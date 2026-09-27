/** In-app history index from TanStack Router, when the entry is tagged. */
export function inAppHistoryIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const index = (state as { __TSR_index?: unknown }).__TSR_index;
  return typeof index === "number" && Number.isFinite(index) ? index : null;
}

/**
 * Back should stay in Looktag. Browser history.length counts the page you
 * came from outside the app, so it is not a safe signal.
 */
export function shouldUseHistoryBack(state: unknown): boolean {
  const index = inAppHistoryIndex(state);
  return index !== null && index > 0;
}
