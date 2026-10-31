import { resolveAuthProvider } from "./resolve.ts";
import { socialProvidersFromEnv } from "./social.ts";

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const SANDBOX_HOSTS = ["*.grok-sandbox.com"];

export function trustedAuthOrigins(env: NodeJS.ProcessEnv): string[] {
  const provider = resolveAuthProvider(env);
  const production = env.NODE_ENV === "production";
  const origins: string[] = [];
  const base = trim(env.BETTER_AUTH_URL);
  const app = trim(env.APP_URL);
  if (base) origins.push(base);
  if (app && app !== base) origins.push(app);
  if (provider === "grok" || !production) {
    origins.push(...LOCAL_DEV_ORIGINS);
    origins.push(...SANDBOX_HOSTS);
    origins.push(...SANDBOX_HOSTS.flatMap((host) => [`https://${host}`, `http://${host}`]));
  }
  if (socialProvidersFromEnv(env).apple) origins.push("https://appleid.apple.com");
  return [...new Set(origins)];
}

export function authBaseURL(env: NodeJS.ProcessEnv): string | {
  allowedHosts: string[];
  protocol: "auto";
  fallback: string;
} {
  const explicit = trim(env.BETTER_AUTH_URL);
  if (explicit) return explicit;
  const hosts = ["localhost", "127.0.0.1", "[::1]"];
  try {
    if (resolveAuthProvider(env) === "grok" || env.NODE_ENV !== "production") hosts.push("*.grok-sandbox.com");
  } catch {
    /* unknown provider: loopback only */
  }
  return { allowedHosts: hosts, protocol: "auto", fallback: "http://localhost:8080" };
}

export function ipAddressConfig(env: NodeJS.ProcessEnv): { ipAddressHeaders: string[] } | undefined {
  const header = trim(env.TRUSTED_PROXY_HEADER).toLowerCase();
  if (!header) return undefined;
  return { ipAddressHeaders: [header] };
}
