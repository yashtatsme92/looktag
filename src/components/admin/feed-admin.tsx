import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  DEFAULT_INTERLEAVE,
  FEED_FEATURES,
  feedFeatureStatus,
  feedSwitchCopy,
  pickWeeklyDrop,
  type FeedFeatureKey,
} from "@/lib/home/engagement";
import { readFeedAudit, writeFeedAudit, type FeedAudit } from "@/lib/home/follows";
import { listFashionCollections, listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import type { FashionCollection, FashionLabel, FashionStyle } from "@/lib/labels/model";
import { useSettingsStore } from "@/lib/settings/store";

function berlinStamp(at: number): string {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
  return `${when} (Berlin)`;
}

export function FeedAdmin() {
  const settings = useSettingsStore();
  const save = useSettingsStore((s) => s.save);
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const { user } = useCurrentUserState();
  const [pending, setPending] = useState<{ key: FeedFeatureKey; label: string; next: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<FeedAudit>({});
  const [labels, setLabels] = useState<FashionLabel[]>([]);
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [styles, setStyles] = useState<FashionStyle[]>([]);

  useEffect(() => {
    setAudit(readFeedAudit());
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([listFashionLabels(), listFashionCollections(), listFashionStyles()])
      .then(([nextLabels, nextCollections, nextStyles]) => {
        if (!alive) return;
        setLabels(nextLabels);
        setCollections(nextCollections);
        setStyles(nextStyles);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const dropLive = pickWeeklyDrop(labels, collections, styles) !== null;
  const copy = pending ? feedSwitchCopy(pending.label, !pending.next) : null;

  function statusFor(key: FeedFeatureKey, on: boolean): string {
    if (key === "feedRuns") return feedFeatureStatus({ on, housesOn, scheduled: false });
    if (key === "feedDrop") return feedFeatureStatus({ on, housesOn, pausedWithHouses: true, scheduled: dropLive });
    if (key === "feedStyleCards") return feedFeatureStatus({ on, housesOn, pausedWithHouses: true });
    return feedFeatureStatus({ on, housesOn });
  }

  async function apply() {
    if (!pending) return;
    setBusy(true);
    try {
      await save({ [pending.key]: pending.next });
      const nextAudit = {
        ...audit,
        [pending.key]: { by: user?.displayName?.trim() || "Admin", at: Date.now() },
      };
      writeFeedAudit(nextAudit);
      setAudit(nextAudit);
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-stage">
      <h1 className="ops-title">Feed & discovery</h1>
      <p className="ops-lead">Shopper feed modules. Slot order stays fixed.</p>
      {FEED_FEATURES.map((feature) => {
        const on = Boolean(settings[feature.key]);
        const changed = audit[feature.key];
        return (
          <div className="ops-row ops-switch-row" key={feature.key}>
            <div>
              <span className="ops-row-title">{feature.label}</span>
              <span className="ops-row-note">{statusFor(feature.key, on)}</span>
              <span className="ops-row-note">
                {changed ? `Last changed by ${changed.by} · ${berlinStamp(changed.at)}` : "Not changed yet · default"}
              </span>
            </div>
            <Switch
              checked={on}
              disabled={busy}
              aria-label={feature.label}
              onCheckedChange={(next) => setPending({ key: feature.key, label: feature.label, next })}
            />
          </div>
        );
      })}
      <section className="ops-row">
        <div>
          <span className="ops-row-title">Interleave preview</span>
          <span className="ops-row-note">{DEFAULT_INTERLEAVE}</span>
        </div>
      </section>
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
