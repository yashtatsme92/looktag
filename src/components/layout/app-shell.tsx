import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Download, SlidersHorizontal } from "lucide-react";
import { InstallSheet } from "@/components/layout/install-sheet";
import { NativeHeader } from "@/components/layout/native-header";
import { NativePortalProvider } from "@/components/layout/native-portal";
import { StatusBar } from "@/components/layout/status-bar";
import { TabBar } from "@/components/layout/tab-bar";
import { WebHeader } from "@/components/layout/web-header";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/admin/access";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCatalogStore } from "@/lib/looks/catalog";
import { useLooksStore } from "@/lib/looks/store";
import { requestInstallSheet, startInstallCapture } from "@/lib/pwa/display";
import { useStandaloneDisplay } from "@/lib/pwa/use-display";
import { useSettingsStore } from "@/lib/settings/store";
import { useChromeLayout } from "@/lib/pwa/use-wide-layout";

export type AppShellProps = {
  children: ReactNode;
  title?: string;
  backTo?: string;
  trailing?: ReactNode;
  largeTitle?: boolean;
  flush?: boolean;
};

const TAB_ROOTS = new Set(["/", "/create", "/rank", "/login", "/houses"]);

function isTabRoot(pathname: string) {
  if (TAB_ROOTS.has(pathname)) return true;
  return pathname.startsWith("/creators/");
}

function inferTitle(pathname: string) {
  if (pathname === "/") return "Looks";
  if (pathname === "/create") return "Create";
  if (pathname === "/rank") return "Rank";
  if (pathname === "/houses") return "Houses";
  if (pathname === "/login") return "You";
  if (pathname === "/admin") return "Admin";
  if (pathname === "/admin/shops") return "Shops";
  if (pathname === "/admin/studio") return "Studio";
  if (pathname === "/admin/observability") return "Signals";
  if (pathname === "/admin/houses") return "Houses";
  if (pathname === "/admin/look" || pathname === "/design") return "Look";
  if (pathname.endsWith("/edit")) return "Edit";
  if (pathname.startsWith("/looks/")) return "Look";
  if (/^\/houses\/[^/]+\/[^/]+/.test(pathname)) return "Collection";
  if (pathname.startsWith("/houses/")) return "House";
  if (pathname.startsWith("/creators/")) return "You";
  return "Looktag";
}

function inferBackTo(pathname: string) {
  if (isTabRoot(pathname) && pathname !== "/admin") return undefined;
  const houseParts = pathname.split("/").filter(Boolean);
  if (houseParts[0] === "houses" && houseParts.length >= 3) {
    return `/houses/${houseParts[1]}`;
  }
  if (pathname.startsWith("/houses/")) return "/houses";
  if (pathname === "/admin") return "/";
  if (pathname.startsWith("/admin")) return "/admin";
  if (pathname.endsWith("/edit")) {
    const lookId = pathname.split("/").filter(Boolean)[1];
    return lookId ? `/looks/${lookId}` : "/";
  }
  return "/";
}

export function AppShell({ children, title, backTo, trailing, largeTitle, flush }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hydrateLooks = useLooksStore((s) => s.hydrate);
  const hydrateCatalog = useCatalogStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const { user } = useCurrentUserState();
  const admin = isAdminEmail(user?.primaryEmail);
  const standalone = useStandaloneDisplay();
  const chrome = useChromeLayout();
  const screenRef = useRef<HTMLDivElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setPortalEl(screenRef.current);
  }, []);

  useEffect(() => {
    hydrateLooks();
    hydrateCatalog();
    hydrateSettings();
    startInstallCapture();
  }, [hydrateLooks, hydrateCatalog, hydrateSettings]);

  const root = largeTitle ?? isTabRoot(pathname);
  const resolvedTitle = title ?? inferTitle(pathname);
  const resolvedBack = backTo ?? inferBackTo(pathname);
  const headerTrailing =
    trailing ??
    (pathname === "/" && !standalone ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 native-only-action"
        aria-label="Get the app"
        onClick={() => requestInstallSheet()}
      >
        <Download className="size-5" />
      </Button>
    ) : pathname === "/" && admin ? (
      <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Admin">
        <Link to="/admin">
          <SlidersHorizontal className="size-5" />
        </Link>
      </Button>
    ) : null);

  return (
    <div className="app-frame" data-chrome={chrome}>
      <WebHeader trailing={pathname === "/" && admin ? (
        <Button asChild variant="ghost" size="icon" className="size-11" aria-label="Admin">
          <Link to="/admin">
            <SlidersHorizontal className="size-5" />
          </Link>
        </Button>
      ) : trailing}
      />
      <NativePortalProvider element={portalEl}>
        <div ref={screenRef} className="native-screen" id="native-screen">
          <StatusBar />
          <NativeHeader
            title={resolvedTitle}
            backTo={resolvedBack}
            trailing={headerTrailing}
            root={root}
          />
          <main className={flush ? "native-main native-main-flush" : "native-main"}>{children}</main>
          <TabBar />
          <InstallSheet />
        </div>
      </NativePortalProvider>
    </div>
  );
}
