export type PlatformChrome = "grok" | "none";

function hostOf(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";
  }
}

function isSandboxHost(host: string): boolean {
  return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}

/**
 * Platform chrome. Explicit PLATFORM_CHROME wins.
 * A request host is ignored unless AUTH_PROVIDER=grok, so a client-sent
 * x-forwarded-host cannot load Grok scripts on the default path.
 */
export function resolvePlatformChrome(
  env: {
    PLATFORM_CHROME?: string;
    AUTH_PROVIDER?: string;
    BETTER_AUTH_URL?: string;
    APP_URL?: string;
  } = {},
  host = "",
): PlatformChrome {
  const explicit = (env.PLATFORM_CHROME ?? "").trim().toLowerCase();
  if (explicit === "grok" || explicit === "none") return explicit;
  if ((env.AUTH_PROVIDER ?? "").trim().toLowerCase() !== "grok") return "none";
  const requestHost = host.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
  if (isSandboxHost(requestHost)) return "grok";
  if (isSandboxHost(hostOf(env.BETTER_AUTH_URL)) || isSandboxHost(hostOf(env.APP_URL))) return "grok";
  return "grok";
}

/** Forwarded host is used for chrome only on the Grok adapter. Otherwise it is ignored. */
export function chromeHostFromRequest(
  env: { AUTH_PROVIDER?: string } = {},
  forwardedHost: string | null | undefined,
): string {
  if ((env.AUTH_PROVIDER ?? "").trim().toLowerCase() !== "grok") return "";
  return (forwardedHost ?? "").split(",")[0]?.trim() ?? "";
}
