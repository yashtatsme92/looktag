import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, ChevronLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { listFashionLabels } from "@/lib/labels/api";
import { looksBelongToHouse, type FashionLabel } from "@/lib/labels/model";
import { beatLabel, creatorRun, ECHO_FROM_KEY, echoKicker, echoLane, echoSwipe, pieceLine } from "@/lib/home/echo";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSavedLooks } from "@/lib/looks/saved";
import type { Look } from "@/lib/looks/types";
import { requestInstallSheet } from "@/lib/pwa/display";
import { cn } from "@/lib/utils";

type EchoMode = "feed" | "lane" | "creator";

export function EchoHome({ looks }: { looks: Look[] }) {
  const deck = useMemo(() => looks.filter((look) => look.imageSrc), [looks]);
  const [mode, setMode] = useState<EchoMode>("feed");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [shift, setShift] = useState(0);
  const [sliding, setSliding] = useState(false);
  const [hint, setHint] = useState(true);
  const dragRef = useRef({ x: 0, y: 0, active: false, moved: false });
  const { user, isPending } = useCurrentUserState();
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const savedIds = useSavedLooks((s) => s.ids);
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [labels, setLabels] = useState<FashionLabel[]>([]);

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

  const anchor = deck.find((look) => look.id === anchorId) ?? deck[0];
  const plates = useMemo(() => {
    if (!anchor) return [];
    if (mode === "lane") return echoLane(anchor, deck);
    if (mode === "creator") return creatorRun(anchor, deck);
    return deck;
  }, [anchor, deck, mode]);

  useEffect(() => {
    setIndex(0);
  }, [mode, anchorId]);

  useEffect(() => {
    if (!anchor) return;
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
  }, [anchor, deck]);

  function houseName(look: Look) {
    return labels.find((label) => looksBelongToHouse(look, label))?.name;
  }

  function save(look: Look) {
    if (authEnabled && !isPending && !user) {
      setSheetOpen(true);
      return;
    }
    const saved = toggleSaved(look.id);
    toast.success(saved ? "Saved" : "Removed from wardrobe");
  }

  function openLane(look: Look) {
    const lane = echoLane(look, deck);
    if (lane.length === 0) return;
    setAnchorId(look.id);
    setMode("lane");
  }

  function openCreator(look: Look) {
    setAnchorId(look.id);
    setMode("creator");
  }

  function backToFeed() {
    setMode("feed");
    setAnchorId(null);
  }

  const look = plates[index];
  const showingReturn = mode === "creator" && index >= plates.length;
  const prevLook = plates[index - 1];
  const nextLook = plates[index + 1];

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (sliding) return;
    dragRef.current = { x: event.clientX, y: event.clientY, active: true, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active || sliding) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) dragRef.current.moved = true;
    if (Math.abs(dy) >= Math.abs(dx)) setShift(dy);
  }

  function settle(nextShift: number, then: () => void) {
    setSliding(true);
    setShift(nextShift);
    window.setTimeout(() => {
      then();
      setSliding(false);
      setShift(0);
    }, 240);
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.active = false;
    dragRef.current.moved = Math.abs(dx) > 12 || Math.abs(dy) > 12;
    const decision = echoSwipe({
      dx,
      dy,
      index,
      length: plates.length,
      mode,
      showingReturn,
    });
    const travel = typeof window !== "undefined" ? window.innerHeight : 720;
    if (decision === "stay") {
      settle(0, () => undefined);
      return;
    }
    setHint(false);
    if (decision === "lane" && look) {
      settle(-Math.min(160, Math.abs(dx)), () => openLane(look));
      return;
    }
    if (decision === "next") {
      settle(-travel, () => setIndex(index + 1));
      return;
    }
    if (decision === "prev") {
      settle(travel, () => setIndex(index - 1));
      return;
    }
    if (decision === "end") {
      settle(-travel, () => setIndex(plates.length));
      return;
    }
    if (decision === "back") {
      settle(-travel, () => backToFeed());
    }
  }

  if (!anchor) return null;

  const paperBar = mode !== "feed";

  return (
    <div className={cn("echo-stage", paperBar && "echo-stage-paper")} data-mode={mode}>
      <header className={cn("echo-bar", paperBar ? "echo-bar-paper" : "echo-bar-photo")}>
        {paperBar ? (
          <button type="button" className="echo-back" onClick={backToFeed} aria-label="Back to For You">
            <ChevronLeft className="size-6" strokeWidth={1.8} />
          </button>
        ) : (
          <span className="echo-wordmark">Looktag</span>
        )}
        <Link to="/houses" className={paperBar ? "echo-houses echo-houses-ink" : "echo-houses"}>
          Houses
        </Link>
        <button type="button" className="echo-icon" aria-label="Get the app" onClick={() => requestInstallSheet()}>
          <Download className="size-5" />
        </button>
      </header>

      {mode === "lane" ? <p className="echo-pill">More like this</p> : null}
      {mode === "creator" ? <p className="echo-pill echo-pill-ink">From {anchor.creator || "this creator"}</p> : null}

      <div
        className="echo-snap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current.active = false;
          setShift(0);
        }}
      >
        <div
          className="echo-shift"
          style={{
            transform: `translate3d(0, ${shift}px, 0)`,
            transition: sliding ? "transform 240ms ease" : "none",
          }}
        >
          {prevLook?.imageSrc ? (
            <img className="echo-neighbor echo-neighbor-prev" src={prevLook.imageSrc} alt="" />
          ) : null}
          {nextLook?.imageSrc ? (
            <img className="echo-neighbor echo-neighbor-next" src={nextLook.imageSrc} alt="" />
          ) : null}
          {showingReturn || !look ? (
            <button type="button" className="echo-return" onClick={backToFeed}>
              Returning to For You
            </button>
          ) : (
            <article className="echo-plate">
              {mode === "feed" ? <span className="echo-peel" aria-hidden /> : null}
              <Link
                to="/looks/$lookId"
                params={{ lookId: look.id }}
                className="echo-photo"
                aria-label={look.title || "Look"}
                onClick={(event) => {
                  if (!dragRef.current.moved) return;
                  event.preventDefault();
                  dragRef.current.moved = false;
                }}
              >
                <img src={look.imageSrc} alt="" />
              </Link>
              {mode === "feed" && beatLabel(look) ? <p className="echo-beat">{beatLabel(look)}</p> : null}
              {hint && mode === "feed" && index === 0 ? <p className="echo-hint">Swipe up</p> : null}
              <div className="echo-meta">
                <button type="button" className="echo-kicker" onClick={() => openCreator(look)}>
                  {echoKicker(look, houseName(look))}
                </button>
                <h2 className="echo-title">{look.title || "Untitled look"}</h2>
                <span className="echo-rule" />
                {pieceLine(look) ? <p className="echo-pieces">{pieceLine(look)}</p> : null}
              </div>
              <button
                type="button"
                className={cn("echo-save", savedIds.includes(look.id) && "echo-save-on")}
                aria-label={savedIds.includes(look.id) ? "Remove saved look" : "Save look"}
                aria-pressed={savedIds.includes(look.id)}
                onClick={() => save(look)}
              >
                <Bookmark className="size-5" fill={savedIds.includes(look.id) ? "currentColor" : "none"} />
              </button>
            </article>
          )}
        </div>
      </div>

      <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
