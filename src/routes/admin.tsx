import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AdminGate } from "@/components/admin/admin-gate";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { AdminNav } from "@/components/observability/admin-nav";

export const Route = createFileRoute("/admin")({ component: AdminHubPage });

const SECTIONS = [
  {
    to: "/admin/shops",
    title: "Shops",
    copy: "Retailers and search engines for new pins.",
  },
  {
    to: "/admin/studio",
    title: "Studio",
    copy: "Sign-up methods, Houses, shop region, rank scores.",
  },
  {
    to: "/admin/houses",
    title: "Houses",
    copy: "Approve new labels before they appear in the app.",
  },
  {
    to: "/admin/look",
    title: "Look",
    copy: "Colour palettes and the design system catalog.",
  },
  {
    to: "/admin/observability",
    title: "Signals",
    copy: "Trace graph, admin filters, and the OTLP destination.",
  },
] as const;

function AdminHubPage() {
  return (
    <AdminGate>
      <AppShell title="Admin" backTo="/">
        <ScreenTitle kicker="Looktag">Admin</ScreenTitle>
        <AdminNav current="hub" />
        <p className="mb-6 text-sm text-muted-foreground">
          System settings live here. Sign in as admin to change shops, palettes, and house
          approvals.
        </p>
        <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
          {SECTIONS.map((section) => (
            <Link
              key={section.to}
              to={section.to}
              className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="ds-card-title">{section.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{section.copy}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </AppShell>
    </AdminGate>
  );
}
