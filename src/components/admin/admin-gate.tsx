import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AccountSheet } from "@/components/home/account-sheet";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ds";
import { FadeLayer } from "@/components/ds/fade-layer";
import { SaveStatus } from "@/components/ds/save-status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { isAdminEmail } from "@/lib/admin/access";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FEED_FEATURES, feedModulesNote } from "@/lib/home/engagement";
import { FEATURE_FLAGS, flagStatus } from "@/lib/settings/flags";
import { housesSwitchCopy } from "@/lib/labels/model";
import { useSettingsStore } from "@/lib/settings/store";

export function AdminHubBody({ linked }: { linked: boolean }) {
  const enabled = useSettingsStore((s) => s.labelsEnabled);
  const save = useSettingsStore((s) => s.save);
  const feedOn = useSettingsStore((s) => FEED_FEATURES.filter((feature) => s[feature.key]).length);
  const settings = useSettingsStore((s) => s);
  const [flagState, setFlagState] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [flagOverride, setFlagOverride] = useState<Record<string, boolean>>({});
  const [flagError, setFlagError] = useState<string | null>(null);
  const [housesPhase, setHousesPhase] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [housesError, setHousesError] = useState<string | null>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = pending === null ? null : housesSwitchCopy(!pending);

  async function apply() {
    if (pending === null) return;
    const next = pending;
    setOptimisticEnabled(next);
    setHousesPhase("saving");
    setHousesError(null);
    setBusy(true);
    try {
      await save({ labelsEnabled: next });
      setPending(null);
      setHousesPhase("saved");
      window.setTimeout(() => setHousesPhase("idle"), 1650);
    } catch (error) {
      setOptimisticEnabled(null);
      setHousesPhase("error");
      setHousesError(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
      setOptimisticEnabled(null);
    }
  }

  async function toggleFlag(key: (typeof FEATURE_FLAGS)[number]["key"], next: boolean) {
    setFlagOverride((state) => ({ ...state, [key]: next }));
    setFlagState((state) => ({ ...state, [key]: "saving" }));
    setFlagError(null);
    try {
      await save({ [key]: next });
      setFlagState((state) => ({ ...state, [key]: "saved" }));
      window.setTimeout(() => {
        setFlagState((state) => {
          if (state[key] !== "saved") return state;
          const next = { ...state };
          delete next[key];
          return next;
        });
      }, 1650);
    } catch (error) {
      setFlagOverride((state) => {
        const nextState = { ...state };
        delete nextState[key];
        return nextState;
      });
      setFlagState((state) => ({ ...state, [key]: "error" }));
      setFlagError(error instanceof Error ? error.message : "Could not save.");
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
          checked={optimisticEnabled ?? enabled}
          disabled={!linked || busy}
          aria-label="Houses for shoppers"
          onCheckedChange={(next) => setPending(next)}
        />
        <SaveStatus phase={housesPhase === "idle" ? "idle" : housesPhase} error={housesError} />
      </div>
      <FadeLayer stateKey={(optimisticEnabled ?? enabled) ? "houses-on" : "houses-off"}>
      {linked ? (
        <Link to="/admin/feed" className="ops-row">
          <span className="ops-row-title">Feed & discovery</span>
          <span className="ops-row-note">{feedModulesNote(feedOn)}</span>
        </Link>
      ) : (
        <div className="ops-row" aria-hidden>
          <span className="ops-row-title">Feed & discovery</span>
          <span className="ops-row-note">{feedModulesNote(feedOn)}</span>
        </div>
      )}
      {linked ? (
        <section className="flag-section" aria-labelledby="feature-flags-title" data-testid="feature-flags">
          <h2 className="flag-section-title" id="feature-flags-title">Feature flags</h2>
          <p className="flag-section-intro">Turn experimental or optional features on or off. Changes apply to all shoppers.</p>
          <div className="flag-list">
            {FEATURE_FLAGS.map((flag) => {
              const on = flag.key in flagOverride ? flagOverride[flag.key] : Boolean(settings[flag.key]);
              const state = flagState[flag.key];
              return (
                <article className="flag-row" key={flag.key} data-testid={`flag-${flag.key}`}>
                  <div className="flag-row-copy">
                    <span className="flag-row-name">{flag.label}</span>
                    <span className="flag-row-helper">{flag.helper}</span>
                    <span className="flag-row-meta">
                      <span className="flag-pill">{flag.scope}</span>
                      <span className="flag-row-state" aria-live="polite">
                        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? flagError || "Could not save." : flagStatus(on, flag)}
                      </span>
                    </span>
                  </div>
                  <Switch
                    checked={on}
                    aria-label={flag.label}
                    onCheckedChange={(next) => void toggleFlag(flag.key, next)}
                  />
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      </FadeLayer>
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
        <Skeleton className="h-48 rounded-xl" />
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