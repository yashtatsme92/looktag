import type { Look } from "../looks/types.ts";

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
