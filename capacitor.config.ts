/**
 * Native export shell for Looktag.
 *
 * Phone users install via Add to Home Screen (iPhone) or Chrome Install (Android).
 * For App Store / Play, wrap the live origin:
 *
 *   LOOKTAG_NATIVE_URL=https://your-looktag-host npx cap add ios
 *   LOOKTAG_NATIVE_URL=https://your-looktag-host npx cap add android
 *   npx cap sync && npx cap open ios
 *
 * SSR, auth, and shop search stay on the hosted app. The native shell is a
 * full-screen WebView with the studio splash and status bar.
 */
const liveUrl = process.env.LOOKTAG_NATIVE_URL?.trim();

const config = {
  appId: "app.looktag.studio",
  appName: "Looktag",
  webDir: "public",
  backgroundColor: "#111111",
  ios: {
    contentInset: "never" as const,
    backgroundColor: "#111111",
    preferredContentMode: "mobile" as const,
    scheme: "Looktag",
  },
  android: {
    backgroundColor: "#111111",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#111111",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK" as const,
      backgroundColor: "#111111",
    },
  },
  ...(liveUrl
    ? {
        server: {
          url: liveUrl,
          androidScheme: "https" as const,
        },
      }
    : {}),
};

export default config;
