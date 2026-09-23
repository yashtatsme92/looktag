/**
 * Viewport chrome. Phone keeps native chrome (header + tab bar + full-bleed
 * feed). Tablet and desktop are a website: masthead, portrait lookbook,
 * plate-sized photos. Capacitor (`html.native-app`) always stays on phone
 * chrome so the exported app does not jump layouts.
 */
export const WIDE_LAYOUT_MIN_PX = 768;
export const DESKTOP_LAYOUT_MIN_PX = 1024;
export const WIDE_LAYOUT_QUERY = `(min-width: ${WIDE_LAYOUT_MIN_PX}px)`;

export type ChromeLayout = "phone" | "tablet" | "desktop";
export type LayoutSurface = "web" | "native";

/** Pull distance at which the refresh pill may paint. Below this it stays out of the DOM. */
export const REFRESH_NOTICE_PULL_PX = 8;

export function chromeFromWidth(width: number, nativeApp = false): ChromeLayout {
  if (nativeApp) return "phone";
  if (width < WIDE_LAYOUT_MIN_PX) return "phone";
  if (width < DESKTOP_LAYOUT_MIN_PX) return "tablet";
  return "desktop";
}

export function isWideChrome(chrome: ChromeLayout) {
  return chrome !== "phone";
}

export function syncDocumentChrome(width: number, nativeApp = false) {
  if (typeof document === "undefined") return chromeFromWidth(width, nativeApp);
  const chrome = chromeFromWidth(width, nativeApp);
  const root = document.documentElement;
  const wide = isWideChrome(chrome);
  root.classList.toggle("layout-web", wide);
  root.setAttribute("data-chrome", chrome);
  return chrome;
}

/**
 * Pull-to-refresh copy is phone-feed only. Idle / tablet / desktop / splash
 * must not paint "Release for latest" over chrome.
 */
export function refreshNoticeVisible(input: {
  chrome: ChromeLayout;
  pull: number;
  refreshing: boolean;
}): boolean {
  if (input.chrome !== "phone") return false;
  return input.refreshing || input.pull >= REFRESH_NOTICE_PULL_PX;
}

/**
 * Website layouts refresh from a control, not a pull. Phone keeps the gesture.
 */
export function webRefreshControlVisible(chrome: ChromeLayout) {
  return chrome !== "phone";
}
