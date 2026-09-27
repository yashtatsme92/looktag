import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Bookmark, ChevronLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { listFashionLabels } from "@/lib/labels/api";
import { looksBelongToHouse, type FashionLabel } from "@/lib/labels/model";
import { beatLabel, creatorRun, ECHO_FROM_KEY, echoDragOffset, echoKicker, echoLane, echoSettleY, echoSwipe, pieceLine } from "@/lib/home/echo";
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
  const [sliding, setSliding] = useState(false);
  const [hint, setHint] = useState(true);
  const dragRef = useRef({ x: 0, y: 0, active: false, moved: false, offset: 0 });
  const shiftRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const pendingY = useRef<number | null>(null);
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
  const canAdvance =
    index < plates.length - 1 || showingReturn || (mode === "creator" && index === plates.length - 1);
  const canRetreat = index > 0;

  function plateHeight() {
    return shiftRef.current?.parentElement?.clientHeight || window.innerHeight;
  }

  function writeShift(y: number, dragging: boolean) {
    const el = shiftRef.current;
    if (!el) return;
    el.dataset.drag = dragging ? "true" : "false";
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  }

  function flushShift() {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    if (pendingY.current == null) return;
    writeShift(pendingY.current, true);
    pendingY.current = null;
  }

  function queueShift(y: number) {
    pendingY.current = y;
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      if (pendingY.current == null) return;
      writeShift(pendingY.current, true);
      pendingY.current = null;
    });
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (sliding) return;
    dragRef.current = { x: event.clientX, y: event.clientY, active: true, moved: false, offset: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    writeShift(dragRef.current.offset, true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active || sliding) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) dragRef.current.moved = true;
    if (Math.abs(dy) < Math.abs(dx)) return;
    const offset = echoDragOffset(dy, canAdvance, canRetreat);
    dragRef.current.offset = offset;
    queueShift(offset);
  }

  function settle(target: number, then: () => void) {
    const el = shiftRef.current;
    if (!el || reducedMotion()) {
      writeShift(0, true);
      then();
      return;
    }
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      pendingY.current = null;
    }
    setSliding(true);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
      el.dataset.drag = "true";
      flushSync(() => then());
      el.style.transform = "translate3d(0, 0px, 0)";
      window.requestAnimationFrame(() => {
        if (shiftRef.current) shiftRef.current.dataset.drag = "false";
        setSliding(false);
      });
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== "transform") return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(finish, 680);
    window.requestAnimationFrame(() => {
      if (!shiftRef.current) return;
      shiftRef.current.dataset.drag = "false";
      shiftRef.current.style.transform = `translate3d(0, ${target}px, 0)`;
    });
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragRef.current.active) return;
    flushShift();
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
    if (decision !== "stay") setHint(false);
    if (decision === "lane" && look) {
      writeShift(0, true);
      openLane(look);
      return;
    }
    const target = echoSettleY(decision, plateHeight());
    if (Math.abs(target - dragRef.current.offset) < 0.5 && decision === "stay") {
      writeShift(0, false);
      return;
    }
    settle(target, () => {
      if (decision === "next") setIndex(index + 1);
      else if (decision === "prev") setIndex(index - 1);
      else if (decision === "end") setIndex(plates.length);
      else if (decision === "back") backToFeed();
    });
  }

  function onPointerCancel() {
    dragRef.current.active = false;
    settle(0, () => undefined);
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
        onPointerCancel={onPointerCancel}
      >
        <div ref={shiftRef} className="echo-shift">
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
