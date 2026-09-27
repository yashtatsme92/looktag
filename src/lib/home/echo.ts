import type { Look } from "../looks/types.ts";

export const ECHO_FROM_KEY = "looktag-echo-from";

/** Phase 1 home. Mood is a similarity signal only — never a pill. Prices stay off the plate. */
export function pieceLine(look: Pick<Look, "tags">): string {
  const count = look.tags.length;
  if (count === 0) return "";
  return count === 1 ? "1 piece" : `${count} pieces`;
}

export function echoKicker(look: Pick<Look, "creator">, houseName?: string): string {
  const house = houseName?.trim() ?? "";
  const creator = look.creator?.trim() ?? "";
  if (house && creator && house.toLowerCase() !== creator.toLowerCase()) {
    return `${house} · ${creator}`;
  }
  return house || creator || "Looktag";
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

/** Looks that continue the one you peeled — shared mood, else the same creator, else the rest. */
export function echoLane(anchor: Look, looks: Look[]): Look[] {
  const rest = withImage(looks).filter((look) => look.id !== anchor.id);
  const moods = new Set(anchor.moods ?? []);
  const similar = rest.filter(
    (look) =>
      (look.moods ?? []).some((mood) => moods.has(mood)) ||
      Boolean(anchor.userId && look.userId === anchor.userId),
  );
  return similar.length > 0 ? similar : rest;
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

/** Quiet ease-out. Long enough to read, short enough to feel direct. */
export const ECHO_SLIDE_MS = 520;

/** Edge drag compresses instead of slamming into a hard stop. */
export function echoDragOffset(dy: number, canAdvance: boolean, canRetreat: boolean): number {
  if (!Number.isFinite(dy)) return 0;
  if (dy < 0 && !canAdvance) return dy * 0.22;
  if (dy > 0 && !canRetreat) return dy * 0.22;
  return dy;
}

/** Settle distance matches the plate, not the browser window. */
export function echoSettleY(decision: EchoSwipe, height: number): number {
  const distance = Number.isFinite(height) ? Math.max(0, height) : 0;
  if (decision === "next" || decision === "end" || decision === "back") return -distance;
  if (decision === "prev") return distance;
  return 0;
}

/** Vertical swipe moves the plate. A left peel opens the lane. Small drags stay put. */
export function echoSwipe(input: {
  dx: number;
  dy: number;
  index: number;
  length: number;
  mode: "feed" | "lane" | "creator";
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
