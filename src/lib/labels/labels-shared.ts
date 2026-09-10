import { getSql, type Sql } from "@/lib/db";
import { lookStats } from "@/lib/looks/rank";
import { type Look, type ProductTag } from "@/lib/looks/types";
import { normalizeLookTags } from "@/lib/looks/offers";
import { readSettings } from "@/lib/settings/store.server";
import {
  collectionSlug,
  LABEL_ID_PREFIX,
  nextCollectionSlug,
  parseHouseStatus,
  type FashionCollection,
  type FashionLabel,
  type HouseCollectionGroup,
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

export type LabelRow = {
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

export type CollectionRow = {
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

export function parseMoods(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseLabel(row: LabelRow): FashionLabel {
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

export function parseCollection(row: CollectionRow): FashionCollection {
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

export function parseLook(row: LookRow): Look {
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

export async function insertLook(sql: Sql, look: Look) {
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

export async function labelsEnabled(): Promise<boolean> {
  const settings = await readSettings();
  return settings.labelsEnabled;
}

export async function collectionsForLabel(sql: Sql, labelId: string): Promise<FashionCollection[]> {
  const rows = await sql<CollectionRow>`
    select id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
    from fashion_collections
    where label_id = ${labelId}
    order by sort_order asc, name asc
  `;
  return rows.map(parseCollection);
}

export async function uniqueHandle(sql: Sql, name: string, userId: string): Promise<string> {
  const base = collectionSlug(name).replace(/-/g, "").slice(0, 14) || "house";
  const suffix = userId.replace(/[^a-z0-9]/gi, "").slice(-6) || "xx";
  const candidate = `${base}${suffix}`.slice(0, 24);
  const existing = await sql<{ handle: string }>`
    select handle from fashion_labels where handle = ${candidate} limit 1
  `;
  if (!existing[0]) return candidate;
  return `${base}${suffix}${Date.now().toString(36).slice(-4)}`.slice(0, 24);
}

export async function ownedHouse(sql: Sql, userId: string): Promise<FashionLabel | null> {
  const rows = await sql<LabelRow>`
    select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id
    from fashion_labels
    where owner_user_id = ${userId}
    order by created_at desc
    limit 1
  `;
  return rows[0] ? parseLabel(rows[0]) : null;
}

export async function uniqueCollectionSlug(
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

export type AdminHouse = FashionLabel & {
  looks: number;
  pins: number;
  compared: number;
  collectionCount: number;
  score: number;
};

export { LABEL_ID_PREFIX, groupLooksByCollection, rankLabels, collectionSlug, nextCollectionSlug, parseHouseStatus } from "./model";
