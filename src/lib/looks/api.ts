import { createServerFn } from "@tanstack/react-start";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_USER_ID, isAdminEmail } from "@/lib/admin/access";
import { getSql, type Sql } from "@/lib/db";
import { withSpan } from "@/lib/observability/instrument";
import { makeHandle, parseHandle } from "./handle";
import { parseProfileFields } from "./profile";
import { EDITORIAL_USER_ID, type Look, type ProductTag } from "./types";
import { lookStats, rankScore, type CreatorRank } from "./rank";
import { normalizeLookTags } from "./offers";
import { SEED_LOOKS } from "./seed";
import { ensureFashionLabels } from "@/lib/labels/api";
import { isLabelUserId } from "@/lib/labels/model";
import { readSettings } from "@/lib/settings/store.server";
import { assertLookImageSrc } from "./image-src";

export type CreatorProfile = {
  userId: string;
  displayName: string;
  handle: string;
  city: string;
  bio: string;
  looks: number;
  pins: number;
  compared: number;
  score: number;
  scouted?: boolean;
  isLabel?: boolean;
};

export type AccountDetails = {
  name: string;
  email: string;
  handle: string;
  city: string;
  bio: string;
  hasPassword: boolean;
  emailLocked: boolean;
};

type LookRow = {
  id: string;
  user_id: string;
  title: string;
  caption: string;
  creator_name: string;
  image_src: string;
  moods_json: string;
  tags_json: string;
  created_at: number;
  updated_at: number;
  collection_id?: string | null;
};

function parseLook(row: LookRow): Look {
  let tags: ProductTag[] = [];
  let moods: string[] = [];
  try {
    const parsed = JSON.parse(row.tags_json) as unknown;
    if (Array.isArray(parsed)) tags = parsed as ProductTag[];
  } catch {
    tags = [];
  }
  try {
    const parsed = JSON.parse(row.moods_json) as unknown;
    if (Array.isArray(parsed)) moods = parsed as string[];
  } catch {
    moods = [];
  }
  return normalizeLookTags({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    caption: row.caption,
    creator: row.creator_name,
    imageSrc: row.image_src,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    tags,
    moods,
    collectionId: row.collection_id ? String(row.collection_id) : undefined,
  });
}

async function insertLookRow(sql: Sql, look: Look, userId: string) {
  const stats = lookStats(look);
  const moodsJson = JSON.stringify(look.moods ?? []);
  const tagsJson = JSON.stringify(look.tags);
  const collectionId = look.collectionId ?? null;
  await sql`
    insert into looks (
      id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
      pin_count, compared_count, retailer_count, published, created_at, updated_at, collection_id
    ) values (
      ${look.id}, ${userId}, ${look.title.trim()}, ${look.caption}, ${look.creator.trim() || "Creator"},
      ${look.imageSrc}, ${moodsJson}, ${tagsJson},
      ${stats.pinCount}, ${stats.comparedCount}, ${stats.retailerCount}, true,
      ${look.createdAt}, ${look.updatedAt}, ${collectionId}
    )
    on conflict (id) do nothing
  `;
}

async function ensureEditorialLooks(sql: Sql) {
  const existing = await sql<{ id: string }>`
    select id from looks where user_id = ${EDITORIAL_USER_ID} limit 1
  `;
  if (existing.length > 0) return;
  for (const look of SEED_LOOKS) {
    await insertLookRow(sql, look, EDITORIAL_USER_ID);
  }
}

async function seedCatalog(sql: Sql) {
  await ensureEditorialLooks(sql);
  await ensureFashionLabels(sql);
}

type ProfileExtras = {
  handle?: string;
  city?: string;
  bio?: string;
};

async function claimHandle(sql: Sql, userId: string, preferred: string): Promise<string> {
  const parsed = parseHandle(preferred);
  if (!parsed.ok) throw new Error(parsed.error);
  const taken = await sql<{ user_id: string }>`
    select user_id from profiles where handle = ${parsed.value} and user_id <> ${userId} limit 1
  `;
  if (taken[0]) throw new Error("That handle is already taken.");
  return parsed.value;
}

async function upsertProfile(sql: Sql, userId: string, displayName: string, extras?: ProfileExtras) {
  const name = displayName.trim() || "Creator";
  const existing = await sql<{ handle: string; city: string; bio: string }>`
    select handle, city, bio from profiles where user_id = ${userId} limit 1
  `;
  const row = existing[0];
  let handle = row?.handle || makeHandle(name, userId);
  if (extras?.handle?.trim()) {
    handle = await claimHandle(sql, userId, extras.handle);
  }
  const city = extras?.city !== undefined ? extras.city.trim() : (row?.city ?? "");
  const bio = extras?.bio !== undefined ? extras.bio.trim() : (row?.bio ?? "");
  await sql`
    insert into profiles (user_id, display_name, handle, city, bio)
    values (${userId}, ${name}, ${handle}, ${city}, ${bio})
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      handle = excluded.handle,
      city = excluded.city,
      bio = excluded.bio
  `;
}

async function loadAccount(sql: Sql, userId: string): Promise<AccountDetails | null> {
  const users = await sql<{ name: string; email: string }>`
    select name, email from "user" where id = ${userId} limit 1
  `;
  const user = users[0];
  if (!user) return null;
  await upsertProfile(sql, userId, user.name);
  const profiles = await sql<{ display_name: string; handle: string; city: string; bio: string }>`
    select display_name, handle, city, bio from profiles where user_id = ${userId} limit 1
  `;
  const profile = profiles[0];
  const accounts = await sql<{ id: string }>`
    select id from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
    limit 1
  `;
  const email = user.email;
  return {
    name: profile?.display_name || user.name,
    email,
    handle: profile?.handle || makeHandle(user.name, userId),
    city: profile?.city ?? "",
    bio: profile?.bio ?? "",
    hasPassword: Boolean(accounts[0]),
    emailLocked: userId === ADMIN_USER_ID || isAdminEmail(email),
  };
}

async function creatorPayload(sql: Sql, userId: string) {
  if (!userId || userId === EDITORIAL_USER_ID) return null;
  const profiles = await sql<{ user_id: string; display_name: string; handle: string; city: string; bio: string }>`
    select user_id, display_name, handle, city, bio from profiles where user_id = ${userId} limit 1
  `;
  const profile = profiles[0];
  if (!profile) return null;
  const lookRows = await sql<LookRow>`
    select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
           created_at, updated_at, collection_id
    from looks
    where published = true and user_id = ${userId}
    order by created_at desc
  `;
  const looks = lookRows.map(parseLook);
  const pins = looks.reduce((sum, look) => sum + look.tags.length, 0);
  const compared = looks.reduce((sum, look) => sum + lookStats(look).comparedCount, 0);
  const settings = await readSettings();
  const flags = await sql<{ scouted: boolean }>`
    select scouted from fashion_labels where id = ${userId} limit 1
  `;
  const isLabel = flags.length > 0;
  const creator: CreatorProfile = {
    userId: profile.user_id,
    displayName: profile.display_name,
    handle: profile.handle,
    city: profile.city ?? "",
    bio: profile.bio ?? "",
    looks: looks.length,
    pins,
    compared,
    score: rankScore(looks.length, pins, compared, {
      look: settings.scoreLook,
      pin: settings.scorePin,
      compared: settings.scoreCompared,
    }),
    isLabel,
    scouted: isLabel ? Boolean(flags[0]?.scouted) : undefined,
  };
  return { creator, looks };
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.message === "Unauthorized";
}

export const listPublicLooks = createServerFn({ method: "GET" }).handler(async () => {
  return withSpan("looktag.looks.list", async (span) => {
    const sql = await getSql();
    await withSpan("looktag.looks.seed", async () => {
      await seedCatalog(sql);
    });
    const settings = await withSpan("looktag.settings.read", async () => readSettings());
    const rows = settings.labelsEnabled
      ? await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
                 created_at, updated_at, collection_id
          from looks
          where published = true
          order by created_at desc
        `
      : await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
                 created_at, updated_at, collection_id
          from looks
          where published = true
            and user_id not in (select id from fashion_labels)
          order by created_at desc
        `;
    span.setAttribute("looktag.looks.count", rows.length);
    return rows.map(parseLook);
  });
});

export const getLookById = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    return withSpan(
      "looktag.looks.get",
      async (span) => {
        span.setAttribute("looktag.look.id", id);
        const sql = await getSql();
        await withSpan("looktag.looks.seed", async () => {
          await seedCatalog(sql);
        });
        const rows = await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
                 created_at, updated_at, collection_id
          from looks
          where id = ${id} and published = true
          limit 1
        `;
        const look = rows[0] ? parseLook(rows[0]) : null;
        if (look && isLabelUserId(look.userId)) {
          const settings = await readSettings();
          if (!settings.labelsEnabled) return null;
        }
        span.setAttribute("looktag.look.found", Boolean(look));
        if (look?.collectionId) span.setAttribute("looktag.look.collection", look.collectionId);
        return look;
      },
      { attributes: { "rpc.method": "getLookById" } },
    );
  });

export const listRankedCreators = createServerFn({ method: "GET" }).handler(async () => {
  return withSpan("looktag.rank.list", async (span) => {
    const sql = await getSql();
    await seedCatalog(sql);
    const settings = await readSettings();
    const rows = await sql<{
      user_id: string;
      display_name: string;
      handle: string;
      looks: number;
      pins: number;
      compared: number;
    }>`
      select
        p.user_id,
        p.display_name,
        p.handle,
        count(*)::int as looks,
        coalesce(sum(l.pin_count), 0)::int as pins,
        coalesce(sum(l.compared_count), 0)::int as compared
      from looks l
      join profiles p on p.user_id = l.user_id
      where l.published = true
        and l.user_id <> ${EDITORIAL_USER_ID}
        and l.user_id not in (select id from fashion_labels)
      group by p.user_id, p.display_name, p.handle
      order by (count(*) * ${settings.scoreLook} + coalesce(sum(l.pin_count), 0) * ${settings.scorePin} + coalesce(sum(l.compared_count), 0) * ${settings.scoreCompared}) desc,
        count(*) desc,
        p.display_name asc
    `;
    span.setAttribute("looktag.rank.count", rows.length);
    return rows.map((row) => {
      const looks = Number(row.looks);
      const pins = Number(row.pins);
      const compared = Number(row.compared);
      const ranked: CreatorRank = {
        userId: row.user_id,
        displayName: row.display_name,
        handle: row.handle,
        looks,
        pins,
        compared,
        score: rankScore(looks, pins, compared, {
          look: settings.scoreLook,
          pin: settings.scorePin,
          compared: settings.scoreCompared,
        }),
      };
      return ranked;
    });
  });
});

export const getCreator = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const sql = await getSql();
    await seedCatalog(sql);
    if (isLabelUserId(userId)) {
      const settings = await readSettings();
      if (!settings.labelsEnabled) return null;
    }
    return creatorPayload(sql, userId);
  });

export const ensureMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { displayName?: string; handle?: string; city?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await upsertProfile(sql, context.userId, data.displayName || "Creator", {
      handle: data.handle,
      city: data.city,
    });
    return creatorPayload(sql, context.userId);
  });

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return loadAccount(sql, context.userId);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      name: string;
      email: string;
      handle: string;
      city?: string;
      bio?: string;
      currentPassword?: string;
      newPassword?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    return withSpan("looktag.profile.update", async (span) => {
      const parsed = parseProfileFields({
        name: data.name,
        email: data.email,
        handle: data.handle,
        city: data.city,
        bio: data.bio,
        newPassword: data.newPassword,
      });
      if (!parsed.ok) throw new Error(parsed.error);
      const sql = await getSql();
      const current = await loadAccount(sql, context.userId);
      if (!current) throw new Error("Could not load your account.");

      let email = parsed.value.email;
      if (current.emailLocked) email = current.email;
      if (email !== current.email) {
        if (isAdminEmail(email) && context.userId !== ADMIN_USER_ID) {
          throw new Error("That email is reserved.");
        }
        const taken = await sql<{ id: string }>`
          select id from "user" where email = ${email} and id <> ${context.userId} limit 1
        `;
        if (taken[0]) throw new Error("That email is already in use.");
      }

      if (parsed.value.newPassword) {
        if (!current.hasPassword) throw new Error("This account signs in without a password.");
        const currentPassword = (data.currentPassword ?? "").trim();
        if (!currentPassword) throw new Error("Enter your current password to change it.");
        const accounts = await sql<{ password: string | null }>`
          select password from "account"
          where "userId" = ${context.userId} and "providerId" = 'credential'
          limit 1
        `;
        const hash = accounts[0]?.password;
        if (!hash) throw new Error("This account signs in without a password.");
        const ok = await verifyPassword({ hash, password: currentPassword });
        if (!ok) throw new Error("Current password is not right.");
        const nextHash = await hashPassword(parsed.value.newPassword);
        const now = new Date();
        await sql`
          update "account"
          set password = ${nextHash}, "updatedAt" = ${now}
          where "userId" = ${context.userId} and "providerId" = 'credential'
        `;
        span.setAttribute("looktag.profile.password", true);
      }

      const now = new Date();
      await sql`
        update "user"
        set name = ${parsed.value.name}, email = ${email}, "updatedAt" = ${now}
        where id = ${context.userId}
      `;
      if (email !== current.email) {
        await sql`
          update "account"
          set "accountId" = ${email}, "updatedAt" = ${now}
          where "userId" = ${context.userId} and "providerId" = 'credential'
        `;
      }
      await upsertProfile(sql, context.userId, parsed.value.name, {
        handle: parsed.value.handle,
        city: parsed.value.city,
        bio: parsed.value.bio,
      });
      await sql`
        update looks set creator_name = ${parsed.value.name} where user_id = ${context.userId}
      `;
      span.setAttribute("looktag.profile.email_changed", email !== current.email);
      span.setAttribute("looktag.profile.handle", parsed.value.handle);
      return loadAccount(sql, context.userId);
    });
  });

export const saveLook = createServerFn({ method: "POST" })
  .validator((look: Look) => look)
  .middleware([authMiddleware])
  .handler(async ({ context, data: incoming }) => {
    return withSpan("looktag.looks.save", async (span) => {
      const title = incoming.title.trim();
      if (!title) throw new Error("Give the look a name.");
      assertLookImageSrc(incoming.imageSrc);
      const sql = await getSql();
      const userId = context.userId;
      const existing = await sql<{ user_id: string }>`
        select user_id from looks where id = ${incoming.id} limit 1
      `;
      if (existing[0] && existing[0].user_id !== userId) {
        throw new Error("You can only edit your own looks.");
      }
      const creator = incoming.creator.trim() || "Creator";
      await upsertProfile(sql, userId, creator);
      const now = Date.now();
      const look: Look = normalizeLookTags({
        ...incoming,
        userId,
        title,
        creator,
        updatedAt: now,
        createdAt: existing[0] ? incoming.createdAt : now,
      });
      const stats = lookStats(look);
      const moodsJson = JSON.stringify(look.moods ?? []);
      const tagsJson = JSON.stringify(look.tags);
      const collectionId = look.collectionId ?? null;
      span.setAttribute("looktag.look.pins", stats.pinCount);
      span.setAttribute("looktag.look.compared", stats.comparedCount);
      span.setAttribute("looktag.look.update", Boolean(existing[0]));
      if (collectionId) span.setAttribute("looktag.look.collection", collectionId);
      if (existing[0]) {
        await sql`
          update looks set
            title = ${look.title},
            caption = ${look.caption},
            creator_name = ${look.creator},
            image_src = ${look.imageSrc},
            moods_json = ${moodsJson},
            tags_json = ${tagsJson},
            pin_count = ${stats.pinCount},
            compared_count = ${stats.comparedCount},
            retailer_count = ${stats.retailerCount},
            updated_at = ${look.updatedAt},
            collection_id = ${collectionId}
          where id = ${look.id} and user_id = ${userId}
        `;
      } else {
        await sql`
          insert into looks (
            id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
            pin_count, compared_count, retailer_count, published, created_at, updated_at, collection_id
          ) values (
            ${look.id}, ${userId}, ${look.title}, ${look.caption}, ${look.creator},
            ${look.imageSrc}, ${moodsJson}, ${tagsJson},
            ${stats.pinCount}, ${stats.comparedCount}, ${stats.retailerCount}, true,
            ${look.createdAt}, ${look.updatedAt}, ${collectionId}
          )
        `;
      }
      return look;
    });
  });

export const deleteLook = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .middleware([authMiddleware])
  .handler(async ({ context, data: id }) => {
    return withSpan("looktag.looks.delete", async () => {
      const sql = await getSql();
      await sql`delete from looks where id = ${id} and user_id = ${context.userId}`;
      return { id };
    });
  });
