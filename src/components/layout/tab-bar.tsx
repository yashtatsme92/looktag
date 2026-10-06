import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, LayoutGrid, Plus, UserRound } from "lucide-react";
import { APP_NAV, isYouPath, navItemActive } from "@/components/layout/app-nav";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

const icons = {
  looks: LayoutGrid,
  houses: Building2,
  create: Plus,
} as const;

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const youActive = isYouPath(pathname);
  const items = APP_NAV.filter((item) => item.id !== "houses" || housesOn);

  return (
    <nav aria-label="App" className="tab-bar">
      <ul className="grid h-full" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = icons[item.id];
          const active = navItemActive(item.id, pathname);
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn("tab-item", active && "tab-item-on")}
              >
                {active ? <span className="tab-item-ind" aria-hidden /> : null}
                <Icon className="size-5" strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            to="/login"
            aria-current={youActive ? "page" : undefined}
            className={cn("tab-item", youActive && "tab-item-on")}
          >
            {youActive ? <span className="tab-item-ind" aria-hidden /> : null}
            <UserRound className="size-5" strokeWidth={1.75} />
            <span>You</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}