import { Link, useRouterState } from "@tanstack/react-router";
import { APP_NAV, isYouPath, navItemActive } from "@/components/layout/app-nav";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

export function WebHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const youActive = isYouPath(pathname);
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
            You
          </Link>
        </nav>
      </div>
    </header>
  );
}