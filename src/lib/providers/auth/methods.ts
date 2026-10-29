import { GROK_PROVIDERS } from "@/lib/auth/providers";
import { visibleOauthProviders, type AppSettings } from "@/lib/settings/model";
import type { SignInMethodView } from "./types";
import { socialProvidersFromEnv } from "./social";
import { resolveAuthProvider, type AuthProviderName } from "./resolve.ts";

export { authCookieNames, authCookiePrefix } from "./cookies.ts";
export { resolveAuthProvider } from "./resolve.ts";
export type { AuthProviderName, SignInMethodView };

export function listVisibleSignInMethods(
  env: { AUTH_PROVIDER?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; APPLE_CLIENT_ID?: string; APPLE_CLIENT_SECRET?: string; APPLE_APP_BUNDLE_IDENTIFIER?: string },
  settings: Pick<AppSettings, "signupEmail" | "signupGoogle" | "signupApple" | "signupX">,
): SignInMethodView[] {
  const methods: SignInMethodView[] = [];
  if (settings.signupEmail) methods.push({ id: "email", label: "Email", kind: "email" });
  let provider: AuthProviderName = "better-auth";
  try {
    provider = resolveAuthProvider(env);
  } catch {
    return methods;
  }
  if (provider === "grok") {
    for (const item of visibleOauthProviders(settings, GROK_PROVIDERS)) {
      methods.push({ id: item.providerId, label: item.label, kind: "oauth2" });
    }
    return methods;
  }
  const social = socialProvidersFromEnv(env);
  if (social.google && settings.signupGoogle) methods.push({ id: "google", label: "Google", kind: "social" });
  if (social.apple && settings.signupApple) methods.push({ id: "apple", label: "Apple", kind: "social" });
  return methods;
}
