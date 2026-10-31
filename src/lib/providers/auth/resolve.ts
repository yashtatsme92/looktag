import { unknownProvider } from "../unknown.ts";

const AUTH_PROVIDERS = ["better-auth", "grok"] as const;

export type AuthProviderName = (typeof AUTH_PROVIDERS)[number];

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Unset is better-auth. `grok` is the only other accepted value. */
export function resolveAuthProvider(env: { AUTH_PROVIDER?: string } = {}): AuthProviderName {
  const named = trim(env.AUTH_PROVIDER).toLowerCase();
  if (!named || named === "better-auth") return "better-auth";
  if (named === "grok") return "grok";
  unknownProvider("AUTH_PROVIDER", named, AUTH_PROVIDERS);
}
