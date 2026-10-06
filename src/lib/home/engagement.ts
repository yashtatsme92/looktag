import type { FashionCollection, FashionLabel, FashionStyle } from "../labels/model.ts";
import { publicLines } from "../labels/model.ts";
import type { Look } from "../looks/types.ts";

export const ECHO_TRAIL_CHIPS = ["Darker", "Lighter", "More tailored", "More relaxed"] as const;
export type EchoTrailChip = (typeof ECHO_TRAIL_CHIPS)[number];

export const DEFAULT_INTERLEAVE =
  "1 Lead · 3 Drop · 8 Beat · 11 Style · 16 Beat · 20 Because · 24 Run";

export const FEED_FEATURES = [
  { key: "feedFollow", label: "Follow creators" },
  { key: "feedEchoTrail", label: "Echo trail" },
  { key: "feedFresh", label: "Fresh first" },
  { key: "feedRuns", label: "Mood runs" },
  { key: "feedSaves", label: "Saves tune the feed" },
  { key: "feedDrop", label: "Weekly House drop" },
  { key: "feedStyleCards", label: "House Style cards in feed" },
] as const;

export type FeedFeatureKey = (typeof FEED_FEATURES)[number]["key"];

/** Confirm copy for one Feed & discovery switch. Cancel leaves it unchanged. */
export function feedSwitchCopy(feature: string, turningOff: boolean): { title: string; body: string; confirm: string } {
  if (turningOff) {
    return {
      title: `Turn off ${feature}?`,
      body: "Shoppers won't see it. Nothing is deleted.",
      confirm: `Turn off ${feature}`,
    };
  }
  return {
    title: `Turn ${feature} back on?`,
    body: "Shoppers will see it again.",
    confirm: `Turn on ${feature}`,
  };
}

export function feedModulesNote(on: number): string {
  return `7 modules · ${on} on`;
}

/** Status line under one Feed & discovery switch. */
export function feedFeatureStatus(input: {
  on: boolean;
  housesOn: boolean;
  pausedWithHouses?: boolean;
  scheduled?: boolean;
}): string {
  if (!input.on) return "Off · hidden from shoppers";
  if (input.pausedWithHouses && !input.housesOn) return "On · paused while Houses are off";
  if (input.scheduled === false) return "On · nothing scheduled";
  return "On · visible to shoppers";
}

const DAY = 24 * 60 * 60 * 1000;

export function freshWindowMs(window: "24h" | "3d" | "7d" = "3d"): number {
  if (window === "24h") return DAY;
  if (window === "7d") return 7 * DAY;
  return 3 * DAY;
}

/** Fresh looks lead. Each group keeps its previous order. Not a badge. */
export function freshFirst(looks: readonly Look[], now: number, window: "24h" | "3d" | "7d" = "3d"): Look[] {
  const cutoff = now - freshWindowMs(window);
  const fresh: Look[] = [];
  const rest: Look[] = [];
  for (const look of looks) {
    if (look.createdAt >= cutoff) fresh.push(look);
    else rest.push(look);
  }
  return [...fresh, ...rest];
}

/** Divider only for a signed-in shopper coming back, once the caller decides to show it. */
export function freshDivider(input: { signedIn: boolean; returning: boolean; freshCount: number }): string | null {
  if (!input.signedIn || !input.returning || input.freshCount < 1) return null;
  return "New since your last visit";
}

/** Reweights a lane. Nothing is removed and there are no counts. */
export function refineLane(looks: readonly Look[], chip: string): Look[] {
  const score = (look: Look) => {
    const moods = new Set(look.moods ?? []);
    if (chip === "Darker") return moods.has("evening") ? 0 : 1;
    if (chip === "Lighter") return moods.has("coastal") ? 0 : moods.has("evening") ? 2 : 1;
    if (chip === "More tailored") return moods.has("tailored") ? 0 : 1;
    if (chip === "More relaxed") return moods.has("knit") || moods.has("coastal") ? 0 : 1;
    return 1;
  };
  return looks
    .map((look, index) => ({ look, index, score: score(look) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((row) => row.look);
}

export function pushTrail(trail: readonly string[], chip: string): string[] {
  if (trail.length >= 4) return trail.slice();
  if (trail[trail.length - 1] === chip) return trail.slice();
  return [...trail, chip];
}

/** Reverse-chronological looks from followed creators. No ranking. */
export function followingLooks(looks: readonly Look[], creatorIds: readonly string[]): Look[] {
  const ids = new Set(creatorIds);
  return looks
    .filter((look) => ids.has(look.userId))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export type WeeklyDrop = {
  houseId: string;
  houseName: string;
  lineName: string;
  lineSlug: string;
  imageSrc: string;
};

function berlinYmd(now: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Monday of the Europe/Berlin week, YYYY-MM-DD. */
export function berlinWeekKey(now: number): string {
  const { year, month, day } = berlinYmd(now);
  const utc = Date.UTC(year, month - 1, day);
  const weekday = new Date(utc).getUTCDay();
  const monday = utc - ((weekday + 6) % 7) * DAY;
  const date = new Date(monday);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** One Line from a Scouted live House. Stable for the Berlin week. */
export function pickWeeklyDrop(
  labels: readonly Pick<FashionLabel, "id" | "name" | "scouted" | "status">[],
  collections: readonly FashionCollection[],
  styles: readonly FashionStyle[],
  now = Date.now(),
): WeeklyDrop | null {
  const live = labels.filter((label) => label.scouted && label.status === "approved");
  const rows = live.flatMap((label) =>
    publicLines(
      collections.filter((collection) => collection.labelId === label.id),
      styles.filter((style) => style.labelId === label.id),
    ).map((line) => ({ label, line })),
  );
  if (rows.length === 0) return null;
  const key = berlinWeekKey(now);
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const picked = rows[hash % rows.length];
  if (!picked) return null;
  const image = picked.line.styles[0]?.imageSrc ?? "";
  if (!image) return null;
  return {
    houseId: picked.label.id,
    houseName: picked.label.name,
    lineName: picked.line.collection.name,
    lineSlug: picked.line.collection.slug,
    imageSrc: image,
  };
}

/** Where the Style card sits. A live drop pushes it so two House items are not within 8 slots. */
export function styleCardAfterDrop(lookCount: number, dropSlot: number | null): number | null {
  if (lookCount < 4) return null;
  if (dropSlot == null) return 4;
  const index = Math.max(9, dropSlot + 8);
  if (lookCount <= index) return null;
  return index;
}

export type FollowingHouseCard = {
  kind: "line" | "style";
  id: string;
  houseId: string;
  houseName: string;
  title: string;
  imageSrc: string;
  lineSlug: string;
  styleId?: string;
  createdAt: number;
};

/** New Lines and Styles from followed live Houses. Reverse-chronological. No ranking. */
export function followingHouseCards(
  labels: readonly Pick<FashionLabel, "id" | "name" | "status">[],
  collections: readonly FashionCollection[],
  styles: readonly FashionStyle[],
  followedHouseIds: readonly string[],
): FollowingHouseCard[] {
  const ids = new Set(followedHouseIds);
  const cards: FollowingHouseCard[] = [];
  for (const label of labels) {
    if (!ids.has(label.id) || label.status !== "approved") continue;
    const lines = publicLines(
      collections.filter((collection) => collection.labelId === label.id),
      styles.filter((style) => style.labelId === label.id),
    );
    for (const line of lines) {
      const image = line.styles[0]?.imageSrc ?? "";
      if (!image) continue;
      cards.push({
        kind: "line",
        id: line.collection.id,
        houseId: label.id,
        houseName: label.name,
        title: line.collection.name,
        imageSrc: image,
        lineSlug: line.collection.slug,
        createdAt: line.collection.createdAt,
      });
      for (const style of line.styles) {
        if (!style.imageSrc) continue;
        cards.push({
          kind: "style",
          id: style.id,
          houseId: label.id,
          houseName: label.name,
          title: style.name,
          imageSrc: style.imageSrc,
          lineSlug: line.collection.slug,
          styleId: style.id,
          createdAt: line.collection.createdAt,
        });
      }
    }
  }
  return cards.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
