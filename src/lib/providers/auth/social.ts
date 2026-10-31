type Env = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
};

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Google and Apple only. Better Auth stays the framework; this is just the credential block. */
export function socialProviders(env: Env = process.env) {
  const googleId = trim(env.GOOGLE_CLIENT_ID);
  const googleSecret = trim(env.GOOGLE_CLIENT_SECRET);
  const appleId = trim(env.APPLE_CLIENT_ID);
  const appleSecret = trim(env.APPLE_CLIENT_SECRET);
  const bundle = trim(env.APPLE_APP_BUNDLE_IDENTIFIER);
  return {
    ...(googleId && googleSecret ? { google: { clientId: googleId, clientSecret: googleSecret } } : {}),
    ...(appleId && appleSecret
      ? {
          apple: {
            clientId: appleId,
            clientSecret: appleSecret,
            ...(bundle ? { appBundleIdentifier: bundle } : {}),
          },
        }
      : {}),
  };
}

export const socialProvidersFromEnv = socialProviders;

export function appleOriginNeeded(env: Env = process.env): boolean {
  return Boolean(trim(env.APPLE_CLIENT_ID) && trim(env.APPLE_CLIENT_SECRET));
}
