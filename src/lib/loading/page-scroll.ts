const MAIN = ".native-main";

/** Phone chrome scrolls `.native-main`. Web layouts scroll the window. */
export function usesElementScroll(overflowY: string): boolean {
  return overflowY === "auto" || overflowY === "scroll";
}

function pageScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(MAIN);
  if (!(el instanceof HTMLElement)) return null;
  return usesElementScroll(getComputedStyle(el).overflowY) ? el : null;
}

export function readPageScroll(): number {
  const el = pageScroller();
  if (el) return el.scrollTop;
  return typeof window === "undefined" ? 0 : window.scrollY;
}

export function writePageScroll(scrollY: number): void {
  const el = pageScroller();
  if (el) {
    el.scrollTop = scrollY;
    return;
  }
  if (typeof window === "undefined") return;
  window.scrollTo({ top: scrollY, behavior: "instant" });
}
