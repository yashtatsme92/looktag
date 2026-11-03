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

/**
 * Visual-viewport height to pin --app-height to, or null to let CSS 100dvh decide.
 * iOS standalone reports a visualViewport shorter than the screen (safe area excluded),
 * which leaves an empty band under the tab bar, so only an open keyboard overrides it.
 */
export function appHeightOverride(
  innerHeight: number,
  visualHeight: number,
  offsetTop = 0,
): number | null {
  return keyboardInset(innerHeight, visualHeight, offsetTop) > 0 ? Math.round(visualHeight) : null;
}
