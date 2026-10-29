/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * The adapter is selected with AUTH_PROVIDER:
 *   - better-auth (default): email/password, plus Google and Apple when their
 *     client credentials are set. No calls to Grok hosts.
 *   - grok: the broker genericOAuth plugin, preview client, and gate identity.
 *     Only used when AUTH_PROVIDER=grok.
 *
 * Off (`VITE_AUTH_ENABLED=false`): no real session; `requireUserId` resolves a
 * dev user unless DATABASE_URL is set (see `verify.server.ts`).
 *
 * NEVER import this from client code. The client uses `@/lib/auth/client`.
 */
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { authDatabase, ensureDbReady } from "../db";
import {
  authBaseURL,
  authCookieNames,
  authCookiePrefix,
  authPlugins,
  grokBrokerCredentials,
  ipAddressConfig,
  resolveAuthProvider,
  socialProvidersFromEnv,
  trustedAccountProviders,
  trustedAuthOrigins,
} from "../providers/auth";
import { emailAndPasswordEnabled } from "./email-password";
import { enforceSignInMethod, methodForAuthRequest } from "./method-gate";
import { nativeTrustedOrigins } from "./native";
import { readSettings } from "../settings/store.server";

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __looktagAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__looktagAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__looktagAuthPreviewSecret__;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const authDisabled = env("VITE_AUTH_ENABLED") === "false";

function safe<T>(label: string, fallback: T, read: () => T): T {
  try {
    return read();
  } catch (error) {
    console.error(error instanceof Error ? error.message : `${label} failed`);
    return fallback;
  }
}

const providerName = safe("AUTH_PROVIDER", "better-auth" as const, () => resolveAuthProvider(process.env));
const socialProviders = providerName === "better-auth" ? socialProvidersFromEnv(process.env) : {};
const grokCreds = safe("grok", null, () => grokBrokerCredentials(process.env));
const plugins = safe("auth plugins", [], () => authPlugins(process.env));

/** True when a real sign-in method is configured (email, social, or the grok broker). */
export const authConfigured =
  !authDisabled &&
  (emailAndPasswordEnabled ||
    Boolean(socialProviders.google || socialProviders.apple) ||
    Boolean(grokCreds));

const baseURL = safe("BETTER_AUTH_URL", "http://127.0.0.1:8080", () => authBaseURL(process.env));
const trustedOrigins = [
  ...safe("trusted origins", [] as string[], () => trustedAuthOrigins(process.env)),
  ...nativeTrustedOrigins,
];

const database = authDatabase();
const cookiePrefix = safe("AUTH_COOKIE_PREFIX", "looktag", () => authCookiePrefix(process.env));
const cookieNames = authCookieNames(cookiePrefix);

/** Session token cookie name — also read by the live-preview popup completion page. */
export const SESSION_TOKEN_COOKIE = cookieNames.session_token.name;

const ipAddress = ipAddressConfig(process.env);

export const auth = betterAuth({
  baseURL,
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,
  trustedOrigins,
  socialProviders,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (methodForAuthRequest(ctx.path, ctx.body)) {
        const requestContext = ctx as typeof ctx & {
          params?: Record<string, unknown>;
          request?: Request;
        };
        enforceSignInMethod(ctx.path, ctx.body, await readSettings(), {
          params: requestContext.params,
          requestUrl: requestContext.request?.url,
        });
      }
    }),
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: safe("account providers", [] as string[], () => trustedAccountProviders(process.env)),
      requireLocalEmailVerified: false,
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax" as const, path: "/" },
    cookies: cookieNames,
    ...(ipAddress ? { ipAddress } : {}),
  },
  plugins: [
    ...plugins,
    // Native Expo clients send Authorization: Bearer. The live-preview popup
    // that captures that token only runs on *.grok-sandbox.com (see client.ts).
    bearer(),
    expo(),
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

export { GROK_PROVIDERS } from "./providers";
