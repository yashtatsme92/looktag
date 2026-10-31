export type PlatformChrome = "grok" | "none";

/**
 * Platform chrome. Explicit PLATFORM_CHROME wins.
 * Otherwise grok only when AUTH_PROVIDER=grok. A request host, including
 * *.grok-sandbox.com, is ignored.
 */
export function resolvePlatformChrome(
  env: {
    PLATFORM_CHROME?: string;
    AUTH_PROVIDER?: string;
  } = {},
  _host = "",
): PlatformChrome {
  const explicit = (env.PLATFORM_CHROME ?? "").trim().toLowerCase();
  if (explicit === "grok" || explicit === "none") return explicit;
  if ((env.AUTH_PROVIDER ?? "").trim().toLowerCase() === "grok") return "grok";
  return "none";
}

/** Forwarded host is used for chrome only on the Grok adapter. Otherwise it is ignored. */
export function chromeHostFromRequest(
  env: { AUTH_PROVIDER?: string } = {},
  forwardedHost: string | null | undefined,
): string {
  if ((env.AUTH_PROVIDER ?? "").trim().toLowerCase() !== "grok") return "";
  return (forwardedHost ?? "").split(",")[0]?.trim() ?? "";
}
