export const SPLASH_IDS = ["wordmark", "tag-draw", "pieces", "soft-power"] as const;
export type SplashId = (typeof SPLASH_IDS)[number];

export const DEFAULT_SPLASH: SplashId = "tag-draw";
export const SPLASH_ROTATION_KEY = "looktag-splash-rotation-v1";

export const SPLASH_OPTIONS: {
  id: SplashId;
  label: string;
  hint: string;
}[] = [
  { id: "wordmark", label: "Wordmark", hint: "Italic wordmark with a fine drawn underline." },
  { id: "tag-draw", label: "Tag draw", hint: "A tag mark draws in, then Looktag appears." },
  { id: "pieces", label: "Drawn pieces reveal", hint: "Linen shirt, raffia tote, pleated shorts, espadrilles." },
  { id: "soft-power", label: "Elegant “soft power”", hint: "Satin blouse, wide-leg trousers, clutch, kitten heels." },
];

export function isSplashId(value: unknown): value is SplashId {
  return SPLASH_IDS.includes(value as SplashId);
}

export function parseSplashId(value: unknown): SplashId {
  return isSplashId(value) ? value : DEFAULT_SPLASH;
}

export function nextSplashId(value: SplashId): SplashId {
  return SPLASH_IDS[(SPLASH_IDS.indexOf(value) + 1) % SPLASH_IDS.length];
}

export function resolveSplashRotation(selected: SplashId, previous: unknown): SplashId {
  if (!previous || typeof previous !== "object") return selected;
  const state = previous as { selected?: unknown; last?: unknown };
  if (state.selected !== selected || !isSplashId(state.last)) return selected;
  return nextSplashId(state.last);
}

export function isCurrentSplashRotation(selected: SplashId, displayed: SplashId): boolean {
  if (typeof window === "undefined") return false;
  try {
    const state = JSON.parse(localStorage.getItem(SPLASH_ROTATION_KEY) || "null") as
      | { selected?: unknown; last?: unknown }
      | null;
    return state?.selected === selected && state.last === displayed;
  } catch {
    return false;
  }
}

/** The server selection anchors a per-browser round-robin used for cold starts. */
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
  if (isCurrentSplashRotation(input.fromStore, input.stored)) return parseSplashId(input.stored);
  return parseSplashId(input.fromStore);
}

/**
 * Runs in <head> before first paint. Restores the theme and rotates from the
 * admin-selected splash, persisting the position for the next cold start.
 */
export const EARLY_CHROME_SCRIPT = `(function(){try{var r=document.documentElement;try{var th=localStorage.getItem("looktag-theme-v1");if(th)r.setAttribute("data-theme",th);var path=location.pathname;var share=/^\\/looks\\/[^/]+$/.test(path)||/^\\/houses\\/[^/]+$/.test(path)||/^\\/houses\\/[^/]+\\/[^/]+$/.test(path);var played=sessionStorage.getItem("looktag-boot-v1")==="done";if(!share&&!played){var ids=["wordmark","tag-draw","pieces","soft-power"];var selected=r.getAttribute("data-splash")||"tag-draw";var key="${SPLASH_ROTATION_KEY}";var previous=JSON.parse(localStorage.getItem(key)||"null");var shown=selected;if(previous&&previous.selected===selected&&ids.indexOf(previous.last)>=0)shown=ids[(ids.indexOf(previous.last)+1)%ids.length];r.setAttribute("data-splash",shown);localStorage.setItem(key,JSON.stringify({selected:selected,last:shown}))}}catch(e){}var w=window.innerWidth||0;var native=r.classList.contains("native-app");var phone=native||w<768;r.setAttribute("data-chrome",phone?"phone":w<1024?"tablet":"desktop");if(phone){var vv=window.visualViewport;var t=vv&&vv.offsetTop?vv.offsetTop:0;r.style.setProperty("--vv-offset",Math.max(0,Math.round(t))+"px")}}catch(e){}})();`;
