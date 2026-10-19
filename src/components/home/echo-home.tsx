import { useEffect, useMemo, useRef, useState, type PointerEvent, type UIEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Layers, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { BecausePlate, RunPlate, ShowLess } from "@/components/home/feed-modules";
import { FollowButton } from "@/components/home/follow-button";
import { FollowingHousePlate } from "@/components/home/following-card";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { FeedLoadError } from "@/components/ds/feed-error";
import { FeedTabs } from "@/components/ds/feed-tabs";
import { ImgSlot } from "@/components/ds/img-slot";
import { SkeletonGrid } from "@/components/ds/skeleton";
import { StyleFrame } from "@/components/labels/style-frame";
import { listFashionCollections, listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import { pickFeedStyle, type FashionCollection, type FashionLabel, type FashionStyle } from "@/lib/labels/model";
import { SEED_STYLES } from "@/lib/labels/seed";
import { beatLabel, creatorRun, ECHO_FROM_KEY, echoKicker, forYouOrder, recordEchoActivation, echoSnapIndex, echoSwipe, pieceLine } from "@/lib/home/echo";
import { useEchoLane } from "@/lib/home/use-echo-lane";
import {
  ECHO_TRAIL_CHIPS,
  becauseYouSaved,
  freshDivider,
  freshDividerAt,
  followingHouseCards,
  followingLooks,
  mixFollowing,
  parseMoodRun,
  pickWeeklyDrop,
  pushTrail,
  refineLane,
  styleCardAfterDrop,
} from "@/lib/home/engagement";
import {
  CREATOR_FOLLOWS_KEY,
  FEED_LESS_KEY,
  FOLLOWING_SEEN_KEY,
  HOUSE_FOLLOWS_KEY,
  consumeFreshVisit,
  omitSelfFollow,
  readStoredIds,
  writeStoredIds,
} from "@/lib/home/follows";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadingCache } from "@/lib/loading/cache";
import { useDelayedLoad } from "@/lib/loading/delayed-load";
import { settleLoad } from "@/lib/loading/test-delay";
import { shareOrCopy } from "@/lib/looks/share";
import { useSavedLooks } from "@/lib/looks/saved";
import { useResumePendingSave } from "@/lib/looks/use-pending-save";
import type { Look } from "@/lib/looks/types";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type EchoMode = "feed" | "lane" | "creator" | "following";

export function EchoHome({ looks }: { looks: Look[] }) {
  const deck = useMemo(() => looks.filter((look) => look.imageSrc), [looks]);
  const [mode, setMode] = useState<EchoMode>("feed");
  const [followRetry, setFollowRetry] = useState(0);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const dragRef = useRef({ x: 0, y: 0, active: false, moved: false });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const { user, isPending } = useCurrentUserState();
  useResumePendingSave(Boolean(user));
  const hydrateSaved = useSavedLooks((s) => s.hydrate);
  const savedIds = useSavedLooks((s) => s.ids);
  const toggleSaved = useSavedLooks((s) => s.toggle);
  const [labels, setLabels] = useState<FashionLabel[]>([]);
  const [styles, setStyles] = useState<FashionStyle[]>(SEED_STYLES);
  const [collections, setCollections] = useState<FashionCollection[]>([]);
  const [followed, setFollowed] = useState<string[]>([]);
  const [houseFollows, setHouseFollows] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [trail, setTrail] = useState<string[]>([]);
  const [lessIds, setLessIds] = useState<string[]>([]);
  const [returning, setReturning] = useState(false);
  const [now] = useState(() => Date.now());
  const housesOn = useSettingsStore((s) => s.labelsEnabled);
  const feedDropOn = useSettingsStore((s) => s.feedDrop);
  const feedStyleOn = useSettingsStore((s) => s.feedStyleCards);
  const feedFollowOn = useSettingsStore((s) => s.feedFollow);
  const feedTrailOn = useSettingsStore((s) => s.feedEchoTrail);
  const feedFreshOn = useSettingsStore((s) => s.feedFresh);
  const feedRunsOn = useSettingsStore((s) => s.feedRuns);
  const feedSavesOn = useSettingsStore((s) => s.feedSaves);
  const freshWindow = useSettingsStore((s) => s.feedFreshWindow);
  const becauseEvery = useSettingsStore((s) => s.feedBecauseEvery);
  const runEvery = useSettingsStore((s) => s.feedRunEvery);
  const runTitle = useSettingsStore((s) => s.feedRunTitle);
  const runIds = useSettingsStore((s) => s.feedRunIds);
  const followingLoad = useDelayedLoad(
    () =>
      mode === "following"
        ? settleLoad(
            Promise.all([listFashionLabels(), listFashionCollections(), listFashionStyles()]).then(
              ([nextLabels, nextCollections, nextStyles]) => ({ nextLabels, nextCollections, nextStyles }),
            ),
          )
        : Promise.resolve(null),
    {
      cacheKey: mode === "following" ? `feed:following:${followRetry}` : "feed:following:idle",
      getScroll: () => scrollerRef.current?.scrollTop ?? 0,
      setScroll: (y) => {
        if (scrollerRef.current) scrollerRef.current.scrollTop = y;
      },
    },
  );
  useDelayedLoad(() => Promise.resolve(deck.length), {
    cacheKey: "feed:phone",
    getScroll: () => scrollerRef.current?.scrollTop ?? 0,
    setScroll: (y) => {
      if (scrollerRef.current) scrollerRef.current.scrollTop = y;
    },
  });

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
    if (!housesOn) return;
    let alive = true;
    void listFashionStyles()
      .then((rows) => {
        if (alive) setStyles(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [housesOn]);

  useEffect(() => {
    const stored = readStoredIds(CREATOR_FOLLOWS_KEY);
    const next = omitSelfFollow(stored, user?.id);
    if (user?.id && next.length !== stored.length) writeStoredIds(CREATOR_FOLLOWS_KEY, next);
    setFollowed(next);
    setHouseFollows(readStoredIds(HOUSE_FOLLOWS_KEY));
    setSeen(readStoredIds(FOLLOWING_SEEN_KEY));
    setLessIds(readStoredIds(FEED_LESS_KEY));
  }, [mode, user?.id]);

  useEffect(() => {
    if (!user || !feedFreshOn) return;
    setReturning(consumeFreshVisit());
  }, [feedFreshOn, user]);

  useEffect(() => {
    let alive = true;
    void listFashionCollections()
      .then((rows) => {
        if (alive) setCollections(rows);
      })
      .catch(() => {
        if (alive) setCollections([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const anchor = deck.find((look) => look.id === anchorId) ?? deck[0];
  const tuned = useMemo(
    () => forYouOrder(deck, { lessIds, savedIds, savesOn: feedSavesOn, freshOn: feedFreshOn, now, freshWindow }),
    [deck, feedFreshOn, feedSavesOn, freshWindow, lessIds, now, savedIds],
  );
  const echoLane = useEchoLane(anchor, deck, tuned, { enabled: mode === "lane", limit: 1 });
  const laneLoad = useDelayedLoad(
    () => (mode === "lane" ? settleLoad(echoLane) : Promise.resolve(echoLane)),
    { cacheKey: mode === "lane" && anchor ? `echo:${anchor.id}:${trail.join("|")}` : "echo:idle" },
  );
  const plates = useMemo(() => {
    if (!anchor) return [];
    if (mode === "following") return followingLooks(deck, followed);
    if (mode === "lane") {
      return trail.reduce((list, chip) => refineLane(list, chip), echoLane);
    }
    if (mode === "creator") return creatorRun(anchor, deck);
    return tuned;
  }, [anchor, deck, echoLane, followed, mode, trail, tuned]);
  const houseCards = useMemo(
    () => (mode === "following" ? followingHouseCards(labels, collections, styles, houseFollows) : []),
    [collections, houseFollows, labels, mode, styles],
  );
  const followMix = useMemo(
    () => (mode === "following" ? mixFollowing(plates, houseCards) : []),
    [houseCards, mode, plates],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const saved = loadingCache.get<number>("feed:phone");
    if (saved?.scrollY != null && saved.scrollY > 1 && mode === "feed") {
      indexRef.current = el.clientHeight > 0 ? Math.round(saved.scrollY / el.clientHeight) : 0;
      el.scrollTop = saved.scrollY;
      return;
    }
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

  function save(look: Look) {
    if (authEnabled && !isPending && !user) {
      setPendingSaveId(look.id);
      setSheetOpen(true);
      return;
    }
    const saved = toggleSaved(look.id);
    toast.success(saved ? "Saved" : "Removed from wardrobe");
  }

  async function share(look: Look) {
    const url = `${window.location.origin}/looks/${look.id}`;
    const result = await shareOrCopy({ title: look.title || "Look", url, kind: "look" });
    if (result === "copied") toast.success("Link copied");
  }

  function openLane(look: Look) {
    if (deck.every((item) => item.id === look.id)) return;
    recordEchoActivation(look);
    setTrail([]);
    setAnchorId(look.id);
    setMode("lane");
  }

  function openCreator(look: Look) {
    setAnchorId(look.id);
    setMode("creator");
  }

  function backToFeed() {
    setTrail([]);
    setMode("feed");
    setAnchorId(null);
  }

  function openFollowing() {
    const ids = followingLooks(deck, followed).map((look) => look.id);
    const next = [...new Set([...readStoredIds(FOLLOWING_SEEN_KEY), ...ids])];
    writeStoredIds(FOLLOWING_SEEN_KEY, next);
    setSeen(next);
    setMode("following");
    setAnchorId(null);
  }

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const raw = el.clientHeight > 0 ? el.scrollTop / el.clientHeight : 0;
    const nearest = Math.round(raw);
    if (Math.abs(raw - nearest) > 0.08) return;
    const count = mode === "following" ? followMix.length : plates.length;
    const next = echoSnapIndex(el.scrollTop, el.clientHeight, count);
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

  const paperBar = mode === "lane" || mode === "creator";
  const drop = housesOn && feedDropOn && mode === "feed" ? pickWeeklyDrop(labels, collections, styles) : null;
  const feedStyle = housesOn && feedStyleOn && mode === "feed" ? pickFeedStyle(styles, labels) : null;
  const styleAt = feedStyle ? styleCardAfterDrop(plates.length, drop ? 3 : null) : null;
  const unseen = followingLooks(deck, followed).filter((look) => !seen.includes(look.id)).length;
  const dividerCopy = freshDivider({
    signedIn: Boolean(user),
    returning,
    freshCount: tuned.filter((look) => look.createdAt >= now - (freshWindow === "24h" ? 86400000 : freshWindow === "7d" ? 7 * 86400000 : 3 * 86400000)).length,
  });
  const dividerAt = dividerCopy && feedFreshOn ? freshDividerAt(plates, now, freshWindow) : null;
  const because = feedSavesOn && user && savedIds.length > 0 ? becauseYouSaved(tuned, savedIds) : [];
  const run = feedRunsOn ? parseMoodRun(runTitle, runIds) : null;
  const runLooks = run ? run.lookIds.map((id) => deck.find((look) => look.id === id)).filter((look): look is Look => Boolean(look)) : [];
  const becauseAt = becauseEvery - 1;
  const runAt = runEvery - 1;
  const followSkeleton = mode === "following" && followingLoad.phase === "skeleton";
  const followError = mode === "following" && followingLoad.phase === "error";
  const followWaiting = mode === "following" && followingLoad.phase === "waiting";
  const showFollowing = mode === "following" && (followingLoad.phase === "ready" || followWaiting);
  const laneSkeleton = mode === "lane" && laneLoad.phase === "skeleton";

  return (
    <div className={cn("echo-stage", paperBar && "echo-stage-paper")} data-mode={mode}>
      <header className={cn("echo-bar", paperBar ? "echo-bar-paper" : "echo-bar-photo")}>
        {paperBar ? (
          <div className="echo-brand">
            <button type="button" className="echo-back" onClick={backToFeed} aria-label="Back to For You">
              <ChevronLeft className="size-5" strokeWidth={1.75} />
            </button>
            <span className="echo-wordmark">Looktag</span>
          </div>
        ) : (
          <span className="echo-wordmark">Looktag</span>
        )}
        {feedFollowOn && (mode === "feed" || mode === "following") ? (
          <FeedTabs
            variant="echo"
            mode={mode === "following" ? "following" : "feed"}
            unseen={unseen}
            onFeed={() => setMode("feed")}
            onFollowing={openFollowing}
          />
        ) : null}
      </header>

      {mode === "lane" ? <p className="echo-lane-label">More like this</p> : null}
      {mode === "lane" && feedTrailOn ? (
        <div className="echo-chips echo-lane">
          {trail.length > 0 ? (
            <>
              <ol className="echo-crumbs">
                {trail.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
              <button type="button" className="echo-chip-back" aria-label="Back one step" onClick={() => setTrail((current) => current.slice(0, -1))}>
                <ChevronLeft className="size-5" />
              </button>
            </>
          ) : null}
          {ECHO_TRAIL_CHIPS.map((chip) => (
            <button type="button" key={chip} className="echo-chip" onClick={() => setTrail((current) => pushTrail(current, chip))}>
              {chip}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "creator" ? <p className="echo-pill echo-pill-ink">From {anchor.creator || "this creator"}</p> : null}

      <div
        ref={scrollerRef}
        className={cn("echo-snap", mode === "lane" && "echo-lane", followWaiting && "is-loading-old")}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {followSkeleton ? (
          <div className="echo-skeleton-pad">
            <SkeletonGrid count={8} captions />
          </div>
        ) : followError ? (
          <FeedLoadError
            onRetry={() => {
              loadingCache.delete(`feed:following:${followRetry}`);
              setFollowRetry((n) => n + 1);
            }}
          />
        ) : mode === "following" ? null : mode === "lane" && laneSkeleton ? (
          <div className="echo-skeleton-pad">
            <SkeletonGrid count={8} captions />
          </div>
        ) : plates.flatMap((look, plateIndex) => {
          const nodes = [];
          if (drop && plateIndex === 2 && mode === "feed") {
            nodes.push(
              <article className="echo-plate echo-drop" key="weekly-drop">
                <Link
                  to="/houses/$labelId/$collectionId"
                  params={{ labelId: drop.houseId, collectionId: drop.lineSlug }}
                  className="echo-photo"
                  aria-label={`${drop.lineName}, This week's drop`}
                >
                  <ImgSlot src={drop.imageSrc} alt="" still slotClassName="img-slot-fill" />
                </Link>
                <div className="echo-meta">
                  <p className="echo-kicker">This week's drop</p>
                  <h2 className="echo-drop-title">{drop.lineName}</h2>
                  <span className="echo-rule" />
                  <p className="echo-pieces">{drop.houseName}</p>
                  <Link
                    to="/houses/$labelId/$collectionId"
                    params={{ labelId: drop.houseId, collectionId: drop.lineSlug }}
                    className="style-pin-view"
                  >
                    View Line
                  </Link>
                </div>
              </article>,
            );
          }
          if (styleAt === plateIndex && feedStyle && mode === "feed") {
            const slug = feedStyle.style.collectionSlug || feedStyle.style.collectionId;
            nodes.push(
              <article className="echo-plate echo-style" key={feedStyle.style.id}>
                <StyleFrame style={feedStyle.style} houseName={feedStyle.houseName} lineSlug={slug} />
              </article>,
            );
          }
          if (mode === "feed" && because.length > 0 && plateIndex === becauseAt) {
            nodes.push(<BecausePlate key="because-saved" looks={because} />);
          }
          if (mode === "feed" && runLooks.length >= 5 && plateIndex === runAt) {
            nodes.push(<RunPlate key="mood-run" title={run?.title || "Run"} looks={runLooks} />);
          }
          const kicker = echoKicker(look);
          nodes.push(
            <article className={cn("echo-plate", mode === "lane" && "echo-tile")} key={look.id}>
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
                <ImgSlot src={look.imageSrc} alt="" slotClassName="img-slot-fill" still={mode === "feed" && plateIndex === 0} />
              </Link>
              {mode === "feed" && beatLabel(look) ? <p className="echo-beat">{beatLabel(look)}</p> : null}
              <div className="echo-meta">
                {kicker ? (
                  <span className="echo-kicker-row">
                    <button type="button" className="echo-kicker" onClick={() => openCreator(look)}>
                      {kicker}
                    </button>
                    {feedFollowOn && mode === "feed" && plateIndex === 0 && look.userId ? (
                      <FollowButton creatorId={look.userId} name={kicker} />
                    ) : null}
                  </span>
                ) : null}
                <h2 className="echo-title">{look.title || "Untitled look"}</h2>
                <span className="echo-rule" />
                {dividerAt === plateIndex && mode === "feed" ? <p className="echo-fresh">New since your last visit</p> : null}
                {pieceLine(look) ? <p className="echo-pieces">{pieceLine(look)}</p> : null}
                {feedSavesOn && mode === "feed" && plateIndex > 0 ? <ShowLess lookId={look.id} onChange={setLessIds} /> : null}
              </div>
              <div className="echo-actions">
                <button
                  type="button"
                  className={cn("echo-action echo-save", savedIds.includes(look.id) && "echo-save-on")}
                  aria-label={savedIds.includes(look.id) ? "Saved" : "Save"}
                  aria-pressed={savedIds.includes(look.id)}
                  onClick={() => save(look)}
                >
                  <HangtagIcon className="size-5" filled={savedIds.includes(look.id)} />
                </button>
                {mode === "feed" ? (
                  <button type="button" className="echo-action echo-act-echo" aria-label="Echo" onClick={() => openLane(look)}>
                    <Layers className="size-5" aria-hidden />
                  </button>
                ) : null}
                <button type="button" className="echo-action echo-act-share" aria-label="Share" onClick={() => void share(look)}>
                  <Share2 className="size-5" aria-hidden />
                </button>
              </div>
            </article>,
          );
          return nodes;
        })}
        {showFollowing
          ? followMix.map((item) =>
              item.kind === "house" ? (
                <FollowingHousePlate key={`${item.card.kind}-${item.card.id}`} card={item.card} />
              ) : (
                <article className="echo-plate echo-tile" key={item.look.id}>
                  <Link to="/looks/$lookId" params={{ lookId: item.look.id }} className="echo-photo" aria-label={item.look.title || "Look"}>
                    <ImgSlot src={item.look.imageSrc} alt="" slotClassName="img-slot-fill" />
                  </Link>
                  <div className="echo-meta">
                    {echoKicker(item.look) ? <p className="echo-kicker">{echoKicker(item.look)}</p> : null}
                    <h2 className="echo-title">{item.look.title || "Untitled look"}</h2>
                    <span className="echo-rule" />
                    {pieceLine(item.look) ? <p className="echo-pieces">{pieceLine(item.look)}</p> : null}
                  </div>
                </article>
              ),
            )
          : null}
        {showFollowing && followingLoad.phase === "ready" ? (
          <div className="echo-end">
            <p>That's everything from who you follow.</p>
            <button type="button" className="house-ghost" onClick={() => setMode("feed")}>
              Back to For you
            </button>
          </div>
        ) : null}
        {mode === "creator" ? (
          <button type="button" className="echo-return" onClick={backToFeed}>
            Returning to For You
          </button>
        ) : null}
      </div>

      <AccountSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setPendingSaveId(null);
        }}
        intent="save"
        pendingSave={pendingSaveId ?? undefined}
        title="Sign in to save"
        description=""
        primary="Continue with email"
        secondary="Cancel"
      />
    </div>
  );
}
