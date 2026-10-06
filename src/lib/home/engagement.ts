import type { FashionCollection, FashionLabel, FashionStyle } from "../labels/model.ts";
import { publicLines } from "../labels/model.ts";
import type { Look } from "../looks/types.ts";

export const ECHO_TRAIL_CHIPS = ["Darker", "Lighter", "More tailored", "More relaxed"] as const;
export type EchoTrailChip = (typeof ECHO_TRAIL_CHIPS)[number];

export const DEFAULT_INTERLEAVE =
  "1 Lead · 3 Drop · 8 Beat · 11 Style · 16 Beat · 20 Because · 24 Run";

export const FEED_FEATURES = [
  {
    key: "feedFollow",
    label: "Follow creators / Following tab",
    detail: "Follow on creator names, the For you · Following tabs and the Following feed.",
    settings: false,
  },
  {
    key: "feedEchoTrail",
    label: "Echo trail",
    detail: "Up to 4 refine chips and a breadcrumb trail inside the Echo lane.",
    settings: true,
  },
  {
    key: "feedFresh",
    label: "Fresh first",
    detail: "Boosts recent looks in For you and shows the “New since your last visit” divider.",
    settings: true,
  },
  {
    key: "feedRuns",
    label: "Mood runs",
    detail: "Curated runs of 5–6 looks in For you.",
    settings: true,
  },
  {
    key: "feedSaves",
    label: "Saves tune the feed",
    detail: "Saves reweight For you; “Because you saved” and “Show less like this”.",
    settings: true,
  },
  {
    key: "feedDrop",
    label: "Weekly House drop",
    detail: "One Line from a Scouted House each week, in For you and on Houses.",
    settings: true,
  },
  {
    key: "feedStyleCards",
    label: "House Style cards in feed",
    detail: "Style cards from Scouted Houses in For you.",
    settings: true,
  },
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
  attention?: boolean;
}): string {
  if (!input.on) return "Off · hidden from shoppers";
  if (input.pausedWithHouses && !input.housesOn) return "On · paused while Houses are off";
  if (input.attention) return "On · needs attention";
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

export type FreshWindow = "24h" | "3d" | "7d";

export type FeedCadence = {
  dropSlot: 3 | 4;
  styleEvery: 12 | 16 | 24;
  becauseEvery: 20 | 24 | 32;
  runEvery: 24 | 32 | 48;
  freshWindow: FreshWindow;
};

export const DEFAULT_CADENCE: FeedCadence = {
  dropSlot: 3,
  styleEvery: 12,
  becauseEvery: 20,
  runEvery: 24,
  freshWindow: "3d",
};

function asChoice<T extends number>(value: number, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Admin can only keep the default or make a module rarer or later. */
export function clampCadence(input: Partial<FeedCadence>): FeedCadence {
  return {
    dropSlot: input.dropSlot === 4 ? 4 : 3,
    styleEvery: asChoice(input.styleEvery ?? 12, [12, 16, 24] as const, 12),
    becauseEvery: asChoice(input.becauseEvery ?? 20, [20, 24, 32] as const, 20),
    runEvery: asChoice(input.runEvery ?? 24, [24, 32, 48] as const, 24),
    freshWindow: input.freshWindow === "24h" || input.freshWindow === "7d" ? input.freshWindow : "3d",
  };
}

export type MoodRun = { title: string; lookIds: string[] };

export function parseMoodRun(title: unknown, ids: unknown): MoodRun | null {
  const name = typeof title === "string" ? title.trim() : "";
  const lookIds = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : typeof ids === "string"
      ? ids.split(",").map((id) => id.trim()).filter(Boolean)
      : [];
  if (!name || lookIds.length < 5 || lookIds.length > 6) return null;
  if (name.toLowerCase().includes("mood")) return null;
  return { title: name, lookIds: lookIds.slice(0, 6) };
}

/** Empty, too short, or a real run of 5–6 looks. */
export function moodRunState(title: string, ids: string): "empty" | "attention" | "ready" {
  const trimmed = title.trim();
  const count = ids.split(",").map((id) => id.trim()).filter(Boolean).length;
  if (!trimmed && count === 0) return "empty";
  if (parseMoodRun(title, ids)) return "ready";
  return "attention";
}

export type FeedSlotName = "Lead" | "Drop" | "Beat" | "Style" | "Because" | "Run";

/** 24-slot proof. Lead stays at 1. A collision moves the later module and records Earliest N. */
export function placeFeed(cadence: FeedCadence): { slots: Array<{ slot: number; name: FeedSlotName }>; notes: string[] } {
  const taken = new Map<number, FeedSlotName>([
    [1, "Lead"],
    [8, "Beat"],
    [16, "Beat"],
  ]);
  const notes: string[] = [];
  const styleWanted = cadence.styleEvery === 12 ? 11 : cadence.styleEvery;
  const requests: Array<[FeedSlotName, number]> = [
    ["Drop", cadence.dropSlot],
    ["Style", styleWanted],
    ["Because", cadence.becauseEvery],
    ["Run", cadence.runEvery],
  ];
  for (const [name, wanted] of requests) {
    let slot = wanted;
    while (slot <= 48) {
      const occupied = taken.has(slot);
      const close = [...taken.entries()].some(([other, label]) => label !== "Lead" && Math.abs(other - slot) < 3);
      if (!occupied && !close) break;
      slot += 1;
    }
    if (slot > 24) {
      notes.push(`${name} is later than this preview`);
      continue;
    }
    taken.set(slot, name);
    if (slot !== wanted) notes.push(`${name} moved · Earliest ${slot}`);
  }
  const slots = [...taken.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, name]) => ({ slot, name }));
  return { slots, notes };
}

export function proofFromCadence(cadence: FeedCadence): string {
  return placeFeed(cadence).slots.map((row) => `${row.slot} ${row.name}`).join(" · ");
}

export function applyFeedCopy(changes: readonly string[]): { title: string; body: string; confirm: string } {
  return {
    title: "Apply feed changes?",
    body: changes.length > 0 ? changes.join(" · ") : "Nothing changed.",
    confirm: "Apply",
  };
}

/** Looks that share a mood with a save. The saved looks themselves stay out. */
export function becauseYouSaved(looks: readonly Look[], savedIds: readonly string[]): Look[] {
  const saved = new Set(savedIds);
  const moods = new Set(looks.filter((look) => saved.has(look.id)).flatMap((look) => look.moods ?? []));
  if (saved.size === 0 || moods.size === 0) return [];
  return looks.filter((look) => !saved.has(look.id) && (look.moods ?? []).some((mood) => moods.has(mood))).slice(0, 6);
}

/** Push muted looks later. The lead stays. Nothing is removed. */
export function showLessOrder(looks: readonly Look[], lessIds: readonly string[]): Look[] {
  if (lessIds.length === 0 || looks.length === 0) return looks.slice();
  const less = new Set(lessIds);
  const lead = looks[0];
  if (!lead) return looks.slice();
  const keep: Look[] = [];
  const later: Look[] = [];
  for (const look of looks.slice(1)) {
    if (less.has(look.id)) later.push(look);
    else keep.push(look);
  }
  return [lead, ...keep, ...later];
}

/** Similar unseen looks move up behind the first two plates. Nothing is removed. */
export function savesTune(looks: readonly Look[], savedIds: readonly string[]): Look[] {
  if (savedIds.length === 0 || looks.length < 3) return looks.slice();
  const saved = new Set(savedIds);
  const moods = new Set(looks.filter((look) => saved.has(look.id)).flatMap((look) => look.moods ?? []));
  if (moods.size === 0) return looks.slice();
  const head = looks.slice(0, 2);
  const boosted: Look[] = [];
  const rest: Look[] = [];
  for (const look of looks.slice(2)) {
    if (!saved.has(look.id) && (look.moods ?? []).some((mood) => moods.has(mood))) boosted.push(look);
    else rest.push(look);
  }
  return [...head, ...boosted, ...rest];
}

/** Where the "New since your last visit" line sits: on the first older look, never its own plate. */
export function freshDividerAt(looks: readonly Look[], now: number, window: FreshWindow = "3d"): number | null {
  const cutoff = now - freshWindowMs(window);
  let lastFresh = -1;
  looks.forEach((look, index) => {
    if (look.createdAt >= cutoff) lastFresh = index;
  });
  if (lastFresh < 0) return null;
  const at = lastFresh + 1;
  return at < looks.length ? at : null;
}

export type FollowMixItem =
  | { kind: "look"; look: Look; at: number }
  | { kind: "house"; card: FollowingHouseCard; at: number };

/** Following looks and House cards, newest first. No ranking. */
export function mixFollowing(looks: readonly Look[], cards: readonly FollowingHouseCard[]): FollowMixItem[] {
  const rows: FollowMixItem[] = [
    ...looks.map((look) => ({ kind: "look" as const, look, at: look.createdAt })),
    ...cards.map((card) => ({ kind: "house" as const, card, at: card.createdAt })),
  ];
  return rows.sort((a, b) => {
    if (b.at !== a.at) return b.at - a.at;
    const aId = a.kind === "look" ? a.look.id : a.card.id;
    const bId = b.kind === "look" ? b.look.id : b.card.id;
    return aId.localeCompare(bId);
  });
}
