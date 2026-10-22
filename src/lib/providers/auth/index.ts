import { unknownProvider } from "../unknown.ts";

export { appleOriginNeeded, socialProviders } from "./social.ts";
export { hashPassword, verifyPassword } from "./password.ts";
export type { AppleSocial, GoogleSocial, SocialProviders } from "./types.ts";

const AUTH_PROVIDERS = ["better-auth"] as const;

/** Better Auth is the framework. Unset (or `better-auth`) keeps it. Any other value is a typo. */
export function resolveAuthProvider(env: { AUTH_PROVIDER?: string } = process.env): "better-auth" {
  const named = env.AUTH_PROVIDER?.trim().toLowerCase();
  if (named && named !== "better-auth") unknownProvider("AUTH_PROVIDER", named, AUTH_PROVIDERS);
  return "better-auth";
}
