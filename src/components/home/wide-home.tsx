import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { StyleFrame } from "@/components/labels/style-frame";
import { beatLabel, creatorRun, ECHO_FROM_KEY, echoKicker, echoLane, pieceLine } from "@/lib/home/echo";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listFashionLabels } from "@/lib/labels/api";
import { pickFeedStyle, styleCardSlot, type FashionLabel } from "@/lib/labels/model";
import { SEED_COLLECTIONS, SEED_STYLES } from "@/lib/labels/seed";
import { useSavedLooks } from "@/lib/looks/saved";
import type { Look } from "@/lib/looks/types";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type WideMode = "feed" | "lane" | "creator";

export function WideHome({ looks }: { looks: Look[] }) {
  const deck = useMemo(() => looks.filter((look) => look.imageSrc), [looks]);
  const [mode, setMode] = useState<WideMode>("feed");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [labels, setLabels] = useState<FashionLabel[]>([]);
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const { user, isPending } = useCurrentUserState();
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const savedIds = useSavedLooks((s) => s.ids);
  const toggleSaved = useSavedLooks((s) => s.toggle);

  useEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  useEffect(() => {
    let alive = true;
    void listFashionLabels()
      .then((rows) => {
        if (alive) setLabels(rows);
      })
      .catch(() => {
        if (alive) setLabels([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (deck.length === 0) return;
    let from: string | null = null;
    try {
      from = sessionStorage.getItem(ECHO_FROM_KEY);
      if (from) sessionStorage.removeItem(ECHO_FROM_KEY);
    } catch {
      return;
    }
    if (!from || !deck.some((look) => look.id === from)) return;
    setAnchorId(from);
    setMode("lane");
  }, [deck]);

  const anchor = deck.find((look) => look.id === anchorId) ?? deck[0];
  const plates = useMemo(() => {
    if (!anchor) return [];
    if (mode === "lane") return echoLane(anchor, deck);
    if (mode === "creator") return creatorRun(anchor, deck).filter((look) => look.id !== anchor.id);
    return deck.slice(1);
  }, [anchor, deck, mode]);

  if (!anchor) return null;

  const beat = mode === "feed" ? deck.map((look) => beatLabel(look)).find(Boolean) : null;
  const tiles = beat ? [...plates.slice(0, 4), ...plates.slice(4)] : plates;
  const feedStyle = housesOn && mode === "feed" ? pickFeedStyle(SEED_STYLES, labels) : null;
  const styleAt = feedStyle ? styleCardSlot(tiles.length) : null;

  function save(look: Look) {
    if (authEnabled && !isPending && !user) {
      setSheetOpen(true);
      return;
    }
    const saved = toggleSaved(look.id);
    toast.success(saved ? "Saved" : "Removed from wardrobe");
  }

  function echo(look: Look) {
    setAnchorId(look.id);
    setMode("lane");
  }

  const heading = mode === "lane" ? "More like this" : mode === "creator" ? anchor.creator || "This creator" : "For you";

  return (
    <div className="wide-home">
      <div className="wide-wrap">
        <header className="wide-pagehd">
          <h1>{heading}</h1>
          <div className="wide-pagehd-side">
            {mode !== "feed" ? (
              <button
                type="button"
                className="wide-houses"
                onClick={() => {
                  setMode("feed");
                  setAnchorId(null);
                }}
              >
                For you
              </button>
            ) : null}
          </div>
        </header>

        <DesktopLead
          look={anchor}
          kicker={echoKicker(anchor)}
          saved={savedIds.includes(anchor.id)}
          onSave={() => save(anchor)}
          onEcho={() => echo(anchor)}
          onCreator={() => {
            setAnchorId(anchor.id);
            setMode("creator");
          }}
        />
        <TabletLead
          look={anchor}
          kicker={echoKicker(anchor)}
          saved={savedIds.includes(anchor.id)}
          onSave={() => save(anchor)}
          onEcho={() => echo(anchor)}
          onCreator={() => {
            setAnchorId(anchor.id);
            setMode("creator");
          }}
        />

        <div className="wide-grid">
          {tiles.flatMap((look, index) => {
            const nodes = [];
            if (styleAt === index && feedStyle) {
              const slug = SEED_COLLECTIONS.find((row) => row.id === feedStyle.style.collectionId)?.slug ?? feedStyle.style.collectionId;
              nodes.push(
                <StyleFrame
                  key={feedStyle.style.id}
                  style={feedStyle.style}
                  houseName={feedStyle.houseName}
                  lineSlug={slug}
                />,
              );
            }
            nodes.push(
              <Tile
                key={look.id}
                look={look}
                kicker={echoKicker(look)}
                saved={savedIds.includes(look.id)}
                onSave={() => save(look)}
                beatAfter={Boolean(beat) && index === 3}
                beat={beat ?? ""}
              />,
            );
            return nodes;
          })}
          {beat && tiles.length < 4 ? (
            <div className="wide-beat">
              <p>From the edit</p>
              <p>{beat}</p>
            </div>
          ) : null}
        </div>
      </div>
      <AccountSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        intent="save"
        title="Sign in to save"
        description="Save stays on this look. Cancel returns here."
        primary="Continue with email"
        secondary="Cancel"
      />
    </div>
  );
}

function DesktopLead({
  look,
  kicker,
  saved,
  onSave,
  onEcho,
  onCreator,
}: {
  look: Look;
  kicker: string;
  saved: boolean;
  onSave: () => void;
  onEcho: () => void;
  onCreator: () => void;
}) {
  return (
    <div className="wide-leadrow">
      <div className="wide-lead-photo">
        <Link to="/looks/$lookId" params={{ lookId: look.id }} aria-label={look.title || "Look"}>
          <img src={look.imageSrc} alt="" />
        </Link>
      </div>
      <div className="wide-lead-copy">
        <Kicker text={kicker} onCreator={onCreator} />
        <h2>{look.title || "Untitled look"}</h2>
        <span className="wide-rule" />
        {pieceLine(look) ? <p className="wide-meta">{pieceLine(look)}</p> : null}
        <div className="wide-acts">
          <button type="button" className="wide-btn wide-btn-primary" onClick={onEcho}>
            <Radio className="size-4" />
            Echo
          </button>
          <SaveButton saved={saved} onSave={onSave} ghost />
        </div>
        <p className="wide-hint">Echo pulls more looks like this one.</p>
      </div>
    </div>
  );
}

function TabletLead({
  look,
  kicker,
  saved,
  onSave,
  onEcho,
  onCreator,
}: {
  look: Look;
  kicker: string;
  saved: boolean;
  onSave: () => void;
  onEcho: () => void;
  onCreator: () => void;
}) {
  return (
    <article className="wide-leadcard">
      <Link to="/looks/$lookId" params={{ lookId: look.id }} className="wide-tile-hit" aria-label={look.title || "Look"}>
        <img src={look.imageSrc} alt="" />
      </Link>
      <span className="wide-peel" aria-hidden />
      <div className="wide-tile-cap wide-leadcard-cap">
        <Kicker text={kicker} onCreator={onCreator} light />
        <h2>{look.title || "Untitled look"}</h2>
        <span className="wide-rule wide-rule-light" />
        <div className="wide-tile-row">
          <span>{pieceLine(look)}</span>
          <div className="wide-acts">
            <button type="button" className="wide-btn wide-btn-onphoto" onClick={onEcho}>
              <Radio className="size-4" />
              Echo
            </button>
            <SaveButton saved={saved} onSave={onSave} onPhoto />
          </div>
        </div>
      </div>
    </article>
  );
}

function Tile({
  look,
  kicker,
  saved,
  onSave,
  beatAfter,
  beat,
}: {
  look: Look;
  kicker: string;
  saved: boolean;
  onSave: () => void;
  beatAfter: boolean;
  beat: string;
}) {
  return (
    <>
      <article className="wide-tile">
        <Link to="/looks/$lookId" params={{ lookId: look.id }} className="wide-tile-hit" aria-label={look.title || "Look"}>
          <img src={look.imageSrc} alt="" />
        </Link>
        <div className="wide-tile-cap">
          <p className="wide-kicker">{kicker}</p>
          <h3>{look.title || "Untitled look"}</h3>
          <div className="wide-tile-row">
            <span>{pieceLine(look)}</span>
            <SaveButton saved={saved} onSave={onSave} onPhoto />
          </div>
        </div>
      </article>
      {beatAfter ? (
        <div className="wide-beat">
          <p>From the edit</p>
          <p>{beat}</p>
        </div>
      ) : null}
    </>
  );
}

function Kicker({ text, onCreator, light = false }: { text: string; onCreator: () => void; light?: boolean }) {
  const parts = text.split(" · ");
  if (parts.length < 2) {
    return (
      <p className={cn("wide-kicker", light && "wide-kicker-light")}>
        <button type="button" className="wide-kicker-link" onClick={onCreator}>
          {text}
        </button>
      </p>
    );
  }
  return (
    <p className={cn("wide-kicker", light && "wide-kicker-light")}>
      {parts[0]}
      {" · "}
      <button type="button" className="wide-kicker-link" onClick={onCreator}>
        {parts.slice(1).join(" · ")}
      </button>
    </p>
  );
}

function SaveButton({
  saved,
  onSave,
  onPhoto = false,
  ghost = false,
}: {
  saved: boolean;
  onSave: () => void;
  onPhoto?: boolean;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("wide-btn wide-btn-sq", onPhoto && "wide-btn-onphoto-sq", ghost && "wide-btn-ghost", saved && "is-saved")}
      aria-label={saved ? "Remove saved look" : "Save"}
      aria-pressed={saved}
      onClick={onSave}
    >
      <HangtagIcon className="size-5" filled={saved} />
    </button>
  );
}
