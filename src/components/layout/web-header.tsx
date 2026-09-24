import { Link, useRouterState } from "@tanstack/react-router";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { APP_NAV, isYouPath, navItemActive } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resolveYouSessionState, youSessionSignedIn } from "@/lib/auth/you-session";
import { requestInstallSheet } from "@/lib/pwa/display";
import { useStandaloneDisplay } from "@/lib/pwa/use-display";
import { cn } from "@/lib/utils";

type WebHeaderProps = {
  trailing?: ReactNode;
};

export function WebHeader({ trailing }: WebHeaderProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const standalone = useStandaloneDisplay();
  const youActive = isYouPath(pathname);
  const sessionState = resolveYouSessionState({ user, isPending });
  const signedIn = youSessionSignedIn(sessionState);

  return (
    <header className="web-header">
      <Link to="/" className="web-wordmark">
        Looktag
      </Link>
      <nav aria-label="App" className="web-nav">
        {APP_NAV.map((item) => {
          const active = navItemActive(item.id, pathname);
          return (
            <Link
              key={item.id}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn("web-nav-link", active && "web-nav-link-on")}
            >
              {item.label}
            </Link>
          );
        })}
        {signedIn && user ? (
          <Link
            to="/creators/$userId"
            params={{ userId: user.id }}
            aria-current={youActive ? "page" : undefined}
            className={cn("web-nav-link", youActive && "web-nav-link-on")}
          >
            You
          </Link>
        ) : (
          <Link
            to="/login"
            aria-current={youActive ? "page" : undefined}
            className={cn("web-nav-link", youActive && "web-nav-link-on")}
          >
            You
          </Link>
        )}
      </nav>
      <div className="web-header-actions">
        {trailing}
        {!standalone ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="web-install"
            onClick={() => requestInstallSheet()}
          >
            <Download className="size-4" />
            Get the app
          </Button>
        ) : null}
      </div>
    </header>
  );
}
