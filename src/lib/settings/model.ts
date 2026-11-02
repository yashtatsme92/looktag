import { DEFAULT_THEME, parseThemeId, type ThemeId } from "../design/themes.ts";
import { clampCadence, type FeedCadence, type FreshWindow } from "../home/engagement.ts";
import { DEFAULT_SPLASH, parseSplashId, type SplashId } from "../pwa/splash.ts";
import { FOOTER_LINK_IDS, parseFooterIds } from "../../config/footer.ts";

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
  signupApple: boolean;
  signupX: boolean;
  labelsEnabled: boolean;
  searchEngine: SearchEngineId;
  searchCountry: string;
  scoreLook: number;
  scorePin: number;
  scoreCompared: number;
  themeId: ThemeId;
  splashId: SplashId;
  feedFollow: boolean;
  feedEchoTrail: boolean;
  feedFresh: boolean;
  feedRuns: boolean;
  feedSaves: boolean;
  feedDrop: boolean;
  feedStyleCards: boolean;
  shopWholeLookPhone: boolean;
  feedDropSlot: FeedCadence["dropSlot"];
  feedStyleEvery: FeedCadence["styleEvery"];
  feedBecauseEvery: FeedCadence["becauseEvery"];
  feedRunEvery: FeedCadence["runEvery"];
  feedFreshWindow: FreshWindow;
  feedRunTitle: string;
  feedRunIds: string;
  feedAuditJson: string;
  /** Footer link ids switched on in Admin (comma-separated). Empty = every link off. */
  footerLinks: string;
  /** Social sign-in methods an admin explicitly switched off (comma-separated: google,apple,x). */
  signupOff: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  signupEmail: true,
  signupGoogle: false,
  signupApple: false,
  signupX: false,
  labelsEnabled: true,
  searchEngine: "xai",
  searchCountry: "DE",
  scoreLook: 12,
  scorePin: 3,
  scoreCompared: 5,
  themeId: DEFAULT_THEME,
  splashId: DEFAULT_SPLASH,
  feedFollow: true,
  feedEchoTrail: true,
  feedFresh: true,
  feedRuns: true,
  feedSaves: true,
  feedDrop: true,
  feedStyleCards: true,
  shopWholeLookPhone: false,
  feedDropSlot: 3,
  feedStyleEvery: 12,
  feedBecauseEvery: 20,
  feedRunEvery: 24,
  feedFreshWindow: "3d",
  feedRunTitle: "",
  feedRunIds: "",
  feedAuditJson: "",
  footerLinks: "",
  signupOff: "",
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

function asCadence(raw: Record<string, unknown>): FeedCadence {
  const numeric = (value: unknown) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const window = raw.feedFreshWindow;
  return clampCadence({
    dropSlot: numeric(raw.feedDropSlot) as FeedCadence["dropSlot"] | undefined,
    styleEvery: numeric(raw.feedStyleEvery) as FeedCadence["styleEvery"] | undefined,
    becauseEvery: numeric(raw.feedBecauseEvery) as FeedCadence["becauseEvery"] | undefined,
    runEvery: numeric(raw.feedRunEvery) as FeedCadence["runEvery"] | undefined,
    freshWindow: window === "24h" || window === "3d" || window === "7d" ? window : undefined,
  });
}

function asLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^\w\s,.'-]/g, "").trim().slice(0, max);
}

function asFooterLinks(value: unknown): string {
  if (typeof value !== "string") return "";
  const ids = parseFooterIds(value, () => {});
  return FOOTER_LINK_IDS.filter((id) => ids.includes(id)).join(",");
}

export const SOCIAL_METHODS = ["google", "apple", "x"] as const;
export type SocialMethod = (typeof SOCIAL_METHODS)[number];

const SOCIAL_FLAG = {
  google: "signupGoogle",
  apple: "signupApple",
  x: "signupX",
} as const satisfies Record<SocialMethod, keyof AppSettings>;

function asSignupOff(value: unknown): string {
  if (typeof value !== "string") return "";
  const ids = value.split(",").map((id) => id.trim());
  return SOCIAL_METHODS.filter((id) => ids.includes(id)).join(",");
}

/**
 * What the server can actually offer for one social method.
 * `credentials`: the app's own OAuth client is set (e.g. GOOGLE_CLIENT_ID/SECRET).
 * `broker`: the shared sign-in broker is registered and can federate to it.
 */
export type ProviderAvailability = Record<SocialMethod, { credentials: boolean; broker: boolean }>;

export const NO_PROVIDERS: ProviderAvailability = {
  google: { credentials: false, broker: false },
  apple: { credentials: false, broker: false },
  x: { credentials: false, broker: false },
};

export function providerConfigured(available: ProviderAvailability, method: SocialMethod): boolean {
  return available[method].credentials || available[method].broker;
}

/** True when an admin switched this method off on purpose. */
export function signupExplicitlyOff(settings: Pick<AppSettings, "signupOff">, method: SocialMethod): boolean {
  return settings.signupOff.split(",").includes(method);
}

/**
 * Whether one social method is offered. Each method is independent:
 *  - not configured on the server → off;
 *  - an admin explicitly switched it off → off;
 *  - an admin switched it on → on;
 *  - unset → on when the app has its own credentials for it.
 */
export function effectiveSocialEnabled(
  settings: Pick<AppSettings, "signupGoogle" | "signupApple" | "signupX" | "signupOff">,
  method: SocialMethod,
  available: ProviderAvailability,
): boolean {
  if (!providerConfigured(available, method)) return false;
  if (signupExplicitlyOff(settings, method)) return false;
  if (settings[SOCIAL_FLAG[method]]) return true;
  return available[method].credentials;
}

/** Settings with each social flag replaced by its effective value. */
export function effectiveSettings<T extends AppSettings>(settings: T, available: ProviderAvailability): T {
  return {
    ...settings,
    signupGoogle: effectiveSocialEnabled(settings, "google", available),
    signupApple: effectiveSocialEnabled(settings, "apple", available),
    signupX: effectiveSocialEnabled(settings, "x", available),
  };
}

export function parseSettings(raw: unknown): AppSettings {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const extras =
    typeof row.extras === "object" && row.extras ? (row.extras as Record<string, unknown>) : row;
  return {
    signupEmail: asBoolean(row.signupEmail, true),
    signupGoogle: asBoolean(row.signupGoogle, false),
    signupX: asBoolean(row.signupX, false),
    labelsEnabled: asBoolean(row.labelsEnabled, true),
    searchEngine: asEngine(extras.searchEngine ?? row.searchEngine),
    searchCountry: asCountry(extras.searchCountry ?? row.searchCountry),
    scoreLook: asScore(extras.scoreLook ?? row.scoreLook, DEFAULT_SETTINGS.scoreLook),
    scorePin: asScore(extras.scorePin ?? row.scorePin, DEFAULT_SETTINGS.scorePin),
    scoreCompared: asScore(extras.scoreCompared ?? row.scoreCompared, DEFAULT_SETTINGS.scoreCompared),
    themeId: parseThemeId(extras.themeId ?? row.themeId),
    splashId: parseSplashId(extras.splashId ?? row.splashId),
    feedFollow: asBoolean(extras.feedFollow ?? row.feedFollow, true),
    feedEchoTrail: asBoolean(extras.feedEchoTrail ?? row.feedEchoTrail, true),
    feedFresh: asBoolean(extras.feedFresh ?? row.feedFresh, true),
    feedRuns: asBoolean(extras.feedRuns ?? row.feedRuns, true),
    feedSaves: asBoolean(extras.feedSaves ?? row.feedSaves, true),
    feedDrop: asBoolean(extras.feedDrop ?? row.feedDrop, true),
    feedStyleCards: asBoolean(extras.feedStyleCards ?? row.feedStyleCards, true),
    shopWholeLookPhone: asBoolean(extras.shopWholeLookPhone ?? row.shopWholeLookPhone, false),
    ...(() => {
      const cadence = asCadence({ ...row, ...extras });
      return {
        feedDropSlot: cadence.dropSlot,
        feedStyleEvery: cadence.styleEvery,
        feedBecauseEvery: cadence.becauseEvery,
        feedRunEvery: cadence.runEvery,
        feedFreshWindow: cadence.freshWindow,
      };
    })(),
    feedRunTitle: asLine(extras.feedRunTitle ?? row.feedRunTitle, 60),
    feedRunIds: asLine(extras.feedRunIds ?? row.feedRunIds, 400),
    feedAuditJson: typeof (extras.feedAuditJson ?? row.feedAuditJson) === "string"
      ? String(extras.feedAuditJson ?? row.feedAuditJson).slice(0, 4000)
      : "",
    signupApple: asBoolean(extras.signupApple ?? row.signupApple, false),
    footerLinks: asFooterLinks(extras.footerLinks ?? row.footerLinks),
    signupOff: asSignupOff(extras.signupOff ?? row.signupOff),
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
    feedFollow: settings.feedFollow,
    feedEchoTrail: settings.feedEchoTrail,
    feedFresh: settings.feedFresh,
    feedRuns: settings.feedRuns,
    feedSaves: settings.feedSaves,
    feedDrop: settings.feedDrop,
    feedStyleCards: settings.feedStyleCards,
    shopWholeLookPhone: settings.shopWholeLookPhone,
    feedDropSlot: settings.feedDropSlot,
    feedStyleEvery: settings.feedStyleEvery,
    feedBecauseEvery: settings.feedBecauseEvery,
    feedRunEvery: settings.feedRunEvery,
    feedFreshWindow: settings.feedFreshWindow,
    feedRunTitle: settings.feedRunTitle,
    feedRunIds: settings.feedRunIds,
    feedAuditJson: settings.feedAuditJson,
    signupApple: settings.signupApple,
    footerLinks: settings.footerLinks,
    signupOff: settings.signupOff,
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
  "feedFollow",
  "feedEchoTrail",
  "feedFresh",
  "feedRuns",
  "feedSaves",
  "feedDrop",
  "feedStyleCards",
  "shopWholeLookPhone",
  "feedDropSlot",
  "feedStyleEvery",
  "feedBecauseEvery",
  "feedRunEvery",
  "feedFreshWindow",
  "feedRunTitle",
  "feedRunIds",
  "feedAuditJson",
  "signupApple",
  "footerLinks",
  "signupOff",
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

/** Patch applied with signupOff updated from the social switches; no guard. */
export function withSignupPatch(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const next = parseSettings({ ...current, ...patch });
  const off = new Set(next.signupOff ? next.signupOff.split(",") : []);
  for (const method of SOCIAL_METHODS) {
    const value = patch[SOCIAL_FLAG[method]];
    if (value === false) off.add(method);
    if (value === true) off.delete(method);
  }
  next.signupOff = SOCIAL_METHODS.filter((id) => off.has(id)).join(",");
  return next;
}

/**
 * Apply an admin patch. A social switch set to false is recorded in signupOff
 * (explicit off, survives credential changes); set to true removes it. With
 * `providers`, the "at least one method on" guard uses effective flags.
 */
export function mergeSettings(
  current: AppSettings,
  patch: Partial<AppSettings>,
  providers?: ProviderAvailability,
): AppSettings {
  const next = withSignupPatch(current, patch);
  if (!hasSignupMethod(next, providers)) return current;
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
    // signupOff is derived from the sign-up switches on the server, never sent.
    if (key === "signupOff") continue;
    if (input[key] !== undefined) {
      next[key] = parsed[key] as never;
    }
  }
  return next;
}

/**
 * True when at least one sign-up method is on. Pass `providers` to judge
 * social methods by their effective state (configured, not switched off).
 */
export function hasSignupMethod(
  settings: Pick<AppSettings, "signupEmail" | "signupGoogle" | "signupApple" | "signupX"> &
    Partial<Pick<AppSettings, "signupOff">>,
  providers?: ProviderAvailability,
): boolean {
  if (providers) {
    const withOff = { ...settings, signupOff: settings.signupOff ?? "" };
    return settings.signupEmail || SOCIAL_METHODS.some((m) => effectiveSocialEnabled(withOff, m, providers));
  }
  return settings.signupEmail || settings.signupGoogle || settings.signupApple || settings.signupX;
}

export function visibleOauthProviders(
  settings: Pick<AppSettings, "signupGoogle" | "signupApple" | "signupX">,
  providers: readonly OauthProvider[],
): OauthProvider[] {
  return providers.filter((provider) => {
    if (provider.idp === "google") return settings.signupGoogle;
    if (provider.idp === "apple") return settings.signupApple;
    if (provider.idp === "twitter") return settings.signupX;
    return false;
  });
}

export function signupMethodCount(
  settings: Pick<AppSettings, "signupEmail" | "signupGoogle" | "signupApple" | "signupX">,
): number {
  return Number(settings.signupEmail) + Number(settings.signupGoogle) +
    Number(settings.signupApple) + Number(settings.signupX);
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
