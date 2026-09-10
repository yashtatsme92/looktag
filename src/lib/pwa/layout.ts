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
