import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  DEFAULT_CADENCE,
  FEED_FEATURES,
  applyFeedCopy,
  feedFeatureStatus,
  feedSwitchCopy,
  moodRunState,
  pickWeeklyDrop,
  placeFeed,
  proofFromCadence,
  type FeedCadence,
  type FeedFeatureKey,
  type FreshWindow,
} from "@/lib/home/engagement";
import { readFeedAudit, writeFeedAudit, type FeedAudit } from "@/lib/home/follows";
import { listFashionCollections, listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import type { FashionCollection, FashionLabel, FashionStyle } from "@/lib/labels/model";
import { useLooksStore } from "@/lib/looks/store";
import type { AppSettings } from "@/lib/settings/model";
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

function parseAudit(json: string): FeedAudit {
  if (!json) return readFeedAudit();
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return readFeedAudit();
    return parsed as FeedAudit;
  } catch {
    return readFeedAudit();
  }
}

type Draft = FeedCadence & { runTitle: string; runIds: string[] };

function draftFromSettings(settings: {
  feedDropSlot: Draft["dropSlot"];
  feedStyleEvery: Draft["styleEvery"];
  feedBecauseEvery: Draft["becauseEvery"];
  feedRunEvery: Draft["runEvery"];
  feedFreshWindow: FreshWindow;
  feedRunTitle: string;
  feedRunIds: string;
}): Draft {
  return {
    dropSlot: settings.feedDropSlot,
    styleEvery: settings.feedStyleEvery,
    becauseEvery: settings.feedBecauseEvery,
    runEvery: settings.feedRunEvery,
    freshWindow: settings.feedFreshWindow,
    runTitle: settings.feedRunTitle,
    runIds: settings.feedRunIds.split(",").map((id) => id.trim()).filter(Boolean),
  };
}

export function FeedAdmin() {
  const settings = useSettingsStore();
  const save = useSettingsStore((s) => s.save);
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const looks = useLooksStore((s) => s.looks);
  const { user } = useCurrentUserState();
  const [pending, setPending] = useState<{ key: FeedFeatureKey; label: string; next: boolean } | null>(null);
  const [editing, setEditing] = useState<FeedFeatureKey | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<FashionLabel[]>([]);
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [styles, setStyles] = useState<FashionStyle[]>([]);
  const audit = useMemo(() => parseAudit(settings.feedAuditJson), [settings.feedAuditJson]);

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
  const savedDraft = draftFromSettings(settings);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const previewCadence: FeedCadence = draft
    ? {
        dropSlot: draft.dropSlot,
        styleEvery: draft.styleEvery,
        becauseEvery: draft.becauseEvery,
        runEvery: draft.runEvery,
        freshWindow: draft.freshWindow,
      }
    : {
        dropSlot: settings.feedDropSlot,
        styleEvery: settings.feedStyleEvery,
        becauseEvery: settings.feedBecauseEvery,
        runEvery: settings.feedRunEvery,
        freshWindow: settings.feedFreshWindow,
      };
  const placed = placeFeed(previewCadence);

  function statusFor(key: FeedFeatureKey, on: boolean): string {
    if (key === "feedFollow" && on && !housesOn) return "On · House items paused while Houses are off";
    if (key === "feedRuns") {
      const state = moodRunState(settings.feedRunTitle, settings.feedRunIds);
      return feedFeatureStatus({ on, housesOn, attention: state === "attention", scheduled: state === "empty" ? false : undefined });
    }
    if (key === "feedDrop") return feedFeatureStatus({ on, housesOn, pausedWithHouses: true, scheduled: dropLive });
    if (key === "feedStyleCards") return feedFeatureStatus({ on, housesOn, pausedWithHouses: true });
    return feedFeatureStatus({ on, housesOn });
  }

  function remember(key: string, patch: Partial<AppSettings>): Partial<AppSettings> {
    const nextAudit = { ...audit, [key]: { by: user?.displayName?.trim() || "Admin", at: Date.now() } };
    writeFeedAudit(nextAudit);
    return { ...patch, feedAuditJson: JSON.stringify(nextAudit) };
  }

  async function applySwitch() {
    if (!pending) return;
    setBusy(true);
    try {
      await save(remember(pending.key, { [pending.key]: pending.next }));
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function openSettings(key: FeedFeatureKey) {
    setEditing(key);
    setDraft(draftFromSettings(settings));
  }

  function askClose() {
    if (dirty) setDiscardOpen(true);
    else {
      setEditing(null);
      setDraft(null);
    }
  }

  function restore() {
    if (!draft || !editing) return;
    setDraft({
      ...draft,
      ...(editing === "feedDrop" ? { dropSlot: DEFAULT_CADENCE.dropSlot } : {}),
      ...(editing === "feedStyleCards" ? { styleEvery: DEFAULT_CADENCE.styleEvery } : {}),
      ...(editing === "feedSaves" ? { becauseEvery: DEFAULT_CADENCE.becauseEvery } : {}),
      ...(editing === "feedFresh" ? { freshWindow: DEFAULT_CADENCE.freshWindow } : {}),
      ...(editing === "feedRuns" ? { runEvery: DEFAULT_CADENCE.runEvery, runTitle: "", runIds: [] } : {}),
    });
  }

  function changeLines(): string[] {
    if (!draft) return [];
    const lines: string[] = [];
    if (draft.dropSlot !== settings.feedDropSlot) lines.push(`Drop ${settings.feedDropSlot} → ${draft.dropSlot}`);
    if (draft.styleEvery !== settings.feedStyleEvery) lines.push(`Style ${settings.feedStyleEvery} → ${draft.styleEvery}`);
    if (draft.becauseEvery !== settings.feedBecauseEvery) lines.push(`Because ${settings.feedBecauseEvery} → ${draft.becauseEvery}`);
    if (draft.runEvery !== settings.feedRunEvery) lines.push(`Run ${settings.feedRunEvery} → ${draft.runEvery}`);
    if (draft.freshWindow !== settings.feedFreshWindow) lines.push(`Fresh ${settings.feedFreshWindow} → ${draft.freshWindow}`);
    const nextIds = draft.runIds.join(",");
    if (draft.runTitle !== settings.feedRunTitle || nextIds !== settings.feedRunIds) {
      lines.push(`Run ${settings.feedRunTitle || "none"} → ${draft.runTitle || "none"}`);
    }
    return lines;
  }

  const runDraftState = draft ? moodRunState(draft.runTitle, draft.runIds.join(",")) : "empty";
  const canApply = dirty && (editing !== "feedRuns" || runDraftState !== "attention");
  const applyCopy = applyFeedCopy(changeLines());

  async function applySettings() {
    if (!draft || !canApply) return;
    setBusy(true);
    try {
      await save(
        remember(editing || "feed", {
          feedDropSlot: draft.dropSlot,
          feedStyleEvery: draft.styleEvery,
          feedBecauseEvery: draft.becauseEvery,
          feedRunEvery: draft.runEvery,
          feedFreshWindow: draft.freshWindow,
          feedRunTitle: draft.runTitle,
          feedRunIds: draft.runIds.join(","),
        }),
      );
      setApplyOpen(false);
      setEditing(null);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  function toggleRunLook(id: string) {
    if (!draft) return;
    const has = draft.runIds.includes(id);
    if (!has && draft.runIds.length >= 6) return;
    setDraft({ ...draft, runIds: has ? draft.runIds.filter((item) => item !== id) : [...draft.runIds, id] });
  }

  return (
    <div className="ops-stage">
      <h1 className="ops-title">Feed & discovery</h1>
      <p className="ops-lead">Changes reach each shopper on their next feed load. Nothing moves mid-scroll.</p>
      <div className="feed-modules">
        {FEED_FEATURES.map((feature) => {
          const on = Boolean(settings[feature.key]);
          const changed = audit[feature.key];
          const status = statusFor(feature.key, on);
          const tone = status.startsWith("Off") ? "off" : status.includes("needs attention") ? "att" : "on";
          return (
            <article className="feed-module" key={feature.key}>
              <div className="feed-module-top">
                <div className="feed-module-copy">
                  <span className="feed-module-title">{feature.label}</span>
                  <span className="feed-module-status">
                    <i data-tone={tone} aria-hidden="true" />
                    {status}
                  </span>
                </div>
                <span className="feed-swbox">
                  <Switch
                    checked={on}
                    disabled={busy}
                    aria-label={feature.label}
                    onCheckedChange={(next) => setPending({ key: feature.key, label: feature.label, next })}
                  />
                </span>
              </div>
              <p className="feed-module-detail">{feature.detail}</p>
              <div className="feed-module-bot">
                <span className="feed-module-audit">
                  {changed ? `Last changed by ${changed.by} · ${berlinStamp(changed.at)}` : "Not changed yet · default"}
                </span>
                {feature.settings ? (
                  <button type="button" className="house-ghost" onClick={() => openSettings(feature.key)}>
                    Settings
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <section className="ops-row">
        <div className="ops-switch-copy">
          <span className="ops-row-title">Interleave preview</span>
          <span className="ops-row-note">{proofFromCadence(previewCadence)}</span>
          {placed.notes.map((note) => (
            <span className="ops-row-note" key={note}>
              {note}
            </span>
          ))}
        </div>
      </section>
      {editing && draft ? (
        <section className="feed-settings" aria-label="Feed settings">
          <h2 className="ops-row-title">{FEED_FEATURES.find((feature) => feature.key === editing)?.label}</h2>
          {editing === "feedDrop" ? (
            <div className="feed-choices">
              <Choice on={draft.dropSlot === 3} label="Slot 3" onPick={() => setDraft({ ...draft, dropSlot: 3 })} />
              <Choice on={draft.dropSlot === 4} label="Slot 4" onPick={() => setDraft({ ...draft, dropSlot: 4 })} />
            </div>
          ) : null}
          {editing === "feedStyleCards" ? (
            <div className="feed-choices">
              {([12, 16, 24] as const).map((value) => (
                <Choice key={value} on={draft.styleEvery === value} label={`1 in ${value}`} onPick={() => setDraft({ ...draft, styleEvery: value })} />
              ))}
            </div>
          ) : null}
          {editing === "feedSaves" ? (
            <div className="feed-choices">
              {([20, 24, 32] as const).map((value) => (
                <Choice key={value} on={draft.becauseEvery === value} label={`1 in ${value}`} onPick={() => setDraft({ ...draft, becauseEvery: value })} />
              ))}
            </div>
          ) : null}
          {editing === "feedFresh" ? (
            <div className="feed-choices">
              {(["24h", "3d", "7d"] as const).map((value) => (
                <Choice key={value} on={draft.freshWindow === value} label={value === "24h" ? "24 hours" : value === "3d" ? "3 days" : "7 days"} onPick={() => setDraft({ ...draft, freshWindow: value })} />
              ))}
            </div>
          ) : null}
          {editing === "feedRuns" ? (
            <div className="feed-run-editor">
              <div className="feed-choices">
                {([24, 32, 48] as const).map((value) => (
                  <Choice key={value} on={draft.runEvery === value} label={`1 in ${value}`} onPick={() => setDraft({ ...draft, runEvery: value })} />
                ))}
              </div>
              <label className="create-kicker" htmlFor="run-title">
                Run title
              </label>
              <input
                id="run-title"
                className="create-piece-link"
                value={draft.runTitle}
                maxLength={60}
                onChange={(event) => setDraft({ ...draft, runTitle: event.target.value })}
              />
              <p className="ops-row-note">Pick 5 or 6 looks. The kicker stays Run.</p>
              <ul className="feed-run-picks">
                {looks.slice(0, 12).map((look) => (
                  <li key={look.id}>
                    <button type="button" aria-pressed={draft.runIds.includes(look.id)} onClick={() => toggleRunLook(look.id)}>
                      {look.title || "Untitled look"}
                    </button>
                  </li>
                ))}
              </ul>
              {runDraftState === "attention" ? <p className="ops-row-note">On · needs attention</p> : null}
            </div>
          ) : null}
          {editing === "feedFollow" || editing === "feedEchoTrail" ? (
            <p className="ops-row-note">The switch is the only control for this module.</p>
          ) : null}
          <div className="feed-settings-actions">
            <button type="button" className="house-primary" disabled={!canApply || busy} onClick={() => setApplyOpen(true)}>
              Save changes
            </button>
            <button type="button" className="house-ghost" onClick={restore}>
              Restore defaults
            </button>
            <button type="button" className="house-ghost" onClick={askClose}>
              Back
            </button>
          </div>
          {dirty ? <p className="feed-dock">Preview · unsaved changes</p> : null}
        </section>
      ) : null}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.body}</DialogDescription>
          <div className="flex flex-col gap-2">
            <button type="button" className="house-primary" disabled={busy} onClick={() => void applySwitch()}>
              {copy?.confirm}
            </button>
            <button type="button" className="house-ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>{applyCopy.title}</DialogTitle>
          <DialogDescription>{applyCopy.body}</DialogDescription>
          <div className="flex flex-col gap-2">
            <button type="button" className="house-primary" disabled={busy} onClick={() => void applySettings()}>
              {applyCopy.confirm}
            </button>
            <button type="button" className="house-ghost" disabled={busy} onClick={() => setApplyOpen(false)}>
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>The feed stays as it is.</DialogDescription>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="house-primary"
              onClick={() => {
                setDiscardOpen(false);
                setEditing(null);
                setDraft(null);
              }}
            >
              Discard
            </button>
            <button type="button" className="house-ghost" onClick={() => setDiscardOpen(false)}>
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Choice({ on, label, onPick }: { on: boolean; label: string; onPick: () => void }) {
  return (
    <button type="button" className={on ? "feed-choice is-on" : "feed-choice"} aria-pressed={on} onClick={onPick}>
      {label}
    </button>
  );
}
