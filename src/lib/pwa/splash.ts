export const SPLASH_IDS = ["wordmark", "tag-draw", "pieces", "soft-power"] as const;
export type SplashId = (typeof SPLASH_IDS)[number];

export const DEFAULT_SPLASH: SplashId = "tag-draw";

export const SPLASH_OPTIONS: {
  id: SplashId;
  label: string;
  hint: string;
}[] = [
  { id: "wordmark", label: "Wordmark", hint: "Italic wordmark with a fine drawn underline." },
  { id: "tag-draw", label: "Tag draw", hint: "A tag mark draws in, then Looktag appears." },
  {
    id: "pieces",
    label: "Drawn pieces reveal",
    hint: "Linen shirt, raffia tote, pleated shorts, espadrilles.",
  },
  {
    id: "soft-power",
    label: "Elegant “soft power”",
    hint: "Satin blouse, wide-leg trousers, clutch, kitten heels.",
  },
];

export function isSplashId(value: unknown): value is SplashId {
  return SPLASH_IDS.includes(value as SplashId);
}

export function parseSplashId(value: unknown): SplashId {
  return isSplashId(value) ? value : DEFAULT_SPLASH;
}

export function readStoredSplash(): SplashId {
  if (typeof document === "undefined") return DEFAULT_SPLASH;
  return parseSplashId(document.documentElement.getAttribute("data-splash"));
}

export function writeStoredSplash(id: SplashId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-splash", parseSplashId(id));
}

/**
 * Until settings hydrate from the server, keep the first-paint selection.
 */
export function resolveBootSplash(input: {
  hydrated: boolean;
  stored: SplashId;
  fromStore: SplashId;
}): SplashId {
  if (!input.hydrated) return parseSplashId(input.stored);
  return parseSplashId(input.fromStore);
}

/**
 * Runs in <head> before first paint. Restores the theme without changing the
 * server-rendered, admin-selected splash.
 */
export const EARLY_CHROME_SCRIPT = `(function(){try{var r=document.documentElement;try{var th=localStorage.getItem("looktag-theme-v1");if(th)r.setAttribute("data-theme",th);localStorage.removeItem("looktag-splash-rotation-v1")}catch(e){}var w=window.innerWidth||0;var native=r.classList.contains("native-app");var phone=native||w<768;r.setAttribute("data-chrome",phone?"phone":w<1024?"tablet":"desktop");if(phone){var vv=window.visualViewport;var t=vv&&vv.offsetTop?vv.offsetTop:0;r.style.setProperty("--vv-offset",Math.max(0,Math.round(t))+"px")}}catch(e){}})();`;
