import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Download, Landmark, Palette, SlidersHorizontal } from "lucide-react";
import { ScoutedMark } from "@/components/labels/scouted-mark";
import { AppShell } from "@/components/layout/app-shell";
import { ScreenTitle } from "@/components/layout/screen-title";
import { LookCard } from "@/components/looks/look-card";
import { ProfileForm } from "@/components/looks/profile-form";
import { SavedLooks } from "@/components/looks/saved-looks";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/admin/access";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyHouse } from "@/lib/labels/api";
import { SCOUTED_FLAG, type FashionLabel } from "@/lib/labels/model";
import { ensureMyProfile, getCreator, type CreatorProfile } from "@/lib/looks/api";
import { emptySelfProfile } from "@/lib/looks/handle";
import { useLooksStore } from "@/lib/looks/store";
import { isEditorialLook, type Look } from "@/lib/looks/types";
import { requestInstallSheet } from "@/lib/pwa/display";
import { useStandaloneDisplay } from "@/lib/pwa/use-display";
import { useSettingsStore } from "@/lib/settings/store";

export const Route = createFileRoute("/creators/$userId")({ component: CreatorPage });

function CreatorPage() {
  const { userId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const standalone = useStandaloneDisplay();
  const labelsEnabled = useSettingsStore((s) => s.labelsEnabled);
  const admin = isAdminEmail(user?.primaryEmail);
  const [data, setData] = useState<{ creator: CreatorProfile; looks: Look[] } | null | undefined>(
    undefined,
  );
  const [house, setHouse] = useState<FashionLabel | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const mine = Boolean(user && user.id === userId);
  const allLooks = useLooksStore((s) => s.looks);
  const storeLooks = useMemo(
    () =>
      mine ? allLooks.filter((look) => look.userId === userId && !isEditorialLook(look)) : [],
    [allLooks, mine, userId],
  );

  useEffect(() => {
    let alive = true;

    if (user?.id === userId) {
      setData((current) =>
        current ??
        emptySelfProfile({
          userId,
          displayName: user.displayName?.trim() || user.primaryEmail || "You",
        }),
      );
    } else if (!isPending) {
      setData(undefined);
    }

    const failSafe = window.setTimeout(() => {
      if (!alive) return;
      setData((current) => {
        if (current) return current;
        if (user?.id === userId) {
          return emptySelfProfile({
            userId,
            displayName: user.displayName?.trim() || user.primaryEmail || "You",
          });
        }
        return null;
      });
    }, 4000);

    void (async () => {
      try {
        let result = await getCreator({ data: userId });
        if (!result && user?.id === userId) {
          result = await ensureMyProfile({
            data: { displayName: user.displayName?.trim() || user.primaryEmail || "Creator" },
          });
        }
        if (!alive) return;
        if (result) {
          setData(result);
          return;
        }
        if (user?.id === userId) {
          setData(
            emptySelfProfile({
              userId,
              displayName: user.displayName?.trim() || user.primaryEmail || "You",
            }),
          );
          return;
        }
        if (!isPending) setData(null);
      } catch {
        if (!alive) return;
        if (user?.id === userId) {
          setData(
            emptySelfProfile({
              userId,
              displayName: user.displayName?.trim() || user.primaryEmail || "You",
            }),
          );
        } else if (!isPending) {
          setData(null);
        }
      } finally {
        window.clearTimeout(failSafe);
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(failSafe);
    };
  }, [userId, user?.id, user?.displayName, user?.primaryEmail, isPending]);

  useEffect(() => {
    if (!mine || !labelsEnabled) {
      setHouse(null);
      return;
    }
    let alive = true;
    void getMyHouse()
      .then((row) => {
        if (alive) setHouse(row);
      })
      .catch(() => {
        if (alive) setHouse(null);
      });
    return () => {
      alive = false;
    };
  }, [mine, labelsEnabled, user?.id]);

  if (data === undefined) {
    return (
      <AppShell title="You" largeTitle={mine} backTo={mine ? undefined : "/rank"}>
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="You" backTo="/rank">
        <h1 className="font-display text-4xl">Creator not found</h1>
        <p className="mt-3 text-muted-foreground">
          Rankings only include people who have signed in and published a look.
        </p>
        <Button asChild className="mt-6">
          <Link to="/rank">Back to ranking</Link>
        </Button>
      </AppShell>
    );
  }

  const { creator } = data;
  const looks = mergeLooks(data.looks, mine ? storeLooks : []);
  const lookCount = Math.max(creator.looks, looks.length);
  const pinCount = Math.max(
    creator.pins,
    looks.reduce((sum, look) => sum + look.tags.length, 0),
  );

  return (
    <AppShell title={mine ? "You" : creator.displayName} largeTitle={mine} backTo={mine ? undefined : "/rank"}>
      <ScreenTitle kicker={`@${creator.handle}`}>{creator.displayName}</ScreenTitle>
      {creator.city || creator.bio ? (
        <div className="mb-4">
          {creator.city ? <p className="text-sm text-muted-foreground">{creator.city}</p> : null}
          {creator.bio ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{creator.bio}</p>
          ) : null}
        </div>
      ) : null}
      {labelsEnabled && creator.scouted ? (
        <div className="mb-4 flex items-center gap-2">
          <ScoutedMark />
          <p className="text-sm text-muted-foreground">{SCOUTED_FLAG} — picked by Looktag.</p>
        </div>
      ) : null}
      <dl className="mb-6 grid grid-cols-4 gap-2 text-center">
        <Stat label="Score" value={String(creator.score)} />
        <Stat label="Looks" value={String(lookCount)} />
        <Stat label="Pins" value={String(pinCount)} />
        <Stat label="Compared" value={String(creator.compared)} />
      </dl>

      {mine ? (
        <ProfileForm
          seed={{
            name: creator.displayName,
            handle: creator.handle,
            email: user?.primaryEmail ?? "",
            city: creator.city,
            bio: creator.bio,
            hasPassword: true,
            emailLocked: isAdminEmail(user?.primaryEmail),
          }}
          onSaved={(account) => {
            setData((current) =>
              current
                ? {
                    ...current,
                    creator: {
                      ...current.creator,
                      displayName: account.name,
                      handle: account.handle,
                      city: account.city,
                      bio: account.bio,
                    },
                  }
                : current,
            );
          }}
        />
      ) : null}

      {mine ? (
        <div className="mb-8 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-border)]">
          {admin ? (
            <>
              <Link to="/admin" className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                <span className="flex-1">Admin</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link to="/admin/look" className="flex min-h-14 items-center gap-3 border-t border-border px-4 text-sm font-medium">
                <Palette className="size-4 text-muted-foreground" />
                <span className="flex-1">Look & palettes</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </>
          ) : null}
          {labelsEnabled ? (
            <Link
              to="/houses/apply"
              className="flex min-h-14 items-center gap-3 border-t border-border px-4 text-sm font-medium first:border-t-0"
            >
              <Landmark className="size-4 text-muted-foreground" />
              <span className="flex-1">
                {house
                  ? house.status === "approved"
                    ? `Manage ${house.name}`
                    : house.status === "rejected"
                      ? `House declined · ${house.name}`
                      : `House pending · ${house.name}`
                  : "Register a house"}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ) : null}
          {!standalone ? (
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 border-t border-border px-4 text-left text-sm font-medium first:border-t-0"
              onClick={() => requestInstallSheet()}
            >
              <Download className="size-4 text-muted-foreground" />
              <span className="flex-1">Get the app</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ) : null}
          {authEnabled ? (
            <button
              type="button"
              disabled={signingOut}
              className="flex min-h-14 w-full items-center gap-3 border-t border-border px-4 text-left text-sm font-medium text-destructive first:border-t-0 disabled:opacity-60"
              onClick={() => {
                setSigningOut(true);
                void signOut().catch(() => setSigningOut(false));
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : null}
        </div>
      ) : null}

      {looks.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {looks.map((look) => (
            <LookCard key={look.id} look={look} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {mine ? "No published looks yet. Create a look to appear on Rank." : "No published looks yet."}
        </p>
      )}

      {mine ? <SavedLooks variant="grid" /> : null}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card px-1 py-3 shadow-[var(--shadow-border)]">
      <dt className="text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-display text-xl tabular-nums">{value}</dd>
    </div>
  );
}

function mergeLooks(primary: Look[], extra: Look[]) {
  const byId = new Map<string, Look>();
  for (const look of [...extra, ...primary]) byId.set(look.id, look);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}
