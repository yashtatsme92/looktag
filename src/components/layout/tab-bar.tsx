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
      <ul className="grid h-14" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = icons[item.id];
          const active = navItemActive(item.id, pathname);
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-h-[var(--target-min)] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium tracking-wide uppercase",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {active ? (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-foreground" />
                ) : null}
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            to="/login"
            aria-current={youActive ? "page" : undefined}
            className={cn(
              "relative flex h-full min-h-[var(--target-min)] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium tracking-wide uppercase",
              youActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {youActive ? (
              <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-foreground" />
            ) : null}
            <UserRound className="size-5" strokeWidth={youActive ? 2.2 : 1.8} />
            You
          </Link>
        </li>
      </ul>
    </nav>
  );
}