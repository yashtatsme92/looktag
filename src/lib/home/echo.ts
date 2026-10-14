import type { Look } from "../looks/types.ts";
import { freshFirst, savesTune, showLessOrder, type FreshWindow } from "./engagement.ts";

export const ECHO_FROM_KEY = "looktag-echo-from";

/** Phase 1 home. Mood is a similarity signal only — never a pill. Prices stay off the plate. */
export function pieceLine(look: Pick<Look, "tags">): string {
  const count = look.tags.length;
  if (count === 0) return "";
  return count === 1 ? "1 piece" : `${count} pieces`;
}

/** Creator only. Look-level House names are not kickers (locked 2026-10-02). */
export function echoKicker(look: Pick<Look, "creator">, _houseName?: string): string {
  return look.creator?.trim() ?? "";
}

/** Quiet beat whisper. Captions only — not a mood filter. */
export function beatLabel(look: Pick<Look, "caption">): string | null {
  const caption = look.caption?.trim() ?? "";
  if (!caption || caption.length > 42) return null;
  return caption;
}

function withImage(looks: Look[]): Look[] {
  return looks.filter((look) => Boolean(look.imageSrc));
}

export const ECHO_SESSION_KEY = "looktag-echo-session";
export const ECHO_IDLE_MS = 30 * 60 * 1000;

/** Session memory: one tab or app session, reset after 30 minutes idle. Never leaves the device. */
export type EchoSession = { counts: Record<string, number>; activations: number; lastActiveAt: number };

type EchoStorage = Pick<Storage, "getItem" | "setItem">;

const emptySession = (now: number): EchoSession => ({ counts: {}, activations: 0, lastActiveAt: now });

export function readEchoSession(storage: EchoStorage | null | undefined, now: number): EchoSession {
  try {
    const raw = storage?.getItem(ECHO_SESSION_KEY);
    if (!raw) return emptySession(now);
    const data = JSON.parse(raw) as Partial<EchoSession>;
    const last = Number(data.lastActiveAt);
    if (!Number.isFinite(last) || now - last > ECHO_IDLE_MS) return emptySession(now);
    const counts: Record<string, number> = {};
    for (const [mood, n] of Object.entries(data.counts ?? {})) {
      if (Number.isFinite(n) && n > 0) counts[mood] = n;
    }
    const activations = Number.isFinite(data.activations) ? Math.max(0, Number(data.activations)) : 0;
    return { counts, activations, lastActiveAt: last };
  } catch {
    return emptySession(now);
  }
}

/** Count one Echo activation and the anchor's moods. */
export function recordEcho(storage: EchoStorage | null | undefined, anchor: Pick<Look, "moods">, now: number): EchoSession {
  const session = readEchoSession(storage, now);
  const counts = { ...session.counts };
  for (const mood of new Set(anchor.moods ?? [])) counts[mood] = (counts[mood] ?? 0) + 1;
  const next = { counts, activations: session.activations + 1, lastActiveAt: now };
  try {
    storage?.setItem(ECHO_SESSION_KEY, JSON.stringify(next));
  } catch {
    // private mode
  }
  return next;
}

function browserSession(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function recordEchoActivation(anchor: Pick<Look, "moods">, now = Date.now()): void {
  recordEcho(browserSession(), anchor, now);
}

export function currentEchoSession(now = Date.now()): EchoSession {
  return readEchoSession(browserSession(), now);
}

/** The shopper's For you order: show-less, saves tune, then Fresh first (FF1). One definition for every surface. */
export function forYouOrder(
  looks: readonly Look[],
  input: { lessIds: readonly string[]; savedIds: readonly string[]; savesOn: boolean; freshOn: boolean; now: number; freshWindow: FreshWindow },
): Look[] {
  const muted = showLessOrder(looks, input.lessIds);
  const tunedSaves = input.savesOn ? savesTune(muted, input.savedIds) : muted;
  return input.freshOn ? freshFirst(tunedSaves, input.now, input.freshWindow) : tunedSaves;
}

/**
 * One Echo engine. Shared moods (most first), then the same creator, then session bias as a tie-break
 * (only after 2+ activations), then the shopper's For you order. Never adds or drops a look; the anchor
 * is excluded and a seed with no overlap returns the For you order. `onScreen` ids keep their place first.
 */
export function rankEcho(
  anchor: Look,
  looks: readonly Look[],
  options: { forYouOrder?: readonly Look[]; session?: EchoSession | null; onScreen?: readonly string[] } = {},
): Look[] {
  const order = new Map<string, number>();
  (options.forYouOrder ?? looks).forEach((look, index) => {
    if (!order.has(look.id)) order.set(look.id, index);
  });
  const rank = (look: Look) => order.get(look.id) ?? Number.MAX_SAFE_INTEGER;
  const seen = new Set<string>();
  const rest = withImage([...looks])
    .filter((look) => look.id !== anchor.id && !seen.has(look.id) && Boolean(seen.add(look.id)))
    .sort((x, y) => rank(x) - rank(y));
  const moods = new Set(anchor.moods ?? []);
  const shared = (look: Look) => new Set((look.moods ?? []).filter((mood) => moods.has(mood))).size;
  const sameCreator = (look: Look) => (anchor.userId && look.userId === anchor.userId ? 1 : 0);
  const session = options.session && options.session.activations >= 2 ? options.session : null;
  const bias = (look: Look) =>
    session ? [...new Set(look.moods ?? [])].reduce((sum, mood) => sum + (session.counts[mood] ?? 0), 0) : 0;
  const ranked = rest
    .map((look, index) => ({ look, index, shared: shared(look), creator: sameCreator(look), bias: bias(look) }))
    .sort((x, y) => y.shared - x.shared || y.creator - x.creator || y.bias - x.bias || x.index - y.index)
    .map((item) => item.look);
  const pinned = (options.onScreen ?? [])
    .map((id) => ranked.find((look) => look.id === id))
    .filter((look): look is Look => Boolean(look));
  if (pinned.length === 0) return ranked;
  const keep = new Set(pinned.map((look) => look.id));
  return [...pinned, ...ranked.filter((look) => !keep.has(look.id))];
}

/** Short run of one creator, starting at the look that opened it. */
export function creatorRun(anchor: Look, looks: Look[]): Look[] {
  if (!anchor.userId) return withImage([anchor]);
  const same = withImage(looks).filter((look) => look.userId === anchor.userId);
  const list = same.length > 0 ? same : withImage([anchor]);
  const index = list.findIndex((look) => look.id === anchor.id);
  if (index <= 0) return list;
  return [...list.slice(index), ...list.slice(0, index)];
}

export type EchoSwipe = "stay" | "next" | "prev" | "lane" | "end" | "back";

/** Which full-height plate owns this scroll position. */
export function echoSnapIndex(scrollTop: number, height: number, count: number): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(height) || height <= 0 || count <= 0) return 0;
  const index = Math.round(scrollTop / height);
  return Math.min(count - 1, Math.max(0, index));
}

/** Vertical swipe moves the plate. A left peel opens the lane. Small drags stay put. */
export function echoSwipe(input: {
  dx: number;
  dy: number;
  index: number;
  length: number;
  mode: "feed" | "lane" | "creator" | "following";
  showingReturn?: boolean;
}): EchoSwipe {
  const { dx, dy, index, length, mode, showingReturn } = input;
  if (mode === "feed" && dx < -64 && Math.abs(dx) > Math.abs(dy)) return "lane";
  if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(dx)) return "stay";
  if (dy < 0) {
    if (index < length - 1) return "next";
    if (mode === "creator" && index === length - 1) return "end";
    if (showingReturn) return "back";
    return "stay";
  }
  if (index > 0) return "prev";
  return "stay";
}
