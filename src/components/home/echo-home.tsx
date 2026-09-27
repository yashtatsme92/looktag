import { useEffect, useMemo, useRef, useState, type PointerEvent, type UIEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, ChevronLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { listFashionLabels } from "@/lib/labels/api";
import { looksBelongToHouse, type FashionLabel } from "@/lib/labels/model";
import { beatLabel, creatorRun, ECHO_FROM_KEY, echoKicker, echoLane, echoSnapIndex, echoSwipe, pieceLine } from "@/lib/home/echo";
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
  const dragRef = useRef({ x: 0, y: 0, active: false, moved: false });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
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
    const el = scrollerRef.current;
    if (!el) return;
    indexRef.current = 0;
    el.scrollTop = 0;
    // Chrome re-snaps this mandatory feed to the last plate once, before any
    // gesture. Put it back. A real swipe or wheel opts out.
    let touched = false;
    const mark = () => {
      touched = true;
    };
    const onScroll = () => {
      if (touched || el.scrollTop <= 1) return;
      el.scrollTop = 0;
      indexRef.current = 0;
    };
    el.addEventListener("pointerdown", mark, { capture: true });
    el.addEventListener("wheel", mark, { capture: true });
    el.addEventListener("touchstart", mark, { capture: true });
    el.addEventListener("scroll", onScroll);
    const stop = window.setTimeout(() => el.removeEventListener("scroll", onScroll), 2500);
    return () => {
      window.clearTimeout(stop);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", mark, { capture: true });
      el.removeEventListener("wheel", mark, { capture: true });
      el.removeEventListener("touchstart", mark, { capture: true });
    };
  }, [mode, anchorId, plates.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let locked = false;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (locked || Math.abs(event.deltaY) < 12) return;
      const dir = event.deltaY > 0 ? 1 : -1;
      const count = el.querySelectorAll(".echo-plate").length;
      const next = Math.min(count - 1, Math.max(0, indexRef.current + dir));
      if (next === indexRef.current) {
        if (dir > 0 && mode === "creator") {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
        return;
      }
      locked = true;
      indexRef.current = next;
      el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
      window.setTimeout(() => {
        locked = false;
      }, 520);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode, anchorId, plates.length]);

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

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const raw = el.clientHeight > 0 ? el.scrollTop / el.clientHeight : 0;
    const nearest = Math.round(raw);
    if (Math.abs(raw - nearest) > 0.08) return;
    const next = echoSnapIndex(el.scrollTop, el.clientHeight, plates.length);
    if (next === indexRef.current) return;
    indexRef.current = next;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY, active: true, moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) dragRef.current.moved = true;
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.active = false;
    dragRef.current.moved = Math.abs(dx) > 12 || Math.abs(dy) > 12;
    const current = plates[indexRef.current];
    if (!current || mode !== "feed") return;
    const decision = echoSwipe({
      dx,
      dy,
      index: indexRef.current,
      length: plates.length,
      mode,
    });
    if (decision === "lane") openLane(current);
  }

  function onPointerCancel() {
    dragRef.current.active = false;
  }

  if (!anchor) return null;

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
        ref={scrollerRef}
        className="echo-snap"
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {plates.map((look, plateIndex) => (
          <article className="echo-plate" key={look.id}>
            {mode === "feed" && plateIndex === 0 ? <span className="echo-peel" aria-hidden /> : null}
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
        ))}
        {mode === "creator" ? (
          <button type="button" className="echo-return" onClick={backToFeed}>
            Returning to For You
          </button>
        ) : null}
      </div>

      <AccountSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
