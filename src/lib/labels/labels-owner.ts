import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { withSpan } from "@/lib/observability/instrument";
import { authMiddleware } from "@/lib/auth/middleware";
import { houseCoverDraft, moveLineOrder, normalizeHouseWebsite, type FashionCollection, type FashionStyle } from "./model";
import {
  LABEL_ID_PREFIX,
  type LabelRow,
  type CollectionRow,
  collectionsForLabel,
  ensureFashionLabels,
  parseLabel,
  parseCollection,
  uniqueHandle,
  ownedHouse,
  uniqueCollectionSlug,
} from "./labels-shared";
import {
  deleteLineStyles,
  deleteStyleForHouse,
  listStylesForLabel,
  moveStyleForHouse,
  saveStyleForHouse,
} from "./style-record";

export const getMyHouse = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureFashionLabels(sql);
    const rows = await sql<LabelRow>`
      select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id, website, cover_src
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
      await ensureFashionLabels(sql);
      const existing = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id, website, cover_src
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
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id, website, cover_src
        from fashion_labels where id = ${id} limit 1
      `;
      return rows[0] ? parseLabel(rows[0]) : null;
    });
  });

export const updateMyHouse = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; city: string; bio: string; moods: string[]; website?: string; coverSrc?: string }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.update", async (span) => {
      const name = data.name.trim();
      if (name.length < 2) throw new Error("Give the house a name.");
      const sql = await getSql();
      await ensureFashionLabels(sql);
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      const nextStatus = house.status === "rejected" ? "pending" : house.status;
      const website = data.website === undefined ? (house.website ?? "") : normalizeHouseWebsite(data.website);
      const coverSrc = data.coverSrc === undefined ? (house.coverSrc ?? "") : houseCoverDraft(data.coverSrc);
      span.setAttribute("looktag.house.id", house.id);
      span.setAttribute("looktag.house.status", nextStatus);
      await sql`
        update fashion_labels
        set name = ${name},
            bio = ${data.bio.trim()},
            city = ${data.city.trim()},
            moods_json = ${JSON.stringify(data.moods.slice(0, 4))},
            status = ${nextStatus},
            website = ${website},
            cover_src = ${coverSrc}
        where id = ${house.id} and owner_user_id = ${context.userId}
      `;
      const rows = await sql<LabelRow>`
        select id, name, handle, bio, city, moods_json, scouted, created_at, status, owner_user_id, website, cover_src
        from fashion_labels where id = ${house.id} limit 1
      `;
      return rows[0] ? parseLabel(rows[0]) : null;
    });
  });

export const listMyCollections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureFashionLabels(sql);
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
      if (name.length < 2) throw new Error("Give the line a name.");
      const sql = await getSql();
      await ensureFashionLabels(sql);
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      if (house.status !== "approved") throw new Error("Your House isn't live yet.");
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
      await ensureFashionLabels(sql);
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      if (house.status !== "approved") throw new Error("Your House isn't live yet.");
      span.setAttribute("looktag.collection.id", data.id);
      await deleteLineStyles(sql, house.id, data.id);
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

export const moveMyCollection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; direction: "up" | "down" }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.line_move", async () => {
      const sql = await getSql();
      await ensureFashionLabels(sql);
      const house = await ownedHouse(sql, context.userId);
      if (!house) throw new Error("Register a house first.");
      if (house.status !== "approved") throw new Error("Your House isn't live yet.");
      const current = await collectionsForLabel(sql, house.id);
      const next = moveLineOrder(current, data.id, data.direction);
      if (!next) return current;
      for (let index = 0; index < next.length; index += 1) {
        const row = next[index]!;
        await sql`
          update fashion_collections
          set sort_order = ${index}
          where id = ${row.id} and label_id = ${house.id}
        `;
      }
      return collectionsForLabel(sql, house.id);
    });
  });

async function liveHouse(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const house = await ownedHouse(sql, userId);
  if (!house) throw new Error("Register a house first.");
  if (house.status !== "approved") throw new Error("Your House isn't live yet.");
  return house;
}

export const listMyStyles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureFashionLabels(sql);
    const house = await ownedHouse(sql, context.userId);
    if (!house || house.status !== "approved") return [] as FashionStyle[];
    return listStylesForLabel(sql, house.id);
  });

export const saveMyStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; collectionId: string; name: string; description?: string; imageSrc: string; images?: string[] }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.style_save", async (span) => {
      const sql = await getSql();
      await ensureFashionLabels(sql);
      const house = await liveHouse(sql, context.userId);
      const saved = await saveStyleForHouse(sql, house.id, data);
      span.setAttribute("looktag.style.id", saved.id);
      return saved;
    });
  });

export const deleteMyStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.style_delete", async (span) => {
      const sql = await getSql();
      await ensureFashionLabels(sql);
      const house = await liveHouse(sql, context.userId);
      span.setAttribute("looktag.style.id", data.id);
      await deleteStyleForHouse(sql, house.id, data.id);
      return { ok: true };
    });
  });

export const moveMyStyle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; direction: "up" | "down" }) => input)
  .handler(async ({ context, data }) => {
    return withSpan("looktag.houses.style_move", async () => {
      const sql = await getSql();
      await ensureFashionLabels(sql);
      const house = await liveHouse(sql, context.userId);
      return moveStyleForHouse(sql, house.id, data.id, data.direction);
    });
  });
