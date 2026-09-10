import { DEFAULT_THEME, parseThemeId, type ThemeId } from "../design/themes.ts";
import { DEFAULT_SPLASH, parseSplashId, type SplashId } from "../pwa/splash.ts";

export const SETTINGS_ID = "default";

export const SEARCH_ENGINE_IDS = ["xai", "duckduckgo", "brave", "google"] as const;
export type SearchEngineId = (typeof SEARCH_ENGINE_IDS)[number];

export type RankWeights = {
  look: number;
  pin: number;
  compared: number;
};

export type AppSettings = {
  signupEmail: boolean;
  signupGoogle: boolean;
  signupX: boolean;
  labelsEnabled: boolean;
  searchEngine: SearchEngineId;
  searchCountry: string;
  scoreLook: number;
  scorePin: number;
  scoreCompared: number;
  themeId: ThemeId;
  splashId: SplashId;
};

export const DEFAULT_SETTINGS: AppSettings = {
  signupEmail: true,
  signupGoogle: true,
  signupX: true,
  labelsEnabled: true,
  searchEngine: "xai",
  searchCountry: "DE",
  scoreLook: 12,
  scorePin: 3,
  scoreCompared: 5,
  themeId: DEFAULT_THEME,
  splashId: DEFAULT_SPLASH,
};

export type OauthProvider = {
  providerId: string;
  idp: string;
  label: string;
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asEngine(value: unknown): SearchEngineId {
  return SEARCH_ENGINE_IDS.includes(value as SearchEngineId)
    ? (value as SearchEngineId)
    : DEFAULT_SETTINGS.searchEngine;
}

function asCountry(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.searchCountry;
  const next = value.trim().toUpperCase().slice(0, 2);
  return /^[A-Z]{2}$/.test(next) ? next : DEFAULT_SETTINGS.searchCountry;
}

function asScore(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(40, Math.round(n)));
}

export function parseSettings(raw: unknown): AppSettings {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const extras =
    typeof row.extras === "object" && row.extras ? (row.extras as Record<string, unknown>) : row;
  return {
    signupEmail: asBoolean(row.signupEmail, true),
    signupGoogle: asBoolean(row.signupGoogle, true),
    signupX: asBoolean(row.signupX, true),
    labelsEnabled: asBoolean(row.labelsEnabled, true),
    searchEngine: asEngine(extras.searchEngine ?? row.searchEngine),
    searchCountry: asCountry(extras.searchCountry ?? row.searchCountry),
    scoreLook: asScore(extras.scoreLook ?? row.scoreLook, DEFAULT_SETTINGS.scoreLook),
    scorePin: asScore(extras.scorePin ?? row.scorePin, DEFAULT_SETTINGS.scorePin),
    scoreCompared: asScore(extras.scoreCompared ?? row.scoreCompared, DEFAULT_SETTINGS.scoreCompared),
    themeId: parseThemeId(extras.themeId ?? row.themeId),
    splashId: parseSplashId(extras.splashId ?? row.splashId),
  };
}

export function extrasFromSettings(settings: AppSettings): Record<string, unknown> {
  return {
    searchEngine: settings.searchEngine,
    searchCountry: settings.searchCountry,
    scoreLook: settings.scoreLook,
    scorePin: settings.scorePin,
    scoreCompared: settings.scoreCompared,
    themeId: settings.themeId,
    splashId: settings.splashId,
  };
}

/** Keys stored in looktag_settings.extras_json. Add a knob here + parseSettings — no migration. */
export const EXTRAS_KEYS = [
  "searchEngine",
  "searchCountry",
  "scoreLook",
  "scorePin",
  "scoreCompared",
  "themeId",
  "splashId",
] as const satisfies readonly (keyof AppSettings)[];

export function parseExtrasRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return { ...(parsed as Record<string, unknown>) };
  } catch {
    return {};
  }
}

export function parseExtrasJson(raw: unknown): Partial<AppSettings> {
  const record = parseExtrasRecord(raw);
  if (Object.keys(record).length === 0) return {};
  return extrasFromSettings(parseSettings(record));
}

/** Merge known knobs onto the stored JSON without dropping unknown future keys. */
export function mergeExtrasJson(raw: unknown, settings: AppSettings): string {
  return JSON.stringify({
    ...parseExtrasRecord(raw),
    ...extrasFromSettings(settings),
  });
}

export function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const next = parseSettings({ ...current, ...patch });
  if (!hasSignupMethod(next)) return current;
  return next;
}

/** Keep only keys the client actually sent, after parsing. Extra knobs live in EXTRAS_KEYS. */
export function pickSettingsPatch(input: Partial<AppSettings>): Partial<AppSettings> {
  const parsed = parseSettings({
    ...input,
    signupEmail: input.signupEmail,
    labelsEnabled: input.labelsEnabled,
  });
  const next: Partial<AppSettings> = {};
  if (typeof input.signupEmail === "boolean") next.signupEmail = parsed.signupEmail;
  if (typeof input.signupGoogle === "boolean") next.signupGoogle = parsed.signupGoogle;
  if (typeof input.signupX === "boolean") next.signupX = parsed.signupX;
  if (typeof input.labelsEnabled === "boolean") next.labelsEnabled = parsed.labelsEnabled;
  for (const key of EXTRAS_KEYS) {
    if (input[key] !== undefined) {
      next[key] = parsed[key] as never;
    }
  }
  return next;
}

export function hasSignupMethod(
  settings: Pick<AppSettings, "signupEmail" | "signupGoogle" | "signupX">,
): boolean {
  return settings.signupEmail || settings.signupGoogle || settings.signupX;
}

export function visibleOauthProviders(
  settings: Pick<AppSettings, "signupGoogle" | "signupX">,
  providers: readonly OauthProvider[],
): OauthProvider[] {
  return providers.filter((provider) => {
    if (provider.idp === "google") return settings.signupGoogle;
    if (provider.idp === "twitter") return settings.signupX;
    return false;
  });
}

export function signupMethodCount(
  settings: Pick<AppSettings, "signupEmail" | "signupGoogle" | "signupX">,
): number {
  return Number(settings.signupEmail) + Number(settings.signupGoogle) + Number(settings.signupX);
}

export function rankWeights(
  settings: Pick<AppSettings, "scoreLook" | "scorePin" | "scoreCompared">,
): RankWeights {
  return {
    look: settings.scoreLook,
    pin: settings.scorePin,
    compared: settings.scoreCompared,
  };
}
