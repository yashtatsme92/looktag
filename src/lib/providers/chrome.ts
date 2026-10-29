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
 * Otherwise grok only when AUTH_PROVIDER=grok or the request/auth host is a Grok sandbox.
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
  if ((env.AUTH_PROVIDER ?? "").trim().toLowerCase() === "grok") return "grok";
  const requestHost = host.split(",")[0]?.trim().split(":")[0]?.toLowerCase() ?? "";
  if (isSandboxHost(requestHost)) return "grok";
  if (isSandboxHost(hostOf(env.BETTER_AUTH_URL)) || isSandboxHost(hostOf(env.APP_URL))) return "grok";
  return "none";
}
