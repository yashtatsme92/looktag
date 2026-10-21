import type { Sql } from "@/lib/db";
import { SEED_STYLES, SEED_LABELS, SEED_LABEL_LOOKS } from "@/lib/labels/seed";
import { imageKey, productKey } from "../../../scripts/seed-ledger.mjs";
import { SEED_LOOKS } from "./seed";

/**
 * Record every repo seed row in seeded_items. Looks are also recorded by the
 * insert (editorial_look / house_look, including house-*). This adds houses,
 * products, and image paths. It does not read uploads, fixtures, or dev data.
 */
export async function recordRepoSeedLedger(sql: Sql): Promise<void> {
  const rows: Array<[string, string]> = [];
  for (const label of SEED_LABELS) rows.push(["house", label.id]);
  for (const look of [...SEED_LOOKS, ...SEED_LABEL_LOOKS]) {
    const lookKind = look.id.startsWith("house-") ? "house_look" : "editorial_look";
    rows.push([lookKind, look.id]);
    const image = imageKey(look.imageSrc, look.id);
    if (image) rows.push(["image", image]);
    for (const tag of look.tags) {
      if (!tag.id) continue;
      rows.push(["product", productKey(look.id, tag.id)]);
    }
  }
  for (const style of SEED_STYLES) {
    const srcs = [style.imageSrc, ...(style.images ?? [])];
    for (const src of srcs) {
      const image = imageKey(src, style.id);
      if (image) rows.push(["image", image]);
    }
  }
  for (const [kind, id] of rows) {
    await sql`
      insert into seeded_items (kind, id)
      values (${kind}, ${id})
      on conflict (kind, id) do nothing
    `;
  }
}
