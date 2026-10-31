export type GoogleSocial = { clientId: string; clientSecret: string };

export type AppleSocial = {
  clientId: string;
  clientSecret: string;
  appBundleIdentifier?: string;
};

export type SocialProviders = {
  google?: GoogleSocial;
  apple?: AppleSocial;
};

/** Visible sign-in method. No secrets. Safe to send to the browser. */
export type SignInMethodView = {
  id: string;
  label: string;
  kind: "email" | "social" | "oauth2";
};

export type AuthProviderName = "better-auth" | "grok";

export const AUTH_PROVIDER_NAMES = ["better-auth", "grok"] as const;
