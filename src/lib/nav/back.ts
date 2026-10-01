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

const EDIT_RETURN_KEY = "looktag-edit-return";

type EditReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function editReturnStorage(storage?: EditReturnStorage | null): EditReturnStorage | null {
  if (storage) return storage;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Remember that Edit was opened from this look, so Back can pop instead of stacking. */
export function markEditOpenedFromLook(lookId: string, storage?: EditReturnStorage | null) {
  editReturnStorage(storage)?.setItem(EDIT_RETURN_KEY, lookId);
}

/**
 * Leaving Edit must not push the look on top of the editor.
 * That stack makes Back alternate between Edit look and View look.
 * Pop only when this visit started from the look. Otherwise replace.
 */
export function leaveEditMode(
  state: unknown,
  lookId: string,
  storage?: EditReturnStorage | null,
): "back" | "replace" {
  const box = editReturnStorage(storage);
  const fromLook = box?.getItem(EDIT_RETURN_KEY) === lookId;
  if (fromLook) box?.removeItem(EDIT_RETURN_KEY);
  if (fromLook && shouldUseHistoryBack(state)) return "back";
  return "replace";
}
