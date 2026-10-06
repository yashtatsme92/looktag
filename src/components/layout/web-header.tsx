import { Link, useRouterState } from "@tanstack/react-router";
import { APP_NAV, isYouPath, navItemActive } from "@/components/layout/app-nav";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function WebHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const youActive = isYouPath(pathname);
  const { user } = useCurrentUserState();
  const signedIn = Boolean(user && !user.isDevFallback);
  const mark = signedIn ? initials(user?.displayName || "") : "";
  const items = APP_NAV.filter((item) => item.id !== "houses" || housesOn);

  return (
    <header className="web-header">
      <div className="web-header-inner">
        <Link to="/" className="web-wordmark">
          Looktag
        </Link>
        <nav aria-label="App" className="web-nav">
          {items.map((item) => {
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
          <Link
            to="/login"
            aria-current={youActive ? "page" : undefined}
            className={cn("web-nav-link", youActive && "web-nav-link-on")}
          >
            {mark ? (
              <span className="web-nav-avatar" aria-hidden>
                {mark}
              </span>
            ) : null}
            You
          </Link>
        </nav>
      </div>
    </header>
  );
}