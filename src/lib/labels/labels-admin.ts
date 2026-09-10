import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { EDITORIAL_USER_ID } from "@/lib/looks/types";
import { withSpan } from "@/lib/observability/instrument";
import { rankWeights } from "@/lib/settings/model";
import { readSettings } from "@/lib/settings/store.server";
import { adminMiddleware } from "@/lib/auth/middleware";
import { rankLabels, type HouseStatus } from "./model";
import {
  type AdminHouse,
  type LabelRow,
  type LookRow,
  ensureFashionLabels,
  parseLabel,
  parseLook,
} from "./labels-shared";

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
