import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { lookStats, rankScore } from "@/lib/looks/rank";
import { EDITORIAL_USER_ID, type Look } from "@/lib/looks/types";
import { withSpan } from "@/lib/observability/instrument";
import { rankWeights } from "@/lib/settings/model";
import { readSettings } from "@/lib/settings/store.server";
import { groupLooksByCollection, rankLabels, type FashionCollection, type FashionLabel, type RankedLabel } from "./model";
import {
  type FashionLabelPage,
  type FashionCollectionPage,
  type LabelRow,
  type CollectionRow,
  type LookRow,
  ensureFashionLabels,
  labelsEnabled,
  collectionsForLabel,
  parseLabel,
  parseCollection,
  parseLook,
} from "./labels-shared";

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
      select c.id, c.label_id, c.name, c.slug, c.caption, c.season, c.moods_json, c.sort_order, c.created_at
      from fashion_collections c
      inner join fashion_labels l on l.id = c.label_id
      where l.status = 'approved'
      order by c.label_id asc, c.sort_order asc, c.name asc
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
