export const SPLASH_IDS = ["minimal", "quiet", "classy", "numbered", "atelier"] as const;
export type SplashId = (typeof SPLASH_IDS)[number];

export const DEFAULT_SPLASH: SplashId = "classy";
export const SPLASH_STORAGE_KEY = "looktag-splash-v1";

export const SPLASH_OPTIONS: {
  id: SplashId;
  label: string;
  hint: string;
}[] = [
  { id: "minimal", label: "Minimal", hint: "Word only on ink." },
  { id: "quiet", label: "Quiet", hint: "Word, kicker, one line." },
  { id: "classy", label: "Classy", hint: "Coat plate and one pin." },
  { id: "numbered", label: "Numbered", hint: "Look 01, three pins, grain." },
  { id: "atelier", label: "Atelier", hint: "Guides, four pins, full plate." },
];

export function parseSplashId(value: unknown): SplashId {
  return SPLASH_IDS.includes(value as SplashId) ? (value as SplashId) : DEFAULT_SPLASH;
}

/** Last chosen splash for this browser. Never invent Classy when a value is already stored. */
export function readStoredSplash(): SplashId {
  if (typeof document === "undefined") return DEFAULT_SPLASH;
  try {
    const fromDom = document.documentElement.getAttribute("data-splash");
    if (fromDom) return parseSplashId(fromDom);
    return parseSplashId(localStorage.getItem(SPLASH_STORAGE_KEY));
  } catch {
    return DEFAULT_SPLASH;
  }
}

export function writeStoredSplash(id: SplashId) {
  if (typeof document === "undefined") return;
  const next = parseSplashId(id);
  document.documentElement.setAttribute("data-splash", next);
  try {
    localStorage.setItem(SPLASH_STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
}

/**
 * Until settings hydrate from the server, keep the stored splash.
 * Using the store default (Classy) before hydrate is what made restart
 * flash the primary plate, then the one you picked.
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
 * Runs in <head> before first paint. Restores the last splash/theme from
 * localStorage when present; does not write Classy over an empty key (the
 * server already stamped html[data-splash] from studio settings).
 */
export const EARLY_CHROME_SCRIPT = `(function(){try{var r=document.documentElement;try{var th=localStorage.getItem("looktag-theme-v1");if(th)r.setAttribute("data-theme",th)}catch(e){}try{var sp=localStorage.getItem("${SPLASH_STORAGE_KEY}");if(sp==="minimal"||sp==="quiet"||sp==="classy"||sp==="numbered"||sp==="atelier")r.setAttribute("data-splash",sp)}catch(e){}}catch(e){}})();`;
