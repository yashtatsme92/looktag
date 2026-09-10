import { useEffect } from "react";
import { keyboardInset, viewportContent } from "@/lib/pwa/viewport";

function writeViewport(content: string) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && meta.getAttribute("content") !== content) {
    meta.setAttribute("content", content);
  }
}

function appShell(): { standalone: boolean; nativeApp: boolean; width: number } {
  const root = document.documentElement;
  return {
    standalone: root.classList.contains("standalone"),
    nativeApp: root.classList.contains("native-app"),
    width: window.innerWidth,
  };
}

/**
 * Phone and installed shells stay 1:1 — no pinch, no iOS focus-zoom.
 * The visual viewport height becomes --app-height so the keyboard resizes
 * the chrome instead of scaling the page.
 */
export function ViewportLock() {
  useEffect(() => {
    const root = document.documentElement;

    function sync() {
      const { standalone, nativeApp, width } = appShell();
      writeViewport(viewportContent(width, standalone, nativeApp));
      const phone = standalone || nativeApp || width < 768;
      if (!phone) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--keyboard-inset");
        return;
      }
      const vv = window.visualViewport;
      const visualHeight = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      root.style.setProperty("--app-height", `${Math.round(visualHeight)}px`);
      root.style.setProperty(
        "--keyboard-inset",
        `${keyboardInset(window.innerHeight, visualHeight, offsetTop)}px`,
      );
    }

    function preventPinch(event: TouchEvent) {
      const { standalone, nativeApp, width } = appShell();
      if (!standalone && !nativeApp && width >= 768) return;
      if (event.touches.length > 1) event.preventDefault();
    }

    function preventGesture(event: Event) {
      const { standalone, nativeApp, width } = appShell();
      if (!standalone && !nativeApp && width >= 768) return;
      event.preventDefault();
    }

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);
    document.addEventListener("touchmove", preventPinch, { passive: false });
    document.addEventListener("gesturestart", preventGesture, { passive: false });

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("touchmove", preventPinch);
      document.removeEventListener("gesturestart", preventGesture);
    };
  }, []);

  return null;
}
