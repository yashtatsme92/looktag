import { useEffect } from "react";
import { keyboardInset } from "@/lib/pwa/viewport";

const FIELD = "input, textarea";
const CLEARANCE = 16;
const MIN_KEYBOARD = 80;

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

function release(root: HTMLElement) {
  delete root.dataset.kb;
  root.style.removeProperty("--kb-pad");
  const dock = root.querySelector<HTMLElement>("[data-kb-dock]");
  dock?.style.removeProperty("top");
}

/**
 * While a Create field is focused and the keyboard is up, the step's primary
 * (`[data-kb-dock]`) sits on the visual viewport bottom and the field scrolls
 * clear of it. Nothing is resized; the photo just scrolls away.
 */
export function useKeyboardDock() {
  useEffect(() => {
    const vv = window.visualViewport;
    let timer = 0;

    function sync() {
      const vv = window.visualViewport;
      const field = document.activeElement;
      const root =
        vv && field instanceof HTMLElement && field.matches(FIELD)
          ? field.closest<HTMLElement>("[data-kb-root]")
          : null;
      document.querySelectorAll<HTMLElement>("[data-kb-root][data-kb]").forEach((el) => {
        if (el !== root) release(el);
      });
      if (!vv || !root || !(field instanceof HTMLElement)) return;
      if (keyboardInset(window.innerHeight, vv.height, vv.offsetTop) < MIN_KEYBOARD) {
        release(root);
        return;
      }
      const bottom = vv.offsetTop + vv.height;
      const dock = root.querySelector<HTMLElement>("[data-kb-dock]");
      const scroller = scrollParent(field);
      root.dataset.kb = "open";
      let dockHeight = 0;
      if (dock) {
        const screenTop = dock.closest(".native-screen")?.getBoundingClientRect().top ?? 0;
        dock.style.top = `${bottom - screenTop}px`;
        dockHeight = dock.offsetHeight;
      }
      const hidden = scroller ? Math.max(0, scroller.getBoundingClientRect().bottom - bottom) : 0;
      root.style.setProperty("--kb-pad", `${Math.ceil(dockHeight + hidden + CLEARANCE)}px`);
      if (!scroller) return;
      const rect = field.getBoundingClientRect();
      const limit = bottom - dockHeight - CLEARANCE;
      if (rect.bottom > limit) {
        scroller.scrollTop += rect.bottom - limit;
      } else if (rect.top < scroller.getBoundingClientRect().top + CLEARANCE) {
        scroller.scrollTop -= scroller.getBoundingClientRect().top + CLEARANCE - rect.top;
      }
    }

    function later() {
      window.clearTimeout(timer);
      timer = window.setTimeout(sync, 30);
    }

    function focused() {
      sync();
      later();
    }

    document.addEventListener("focusin", focused);
    document.addEventListener("focusout", later);
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", focused);
      document.removeEventListener("focusout", later);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.querySelectorAll<HTMLElement>("[data-kb-root][data-kb]").forEach(release);
    };
  }, []);
}
