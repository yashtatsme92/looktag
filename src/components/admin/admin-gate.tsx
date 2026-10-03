import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AccountSheet } from "@/components/home/account-sheet";
import { AppShell } from "@/components/layout/app-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { isAdminEmail } from "@/lib/admin/access";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { housesSwitchCopy } from "@/lib/labels/model";
import { useSettingsStore } from "@/lib/settings/store";

export function AdminHubBody({ linked }: { linked: boolean }) {
  const enabled = useSettingsStore((s) => s.labelsEnabled);
  const save = useSettingsStore((s) => s.save);
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = pending === null ? null : housesSwitchCopy(!pending);

  async function apply() {
    if (pending === null) return;
    setBusy(true);
    try {
      await save({ labelsEnabled: pending });
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const row = (
    <>
      <span className="ops-row-title">Houses</span>
      <span className="ops-row-note">Approve · Scouted</span>
    </>
  );
  return (
    <div className="ops-stage">
      <h1 className="ops-title">Admin</h1>
      <p className="ops-lead">System tools.</p>
      {linked ? (
        <Link to="/admin/houses" className="ops-row">
          {row}
        </Link>
      ) : (
        <div className="ops-row" aria-hidden>
          {row}
        </div>
      )}
      <div className="ops-row ops-switch-row">
        <div>
          <span className="ops-row-title">Houses for shoppers</span>
          <span className="ops-row-note">{enabled ? "On · visible to shoppers" : "Off · hidden from shoppers"}</span>
        </div>
        <Switch
          checked={enabled}
          disabled={!linked || busy}
          aria-label="Houses for shoppers"
          onCheckedChange={(next) => setPending(next)}
        />
      </div>
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.body}</DialogDescription>
          <div className="flex flex-col gap-2">
            <button type="button" className="house-primary" disabled={busy} onClick={() => void apply()}>
              {copy?.confirm}
            </button>
            <button type="button" className="house-ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SessionSplit({ mode = "split", children }: { mode?: "split" | "admin"; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.session;
    root.dataset.session = mode;
    return () => {
      if (previous) root.dataset.session = previous;
      else delete root.dataset.session;
    };
  }, [mode]);
  return <>{children}</>;
}

export function AdminGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  if (isPending) {
    return (
      <AppShell title="Admin" backTo="/">
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <SessionSplit>
        <AppShell title="Admin" backTo="/" header="hidden">
          <AdminHubBody linked={false} />
          <AccountSheet
              open
              onOpenChange={(open) => {
                if (!open) void navigate({ to: "/" });
              }}
              title="Sign in for admin"
              description="Cancel returns. Operator tools stay behind AdminGate."
              primary="Continue with email"
              secondary="Cancel"
              next={pathname}
            />
        </AppShell>
      </SessionSplit>
    );
  }

  if (!isAdminEmail(user.primaryEmail)) {
    return (
      <SessionSplit>
        <AppShell title="Admin" backTo="/" header="hidden">
          <div className="ops-stage">
            <h1 className="ops-title">Admins only</h1>
            <p className="ops-lead">This area is for the Looktag team.</p>
            <Link to="/login" className="house-exit">
              Back to You
            </Link>
          </div>
        </AppShell>
      </SessionSplit>
    );
  }

  return <SessionSplit mode="admin">{children}</SessionSplit>;
}