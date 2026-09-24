import type { FashionLabel } from "../labels/model.ts";
import { looksBelongToHouse } from "../labels/model.ts";
import { lookPriceBand } from "../looks/format.ts";
import type { Look } from "../looks/types.ts";

export function plateAttribution(look: Look, labels: FashionLabel[]): string {
  const house = labels.find((label) => looksBelongToHouse(look, label));
  return house?.name || look.creator || "Looktag";
}

export function plateCaptionLine(look: Look): string {
  const parts: string[] = [];
  if (look.tags.length) {
    parts.push(`${look.tags.length} ${look.tags.length === 1 ? "piece" : "pieces"}`);
  }
  const band = lookPriceBand(look.tags);
  if (band) parts.push(band);
  return parts.join(" · ");
}

export function plateMetaLine(look: Look, labels: FashionLabel[]): string {
  const parts: string[] = [plateAttribution(look, labels)];
  const caption = plateCaptionLine(look);
  if (caption) parts.push(caption);
  return parts.join(" · ");
}
