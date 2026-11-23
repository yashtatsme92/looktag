import { getSql } from "@/lib/db";
import { withSpan } from "@/lib/observability/instrument";
import { EDITORIAL_USER_ID } from "@looktag/shared";
import { rankScore, type CreatorRank } from "@/lib/looks/rank";
import { isLabelUserId } from "@/lib/labels/model";
import { readSettings } from "@/lib/settings/store.server";
import { backfillLookCrops } from "../../../scripts/backfill-look-crops.mjs";
import {
  type LookRow,
  parseLook,
  seedCatalog,
} from "@/lib/looks/looks-shared";
import { requestPhotoMigrationEnabled } from "@/lib/looks/image-variants";

const cropsBackfilled = new WeakSet<object>();
let photoMigration: Promise<void> | null = null;

async function maybeMigratePhotos(sql: Awaited<ReturnType<typeof getSql>>) {
  if (!requestPhotoMigrationEnabled(process.env)) {
    if (process.env.MIGRATE_LOOK_PHOTOS === "1") {
      console.error(
        "[photos] MIGRATE_LOOK_PHOTOS is ignored when NODE_ENV=production. Run scripts/migrate-look-photos.mjs --apply instead.",
      );
    }
    return;
  }
  photoMigration ??= import("@/lib/looks/migrate-photos.server").then(({ migrateLookPhotos }) =>
    migrateLookPhotos(sql).then(() => undefined),
  );
  await photoMigration;
}

export async function seedAndBackfillLooks(sql: Awaited<ReturnType<typeof getSql>>) {
  await seedCatalog(sql);
  if (!cropsBackfilled.has(sql)) {
    await backfillLookCrops(sql);
    cropsBackfilled.add(sql);
  }
  await maybeMigratePhotos(sql);
}

export async function listPublicLooks() {
  return withSpan("looktag.looks.list", async (span) => {
    const sql = await getSql();
    await withSpan("looktag.looks.seed", async () => {
      await seedAndBackfillLooks(sql);
    });
    const settings = await withSpan("looktag.settings.read", async () => readSettings());
    const rows = settings.labelsEnabled
      ? await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, image_variants_json, moods_json, tags_json,
                 created_at, updated_at, collection_id, crop_json
          from looks
          where published = true
          order by created_at desc
        `
      : await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, image_variants_json, moods_json, tags_json,
                 created_at, updated_at, collection_id, crop_json
          from looks
          where published = true
            and user_id not in (select id from fashion_labels)
          order by created_at desc
        `;
    span.setAttribute("looktag.looks.count", rows.length);
    return rows.map(parseLook);
  });
}

export async function getLookById(id: string) {
    return withSpan(
      "looktag.looks.get",
      async (span) => {
        span.setAttribute("looktag.look.id", id);
        const sql = await getSql();
        await withSpan("looktag.looks.seed", async () => {
          await seedAndBackfillLooks(sql);
        });
        const rows = await sql<LookRow>`
          select id, user_id, title, caption, creator_name, image_src, image_variants_json, moods_json, tags_json,
                 created_at, updated_at, collection_id, crop_json
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
}

export async function listRankedCreators() {
  return withSpan("looktag.rank.list", async (span) => {
    const sql = await getSql();
    await seedAndBackfillLooks(sql);
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
        and l.user_id not like 'seed-%'
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
}
