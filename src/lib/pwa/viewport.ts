/** Phone / installed shell — no pinch, no iOS focus-zoom. */
export const APP_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";

/** Tablet and desktop browsers keep pinch-zoom. */
export const WEB_VIEWPORT =
  "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content";

export function isAppViewport(width: number, standalone = false, nativeApp = false): boolean {
  return standalone || nativeApp || width < 768;
}

export function viewportContent(width: number, standalone = false, nativeApp = false): string {
  return isAppViewport(width, standalone, nativeApp) ? APP_VIEWPORT : WEB_VIEWPORT;
}

/** Keyboard overlap in CSS pixels. Zero when the visual viewport is the full window. */
export function keyboardInset(innerHeight: number, visualHeight: number, offsetTop = 0): number {
  const inset = innerHeight - visualHeight - offsetTop;
  if (!Number.isFinite(inset)) return 0;
  return Math.max(0, Math.round(inset));
}

/** Smallest extra viewport shrink (px) that counts as an on-screen keyboard. */
export const KEYBOARD_MIN_INSET = 120;

/** Largest unfocused shortfall (px) trusted as a static standalone baseline. */
export const BASELINE_MAX_INSET = 200;

/**
 * Visual-viewport height to pin --app-height to, or null to let CSS 100dvh decide.
 * iOS standalone reports a visualViewport shorter than the screen with no keyboard open,
 * which leaves an empty band under the tab bar. Only pin while an editable field has focus
 * and the viewport has shrunk by a keyboard-sized amount beyond that static `baseline`
 * (the shortfall measured while nothing was focused).
 */
export function appHeightOverride(
  innerHeight: number,
  visualHeight: number,
  offsetTop = 0,
  editableFocused = false,
  baseline = 0,
): number | null {
  if (!editableFocused) return null;
  const extra = keyboardInset(innerHeight, visualHeight, offsetTop) - Math.max(0, baseline);
  return extra >= KEYBOARD_MIN_INSET ? Math.round(visualHeight) : null;
}

/** True when the element takes text input, i.e. the on-screen keyboard can be open. */
export function isEditableElement(
  el: { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined,
): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return ![
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "range",
    "file",
    "image",
    "color",
  ].includes((el.type ?? "").toLowerCase());
}
