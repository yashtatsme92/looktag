import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { BROWSE_COACH_KEY } from "@/components/home/style-guide";
import { MoodFilter, type FeedFilter } from "@/components/home/mood-filter";
import { LookCanvas } from "@/components/looks/look-canvas";
import { ShopDock } from "@/components/looks/shop-dock";
import { Button } from "@/components/ui/button";
import { listFashionLabels } from "@/lib/labels/api";
import {
  looksBelongToHouse,
  looksForYou,
  likingsFromLooks,
  type FashionLabel,
} from "@/lib/labels/model";
import { lookPriceBand } from "@/lib/looks/format";
import { looksForMood, MOODS } from "@/lib/looks/moods";
import { useSavedLooks } from "@/lib/looks/saved";
import { useLooksStore } from "@/lib/looks/store";
import type { Look } from "@/lib/looks/types";
import { useChromeLayout } from "@/lib/pwa/use-wide-layout";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import "./look-feed.css";

type LookFeedProps = {
  looks: Look[];
  showCoach?: boolean;
  onHowTo: () => void;
};

function writeCoachDone() {
  try {
    localStorage.setItem(BROWSE_COACH_KEY, "done");
  } catch {
    // private mode
  }
}

function plateAttribution(look: Look, labels: FashionLabel[]): string {
  const house = labels.find((label) => looksBelongToHouse(look, label));
  return house?.name || look.creator || "Looktag";
}

function plateMetaLine(look: Look, labels: FashionLabel[]): string {
  const parts: string[] = [plateAttribution(look, labels)];
  if (look.tags.length) {
    parts.push(`${look.tags.length} ${look.tags.length === 1 ? "piece" : "pieces"}`);
  }
  const band = lookPriceBand(look.tags);
  if (band) parts.push(band);
  return parts.join(" · ");
}

export function LookFeed({ looks, showCoach = false, onHowTo }: LookFeedProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef({ startY: 0, pulling: false, distance: 0 });
  const navigate = useNavigate();
  const chrome = useChromeLayout();
  const wide = chrome !== "phone";
  const wideRef = useRef(wide);
  wideRef.current = wide;
  const refreshLooks = useLooksStore((s) => s.refresh);
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const savedIds = useSavedLooks((s) => s.ids);
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const labelsEnabled = useSettingsStore((s) => s.labelsEnabled);
  const [labels, setLabels] = useState<FashionLabel[]>([]);
  // Guests land on the editorial lane when Houses is on; All is secondary.
  const [filter, setFilter] = useState<FeedFilter>(() => (labelsEnabled ? "foryou" : null));
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedByLook, setSelectedByLook] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [coach, setCoach] = useState(showCoach);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    hydrateSaved();
  }, [hydrateSaved]);

  useEffect(() => {
    if (!labelsEnabled) {
      setLabels([]);
      return;
    }
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
  }, [labelsEnabled]);

  useEffect(() => {
    if (!labelsEnabled && filter === "foryou") setFilter(null);
  }, [labelsEnabled, filter]);

  useEffect(() => {
    setCoach(showCoach);
  }, [showCoach]);

  const filtered = useMemo(() => {
    if (filter === "saved") return looks.filter((look) => savedIds.includes(look.id));
    if (filter === "foryou") {
      const savedLooks = looks.filter((look) => savedIds.includes(look.id));
      return looksForYou(looks, labels, likingsFromLooks(savedLooks));
    }
    return looksForMood(looks, filter);
  }, [filter, looks, savedIds, labels]);
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const counts = useMemo(() => {
    const savedLooks = looks.filter((look) => savedIds.includes(look.id));
    const next: Record<string, number> = {
      all: looks.length,
      saved: savedIds.filter((id) => looks.some((look) => look.id === id)).length,
      foryou: looksForYou(looks, labels, likingsFromLooks(savedLooks)).length,
    };
    for (const item of MOODS) {
      next[item.id] = looksForMood(looks, item.id).length;
    }
    return next;
  }, [looks, savedIds, labels]);

  useEffect(() => {
    setActiveIndex(0);
    const root = scrollerRef.current;
    if (!root) return;
    root.scrollTop = 0;
    const id = window.requestAnimationFrame(() => {
      root.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(id);
  }, [filter, filtered.length]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>("[data-feed-slide]")];
    if (slides.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset.feedIndex);
        if (Number.isNaN(index)) return;
        setActiveIndex(index);
        if (index > 0) dismissCoach();
      },
      { root, threshold: [0.55, 0.75] },
    );
    slides.forEach((slide) => io.observe(slide));
    return () => io.disconnect();
  }, [filtered]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || wide) return;
    const scroller = root;

    function onStart(event: TouchEvent) {
      if (scroller.scrollTop > 4 || refreshing) return;
      pullRef.current = { startY: event.touches[0]?.clientY ?? 0, pulling: true, distance: 0 };
    }
    function onMove(event: TouchEvent) {
      if (!pullRef.current.pulling) return;
      const y = event.touches[0]?.clientY ?? 0;
      const dy = y - pullRef.current.startY;
      if (dy <= 0 || scroller.scrollTop > 4) {
        pullRef.current.pulling = false;
        pullRef.current.distance = 0;
        setPull(0);
        return;
      }
      event.preventDefault();
      const next = Math.min(96, dy * 0.42);
      pullRef.current.distance = next;
      setPull(next);
    }
    function onEnd() {
      if (!pullRef.current.pulling) return;
      const distance = pullRef.current.distance;
      pullRef.current.pulling = false;
      pullRef.current.distance = 0;
      setPull(0);
      if (distance > 52) {
        setRefreshing(true);
        void refreshLooks()
          .then(() => toast.success("Latest looks"))
          .finally(() => setRefreshing(false));
      }
    }

    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd);
    scroller.addEventListener("touchcancel", onEnd);
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
    };
  }, [wide, refreshing, refreshLooks]);

  const active = filtered[Math.min(activeIndex, Math.max(filtered.length - 1, 0))] ?? null;
  const selectedId = active
    ? (selectedByLook[active.id] ?? active.tags[0]?.id ?? null)
    : null;
  const tagsOpen = active
    ? wide
      ? hoveredId === active.id || Boolean(revealed[active.id])
      : Boolean(revealed[active.id])
    : false;

  function dismissCoach() {
    if (!coach) return;
    setCoach(false);
    writeCoachDone();
  }

  function selectPin(lookId: string, tagId: string | null) {
    if (!tagId) return;
    dismissCoach();
    revealedRef.current = { ...revealedRef.current, [lookId]: true };
    setRevealed((prev) => ({ ...prev, [lookId]: true }));
    setSelectedByLook((prev) => ({ ...prev, [lookId]: tagId }));
  }

  function openLook(look: Look) {
    dismissCoach();
    void navigate({ to: "/looks/$lookId", params: { lookId: look.id } });
  }

  function handleLookTap(look: Look) {
    if (wideRef.current) {
      openLook(look);
      return;
    }
    if (!revealedRef.current[look.id]) {
      revealedRef.current = { ...revealedRef.current, [look.id]: true };
      setRevealed((prev) => ({ ...prev, [look.id]: true }));
      dismissCoach();
      return;
    }
    openLook(look);
  }
  const tapHandlerRef = useRef(handleLookTap);
  tapHandlerRef.current = handleLookTap;

  useLayoutEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    function onClick(event: Event) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".look-slide-save, [data-tag-pin], a, .look-feed-top, .look-feed-coach")) return;
      const slide = target.closest("[data-feed-slide]");
      if (!(slide instanceof HTMLElement)) return;
      const look = filteredRef.current.find((item) => item.id === slide.dataset.lookId);
      if (!look) return;
      tapHandlerRef.current(look);
    }
    root.addEventListener("click", onClick, true);
    root.dataset.feedReady = "true";
    return () => {
      root.removeEventListener("click", onClick, true);
      delete root.dataset.feedReady;
    };
  }, []);

  function saveLook(look: Look, onlySave = false) {
    if (onlySave && savedIds.includes(look.id)) {
      setBurstId(look.id);
      window.setTimeout(() => setBurstId((id) => (id === look.id ? null : id)), 700);
      return;
    }
    const saved = toggleSaved(look.id);
    if (saved) {
      setBurstId(look.id);
      window.setTimeout(() => setBurstId((id) => (id === look.id ? null : id)), 700);
      toast.success("Saved");
    }
  }

  function browseAllStyles() {
    setFilter(null);
  }

  return (
    <div className="look-feed-stage" ref={stageRef}>
      <div
        className="look-feed-refresh"
        data-refreshing={refreshing ? "true" : "false"}
        style={{ transform: `translate(-50%, ${Math.max(pull, refreshing ? 44 : 0) - 56}px)` }}
        aria-hidden={!refreshing && pull < 8}
      >
        {refreshing ? "Updating looks" : "Release for latest"}
      </div>
      <div className="look-feed-top">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <MoodFilter
              value={filter}
              onChange={setFilter}
              counts={counts}
              variant="overlay"
              showForYou={labelsEnabled}
            />
          </div>
          {coach ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-1.5 shrink-0 bg-card/90 backdrop-blur-md"
              onClick={onHowTo}
            >
              How to
            </Button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="look-feed-empty flex h-full flex-col justify-end px-5 pb-28">
          {filter === "foryou" ? (
            <>
              <p className="ds-screen-title look-feed-empty-title">Nothing here yet</p>
              <p className="look-feed-empty-copy mt-2 max-w-64 text-sm">
                Browse All styles to find looks — For you fills in as you save.
              </p>
              <Button
                type="button"
                variant="default"
                size="lg"
                className="mt-4 h-11 w-fit min-w-44"
                onClick={browseAllStyles}
              >
                Browse All styles
              </Button>
            </>
          ) : (
            <>
              <p className="ds-screen-title look-feed-empty-title">
                {filter === "saved" ? "Nothing saved yet" : "No looks in this style yet."}
              </p>
              <p className="look-feed-empty-copy mt-2 max-w-64 text-sm">
                {filter === "saved"
                  ? "Tap the bookmark on a look to keep it. Flick up to find the next one."
                  : "Try another style, or flick the full feed."}
              </p>
            </>
          )}
        </div>
      ) : (
        <div ref={scrollerRef} className="look-feed">
          {filtered.map((look, index) => {
            const selected = selectedByLook[look.id] ?? look.tags[0]?.id ?? null;
            const saved = savedIds.includes(look.id);
            const tagsVisible = wide
              ? hoveredId === look.id || Boolean(revealed[look.id])
              : Boolean(revealed[look.id]);
            const meta = plateMetaLine(look, labels);
            return (
              <article
                key={look.id}
                data-feed-slide
                data-feed-index={index}
                data-look-id={look.id}
                data-tags={tagsVisible ? "on" : "off"}
                className="look-slide"
                aria-label={look.title}
                onMouseEnter={() => setHoveredId(look.id)}
                onMouseLeave={() => setHoveredId((id) => (id === look.id ? null : id))}
              >
                <LookCanvas
                  imageSrc={look.imageSrc}
                  title={look.title}
                  tags={look.tags}
                  selectedId={selected}
                  showTags={tagsVisible}
                  fit="fill"
                  className="absolute inset-0"
                  onSelect={(id) => selectPin(look.id, id)}
                  onImageTap={() => handleLookTap(look)}
                />
                <div className="look-slide-meta">
                  {wide ? (
                    <Link
                      to="/looks/$lookId"
                      params={{ lookId: look.id }}
                      className="pointer-events-auto ds-screen-title text-card"
                    >
                      {look.title || "Untitled look"}
                    </Link>
                  ) : (
                    <p className="ds-screen-title text-card">{look.title || "Untitled look"}</p>
                  )}
                  <p className="look-slide-meta-caption mt-2 text-card/80">{meta}</p>
                </div>
                <button
                  type="button"
                  aria-label={saved ? "Remove saved look" : "Save look"}
                  aria-pressed={saved}
                  onClick={(event) => {
                    event.stopPropagation();
                    saveLook(look);
                  }}
                  className="look-slide-save"
                >
                  <Bookmark
                    className={cn("size-5", saved && "fill-current")}
                    strokeWidth={saved ? 2.2 : 1.8}
                  />
                </button>
                {burstId === look.id ? (
                  <span className="look-save-burst" aria-hidden>
                    <Bookmark className="size-16 fill-current" />
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {coach && filtered.length > 0 ? (
        <div className="look-feed-coach">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            The feed
          </p>
          <p className="mt-1.5 text-sm leading-relaxed">
            Tap once to see the pins. Tap again to open the look. Flick up for the next one.
            Pull down for the latest.
          </p>
          <button
            type="button"
            onClick={dismissCoach}
            className="mt-2 h-11 text-sm font-medium underline-offset-4 hover:underline"
          >
            Got it
          </button>
        </div>
      ) : null}

      {active && tagsOpen ? (
        <ShopDock
          floating
          tags={active.tags}
          selectedId={selectedId}
          onSelect={(id) => selectPin(active.id, id)}
        />
      ) : null}
    </div>
  );
}
