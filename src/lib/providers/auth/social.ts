type Env = Record<string, string | undefined>;

/** Google and Apple only. Better Auth stays the framework; this is just the credential block. */
export function socialProviders(env: Env = process.env) {
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const appleClientId = env.APPLE_CLIENT_ID?.trim();
  const appleClientSecret = env.APPLE_CLIENT_SECRET?.trim();
  const appleBundleId = env.APPLE_APP_BUNDLE_IDENTIFIER?.trim();
  return {
    ...(googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {}),
    ...(appleClientId && appleClientSecret
      ? {
          apple: {
            clientId: appleClientId,
            clientSecret: appleClientSecret,
            ...(appleBundleId ? { appBundleIdentifier: appleBundleId } : {}),
          },
        }
      : {}),
  };
}

export function appleOriginNeeded(env: Env = process.env): boolean {
  return Boolean(env.APPLE_CLIENT_ID?.trim() && env.APPLE_CLIENT_SECRET?.trim());
}
