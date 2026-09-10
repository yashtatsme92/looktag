import { useEffect, useState } from "react";
import {
  DESKTOP_LAYOUT_MIN_PX,
  WIDE_LAYOUT_QUERY,
  chromeFromWidth,
  isWideChrome,
  syncDocumentChrome,
  type ChromeLayout,
  type LayoutSurface,
} from "./layout";

export { WIDE_LAYOUT_QUERY } from "./layout";

function nativeAppFlag() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("native-app");
}

function subscribeChrome(onChange: () => void) {
  const wide = window.matchMedia(WIDE_LAYOUT_QUERY);
  const desktop = window.matchMedia(`(min-width: ${DESKTOP_LAYOUT_MIN_PX}px)`);
  wide.addEventListener("change", onChange);
  desktop.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    wide.removeEventListener("change", onChange);
    desktop.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

export function isWideWebLayout() {
  if (typeof window === "undefined") return false;
  return isWideChrome(chromeFromWidth(window.innerWidth, nativeAppFlag()));
}

export function layoutSurface(): LayoutSurface {
  return nativeAppFlag() ? "native" : "web";
}

export function chromeLayout(): ChromeLayout {
  if (typeof window === "undefined") return "phone";
  return chromeFromWidth(window.innerWidth, nativeAppFlag());
}

export function useWideLayout() {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const sync = () => {
      const chrome = syncDocumentChrome(window.innerWidth, nativeAppFlag());
      setWide(isWideChrome(chrome));
    };
    sync();
    return subscribeChrome(sync);
  }, []);

  return wide;
}

export function useChromeLayout() {
  const [chrome, setChrome] = useState<ChromeLayout>("phone");

  useEffect(() => {
    const sync = () => setChrome(syncDocumentChrome(window.innerWidth, nativeAppFlag()));
    sync();
    return subscribeChrome(sync);
  }, []);

  return chrome;
}
