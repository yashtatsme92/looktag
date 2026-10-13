import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SEED_COLLECTIONS, SEED_LABELS, SEED_STYLES } from "./seed.ts";

describe("Maison Calvé seed rename", () => {
  it("uses the new house identity throughout the seed", () => {
    const label = SEED_LABELS.find((item) => item.id === "label-maison-calve");
    assert.equal(label?.name, "Maison Calvé");
    assert.equal(label?.handle, "maisoncalve");
    assert.equal(SEED_COLLECTIONS.find((item) => item.labelId === label?.id)?.id, "col-maison-calve-midnight-fittings");
    assert.equal(SEED_STYLES.filter((item) => item.labelId === label?.id).length, 3);
    assert.doesNotMatch(JSON.stringify([SEED_LABELS, SEED_COLLECTIONS, SEED_STYLES]), /veyra/i);
  });

  it("renames legacy records idempotently without losing related records", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    try {
      for (const migration of ["0001_auth.sql", "0002_looks.sql", "0004_studio.sql", "0005_studio_config.sql", "0006_collections.sql", "0007_houses_admin.sql", "0008_profile_details.sql", "0010_house_styles.sql"]) {
        await pg.exec(await readFile(path.join(process.cwd(), "migrations", migration), "utf8"));
      }
      await pg.exec(`
        insert into fashion_labels (
          id, name, handle, bio, city, moods_json, scouted, created_at, status,
          owner_user_id, website, cover_src
        ) values (
          'label-maison-veyra', 'Maison Veyra', 'maisonveyra', 'Bio', 'London',
          '["evening"]', false, 1, 'approved', null, '', ''
        );
        insert into profiles (user_id, display_name, handle)
        values ('label-maison-veyra', 'Maison Veyra', 'maisonveyra');
        insert into fashion_collections (
          id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
        ) values (
          'col-maison-veyra-midnight-fittings', 'label-maison-veyra',
          'Midnight Fittings', 'midnight-fittings', 'Caption', 'AW26', '["evening"]', 0, 2
        );
        insert into fashion_styles (
          id, label_id, collection_id, name, description, image_src, images_json, sort_order, created_at
        ) values (
          'style-maison-veyra-lace-gown', 'label-maison-veyra',
          'col-maison-veyra-midnight-fittings', 'Lace Gown', 'Description',
          '/looks/houses/maison-veyra_lace-gown.jpg',
          '["/looks/houses/maison-veyra_lace-gown.jpg"]', 0, 3
        );
        insert into looks (
          id, user_id, title, caption, creator_name, image_src, moods_json, tags_json,
          pin_count, compared_count, retailer_count, published, created_at, updated_at, collection_id
        ) values (
          'look-house', 'label-maison-veyra', 'Look', 'Caption', 'Maison Veyra',
          '/looks/houses/maison-veyra_lace-gown.jpg', '[]', '[]', 0, 0, 0, true, 4, 4,
          'col-maison-veyra-midnight-fittings'
        );
      `);

      const migration = await readFile(
        path.join(process.cwd(), "migrations/0012_maison_calve.sql"),
        "utf8",
      );
      await pg.exec(migration);
      await pg.exec(migration);

      const labels = await pg.query(`select id, name, handle from fashion_labels`);
      assert.deepEqual(labels.rows, [{
        id: "label-maison-calve",
        name: "Maison Calvé",
        handle: "maisoncalve",
      }]);
      const related = await pg.query(`
        select c.id as collection_id, c.label_id, s.id as style_id, s.collection_id as style_collection_id,
               s.image_src, s.images_json, l.user_id, l.creator_name, l.image_src as look_image_src,
               l.collection_id as look_collection_id, p.display_name, p.handle as profile_handle
        from fashion_collections c
        join fashion_styles s on s.collection_id = c.id
        join looks l on l.collection_id = c.id
        join profiles p on p.user_id = l.user_id
      `);
      assert.deepEqual(related.rows, [{
        collection_id: "col-maison-calve-midnight-fittings",
        label_id: "label-maison-calve",
        style_id: "style-maison-calve-lace-gown",
        style_collection_id: "col-maison-calve-midnight-fittings",
        image_src: "/looks/houses/maison-calve_lace-gown.jpg",
        images_json: '["/looks/houses/maison-calve_lace-gown.jpg"]',
        user_id: "label-maison-calve",
        creator_name: "Maison Calvé",
        look_image_src: "/looks/houses/maison-calve_lace-gown.jpg",
        look_collection_id: "col-maison-calve-midnight-fittings",
        display_name: "Maison Calvé",
        profile_handle: "maisoncalve",
      }]);
    } finally {
      await pg.close();
    }
  });
});
