import { APIError } from "better-auth/api";
import type { AppSettings } from "../settings/model";

export type SignInMethod = "email" | "google" | "apple" | "x";

function methodForProvider(provider: unknown): SignInMethod {
  const id = typeof provider === "string" ? provider.toLowerCase() : "";
  if (id === "google" || id === "grok-google") return "google";
  if (id === "apple" || id === "grok-apple") return "apple";
  return "x";
}

export function methodForAuthRequest(path: string, body: unknown): SignInMethod | null {
  const endpoint = path.replace(/^\/api\/auth(?=\/)/, "");
  if (endpoint === "/sign-up/email" || endpoint === "/sign-in/email") return "email";

  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (endpoint === "/sign-in/social") return methodForProvider(payload.provider);
  if (endpoint === "/link-social") {
    return methodForProvider(payload.providerId ?? payload.provider);
  }
  if (endpoint === "/sign-in/oauth2") return methodForProvider(payload.providerId);

  const callback = endpoint.match(/^\/callback\/([^/]+)$/);
  if (callback) return methodForProvider(callback[1]);
  const oauthCallback = endpoint.match(/^\/oauth2\/callback\/([^/]+)$/);
  if (oauthCallback) return methodForProvider(oauthCallback[1]);
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
): void {
  const method = methodForAuthRequest(path, body);
  if (method && !isSignInMethodEnabled(settings, method)) {
    throw new APIError("FORBIDDEN", {
      message: `Sign-in method disabled: ${method}`,
    });
  }
}
