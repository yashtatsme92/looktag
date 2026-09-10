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

export type LookRow = {
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

export function parseLook(row: LookRow): Look {
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

export async function insertLookRow(sql: Sql, look: Look, userId: string) {
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

export async function ensureEditorialLooks(sql: Sql) {
  const existing = await sql<{ id: string }>`
    select id from looks where user_id = ${EDITORIAL_USER_ID} limit 1
  `;
  if (existing.length > 0) return;
  for (const look of SEED_LOOKS) {
    await insertLookRow(sql, look, EDITORIAL_USER_ID);
  }
}

export async function seedCatalog(sql: Sql) {
  await ensureEditorialLooks(sql);
  await ensureFashionLabels(sql);
}

export type ProfileExtras = {
  handle?: string;
  city?: string;
  bio?: string;
};

export async function claimHandle(sql: Sql, userId: string, preferred: string): Promise<string> {
  const parsed = parseHandle(preferred);
  if (!parsed.ok) throw new Error(parsed.error);
  const taken = await sql<{ user_id: string }>`
    select user_id from profiles where handle = ${parsed.value} and user_id <> ${userId} limit 1
  `;
  if (taken[0]) throw new Error("That handle is already taken.");
  return parsed.value;
}

export async function upsertProfile(sql: Sql, userId: string, displayName: string, extras?: ProfileExtras) {
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

export async function loadAccount(sql: Sql, userId: string): Promise<AccountDetails | null> {
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

export async function creatorPayload(sql: Sql, userId: string) {
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
