import { EDITORIAL_USER_ID, type Look } from "../looks/types.ts";

/** Portal-curated houses wear this mark on their profile. */
export const SCOUTED_FLAG = "Scouted";

export const LABEL_ID_PREFIX = "label-";

const SCORE_PER_LOOK = 12;
const SCORE_PER_PIN = 3;
const SCORE_PER_COMPARED = 5;

export type HouseStatus = "pending" | "approved" | "rejected";

export type FashionLabel = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  city: string;
  moods: string[];
  scouted: boolean;
  status: HouseStatus;
  ownerUserId?: string;
  createdAt: number;
};

export type FashionCollection = {
  id: string;
  labelId: string;
  name: string;
  slug: string;
  caption: string;
  season: string;
  moods: string[];
  sortOrder: number;
  createdAt: number;
};

export type HouseCollectionGroup = {
  collection: FashionCollection;
  looks: Look[];
};

export type RankedLabel = {
  label: FashionLabel;
  looks: number;
  pins: number;
  compared: number;
  collectionCount: number;
  score: number;
};

export type SuggestedLook = {
  look: Look;
  source: "influencer" | "house";
  score: number;
};

export function parseHouseStatus(value: unknown): HouseStatus {
  if (value === "pending" || value === "rejected") return value;
  return "approved";
}

export function isPublicHouse(label: Pick<FashionLabel, "status">): boolean {
  return label.status === "approved";
}

export function isLabelUserId(userId: string): boolean {
  return userId.startsWith(LABEL_ID_PREFIX);
}

export function collectionSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nextCollectionSlug(name: string, taken: string[]): string {
  const base = collectionSlug(name) || "collection";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function collectionPath(labelId: string, collection: Pick<FashionCollection, "slug">): string {
  return `/houses/${labelId}/${collection.slug}`;
}

export function likingsFromLooks(looks: Look[]): string[] {
  const counts = new Map<string, number>();
  for (const look of looks) {
    for (const mood of look.moods ?? []) {
      if (!mood) continue;
      counts.set(mood, (counts.get(mood) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

export function moodOverlap(moods: string[] | undefined, likings: string[]): number {
  if (!moods?.length || likings.length === 0) return 0;
  const wanted = new Set(likings);
  return moods.filter((mood) => wanted.has(mood)).length;
}

export function labelMatchScore(label: FashionLabel, likings: string[]): number {
  const overlap = moodOverlap(label.moods, likings);
  const scoutedBoost = label.scouted ? 0.5 : 0;
  if (likings.length === 0) return scoutedBoost;
  return overlap + scoutedBoost;
}

export function labelsForLikings(labels: FashionLabel[], likings: string[]): FashionLabel[] {
  return [...labels].sort((a, b) => {
    const score = labelMatchScore(b, likings) - labelMatchScore(a, likings);
    if (score !== 0) return score;
    if (a.scouted !== b.scouted) return a.scouted ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function comparedPins(look: Look): number {
  return look.tags.filter((tag) => (tag.offers?.length ?? 0) >= 2).length;
}

function houseScore(
  looks: number,
  pins: number,
  compared: number,
  weights = { look: SCORE_PER_LOOK, pin: SCORE_PER_PIN, compared: SCORE_PER_COMPARED },
): number {
  return looks * weights.look + pins * weights.pin + compared * weights.compared;
}

export function looksBelongToHouse(
  look: Pick<Look, "userId">,
  label: Pick<FashionLabel, "id" | "ownerUserId">,
): boolean {
  return look.userId === label.id || Boolean(label.ownerUserId && look.userId === label.ownerUserId);
}

export function collectionIdsForLabel(
  looks: Look[],
  label: Pick<FashionLabel, "id" | "ownerUserId">,
): string[] {
  const ids = new Set<string>();
  for (const look of looks) {
    if (!looksBelongToHouse(look, label) || !look.collectionId) continue;
    ids.add(look.collectionId);
  }
  return [...ids];
}

export function groupLooksByCollection(
  collections: FashionCollection[],
  looks: Look[],
): HouseCollectionGroup[] {
  const ordered = [...collections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const buckets = new Map<string, Look[]>(ordered.map((item) => [item.id, []]));
  const ungrouped: Look[] = [];
  for (const look of looks) {
    const bucket = look.collectionId ? buckets.get(look.collectionId) : undefined;
    if (bucket) bucket.push(look);
    else ungrouped.push(look);
  }
  const grouped = ordered
    .map((collection) => ({
      collection,
      looks: buckets.get(collection.id) ?? [],
    }))
    .filter((row) => row.looks.length > 0);
  if (ungrouped.length === 0) return grouped;
  const labelId = collections[0]?.labelId ?? ungrouped[0]?.userId ?? "";
  grouped.push({
    collection: {
      id: `${labelId}-ungrouped`,
      labelId,
      name: "Looks",
      slug: "looks",
      caption: "",
      season: "",
      moods: [],
      sortOrder: 999,
      createdAt: 0,
    },
    looks: ungrouped,
  });
  return grouped;
}

export function rankLabels(
  labels: FashionLabel[],
  looks: Look[],
  weights?: { look: number; pin: number; compared: number },
): RankedLabel[] {
  return labels
    .map((label) => {
      const owned = looks.filter((look) => looksBelongToHouse(look, label));
      const pins = owned.reduce((sum, look) => sum + look.tags.length, 0);
      const compared = owned.reduce((sum, look) => sum + comparedPins(look), 0);
      return {
        label,
        looks: owned.length,
        pins,
        compared,
        collectionCount: collectionIdsForLabel(owned, label).length,
        score: houseScore(owned.length, pins, compared, weights),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.looks !== a.looks) return b.looks - a.looks;
      if (a.label.scouted !== b.label.scouted) return a.label.scouted ? -1 : 1;
      return a.label.name.localeCompare(b.label.name);
    });
}

export function suggestLooks(input: {
  looks: Look[];
  labels: FashionLabel[];
  likings: string[];
  limit?: number;
}): SuggestedLook[] {
  const limit = input.limit ?? 6;
  const labelIds = new Set(input.labels.map((label) => label.id));
  const scouted = new Set(input.labels.filter((label) => label.scouted).map((label) => label.id));

  function score(look: Look, source: SuggestedLook["source"]): number {
    const overlap = moodOverlap(look.moods, input.likings);
    const houseBoost = source === "house" ? 1 : 0;
    const scoutedBoost = scouted.has(look.userId) ? 2 : 0;
    const recency = Math.max(0, look.createdAt) / 1_000_000_000_000;
    return overlap * 10 + houseBoost + scoutedBoost + recency;
  }

  const influencers: SuggestedLook[] = input.looks
    .filter((look) => look.userId && look.userId !== EDITORIAL_USER_ID && !labelIds.has(look.userId))
    .map((look) => ({ look, source: "influencer" as const, score: score(look, "influencer") }));

  const houses: SuggestedLook[] = input.looks
    .filter((look) => labelIds.has(look.userId))
    .map((look) => ({ look, source: "house" as const, score: score(look, "house") }));

  const pick = (rows: SuggestedLook[], count: number) =>
    [...rows].sort((a, b) => b.score - a.score || a.look.title.localeCompare(b.look.title)).slice(0, count);

  const half = Math.max(1, Math.ceil(limit / 2));
  const mixed: SuggestedLook[] = [];
  const fromInfluencers = pick(influencers, half);
  const fromHouses = pick(houses, half);
  const max = Math.max(fromInfluencers.length, fromHouses.length);
  for (let i = 0; i < max && mixed.length < limit; i += 1) {
    const house = fromHouses[i];
    const influencer = fromInfluencers[i];
    if (house) mixed.push(house);
    if (influencer && mixed.length < limit) mixed.push(influencer);
  }
  if (mixed.length < limit) {
    const used = new Set(mixed.map((row) => row.look.id));
    for (const row of pick([...influencers, ...houses], limit * 2)) {
      if (used.has(row.look.id)) continue;
      mixed.push(row);
      used.add(row.look.id);
      if (mixed.length >= limit) break;
    }
  }
  return mixed.slice(0, limit);
}

export function looksForYou(looks: Look[], labels: FashionLabel[], likings: string[]): Look[] {
  const suggested = suggestLooks({ looks, labels, likings, limit: looks.length });
  if (suggested.length > 0) return suggested.map((row) => row.look);
  if (likings.length === 0) {
    return looks.filter((look) => look.userId !== EDITORIAL_USER_ID);
  }
  return [...looks].sort(
    (a, b) => moodOverlap(b.moods, likings) - moodOverlap(a.moods, likings),
  );
}
