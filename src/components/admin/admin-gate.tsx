import type { ReactNode } from "react";
import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/admin/access";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AdminGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isPending) {
    return (
      <AppShell title="Admin" backTo="/">
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" search={{ next: pathname }} />;
  }

  if (!isAdminEmail(user.primaryEmail)) {
    return (
      <AppShell title="Admin" backTo="/">
        <ScreenTitle kicker="Admin">Restricted</ScreenTitle>
        <p className="mb-6 text-sm text-muted-foreground">
          System settings are only available to the Looktag admin.
        </p>
        <Button asChild>
          <Link to="/">Back to looks</Link>
        </Button>
      </AppShell>
    );
  }

  return <>{children}</>;
}
