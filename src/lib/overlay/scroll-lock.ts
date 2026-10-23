type Saved = { el: HTMLElement; overflow: string; top: number };

let depth = 0;
let saved: Saved[] = [];
let htmlOverflow = "";
let pad = "";
let savedWindowX = 0;
let savedWindowY = 0;
let restoring = false;
let lastTouchY = 0;

const SCROLL_KEYS = new Set([
  " ",
  "Spacebar",
  "PageDown",
  "PageUp",
  "End",
  "Home",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function scrollers(): HTMLElement[] {
  const list: HTMLElement[] = [];
  const root = document.scrollingElement;
  if (root instanceof HTMLElement) list.push(root);
  if (document.body && !list.includes(document.body)) list.push(document.body);
  for (const el of document.querySelectorAll<HTMLElement>(".native-main, .echo-snap, .wide-panel-bd")) {
    if (!list.includes(el)) list.push(el);
  }
  return list;
}

function overlayRootOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const root = node.closest<HTMLElement>("[data-overlay-root]");
  return root;
}

function canScroll(el: HTMLElement, deltaY: number, deltaX: number): boolean {
  const style = getComputedStyle(el);
  if (deltaY !== 0 && (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
    if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    if (deltaY < 0 && el.scrollTop > 0) return true;
  }
  if (deltaX !== 0 && (style.overflowX === "auto" || style.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) {
    if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    if (deltaX < 0 && el.scrollLeft > 0) return true;
  }
  return false;
}

/** The overlay element that can consume this delta, if any. */
function overlayScroller(target: EventTarget | null, deltaY: number, deltaX: number): HTMLElement | null {
  const root = overlayRootOf(target);
  if (!root || !(target instanceof Element)) return null;
  let el: HTMLElement | null = target instanceof HTMLElement ? target : null;
  while (el && root.contains(el)) {
    if (canScroll(el, deltaY, deltaX)) return el;
    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

function onWheel(event: WheelEvent) {
  const scroller = overlayScroller(event.target, event.deltaY, event.deltaX);
  if (scroller) {
    scroller.scrollTop += event.deltaY;
    scroller.scrollLeft += event.deltaX;
  }
  if (event.cancelable) event.preventDefault();
}

function keyDelta(key: string): { x: number; y: number } {
  switch (key) {
    case "ArrowDown":
    case "PageDown":
    case " ":
    case "Spacebar":
      return { x: 0, y: 1 };
    case "End":
      return { x: 0, y: 1 };
    case "ArrowUp":
    case "PageUp":
    case "Home":
      return { x: 0, y: -1 };
    case "ArrowRight":
      return { x: 1, y: 0 };
    case "ArrowLeft":
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function isSingleLineField(el: HTMLElement): boolean {
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return type !== "button" && type !== "submit" && type !== "checkbox" && type !== "radio" && type !== "range" && type !== "file" && type !== "hidden";
}

function onTouchStart(event: TouchEvent) {
  lastTouchY = event.touches[0]?.clientY ?? 0;
}

function onTouchMove(event: TouchEvent) {
  const y = event.touches[0]?.clientY ?? lastTouchY;
  const deltaY = lastTouchY - y;
  lastTouchY = y;
  const scroller = overlayScroller(event.target, deltaY, 0);
  if (scroller) scroller.scrollTop += deltaY;
  if (event.cancelable) event.preventDefault();
}

function onKey(event: KeyboardEvent) {
  if (!SCROLL_KEYS.has(event.key) || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  const pageKey = event.key === "PageDown" || event.key === "PageUp";
  if (target && overlayRootOf(target)) {
    if (isSingleLineField(target) && !pageKey) return;
    if ((target.tagName === "TEXTAREA" || target.isContentEditable) && !pageKey) {
      const delta = keyDelta(event.key);
      if (event.key === " " || event.key === "Spacebar" || overlayScroller(target, delta.y, delta.x)) return;
    }
    if ((event.key === " " || event.key === "Spacebar") && (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "SUMMARY")) {
      return;
    }
    // The piece card uses ArrowLeft/Right to step pins and cancels the scroll itself.
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && target.closest(".look-plate-piece")) return;
    const delta = keyDelta(event.key);
    const scroller = overlayScroller(target, delta.y * 40, delta.x * 40);
    if (scroller) {
      const step = event.key === "PageDown" || event.key === "PageUp" ? scroller.clientHeight : event.key === "End" || event.key === "Home" ? scroller.scrollHeight : 40;
      scroller.scrollTop += delta.y < 0 ? -step : delta.y > 0 ? step : 0;
      scroller.scrollLeft += delta.x < 0 ? -step : delta.x > 0 ? step : 0;
    }
  }
  event.preventDefault();
}

function onScroll() {
  if (restoring) return;
  restoring = true;
  if (window.scrollX !== savedWindowX || window.scrollY !== savedWindowY) {
    window.scrollTo(savedWindowX, savedWindowY);
  }
  for (const item of saved) {
    if (item.el.isConnected && item.el.scrollTop !== item.top) item.el.scrollTop = item.top;
  }
  restoring = false;
}

function arm() {
  savedWindowX = window.scrollX;
  savedWindowY = window.scrollY;
  saved = scrollers().map((el) => ({ el, overflow: el.style.overflow, top: el.scrollTop }));
  for (const item of saved) item.el.style.overflow = "hidden";
  htmlOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  const gap = window.innerWidth - document.documentElement.clientWidth;
  pad = document.documentElement.style.paddingRight;
  if (gap > 0) document.documentElement.style.paddingRight = `${gap}px`;
  document.documentElement.classList.add("overlay-lock");
  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
  document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
  document.addEventListener("keydown", onKey, { capture: true });
  window.addEventListener("scroll", onScroll, true);
}

function disarm() {
  document.removeEventListener("wheel", onWheel, { capture: true });
  document.removeEventListener("touchstart", onTouchStart, { capture: true });
  document.removeEventListener("touchmove", onTouchMove, { capture: true });
  document.removeEventListener("keydown", onKey, { capture: true });
  window.removeEventListener("scroll", onScroll, true);
  for (const item of saved) {
    if (!item.el.isConnected) continue;
    item.el.style.overflow = item.overflow;
    if (Math.abs(item.el.scrollTop - item.top) > 1) item.el.scrollTop = item.top;
  }
  saved = [];
  document.documentElement.style.overflow = htmlOverflow;
  document.documentElement.style.paddingRight = pad;
  document.documentElement.classList.remove("overlay-lock");
  if (window.scrollX !== savedWindowX || window.scrollY !== savedWindowY) {
    window.scrollTo(savedWindowX, savedWindowY);
  }
}

/**
 * Stops the page behind an overlay from moving. overflow:hidden keeps the
 * phone scrollers put; wheel, touch and the scroll keys are cancelled unless
 * the open overlay itself can scroll. A scroll listener puts window.scrollY
 * back if the browser moves it anyway (focus, End, PageDown).
 */
export function lockBackgroundScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  depth += 1;
  if (depth === 1) arm();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    disarm();
  };
}
