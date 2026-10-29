import { genericOAuth } from "better-auth/plugins";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "@/lib/auth/gate-session.server";
import { GROK_PROVIDERS } from "@/lib/auth/providers";
import { authCookieNames, authCookiePrefix } from "./cookies.ts";
import { listVisibleSignInMethods } from "./methods";
import { resolveAuthProvider } from "./resolve.ts";
import { socialProvidersFromEnv } from "./social";

export {
  authCookieNames,
  authCookiePrefix,
  listVisibleSignInMethods,
  resolveAuthProvider,
};
export { appleOriginNeeded, socialProviders, socialProvidersFromEnv } from "./social";
export { hashPassword, verifyPassword } from "./password.ts";
export type { AppleSocial, AuthProviderName, GoogleSocial, SignInMethodView, SocialProviders } from "./types";
export { AUTH_PROVIDER_NAMES } from "./types";
export { authBaseURL, ipAddressConfig, trustedAuthOrigins } from "./origins.ts";
export { identityFromRequest } from "./identity.ts";

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

function previewClient(env: { GROK_PREVIEW_CLIENT_ID?: string; GROK_PREVIEW_CLIENT_SECRET?: string }) {
  return {
    id: trim(env.GROK_PREVIEW_CLIENT_ID),
    secret: trim(env.GROK_PREVIEW_CLIENT_SECRET),
  };
}

/** Grok broker client. Preview id/secret come only from env, and only for the grok adapter. */
export function grokBrokerCredentials(env: {
  AUTH_PROVIDER?: string;
  GROK_AUTH_CLIENT_ID?: string;
  GROK_AUTH_CLIENT_SECRET?: string;
  GROK_PREVIEW_CLIENT_ID?: string;
  GROK_PREVIEW_CLIENT_SECRET?: string;
}): { id: string; secret: string } | null {
  if (resolveAuthProvider(env) !== "grok") return null;
  const clientId = trim(env.GROK_AUTH_CLIENT_ID) || previewClient(env).id;
  const clientSecret = trim(env.GROK_AUTH_CLIENT_SECRET) || previewClient(env).secret;
  if (!clientId || !clientSecret) return null;
  return { id: clientId, secret: clientSecret };
}

type BetterAuthPlugin = ReturnType<typeof gateIdentitySessions> | ReturnType<typeof genericOAuth>;

export function authPlugins(env: NodeJS.ProcessEnv): BetterAuthPlugin[] {
  if (resolveAuthProvider(env) !== "grok") return [];
  const creds = grokBrokerCredentials(env);
  const plugins: BetterAuthPlugin[] = [gateIdentitySessions()];
  if (!creds) return plugins;
  const issuer = (trim(env.GROK_AUTH_ISSUER) || "https://auth.grok.me").replace(/\/+$/, "");
  plugins.push(
    genericOAuth({
      config: GROK_PROVIDERS.map(({ providerId, idp }) => ({
        providerId,
        clientId: creds.id,
        clientSecret: creds.secret,
        authorizationUrl: `${issuer}/api/auth/oauth2/authorize`,
        tokenUrl: `${issuer}/api/auth/oauth2/token`,
        userInfoUrl: `${issuer}/api/auth/oauth2/userinfo`,
        scopes: ["openid", "profile", "email"],
        authorizationUrlParams: { idp, prompt: "login" },
      })),
    }),
  );
  return plugins;
}

export function trustedAccountProviders(env: NodeJS.ProcessEnv): string[] {
  if (resolveAuthProvider(env) === "grok") {
    return [...GROK_PROVIDERS.map((item) => item.providerId), GATE_PROVIDER_ID];
  }
  const social = socialProvidersFromEnv(env);
  const names: string[] = [];
  if (social.google) names.push("google");
  if (social.apple) names.push("apple");
  return names;
}

