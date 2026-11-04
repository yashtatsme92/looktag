import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const ITEMS = [
  { to: "/admin", label: "Admin", id: "hub" },
  { to: "/admin/shops", label: "Shops", id: "shops", note: "Catalog · Sources" },
  { to: "/admin/studio", label: "Studio", id: "studio", note: "Splash screen, settings" },
  { to: "/admin/houses", label: "Houses", id: "houses", note: "Approve · Scouted" },
  { to: "/admin/look", label: "Look", id: "look", note: "Looks · Moods" },
  { to: "/admin/observability", label: "Signals", id: "signals", note: "Observability · Health" },
] as const;

export type AdminNavId = (typeof ITEMS)[number]["id"];

export function AdminNav({ current }: { current: AdminNavId }) {
  return (
    <nav className="chip-scroll mb-6 -mx-1 overflow-x-auto px-1" aria-label="Admin">
      <div className="flex w-max gap-1 rounded-lg bg-muted p-1">
        {ITEMS.map((item) => {
          const active = item.id === current;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "min-h-11 min-w-16 rounded-md px-3 py-2.5 text-center text-sm font-medium transition-colors duration-150",
                active ? "bg-card text-foreground shadow-[var(--shadow-border)]" : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
