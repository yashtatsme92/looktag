import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Plus, UserRound } from "lucide-react";
import { APP_NAV, isYouPath, navItemActive } from "@/components/layout/app-nav";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const icons = {
  looks: LayoutGrid,
  create: Plus,
} as const;

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUserState();
  const youActive = isYouPath(pathname);

  return (
    <nav aria-label="App" className="tab-bar">
      <ul className="grid h-14 grid-cols-3">
        {APP_NAV.map((item) => {
          const Icon = icons[item.id];
          const active = navItemActive(item.id, pathname);
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-h-[var(--target-min)] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium tracking-wide",
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
          {user ? (
            <Link
              to="/creators/$userId"
              params={{ userId: user.id }}
              aria-current={youActive ? "page" : undefined}
              className={cn(
                "relative flex h-full min-h-[var(--target-min)] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium tracking-wide",
                youActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {youActive ? (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-foreground" />
              ) : null}
              <UserRound className="size-5" strokeWidth={youActive ? 2.2 : 1.8} />
              You
            </Link>
          ) : (
            <Link
              to="/login"
              aria-current={youActive ? "page" : undefined}
              className={cn(
                "relative flex h-full min-h-[var(--target-min)] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium tracking-wide",
                youActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {youActive ? (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-foreground" />
              ) : null}
              <UserRound className="size-5" strokeWidth={youActive ? 2.2 : 1.8} />
              You
            </Link>
          )}
        </li>
      </ul>
    </nav>
  );
}
