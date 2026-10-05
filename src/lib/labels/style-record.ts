import type { Sql } from "@/lib/db";
import {
  houseCoverDraft,
  moveLineOrder,
  styleDraft,
  type FashionStyle,
} from "./model.ts";

export type StyleRow = {
  id: string;
  label_id: string;
  collection_id: string;
  name: string;
  description: string;
  image_src: string;
  images_json: string;
  sort_order: number;
  created_at: number;
  collection_slug?: string | null;
};

const STYLE_COLUMNS = `s.id, s.label_id, s.collection_id, s.name, s.description, s.image_src, s.images_json, s.sort_order, s.created_at`;

export function parseStyle(row: StyleRow): FashionStyle {
  let images: string[] = [];
  try {
    const parsed = JSON.parse(row.images_json) as unknown;
    if (Array.isArray(parsed)) {
      images = parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  } catch {
    images = [];
  }
  const imageSrc = row.image_src || images[0] || "";
  if (imageSrc && !images.includes(imageSrc)) images = [imageSrc, ...images];
  return {
    id: row.id,
    labelId: row.label_id,
    collectionId: row.collection_id,
    collectionSlug: row.collection_slug ? String(row.collection_slug) : undefined,
    name: row.name,
    description: row.description ?? "",
    imageSrc,
    images,
    sortOrder: Number(row.sort_order),
  };
}

export async function ensureHouseStyleSchema(sql: Sql) {
  await sql.query(`alter table fashion_labels add column if not exists website text not null default ''`);
  await sql.query(`alter table fashion_labels add column if not exists cover_src text not null default ''`);
  await sql.query(`
    create table if not exists fashion_styles (
      id text primary key,
      label_id text not null references fashion_labels(id) on delete cascade,
      collection_id text not null references fashion_collections(id) on delete cascade,
      name text not null,
      description text not null default '',
      image_src text not null default '',
      images_json text not null default '[]',
      sort_order integer not null default 0,
      created_at bigint not null
    )
  `);
  await sql.query(`create index if not exists fashion_styles_collection_idx on fashion_styles (collection_id, sort_order)`);
  await sql.query(`create index if not exists fashion_styles_label_idx on fashion_styles (label_id)`);
}

export async function listStylesForLabel(sql: Sql, labelId: string): Promise<FashionStyle[]> {
  const rows = await sql.query<StyleRow>(
    `select ${STYLE_COLUMNS}, c.slug as collection_slug
     from fashion_styles s
     inner join fashion_collections c on c.id = s.collection_id
     where s.label_id = $1
     order by s.sort_order asc, s.name asc`,
    [labelId],
  );
  return rows.map(parseStyle);
}

export async function listPublicStyles(sql: Sql): Promise<FashionStyle[]> {
  const rows = await sql.query<StyleRow>(
    `select ${STYLE_COLUMNS}, c.slug as collection_slug
     from fashion_styles s
     inner join fashion_collections c on c.id = s.collection_id
     inner join fashion_labels l on l.id = s.label_id
     where l.status = 'approved'
     order by s.sort_order asc, s.name asc`,
    [],
  );
  return rows.map(parseStyle);
}

async function styleById(sql: Sql, labelId: string, id: string): Promise<FashionStyle | null> {
  const rows = await listStylesForLabel(sql, labelId);
  return rows.find((style) => style.id === id) ?? null;
}

async function fillEmptyCover(sql: Sql, labelId: string, imageSrc: string) {
  if (!imageSrc) return;
  await sql`
    update fashion_labels
    set cover_src = ${imageSrc}
    where id = ${labelId} and cover_src = ''
  `;
}

export async function saveStyleForHouse(
  sql: Sql,
  labelId: string,
  input: { id?: string; collectionId: string; name: string; description?: string; imageSrc: string; images?: string[] },
): Promise<FashionStyle> {
  const draft = styleDraft(input);
  const collections = await sql<{ id: string }>`
    select id from fashion_collections
    where id = ${input.collectionId} and label_id = ${labelId}
    limit 1
  `;
  if (!collections[0]) throw new Error("That line is not on your House.");
  const imagesJson = JSON.stringify(draft.images);
  if (input.id) {
    await sql`
      update fashion_styles
      set name = ${draft.name},
          description = ${draft.description},
          image_src = ${draft.imageSrc},
          images_json = ${imagesJson},
          collection_id = ${input.collectionId}
      where id = ${input.id} and label_id = ${labelId}
    `;
    const saved = await styleById(sql, labelId, input.id);
    if (!saved) throw new Error("That style is not on your House.");
    await fillEmptyCover(sql, labelId, draft.imageSrc);
    return saved;
  }
  const existing = await sql<{ sort_order: number }>`
    select sort_order from fashion_styles
    where collection_id = ${input.collectionId}
    order by sort_order desc
    limit 1
  `;
  const sortOrder = Number(existing[0]?.sort_order ?? -1) + 1;
  const id = `style-${labelId.replace(/[^a-z0-9]/gi, "").slice(0, 10)}-${Date.now().toString(36)}`.slice(0, 56);
  const now = Date.now();
  await sql`
    insert into fashion_styles (
      id, label_id, collection_id, name, description, image_src, images_json, sort_order, created_at
    ) values (
      ${id}, ${labelId}, ${input.collectionId}, ${draft.name}, ${draft.description},
      ${draft.imageSrc}, ${imagesJson}, ${sortOrder}, ${now}
    )
  `;
  await fillEmptyCover(sql, labelId, draft.imageSrc);
  const saved = await styleById(sql, labelId, id);
  if (!saved) throw new Error("Could not save the style.");
  return saved;
}

export async function insertSeedStyles(sql: Sql, styles: readonly FashionStyle[]) {
  for (const style of styles) {
    const images = style.images?.length ? style.images : style.imageSrc ? [style.imageSrc] : [];
    await sql`
      insert into fashion_styles (
        id, label_id, collection_id, name, description, image_src, images_json, sort_order, created_at
      ) values (
        ${style.id}, ${style.labelId}, ${style.collectionId}, ${style.name}, ${style.description},
        ${style.imageSrc}, ${JSON.stringify(images)}, ${style.sortOrder}, ${1}
      )
      on conflict (id) do nothing
    `;
  }
}

export async function deleteLineStyles(sql: Sql, labelId: string, collectionId: string) {
  const all = await listStylesForLabel(sql, labelId);
  const doomed = new Set(
    all
      .filter((style) => style.collectionId === collectionId)
      .flatMap((style) => (style.images?.length ? style.images : [style.imageSrc])),
  );
  await sql`
    delete from fashion_styles
    where collection_id = ${collectionId} and label_id = ${labelId}
  `;
  const cover = await sql<{ cover_src: string }>`
    select cover_src from fashion_labels where id = ${labelId} limit 1
  `;
  const current = cover[0]?.cover_src ?? "";
  if (current && doomed.has(current)) {
    const rest = all.filter((style) => style.collectionId !== collectionId);
    await sql`update fashion_labels set cover_src = ${rest[0]?.imageSrc ?? ""} where id = ${labelId}`;
  }
}

export async function deleteStyleForHouse(sql: Sql, labelId: string, id: string): Promise<void> {
  const current = await styleById(sql, labelId, id);
  if (!current) return;
  await sql`delete from fashion_styles where id = ${id} and label_id = ${labelId}`;
  const cover = await sql<{ cover_src: string }>`
    select cover_src from fashion_labels where id = ${labelId} limit 1
  `;
  const photos = new Set(current.images?.length ? current.images : [current.imageSrc]);
  if (cover[0]?.cover_src && photos.has(cover[0].cover_src)) {
    const rest = await listStylesForLabel(sql, labelId);
    const next = rest[0]?.imageSrc ?? "";
    await sql`update fashion_labels set cover_src = ${next} where id = ${labelId}`;
  }
}

export async function moveStyleForHouse(
  sql: Sql,
  labelId: string,
  id: string,
  direction: "up" | "down",
): Promise<FashionStyle[]> {
  const all = await listStylesForLabel(sql, labelId);
  const current = all.find((style) => style.id === id);
  if (!current) return all;
  const siblings = all.filter((style) => style.collectionId === current.collectionId);
  const next = moveLineOrder(siblings, id, direction);
  if (!next) return all;
  for (let index = 0; index < next.length; index += 1) {
    const row = next[index];
    if (!row) continue;
    await sql`
      update fashion_styles
      set sort_order = ${index}
      where id = ${row.id} and label_id = ${labelId}
    `;
  }
  return listStylesForLabel(sql, labelId);
}

export async function setHouseCover(sql: Sql, labelId: string, coverSrc: string) {
  const next = houseCoverDraft(coverSrc);
  await sql`update fashion_labels set cover_src = ${next} where id = ${labelId}`;
}
