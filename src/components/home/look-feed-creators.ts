import type { Look } from "@/lib/looks/types";
export { plateAttribution, plateCaptionLine, plateMetaLine } from "@/lib/home/look-feed-plate";

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
