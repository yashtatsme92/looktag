import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Radio } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/home/account-sheet";
import { BecauseRow, RunRow, ShowLess } from "@/components/home/feed-modules";
import { FollowButton } from "@/components/home/follow-button";
import { FollowingHouseTile } from "@/components/home/following-card";
import { HangtagIcon } from "@/components/home/hangtag-icon";
import { StyleFrame } from "@/components/labels/style-frame";
import { beatLabel, creatorRun, ECHO_FROM_KEY, echoKicker, echoLane, pieceLine } from "@/lib/home/echo";
import {
  ECHO_TRAIL_CHIPS,
  becauseYouSaved,
  freshDivider,
  freshDividerAt,
  freshFirst,
  followingHouseCards,
  followingLooks,
  mixFollowing,
  parseMoodRun,
  pickWeeklyDrop,
  pushTrail,
  refineLane,
  savesTune,
  showLessOrder,
  styleCardAfterDrop,
} from "@/lib/home/engagement";
import {
  CREATOR_FOLLOWS_KEY,
  FEED_LESS_KEY,
  FOLLOWING_SEEN_KEY,
  HOUSE_FOLLOWS_KEY,
  consumeFreshVisit,
  readStoredIds,
  writeStoredIds,
} from "@/lib/home/follows";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listFashionCollections, listFashionLabels, listFashionStyles } from "@/lib/labels/api";
import { pickFeedStyle, type FashionCollection, type FashionLabel, type FashionStyle } from "@/lib/labels/model";
import { SEED_STYLES } from "@/lib/labels/seed";
import { useSavedLooks } from "@/lib/looks/saved";
import type { Look } from "@/lib/looks/types";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type WideMode = "feed" | "lane" | "creator" | "following";

export function WideHome({ looks }: { looks: Look[] }) {
  const deck = useMemo(() => looks.filter((look) => look.imageSrc), [looks]);
  const [mode, setMode] = useState<WideMode>("feed");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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
    if (!housesOn) return;
    let alive = true;
    void listFashionStyles()
      .then((rows) => {
        if (alive) setStyles(rows);
      })
      .catch(() => undefined);
    void listFashionCollections()
      .then((rows) => {
        if (alive) setCollections(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [housesOn]);

  useEffect(() => {
    setFollowed(readStoredIds(CREATOR_FOLLOWS_KEY));
    setHouseFollows(readStoredIds(HOUSE_FOLLOWS_KEY));
    setSeen(readStoredIds(FOLLOWING_SEEN_KEY));
    setLessIds(readStoredIds(FEED_LESS_KEY));
  }, [mode]);

  useEffect(() => {
    if (!user || !feedFreshOn) return;
    setReturning(consumeFreshVisit());
  }, [feedFreshOn, user]);

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

  const tuned = useMemo(() => {
    const muted = showLessOrder(deck, lessIds);
    const tunedSaves = feedSavesOn ? savesTune(muted, savedIds) : muted;
    return feedFreshOn ? freshFirst(tunedSaves, now, freshWindow) : tunedSaves;
  }, [deck, feedFreshOn, feedSavesOn, freshWindow, lessIds, now, savedIds]);
  const anchor = (mode === "feed" ? tuned : deck).find((look) => look.id === anchorId) ?? (mode === "feed" ? tuned[0] : deck[0]);
  const plates = useMemo(() => {
    if (!anchor) return [];
    if (mode === "following") return followingLooks(deck, followed);
    if (mode === "lane") {
      const lane = echoLane(anchor, deck);
      return trail.reduce((list, chip) => refineLane(list, chip), lane);
    }
    if (mode === "creator") return creatorRun(anchor, deck).filter((look) => look.id !== anchor.id);
    return tuned.slice(1);
  }, [anchor, deck, followed, mode, trail, tuned]);

  const houseCards = useMemo(
    () => (mode === "following" ? followingHouseCards(labels, collections, styles, houseFollows) : []),
    [collections, houseFollows, labels, mode, styles],
  );
  const followMix = useMemo(
    () => (mode === "following" ? mixFollowing(plates, houseCards) : []),
    [houseCards, mode, plates],
  );

  if (!anchor) return null;

  const beat = mode === "feed" ? deck.map((look) => beatLabel(look)).find(Boolean) : null;
  const tiles = beat && mode === "feed" ? plates : plates;
  const drop = housesOn && feedDropOn && mode === "feed" ? pickWeeklyDrop(labels, collections, styles) : null;
  const feedStyle = housesOn && feedStyleOn && mode === "feed" ? pickFeedStyle(styles, labels) : null;
  const styleAt = feedStyle ? styleCardAfterDrop(deck.length, drop ? 3 : null) : null;
  const unseen = followingLooks(deck, followed).filter((look) => !seen.includes(look.id)).length;
  const dividerCopy = freshDivider({
    signedIn: Boolean(user),
    returning,
    freshCount: tuned.filter((look) => look.createdAt >= now - (freshWindow === "24h" ? 86400000 : freshWindow === "7d" ? 7 * 86400000 : 3 * 86400000)).length,
  });
  const dividerAt = dividerCopy && feedFreshOn ? freshDividerAt(tuned, now, freshWindow) : null;
  const because = feedSavesOn && user && savedIds.length > 0 ? becauseYouSaved(tuned, savedIds) : [];
  const run = feedRunsOn ? parseMoodRun(runTitle, runIds) : null;
  const runLooks = run ? run.lookIds.map((id) => deck.find((look) => look.id === id)).filter((look): look is Look => Boolean(look)) : [];

  function save(look: Look) {
    if (authEnabled && !isPending && !user) {
      setSheetOpen(true);
      return;
    }
    const saved = toggleSaved(look.id);
    toast.success(saved ? "Saved" : "Removed from wardrobe");
  }

  function echo(look: Look) {
    setTrail([]);
    setAnchorId(look.id);
    setMode("lane");
  }

  function openFollowing() {
    const ids = followingLooks(deck, followed).map((look) => look.id);
    const next = [...new Set([...readStoredIds(FOLLOWING_SEEN_KEY), ...ids])];
    writeStoredIds(FOLLOWING_SEEN_KEY, next);
    setSeen(next);
    setMode("following");
    setAnchorId(null);
  }

  const heading =
    mode === "lane" ? "More like this" : mode === "creator" ? anchor.creator || "This creator" : mode === "following" ? "Following" : "For you";

  return (
    <div className="wide-home">
      <div className="wide-wrap">
        <header className="wide-pagehd">
          <h1>{heading}</h1>
          <div className="wide-pagehd-side">
            {feedFollowOn && (mode === "feed" || mode === "following") ? (
              <nav className="wide-tabs" aria-label="Looks">
                <button
                  type="button"
                  aria-current={mode === "feed" ? "page" : undefined}
                  onClick={() => {
                    setTrail([]);
                    setMode("feed");
                    setAnchorId(null);
                  }}
                >
                  For you
                </button>
                <button
                  type="button"
                  aria-current={mode === "following" ? "page" : undefined}
                  aria-label={unseen > 0 ? `Following, ${unseen} new` : "Following"}
                  onClick={openFollowing}
                >
                  Following
                  {unseen > 0 && mode !== "following" ? <span className="echo-dot" aria-hidden /> : null}
                </button>
              </nav>
            ) : null}
            {mode === "lane" || mode === "creator" ? (
              <button
                type="button"
                className="wide-houses"
                onClick={() => {
                  setTrail([]);
                  setMode("feed");
                  setAnchorId(null);
                }}
              >
                For you
              </button>
            ) : null}
          </div>
        </header>

        {mode === "lane" && feedTrailOn ? (
          <div className="echo-chips echo-chips-ink">
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

        {mode === "following" ? null : (
          <>
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
          follow={feedFollowOn && mode === "feed" ? anchor.userId : ""}
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
          follow={feedFollowOn && mode === "feed" ? anchor.userId : ""}
        />
          </>
        )}

        <div className="wide-grid">
          {mode === "following"
            ? followMix.map((item) =>
                item.kind === "house" ? (
                  <FollowingHouseTile key={`${item.card.kind}-${item.card.id}`} card={item.card} />
                ) : (
                  <Tile
                    key={item.look.id}
                    look={item.look}
                    kicker={echoKicker(item.look)}
                    saved={savedIds.includes(item.look.id)}
                    onSave={() => save(item.look)}
                    beatAfter={false}
                    beat=""
                  />
                ),
              )
            : tiles.flatMap((look, index) => {
            const nodes = [];
            if (drop && index === 1 && mode === "feed") {
              nodes.push(
                <Link
                  key="weekly-drop"
                  to="/houses/$labelId/$collectionId"
                  params={{ labelId: drop.houseId, collectionId: drop.lineSlug }}
                  className="wide-tile wide-drop"
                >
                  <img src={drop.imageSrc} alt="" />
                  <div className="wide-tile-cap">
                    <p className="wide-kicker">This week's drop</p>
                    <h3>{drop.lineName}</h3>
                    <span className="house-ghost">View Line</span>
                  </div>
                </Link>,
              );
            }
            if (styleAt != null && styleAt - 1 === index && feedStyle && mode === "feed") {
              const slug = feedStyle.style.collectionSlug || feedStyle.style.collectionId;
              nodes.push(
                <StyleFrame
                  key={feedStyle.style.id}
                  style={feedStyle.style}
                  houseName={feedStyle.houseName}
                  lineSlug={slug}
                />,
              );
            }
            if (mode === "feed" && because.length > 0 && index === becauseEvery - 2) {
              nodes.push(<BecauseRow key="because-saved" looks={because} />);
            }
            if (mode === "feed" && runLooks.length >= 5 && index === runEvery - 2) {
              nodes.push(<RunRow key="feed-run" title={run?.title || "Run"} looks={runLooks} />);
            }
            nodes.push(
              <Tile
                key={look.id}
                look={look}
                kicker={echoKicker(look)}
                saved={savedIds.includes(look.id)}
                onSave={() => save(look)}
                beatAfter={Boolean(beat) && mode === "feed" && index === 3}
                beat={beat ?? ""}
                fresh={dividerAt === index + 1}
                less={feedSavesOn && mode === "feed"}
                onLess={setLessIds}
              />,
            );
            return nodes;
          })}
          {beat && mode === "feed" && tiles.length < 4 ? (
            <div className="wide-beat">
              <p>From the edit</p>
              <p>{beat}</p>
            </div>
          ) : null}
        </div>
        {mode === "following" ? (
          <div className="echo-end echo-end-ink">
            <p>That's everything from who you follow.</p>
            <button type="button" className="house-ghost" onClick={() => setMode("feed")}>
              Back to For you
            </button>
          </div>
        ) : null}
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
  follow,
}: {
  look: Look;
  kicker: string;
  saved: boolean;
  onSave: () => void;
  onEcho: () => void;
  onCreator: () => void;
  follow: string;
}) {
  return (
    <div className="wide-leadrow">
      <div className="wide-lead-photo">
        <Link to="/looks/$lookId" params={{ lookId: look.id }} aria-label={look.title || "Look"}>
          <img src={look.imageSrc} alt="" />
        </Link>
      </div>
      <div className="wide-lead-copy">
        <Kicker text={kicker} onCreator={onCreator} follow={follow} />
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
  follow,
}: {
  look: Look;
  kicker: string;
  saved: boolean;
  onSave: () => void;
  onEcho: () => void;
  onCreator: () => void;
  follow: string;
}) {
  return (
    <article className="wide-leadcard">
      <Link to="/looks/$lookId" params={{ lookId: look.id }} className="wide-tile-hit" aria-label={look.title || "Look"}>
        <img src={look.imageSrc} alt="" />
      </Link>
      <span className="wide-peel" aria-hidden />
      <div className="wide-tile-cap wide-leadcard-cap">
        <Kicker text={kicker} onCreator={onCreator} light follow={follow} />
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
  fresh = false,
  less = false,
  onLess,
}: {
  look: Look;
  kicker: string;
  saved: boolean;
  onSave: () => void;
  beatAfter: boolean;
  beat: string;
  fresh?: boolean;
  less?: boolean;
  onLess?: (ids: string[]) => void;
}) {
  return (
    <>
      <article className="wide-tile">
        <Link to="/looks/$lookId" params={{ lookId: look.id }} className="wide-tile-hit" aria-label={look.title || "Look"}>
          <img src={look.imageSrc} alt="" />
        </Link>
        <div className="wide-tile-cap">
          {fresh ? <p className="echo-fresh echo-fresh-ink">New since your last visit</p> : null}
          <p className="wide-kicker">{kicker}</p>
          <h3>{look.title || "Untitled look"}</h3>
          <div className="wide-tile-row">
            <span>{pieceLine(look)}</span>
            <SaveButton saved={saved} onSave={onSave} onPhoto />
          </div>
          {less ? <ShowLess lookId={look.id} onChange={onLess} /> : null}
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

function Kicker({ text, onCreator, light = false, follow = "" }: { text: string; onCreator: () => void; light?: boolean; follow?: string }) {
  const parts = text.split(" · ");
  const followBtn = follow ? <FollowButton creatorId={follow} name={text || "this creator"} tone={light ? "photo" : "paper"} /> : null;
  if (parts.length < 2) {
    return (
      <span className="echo-kicker-row">
        <p className={cn("wide-kicker", light && "wide-kicker-light")}>
          <button type="button" className="wide-kicker-link" onClick={onCreator}>
            {text}
          </button>
        </p>
        {followBtn}
      </span>
    );
  }
  return (
    <span className="echo-kicker-row">
      <p className={cn("wide-kicker", light && "wide-kicker-light")}>
        {parts[0]}
        {" · "}
        <button type="button" className="wide-kicker-link" onClick={onCreator}>
          {parts.slice(1).join(" · ")}
        </button>
      </p>
      {followBtn}
    </span>
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
