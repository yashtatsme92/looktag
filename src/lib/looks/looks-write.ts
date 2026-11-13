import { FRIENDLY_ERRORS, PublicError, isPublicError } from "../errors/public-error.ts";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { withSpan } from "@/lib/observability/instrument";
import { type Look } from "./types";
import { lookStats } from "./rank";
import { normalizeLookTags } from "./offers";
import { assertLookImageSrc } from "./image-src";
import { parseStoredLookImages, toPublicImages } from "./image-variants";
import { upsertProfile } from "./looks-shared";

export const saveLook = createServerFn({ method: "POST" })
  .validator((look: Look) => look)
  .middleware([authMiddleware])
  .handler(async ({ context, data: incoming }) => {
    return withSpan("looktag.looks.save", async (span) => {
      const title = incoming.title.trim();
      if (!title) throw new PublicError("Give the look a name.");
      assertLookImageSrc(incoming.imageSrc);
      const sql = await getSql();
      const userId = context.userId;
      const existing = await sql<{ user_id: string; image_variants_json: string | null }>`
        select user_id, image_variants_json from looks where id = ${incoming.id} limit 1
      `;
      if (existing[0] && existing[0].user_id !== userId) {
        throw new PublicError("You can only edit your own looks.");
      }
      let imageSrc = assertLookImageSrc(incoming.imageSrc);
      let variantsJson = existing[0]?.image_variants_json ?? null;
      if (imageSrc.startsWith("data:")) {
        const { persistDataUrlPhoto } = await import("./photo-store.server");
        let stored: Awaited<ReturnType<typeof persistDataUrlPhoto>>;
        try {
          stored = await persistDataUrlPhoto(incoming.id, imageSrc, variantsJson);
        } catch (error) {
          // "Use a JPEG, PNG, or WebP photo." stays as is; storage / encoder
          // failures get the upload sentence. The cause is logged by
          // serverFnErrorMiddleware and recorded on this span.
          if (isPublicError(error)) throw error;
          span.recordException(error);
          throw new PublicError(FRIENDLY_ERRORS.photoUpload, { status: 503, cause: error });
        }
        imageSrc = stored.imageSrc;
        variantsJson = stored.variantsJson;
      }
      const storedImages = parseStoredLookImages(variantsJson);
      const creator = incoming.creator.trim() || "Creator";
      await upsertProfile(sql, userId, creator);
      const now = Date.now();
      const look: Look = normalizeLookTags({
        ...incoming,
        imageSrc,
        images: storedImages ? toPublicImages(storedImages) : undefined,
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
            image_variants_json = ${variantsJson},
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
            id, user_id, title, caption, creator_name, image_src, image_variants_json, moods_json, tags_json,
            pin_count, compared_count, retailer_count, published, created_at, updated_at, collection_id, crop_json
          ) values (
            ${look.id}, ${userId}, ${look.title}, ${look.caption}, ${look.creator},
            ${look.imageSrc}, ${variantsJson}, ${moodsJson}, ${tagsJson},
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
      const rows = await sql<{ image_variants_json: string | null }>`
        select image_variants_json from looks where id = ${id} and user_id = ${context.userId} limit 1
      `;
      if (rows[0]) {
        const { deleteStoredLookImages } = await import("./photo-store.server");
        const { parseStoredLookImages } = await import("./image-variants");
        await deleteStoredLookImages(parseStoredLookImages(rows[0].image_variants_json));
      }
      await sql`delete from looks where id = ${id} and user_id = ${context.userId}`;
      return { id };
    });
  });
