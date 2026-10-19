import { APIError } from "better-auth/api";
import { isAdminEmail } from "../admin/access.ts";
import type { AppSettings } from "../settings/model";

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

export function isSignInMethodEnabled(settings: AppSettings, method: SignInMethod): boolean {
  if (method === "email") return settings.signupEmail;
  if (method === "google") return settings.signupGoogle;
  if (method === "apple") return settings.signupApple;
  return settings.signupX;
}

export function enforceSignInMethod(
  path: string,
  body: unknown,
  settings: AppSettings,
  details: AuthRequestDetails = {},
): void {
  const method = methodForAuthRequest(path, body, details);
  const endpoint = endpointPath(path, details.requestUrl);
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (
    method === "email" &&
    endpoint === "/sign-in/email" &&
    typeof payload.email === "string" &&
    isAdminEmail(payload.email)
  ) {
    return;
  }
  if (method && (method === "unknown" || !isSignInMethodEnabled(settings, method))) {
    throw new APIError("FORBIDDEN", {
      message: `Sign-in method disabled: ${method}`,
    });
  }
}
