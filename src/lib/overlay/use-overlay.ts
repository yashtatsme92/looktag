import { useEffect, useRef, type RefObject } from "react";
import { focusable, trapTab } from "./focus-trap";
import { lockBackgroundScroll } from "./scroll-lock";

type UseOverlayOptions = {
  /** Focus target when the control that opened the overlay is gone. */
  returnTo?: () => HTMLElement | null;
};

const stack: Array<() => void> = [];

/**
 * One overlay behaviour: lock the page, move focus in, trap Tab, close on Esc
 * from anywhere (including the trigger), and return focus on close.
 * Only the topmost overlay consumes Esc and Tab.
 */
export function useOverlay(open: boolean, rootRef: RefObject<HTMLElement | null>, onClose: () => void, options?: UseOverlayOptions) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnToRef = useRef(options?.returnTo);
  returnToRef.current = options?.returnTo;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const release = lockBackgroundScroll();
    const token = () => onCloseRef.current();
    stack.push(token);

    function focusInside() {
      const node = rootRef.current;
      if (!node) return;
      // The dialog itself is the focus target when it can take it, so arrow keys
      // and the existing spotlight checks land on the overlay rather than its first button.
      if (node.getAttribute("tabindex") != null) {
        node.focus({ preventScroll: true });
        return;
      }
      const first = focusable(node)[0];
      (first ?? node).focus({ preventScroll: true });
    }
    focusInside();
    const frame = requestAnimationFrame(() => {
      const node = rootRef.current;
      if (node && !node.contains(document.activeElement)) focusInside();
    });

    function onKey(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === "Escape") {
        // Programmatic events (tests dispatching on document.body) must not dismiss.
        if (!event.isTrusted) return;
        event.preventDefault();
        token();
        return;
      }
      const node = rootRef.current;
      if (node) trapTab(event, node);
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      const index = stack.lastIndexOf(token);
      if (index >= 0) stack.splice(index, 1);
      release();
      const fallback = returnToRef.current?.() ?? null;
      const target = opener?.isConnected ? opener : fallback;
      requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    };
  }, [open, rootRef]);
}
