import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { lookStats, rankScore } from "@/lib/looks/rank";
import { EDITORIAL_USER_ID, type Look, type ProductTag } from "@/lib/looks/types";
import { normalizeLookTags } from "@/lib/looks/offers";
import { withSpan } from "@/lib/observability/instrument";
import { rankWeights } from "@/lib/settings/model";
import { readSettings } from "@/lib/settings/store.server";
import { authMiddleware, adminMiddleware } from "@/lib/auth/middleware";
import {
  collectionSlug,
  groupLooksByCollection,
  LABEL_ID_PREFIX,
  nextCollectionSlug,
  parseHouseStatus,
  rankLabels,
  type FashionCollection,
  type FashionLabel,
  type HouseCollectionGroup,
  type HouseStatus,
  type RankedLabel,
} from "./model";
import { SEED_COLLECTIONS, SEED_LABEL_LOOKS, SEED_LABELS } from "./seed";

export type FashionLabelPage = RankedLabel & {
  collection: Look[];
  collections: HouseCollectionGroup[];
};

export type FashionCollectionPage = {
  label: FashionLabel;
  collection: FashionCollection;
  looks: Look[];
  pins: number;
  compared: number;
};

type LabelRow = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  city: string;
  moods_json: string;
  scouted: boolean;
  created_at: number;
  status?: string | null;
  owner_user_id?: string | null;
};

type CollectionRow = {
  id: string;
  label_id: string;
  name: string;
  slug: string;
  caption: string;
  season: string;
  moods_json: string;
  sort_order: number;
  created_at: number;
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

function parseMoods(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseLabel(row: LabelRow): FashionLabel {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    bio: row.bio,
    city: row.city,
    moods: parseMoods(row.moods_json),
    scouted: Boolean(row.scouted),
    status: parseHouseStatus(row.status),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
    createdAt: Number(row.created_at),
  };
}

function parseCollection(row: CollectionRow): FashionCollection {
  return {
    id: row.id,
    labelId: row.label_id,
    name: row.name,
    slug: row.slug,
    caption: row.caption,
    season: row.season,
    moods: parseMoods(row.moods_json),
    sortOrder: Number(row.sort_order),
    createdAt: Number(row.created_at),
  };
}

function parseLook(row: LookRow): Look {
  let tags: ProductTag[] = [];
  try {
    const parsed = JSON.parse(row.tags_json) as unknown;
    if (Array.isArray(parsed)) tags = parsed as ProductTag[];
  } catch {
    tags = [];
  }
  const collectionId = row.collection_id ? String(row.collection_id) : "";
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
    moods: parseMoods(row.moods_json),
    collectionId: collectionId || undefined,
  });
}

async function insertLook(sql: Sql, look: Look) {
  const stats = lookStats(look);
  const collectionId = look.collectionId ?? null;
  await sql`
    insert into looks (
      id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
      pin_count, compared_count, retailer_count, published, created_at, updated_at, collection_id
    ) values (
      ${look.id}, ${look.userId}, ${look.title}, ${look.caption}, ${look.creator},
      ${look.imageSrc}, ${JSON.stringify(look.moods ?? [])}, ${JSON.stringify(look.tags)},
      ${stats.pinCount}, ${stats.comparedCount}, ${stats.retailerCount}, true,
      ${look.createdAt}, ${look.updatedAt}, ${collectionId}
    )
    on conflict (id) do nothing
  `;
  if (collectionId) {
    await sql`
      update looks set collection_id = ${collectionId} where id = ${look.id}
    `;
  }
}

export async function ensureFashionLabels(sql: Sql) {
  for (const label of SEED_LABELS) {
    await sql`
      insert into fashion_labels (id, name, handle, bio, city, moods_json, scouted, created_at, status)
      values (
        ${label.id}, ${label.name}, ${label.handle}, ${label.bio}, ${label.city},
        ${JSON.stringify(label.moods)}, ${label.scouted}, ${label.createdAt}, ${label.status}
      )
      on conflict (id) do nothing
    `;
    await sql`
      insert into profiles (user_id, display_name, handle)
      values (${label.id}, ${label.name}, ${label.handle})
      on conflict (user_id) do nothing
    `;
  }
  for (const collection of SEED_COLLECTIONS) {
    await sql`
      insert into fashion_collections (
        id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
      ) values (
        ${collection.id}, ${collection.labelId}, ${collection.name}, ${collection.slug},
        ${collection.caption}, ${collection.season}, ${JSON.stringify(collection.moods)},
        ${collection.sortOrder}, ${collection.createdAt}
      )
      on conflict (id) do nothing
    `;
  }
  for (const look of SEED_LABEL_LOOKS) {
    await insertLook(sql, look);
  }
}

async function labelsEnabled(): Promise<boolean> {
  const settings = await readSettings();
  return settings.labelsEnabled;
}

async function collectionsForLabel(sql: Sql, labelId: string): Promise<FashionCollection[]> {
  const rows = await sql<CollectionRow>`
    select id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
    from fashion_collections
    where label_id = ${labelId}
    order by sort_order asc, name asc
  `;
  return rows.map(parseCollection);
}

export const listFashionLabels = createServerFn({ method: "GET" }).handler(async () => {
  return withSpan("looktag.houses.list", async (span) => {
    if (!(await labelsEnabled())) {
      span.setAttribute("looktag.houses.enabled", false);
      return [] as FashionLabel[];
    }
    const sql = await getSql();
    await ensureFashionLabels(sql);
    const rows = await sql<LabelRow>`
      select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
      from fashion_labels
      where status = 'approved'
      order by scouted desc, name asc
    `;
    span.setAttribute("looktag.houses.enabled", true);
    span.setAttribute("looktag.houses.count", rows.length);
    return rows.map(parseLabel);
  });
});

export const listFashionCollections = createServerFn({ method: "GET" }).handler(async () => {
  return withSpan("looktag.collections.list", async (span) => {
    if (!(await labelsEnabled())) {
      span.setAttribute("looktag.houses.enabled", false);
      return [] as FashionCollection[];
    }
    const sql = await getSql();
    await ensureFashionLabels(sql);
    const rows = await sql<CollectionRow>`
      select id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
      from fashion_collections
      order by label_id asc, sort_order asc, name asc
    `;
    span.setAttribute("looktag.collections.count", rows.length);
    return rows.map(parseCollection);
  });
});

export const getFashionLabel = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    return withSpan(
      "looktag.houses.get",
      async (span) => {
        span.setAttribute("looktag.house.id", id);
        if (!(await labelsEnabled())) {
          span.setAttribute("looktag.houses.enabled", false);
          return null;
        }
        const sql = await getSql();
        await ensureFashionLabels(sql);
        const labels = await sql<LabelRow>`
          select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
          from fashion_labels
          where id = ${id}
          limit 1
        `;
        const label = labels[0] ? parseLabel(labels[0]) : null;
        span.setAttribute("looktag.house.found", Boolean(label));
        if (!label || label.status !== "approved") {
          span.setAttribute("looktag.house.found", Boolean(label && label.status === "approved"));
          return null;
        }
        const owner = label.ownerUserId ?? "";
        const looks = await withSpan("looktag.houses.looks", async (child) => {
          const lookRows = await sql<LookRow>`
            select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
                   created_at, updated_at, collection_id
            from looks
            where published = true
              and (user_id = ${id} or (${owner} <> '' and user_id = ${owner}))
            order by created_at desc
          `;
          child.setAttribute("looktag.house.looks", lookRows.length);
          return lookRows.map(parseLook);
        });
        const collections = await withSpan("looktag.houses.collections", async (child) => {
          const next = await collectionsForLabel(sql, id);
          child.setAttribute("looktag.house.collections", next.length);
          return next;
        });
        const grouped = groupLooksByCollection(collections, looks);
        const pins = looks.reduce((sum, look) => sum + look.tags.length, 0);
        const compared = looks.reduce((sum, look) => sum + lookStats(look).comparedCount, 0);
        const settings = await readSettings();
        const weights = rankWeights(settings);
        const ranked: RankedLabel = {
          label,
          looks: looks.length,
          pins,
          compared,
          collectionCount: grouped.length,
          score: rankScore(looks.length, pins, compared, weights),
        };
        span.setAttribute("looktag.house.looks", looks.length);
        span.setAttribute("looktag.house.collections", grouped.length);
        span.setAttribute("looktag.house.scouted", label.scouted);
        const page: FashionLabelPage = { ...ranked, collection: looks, collections: grouped };
        return page;
      },
      { attributes: { "rpc.method": "getFashionLabel" } },
    );
  });

export const getFashionCollection = createServerFn({ method: "GET" })
  .validator((input: { labelId: string; collectionId: string }) => input)
  .handler(async ({ data }) => {
    return withSpan(
      "looktag.collections.get",
      async (span) => {
        span.setAttribute("looktag.house.id", data.labelId);
        span.setAttribute("looktag.collection.id", data.collectionId);
        if (!(await labelsEnabled())) {
          span.setAttribute("looktag.houses.enabled", false);
          return null;
        }
        const sql = await getSql();
        await ensureFashionLabels(sql);
        const labels = await sql<LabelRow>`
          select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
          from fashion_labels
          where id = ${data.labelId}
          limit 1
        `;
        const label = labels[0] ? parseLabel(labels[0]) : null;
        if (!label || label.status !== "approved") {
          span.setAttribute("looktag.collection.found", false);
          return null;
        }
        const rows = await sql<CollectionRow>`
          select id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
          from fashion_collections
          where label_id = ${data.labelId}
            and (id = ${data.collectionId} or slug = ${data.collectionId})
          limit 1
        `;
        const collection = rows[0] ? parseCollection(rows[0]) : null;
        span.setAttribute("looktag.collection.found", Boolean(collection));
        if (!collection) return null;
        span.setAttribute("looktag.collection.slug", collection.slug);
        const lookRows = await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
                 created_at, updated_at, collection_id
          from looks
          where published = true and collection_id = ${collection.id}
          order by created_at desc
        `;
        const looks = lookRows.map(parseLook);
        const pins = looks.reduce((sum, look) => sum + look.tags.length, 0);
        const compared = looks.reduce((sum, look) => sum + lookStats(look).comparedCount, 0);
        span.setAttribute("looktag.collection.looks", looks.length);
        const page: FashionCollectionPage = { label, collection, looks, pins, compared };
        return page;
      },
      { attributes: { "rpc.method": "getFashionCollection" } },
    );
  });

export const listRankedLabels = createServerFn({ method: "GET" }).handler(async () => {
  return withSpan("looktag.houses.rank", async (span) => {
    if (!(await labelsEnabled())) {
      span.setAttribute("looktag.houses.enabled", false);
      return [] as RankedLabel[];
    }
    const sql = await getSql();
    await ensureFashionLabels(sql);
    const labels = await sql<LabelRow>`
      select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
      from fashion_labels
    `;
    const lookRows = await sql<LookRow>`
      select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
             created_at, updated_at, collection_id
      from looks
      where published = true and user_id <> ${EDITORIAL_USER_ID}
    `;
    const ranked = rankLabels(
      labels.map(parseLabel).filter((label) => label.status === "approved"),
      lookRows.map(parseLook),
      rankWeights(await readSettings()),
    );
    span.setAttribute("looktag.houses.rank.count", ranked.length);
    return ranked;
  });
});

export const setLabelScouted = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((input: { id: string; scouted: boolean }) => input)
  .handler(async ({ data }) => {
    return withSpan("looktag.houses.scouted", async (span) => {
      span.setAttribute("looktag.house.id", data.id);
      span.setAttribute("looktag.house.scouted", data.scouted);
      const sql = await getSql();
      await sql`
        update fashion_labels set scouted = ${data.scouted} where id = ${data.id}
      `;
      const rows = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
        from fashion_labels where id = ${data.id} limit 1
      `;
      return rows[0] ? parseLabel(rows[0]) : null;
    });
  });

export type AdminHouse = FashionLabel & {
  looks: number;
  pins: number;
  compared: number;
  collectionCount: number;
  score: number;
};

export const listAdminHouses = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
  return withSpan("looktag.houses.admin_list", async (span) => {
    const sql = await getSql();
    await ensureFashionLabels(sql);
    const rows = await sql<LabelRow>`
      select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
      from fashion_labels
      order by
        case status when 'pending' then 0 when 'approved' then 1 else 2 end,
        created_at desc
    `;
    const lookRows = await sql<LookRow>`
      select id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
             created_at, updated_at, collection_id
      from looks
      where published = true and user_id <> ${EDITORIAL_USER_ID}
    `;
    const labels = rows.map(parseLabel);
    const ranked = rankLabels(labels, lookRows.map(parseLook), rankWeights(await readSettings()));
    const byId = new Map(ranked.map((row) => [row.label.id, row]));
    span.setAttribute("looktag.houses.admin_count", rows.length);
    span.setAttribute("looktag.houses.pending", rows.filter((row) => row.status === "pending").length);
    return labels.map((label): AdminHouse => {
      const row = byId.get(label.id);
      return {
        ...label,
        looks: row?.looks ?? 0,
        pins: row?.pins ?? 0,
        compared: row?.compared ?? 0,
        collectionCount: row?.collectionCount ?? 0,
        score: row?.score ?? 0,
      };
    });
  });
});

export const setHouseStatus = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator((input: { id: string; status: HouseStatus }) => input)
  .handler(async ({ data }) => {
    return withSpan("looktag.houses.status", async (span) => {
      span.setAttribute("looktag.house.id", data.id);
      span.setAttribute("looktag.house.status", data.status);
      const sql = await getSql();
      if (data.status !== "approved") {
        await sql`
          update fashion_labels set status = ${data.status}, scouted = false where id = ${data.id}
        `;
      } else {
        await sql`
          update fashion_labels set status = ${data.status} where id = ${data.id}
        `;
      }
      const rows = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
        from fashion_labels where id = ${data.id} limit 1
      `;
      return rows[0] ? parseLabel(rows[0]) : null;
    });
  });

export const getMyHouse = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<LabelRow>`
      select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
      from fashion_labels
      where owner_user_id = ${context.userId}
      order by created_at desc
      limit 1
    `;
    return rows[0] ? parseLabel(rows[0]) : null;
  });

export const applyHouse = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; city: string; bio: string; moods: string[] }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.apply", async (span) => {
      const name = data.name.trim();
      if (name.length < 2) throw new Error("Give the house a name.");
      const sql = await getSql();
      const existing = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
        from fashion_labels
        where owner_user_id = ${context.userId}
        limit 1
      `;
      if (existing[0]) {
        span.setAttribute("looktag.house.apply", "exists");
        return parseLabel(existing[0]);
      }
      const handle = await uniqueHandle(sql, name, context.userId);
      const id = `${LABEL_ID_PREFIX}${context.userId.slice(0, 8)}-${handle}`.slice(0, 48);
      const now = Date.now();
      await sql`
        insert into fashion_labels (
          id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
        ) values (
          ${id}, ${name}, ${handle}, ${data.bio.trim()}, ${data.city.trim()},
          ${JSON.stringify(data.moods.slice(0, 4))}, false, ${now}, 'pending', ${context.userId}
        )
      `;
      span.setAttribute("looktag.house.id", id);
      span.setAttribute("looktag.house.status", "pending");
      const rows = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
        from fashion_labels where id = ${id} limit 1
      `;
      return rows[0] ? parseLabel(rows[0]) : null;
    });
  });

async function uniqueHandle(sql: Sql, name: string, userId: string): Promise<string> {
  const base = collectionSlug(name).replace(/-/g, "").slice(0, 14) || "house";
  const suffix = userId.replace(/[^a-z0-9]/gi, "").slice(-6) || "xx";
  const candidate = `${base}${suffix}`.slice(0, 24);
  const existing = await sql<{ handle: string }>`
    select handle from fashion_labels where handle = ${candidate} limit 1
  `;
  if (!existing[0]) return candidate;
  return `${base}${suffix}${Date.now().toString(36).slice(-4)}`.slice(0, 24);
}

async function ownedHouse(sql: Sql, userId: string): Promise<FashionLabel | null> {
  const rows = await sql<LabelRow>`
    select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
    from fashion_labels
    where owner_user_id = ${userId}
    order by created_at desc
    limit 1
  `;
  return rows[0] ? parseLabel(rows[0]) : null;
}

async function uniqueCollectionSlug(
  sql: Sql,
  labelId: string,
  name: string,
  excludeId?: string,
): Promise<string> {
  const takenRows = excludeId
    ? await sql<{ slug: string }>`
        select slug from fashion_collections where label_id = ${labelId} and id <> ${excludeId}
      `
    : await sql<{ slug: string }>`
        select slug from fashion_collections where label_id = ${labelId}
      `;
  return nextCollectionSlug(name, takenRows.map((row) => row.slug));
}

export const updateMyHouse = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; city: string; bio: string; moods: string[] }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.update", async (span) => {
      const name = data.name.trim();
      if (name.length < 2) throw new Error("Give the house a name.");
      const sql = await getSql();
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      const nextStatus = house.status === "rejected" ? "pending" : house.status;
      span.setAttribute("looktag.house.id", house.id);
      span.setAttribute("looktag.house.status", nextStatus);
      await sql`
        update fashion_labels
        set name = ${name},
            bio = ${data.bio.trim()},
            city = ${data.city.trim()},
            moods_json = ${JSON.stringify(data.moods.slice(0, 4))},
            status = ${nextStatus}
        where id = ${house.id} and owner_user_id = ${context.userId}
      `;
      const rows = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
        from fashion_labels where id = ${house.id} limit 1
      `;
      return rows[0] ? parseLabel(rows[0]) : null;
    });
  });

export const listMyCollections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const house = await ownedHouse(sql, context.userId);
    if (!house) return [] as FashionCollection[];
    return collectionsForLabel(sql, house.id);
  });

export const saveMyCollection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; name: string; caption: string; season: string }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.collection_save", async (span) => {
      const name = data.name.trim();
      if (name.length < 2) throw new Error("Give the collection a name.");
      const sql = await getSql();
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      const caption = data.caption.trim();
      const season = data.season.trim();
      if (data.id) {
        const slug = await uniqueCollectionSlug(sql, house.id, name, data.id);
        await sql`
          update fashion_collections
          set name = ${name}, slug = ${slug}, caption = ${caption}, season = ${season}
          where id = ${data.id} and label_id = ${house.id}
        `;
        span.setAttribute("looktag.collection.id", data.id);
        const rows = await sql<CollectionRow>`
          select id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
          from fashion_collections where id = ${data.id} and label_id = ${house.id} limit 1
        `;
        return rows[0] ? parseCollection(rows[0]) : null;
      }
      const slug = await uniqueCollectionSlug(sql, house.id, name);
      const existing = await sql<{ sort_order: number }>`
        select sort_order from fashion_collections
        where label_id = ${house.id}
        order by sort_order desc
        limit 1
      `;
      const sortOrder = Number(existing[0]?.sort_order ?? -1) + 1;
      const id = `${house.id}-${slug}`.slice(0, 56);
      const now = Date.now();
      await sql`
        insert into fashion_collections (
          id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
        ) values (
          ${id}, ${house.id}, ${name}, ${slug}, ${caption}, ${season}, '[]', ${sortOrder}, ${now}
        )
      `;
      span.setAttribute("looktag.collection.id", id);
      const rows = await sql<CollectionRow>`
        select id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
        from fashion_collections where id = ${id} limit 1
      `;
      return rows[0] ? parseCollection(rows[0]) : null;
    });
  });

export const deleteMyCollection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.collection_delete", async (span) => {
      const sql = await getSql();
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      span.setAttribute("looktag.collection.id", data.id);
      await sql`
        update looks set collection_id = null
        where collection_id = ${data.id}
      `;
      await sql`
        delete from fashion_collections
        where id = ${data.id} and label_id = ${house.id}
      `;
      return { ok: true };
    });
  });
