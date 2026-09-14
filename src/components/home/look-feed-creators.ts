import type { Look } from "@/lib/looks/types";
import type { FashionLabel } from "@/lib/labels/model";
import { looksBelongToHouse } from "@/lib/labels/model";
import { lookPriceBand } from "@/lib/looks/format";

export function plateAttribution(look: Look, labels: FashionLabel[]): string {
  const house = labels.find((label) => looksBelongToHouse(look, label));
  return house?.name || look.creator || "Looktag";
}

export function plateMetaLine(look: Look, labels: FashionLabel[]): string {
  const parts: string[] = [plateAttribution(look, labels)];
  if (look.tags.length) {
    parts.push(`${look.tags.length} ${look.tags.length === 1 ? "piece" : "pieces"}`);
  }
  const band = lookPriceBand(look.tags);
  if (band) parts.push(band);
  return parts.join(" · ");
}

export type FeedCreator = {
  userId: string;
  name: string;
  imageSrc: string;
  lookCount: number;
};

export function creatorsFromLooks(looks: Look[]): FeedCreator[] {
  const map = new Map<string, FeedCreator>();
  for (const look of looks) {
    if (!look.userId || look.userId === "editorial") continue;
    const existing = map.get(look.userId);
    if (existing) {
      existing.lookCount += 1;
      continue;
    }
    map.set(look.userId, {
      userId: look.userId,
      name: look.creator || "Creator",
      imageSrc: look.imageSrc,
      lookCount: 1,
    });
  }
  return [...map.values()].sort((a, b) => b.lookCount - a.lookCount || a.name.localeCompare(b.name));
}
