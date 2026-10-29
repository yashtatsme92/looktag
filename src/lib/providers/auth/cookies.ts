import { resolveAuthProvider } from "./resolve.ts";

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function authCookiePrefix(env: { AUTH_PROVIDER?: string; AUTH_COOKIE_PREFIX?: string } = {}): string {
  try {
    if (resolveAuthProvider(env) === "grok") return "grok-auth";
  } catch {
    return "looktag";
  }
  const raw = trim(env.AUTH_COOKIE_PREFIX) || "looktag";
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : "looktag";
}

export function authCookieNames(prefix: string) {
  const host = `__Host-${prefix}`;
  return {
    session_token: { name: `${host}.session_token` },
    session_data: { name: `${host}.session_data` },
    account_data: { name: `${host}.account_data` },
    dont_remember: { name: `${host}.dont_remember` },
  };
}
