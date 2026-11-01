import { APIError } from "better-auth/api";
import { isAdminPasswordSignInEmail } from "../admin/access.ts";
import {
  effectiveSettings,
  effectiveSocialEnabled,
  NO_PROVIDERS,
  type AppSettings,
  type ProviderAvailability,
} from "../settings/model.ts";
import { socialProvidersForDeploy } from "../providers/auth/social.ts";
import { shouldRegisterGrokBroker } from "./preview.ts";

export type SignInMethod = "email" | "google" | "apple" | "x";
type ResolvedMethod = SignInMethod | "unknown";
type AuthRequestDetails = {
  params?: Record<string, unknown>;
  requestUrl?: string;
};

function methodForProvider(provider: unknown): ResolvedMethod {
  const id = typeof provider === "string" ? provider.toLowerCase() : "";
  if (id === "google" || id === "grok-google") return "google";
  if (id === "apple" || id === "grok-apple") return "apple";
  if (id === "x" || id === "twitter" || id === "grok-x") return "x";
  return "unknown";
}

function endpointPath(path: string, requestUrl?: string): string {
  const actualPath = requestUrl ? new URL(requestUrl).pathname : path;
  return actualPath.replace(/^\/api\/auth(?=\/)/, "");
}

export function methodForAuthRequest(
  path: string,
  body: unknown,
  details: AuthRequestDetails = {},
): ResolvedMethod | null {
  const endpoint = endpointPath(path, details.requestUrl);
  if (endpoint === "/sign-up/email" || endpoint === "/sign-in/email") return "email";

  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (endpoint === "/sign-in/social") return methodForProvider(payload.provider);
  if (endpoint === "/link-social") {
    return methodForProvider(payload.providerId ?? payload.provider);
  }
  if (endpoint === "/sign-in/oauth2" || endpoint === "/oauth2/link") {
    return methodForProvider(payload.providerId);
  }

  const callback = endpoint.match(/^\/callback\/([^/]+)$/);
  if (callback) {
    const provider = details.params?.id ?? callback[1];
    return methodForProvider(provider);
  }
  const oauthCallback = endpoint.match(/^\/oauth2\/callback\/([^/]+)$/);
  if (oauthCallback) {
    const provider = details.params?.providerId ?? oauthCallback[1];
    return methodForProvider(provider);
  }
  return null;
}

export function previewHidesSocial(env: { APP_ENV?: string } = process.env): boolean {
  return (env.APP_ENV ?? "").trim() === "preview";
}

type ServerEnv = Record<string, string | undefined>;

/**
 * Which social methods this server can offer, read from its own env. The
 * client learns this from getAppSettings; it is never hardcoded there.
 */
export function serverProviderAvailability(env: ServerEnv = process.env): ProviderAvailability {
  if (previewHidesSocial(env)) return NO_PROVIDERS;
  const direct = socialProvidersForDeploy(env) as Record<string, unknown>;
  const broker = (env.VITE_AUTH_ENABLED ?? "").trim() !== "false" && shouldRegisterGrokBroker(env);
  return {
    google: { credentials: Boolean(direct.google), broker },
    apple: { credentials: Boolean(direct.apple), broker },
    x: { credentials: false, broker },
  };
}

/** Stored settings → what sign-in pages and the gate should honour. */
export function publicSignInSettings<T extends AppSettings>(
  settings: T,
  env: ServerEnv = process.env,
): T & { providers: ProviderAvailability } {
  const providers = serverProviderAvailability(env);
  return { ...settingsForSignIn(effectiveSettings(settings, providers), env), providers };
}

export function settingsForSignIn<T extends Pick<AppSettings, "signupGoogle" | "signupApple" | "signupX">>(
  settings: T,
  env: { APP_ENV?: string } = process.env,
): T {
  if (!previewHidesSocial(env)) return settings;
  return { ...settings, signupGoogle: false, signupApple: false, signupX: false };
}

export function isSignInMethodEnabled(
  settings: AppSettings,
  method: SignInMethod,
  providers: ProviderAvailability = serverProviderAvailability(),
): boolean {
  if (method === "email") return settings.signupEmail;
  if (previewHidesSocial()) return false;
  return effectiveSocialEnabled(settings, method, providers);
}

export function enforceSignInMethod(
  path: string,
  body: unknown,
  settings: AppSettings,
  details: AuthRequestDetails = {},
  providers: ProviderAvailability = serverProviderAvailability(),
): void {
  const method = methodForAuthRequest(path, body, details);
  const endpoint = endpointPath(path, details.requestUrl);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (
    method === "email" &&
    endpoint === "/sign-in/email" &&
    typeof payload.email === "string" &&
    isAdminPasswordSignInEmail(payload.email)
  ) {
    return;
  }
  if (method && (method === "unknown" || !isSignInMethodEnabled(settings, method, providers))) {
    throw new APIError("FORBIDDEN", {
      message: `Sign-in method disabled: ${method}`,
    });
  }
}
