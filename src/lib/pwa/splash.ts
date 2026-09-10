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
