import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { TelemetryProvider } from "@/lib/observability/client";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { BootSplash, StaticBootSplash } from "@/components/layout/boot-splash";
import { ThemeSync } from "@/components/layout/theme-sync";
import { ViewportLock } from "@/components/layout/viewport-lock";
import { parseThemeId, DEFAULT_THEME, readStoredTheme } from "@/lib/design/themes";
import { withTimeout } from "@/lib/login-next";
import { APP_VIEWPORT } from "@/lib/pwa/viewport";
import { DEFAULT_SPLASH, EARLY_CHROME_SCRIPT, parseSplashId, readStoredSplash } from "@/lib/pwa/splash";
import appCss from "../styles.css?url";

const APP_NAME = "Looktag";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const u = await getSessionUser();
  return u ? { id: u.id, email: u.email } : null;
});

const fetchChrome = createServerFn({ method: "GET" }).handler(async () => {
  const { readSettings } = await import("@/lib/settings/store.server");
  const settings = await readSettings();
  return { splashId: settings.splashId, themeId: settings.themeId };
});

export const Route = createRootRoute({
  beforeLoad: async () => {
    // Never block a navigation on session SSR — a stalled getSession after
    // email sign-up was hanging the app on the "Please wait…" login screen.
    const sessionUser = await withTimeout(fetchSessionUser(), 2000, null);
    if (typeof document !== "undefined") {
      return {
        sessionUser,
        splashId: readStoredSplash(),
        themeId: readStoredTheme(),
      };
    }
    const chrome = await withTimeout(fetchChrome(), 800, {
      splashId: DEFAULT_SPLASH,
      themeId: DEFAULT_THEME,
    });
    return {
      sessionUser,
      splashId: parseSplashId(chrome?.splashId),
      themeId: parseThemeId(chrome?.themeId),
    };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: APP_VIEWPORT,
      },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Shoppable looks on the web and on your phone. Pin product pages from Zalando, Zara, COS and more — open a look, shop the cheapest live item.",
      },
      { name: "theme-color", content: "#F4F4F4" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Figtree:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-1179x2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-1290x2796.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-1284x2778.png",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-1206x2622.png",
        media:
          "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-1320x2868.png",
        media:
          "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/splash-750x1334.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
    scripts: [{ children: EARLY_CHROME_SCRIPT }],
  }),
  component: RootDocument,
});

function RootDocument() {
  const ctx = Route.useRouteContext();
  const splashId = parseSplashId(ctx.splashId);
  const themeId = parseThemeId(ctx.themeId);
  return (
    <html
      lang="en"
      className="antialiased"
      data-splash={splashId}
      data-theme={themeId}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement;try{var th=localStorage.getItem("looktag-theme-v1");if(th)r.setAttribute("data-theme",th)}catch(e){}try{var sp=localStorage.getItem("looktag-splash-v1");if(sp==="minimal"||sp==="quiet"||sp==="classy"||sp==="numbered"||sp==="atelier")r.setAttribute("data-splash",sp)}catch(e){}if(window.matchMedia("(display-mode: standalone)").matches||navigator.standalone){r.classList.add("standalone")}var wide=window.matchMedia("(min-width: 768px)");var desk=window.matchMedia("(min-width: 1024px)");function layout(){if(r.classList.contains("native-app")){r.classList.remove("layout-web");r.setAttribute("data-chrome","phone");return}var w=wide.matches;r.classList.toggle("layout-web",w);r.setAttribute("data-chrome",w?(desk.matches?"desktop":"tablet"):"phone")}layout();if(wide.addEventListener){wide.addEventListener("change",layout);desk.addEventListener("change",layout)}var k="looktag-boot-v1";function go(){if(r.classList.contains("boot-done"))return;r.classList.add("boot-done");try{sessionStorage.setItem(k,"done")}catch(e){}}if(sessionStorage.getItem(k)==="done"){go();return}var p=location.pathname;if(/^\\/looks\\/[^/]+$/.test(p)||/^\\/houses\\/[^/]+$/.test(p)||/^\\/houses\\/[^/]+\\/[^/]+$/.test(p)){go();return}document.addEventListener("pointerdown",function(e){var t=e.target;if(t&&t.closest&&t.closest(".boot-splash"))go()},true);setTimeout(go,2600)}catch(e){}})();`,
          }}
        />
        <StaticBootSplash />
        <PreviewHostBridge />
        <AuthProvider>
          <TelemetryProvider>
            <ThemeSync />
            <ViewportLock />
            <BootSplash initialSplash={splashId}>
              <Outlet />
            </BootSplash>
          </TelemetryProvider>
        </AuthProvider>
        <Toaster
          position="top-center"
          offset={16}
          mobileOffset={24}
          toastOptions={{
            classNames: {
              toast: "bg-card text-card-foreground border-border font-sans shadow-[var(--shadow-border-hover)]",
            },
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}
