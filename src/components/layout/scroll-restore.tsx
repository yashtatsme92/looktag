import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

const positions = new Map<string, number>();

function keyFor(href: string, id: string) {
  return `${href}#${id}`;
}

function pathKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

function restore(href: string) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-scroll-restoration-id]")) {
    const id = el.getAttribute("data-scroll-restoration-id");
    const top = id ? positions.get(keyFor(href, id)) : undefined;
    if (top != null) el.scrollTop = top;
  }
}

/** Puts list scroll back on Back and Forward. Push navigations stay at the top. */
export function ScrollRestore() {
  const router = useRouter();

  useEffect(() => {
    let href = pathKey(window.location.pathname, window.location.search);
    let holding = false;
    const onScroll = (event: Event) => {
      if (holding) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.getAttribute("data-scroll-restoration-id");
      if (!id) return;
      positions.set(keyFor(href, id), target.scrollTop);
    };
    document.addEventListener("scroll", onScroll, true);
    const unsub = router.history.subscribe(({ action, location }) => {
      const next = pathKey(location.pathname, typeof location.search === "string" ? location.search : window.location.search);
      if (action.type === "BACK" || action.type === "FORWARD" || action.type === "GO") {
        holding = true;
        const started = performance.now();
        const apply = () => {
          if (window.location.pathname + window.location.search !== next) {
            if (performance.now() - started < 1200) requestAnimationFrame(apply);
            else holding = false;
            return;
          }
          restore(next);
          if (performance.now() - started < 1000) requestAnimationFrame(apply);
          else holding = false;
        };
        requestAnimationFrame(apply);
      }
      href = next;
    });
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      unsub();
    };
  }, [router]);

  return null;
}
