/** Native iOS / Android shell. No-ops in the browser. */

const STUDIO = "#111111";
const PAPER = "#F4F4F4";

let backBound = false;

export async function bootNativeShell() {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.classList.add("native-app", "standalone");
    const [{ StatusBar, Style }, { SplashScreen }, { App }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
      import("@capacitor/app"),
    ]);
    await Promise.all([
      StatusBar.setStyle({ style: Style.Dark }),
      StatusBar.setBackgroundColor({ color: STUDIO }).catch(() => undefined),
      SplashScreen.hide(),
    ]);
    if (!backBound) {
      backBound = true;
      await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack || window.history.length > 1) {
          window.history.back();
          return;
        }
        void App.exitApp();
      });
    }
  } catch {
    // Web, or Capacitor plugins unavailable.
  }
}

export async function restyleNativeChrome() {
  if (typeof window === "undefined") return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: PAPER }).catch(() => undefined);
  } catch {
    // Web, or Capacitor plugins unavailable.
  }
}
