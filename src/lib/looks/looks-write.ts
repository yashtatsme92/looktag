import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { withSpan } from "@/lib/observability/instrument";
import { type Look } from "./types";
import { lookStats } from "./rank";
import { normalizeLookTags } from "./offers";
import { assertLookImageSrc } from "./image-src";
import { upsertProfile } from "./looks-shared";

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
      const cropJson = look.crop ? JSON.stringify(look.crop) : null;
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
            crop_json = ${cropJson},
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
            pin_count, compared_count, retailer_count, published, created_at, updated_at, collection_id, crop_json
          ) values (
            ${look.id}, ${userId}, ${look.title}, ${look.caption}, ${look.creator},
            ${look.imageSrc}, ${moodsJson}, ${tagsJson},
            ${stats.pinCount}, ${stats.comparedCount}, ${stats.retailerCount}, true,
            ${look.createdAt}, ${look.updatedAt}, ${collectionId}, ${cropJson}
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

/** E2E cleanup. Refuses every account except the `@looktag.test` users the suites sign up. */
export const deleteSignedUpUser = createServerFn({ method: "POST" })
  .validator(() => null)
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId} limit 1
    `;
    const email = rows[0]?.email ?? "";
    if (!email.endsWith("@looktag.test")) {
      throw new Error("Refusing to delete this account.");
    }
    const userId = context.userId;
    await sql`delete from looks where user_id = ${userId}`;
    await sql`delete from profiles where user_id = ${userId}`;
    await sql`delete from "user" where id = ${userId} and email = ${email}`;
    return { id: userId };
  });
