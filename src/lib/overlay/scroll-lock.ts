type Saved = { el: HTMLElement; overflow: string; top: number };

let depth = 0;
let saved: Saved[] = [];
let htmlOverflow = "";
let pad = "";

function scrollers(): HTMLElement[] {
  const list: HTMLElement[] = [];
  const root = document.scrollingElement;
  if (root instanceof HTMLElement) list.push(root);
  if (document.body && !list.includes(document.body)) list.push(document.body);
  for (const el of document.querySelectorAll<HTMLElement>(".native-main, .echo-snap")) {
    if (!list.includes(el)) list.push(el);
  }
  return list;
}

/**
 * Stops the page behind an overlay from moving. The lock is overflow:hidden
 * on the document and on the phone scrollers, which keep their scrollTop, so
 * closing the overlay does not jump. A classic scrollbar's width is padded
 * onto the document so the masthead's right edge stays put.
 */
export function lockBackgroundScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  depth += 1;
  if (depth === 1) {
    saved = scrollers().map((el) => ({ el, overflow: el.style.overflow, top: el.scrollTop }));
    for (const item of saved) item.el.style.overflow = "hidden";
    htmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const gap = window.innerWidth - document.documentElement.clientWidth;
    pad = document.documentElement.style.paddingRight;
    if (gap > 0) document.documentElement.style.paddingRight = `${gap}px`;
    document.documentElement.classList.add("overlay-lock");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    for (const item of saved) {
      item.el.style.overflow = item.overflow;
      if (Math.abs(item.el.scrollTop - item.top) > 1) item.el.scrollTop = item.top;
    }
    saved = [];
    document.documentElement.style.overflow = htmlOverflow;
    document.documentElement.style.paddingRight = pad;
    document.documentElement.classList.remove("overlay-lock");
  };
}
