import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  BOOT_CROSSFADE_MS,
  BOOT_FEED_READY_EVENT,
  BOOT_MAX_WAIT_MS,
  BOOT_MIN_ANIMATION_MS,
  BOOT_REPLAY_EVENT,
  BOOT_STATIC_FINISH_EVENT,
  hasBootPlayed,
  isSharePath,
  markBootPlayed,
} from "@/lib/pwa/boot";
import { bootNativeShell, restyleNativeChrome } from "@/lib/native/shell";
import { parseSplashId, resolveBootSplash, readStoredSplash, type SplashId } from "@/lib/pwa/splash";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type Phase = "in" | "out" | "done";

let bootClock = 0;

export function BootSplash({
  children,
  initialSplash,
}: {
  children: ReactNode;
  initialSplash?: SplashId;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const skipLaunch = isSharePath(pathname);
  const splashId = useSettingsStore((s) => parseSplashId(s.splashId));
  const hydrated = useSettingsStore((s) => s.hydrated);
  const [variant, setVariant] = useState<SplashId>(() => parseSplashId(initialSplash));
  const [phase, setPhase] = useState<Phase>(() => (skipLaunch ? "done" : "in"));
  const [clientPaint, setClientPaint] = useState(false);
  const previewReplay = useRef(false);

  useLayoutEffect(() => {
    document.documentElement.classList.add("boot-react");
    setClientPaint(true);
    setVariant(
      resolveBootSplash({
        hydrated,
        stored: readStoredSplash(),
        fromStore: splashId,
      }),
    );
  }, [hydrated, splashId]);

  function finish() {
    setPhase("out");
  }

  useLayoutEffect(() => {
    if (skipLaunch || hasBootPlayed() || document.documentElement.classList.contains("boot-done")) {
      markBootPlayed();
      setPhase("done");
      return;
    }
    void bootNativeShell();
  }, [skipLaunch]);

  useLayoutEffect(() => {
    function replay() {
      bootClock = Date.now();
      previewReplay.current = true;
      document.documentElement.classList.remove("boot-done");
      void bootNativeShell();
      setVariant(readStoredSplash());
      setPhase("in");
    }
    const finishBoot = () => setPhase("out");
    window.addEventListener(BOOT_REPLAY_EVENT, replay);
    window.addEventListener(BOOT_STATIC_FINISH_EVENT, finishBoot);
    return () => {
      window.removeEventListener(BOOT_REPLAY_EVENT, replay);
      window.removeEventListener(BOOT_STATIC_FINISH_EVENT, finishBoot);
    };
  }, []);

  useEffect(() => {
    if (phase !== "in") return;
    if (!bootClock) bootClock = Date.now();
    const elapsed = () => Date.now() - bootClock;
    const maxTimer = window.setTimeout(() => setPhase("out"), Math.max(0, BOOT_MAX_WAIT_MS - elapsed()));
    let animationTimer: number | undefined;
    let feedReadySeen = false;
    function feedReady() {
      if (feedReadySeen) return;
      feedReadySeen = true;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const remaining = reducedMotion ? 0 : Math.max(0, BOOT_MIN_ANIMATION_MS - elapsed());
      animationTimer = window.setTimeout(() => setPhase("out"), remaining);
    }
    if (document.documentElement.dataset.feedReady === "true") feedReady();
    window.addEventListener(BOOT_FEED_READY_EVENT, feedReady);
    if (previewReplay.current) feedReady();
    return () => {
      window.clearTimeout(maxTimer);
      if (animationTimer !== undefined) window.clearTimeout(animationTimer);
      window.removeEventListener(BOOT_FEED_READY_EVENT, feedReady);
    };
  }, [phase, pathname]);

  useEffect(() => {
    if (phase !== "out") return;
    const timer = window.setTimeout(() => {
      markBootPlayed();
      setPhase("done");
    }, BOOT_CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;
    void restyleNativeChrome();
  }, [phase]);

  return (
    <>
      {phase !== "done" && clientPaint ? (
        <div
          className={cn("boot-splash", phase === "out" && "boot-splash-out")}
          data-boot={phase}
          data-splash={variant}
          suppressHydrationWarning
          role="button"
          tabIndex={0}
          aria-label="Looktag is opening. Tap to enter."
          onClick={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              finish();
            }
          }}
        >
          <SplashContent variant={variant} />
        </div>
      ) : null}
      {children}
    </>
  );
}

function SplashContent({ variant }: { variant: SplashId }) {
  const wordmark = (
    <div className={cn("boot-splash-mark", `boot-mark-${variant}`)}>
      <p className="boot-splash-word">Looktag</p>
      {variant === "wordmark" ? <span className="boot-wordmark-line" /> : null}
    </div>
  );
  if (variant === "wordmark") return wordmark;
  if (variant === "tag-draw") {
    return (
      <>
        <BootArtwork variant={variant} />
        {wordmark}
        <p className="boot-splash-kicker">SHOP THE LOOK</p>
      </>
    );
  }
  return (
    <>
      {wordmark}
      <BootArtwork variant={variant} />
      <p className="boot-splash-count">4 pieces tagged</p>
    </>
  );
}

export function BootArtwork({ variant, preview }: { variant: SplashId; preview?: boolean }) {
  if (variant === "wordmark") {
    return <div className={cn("boot-splash-art boot-art-wordmark", preview && "boot-art-preview")} aria-hidden />;
  }

  if (variant === "tag-draw") {
    return (
      <div className={cn("boot-splash-art boot-art-tag", preview && "boot-art-preview")} aria-hidden>
        <svg viewBox="0 0 160 110" fill="none">
          <path className="boot-tag-outline" pathLength="1" d="M31 18 H99 L132 50 V96 H31 Z" />
          <circle className="boot-tag-hole" cx="104" cy="42" r="7" />
          <circle className="boot-tag-eyelet" cx="104" cy="42" r="2" />
          <path className="boot-tag-string" d="M108 38 C135 17 141 41 125 51" />
        </svg>
      </div>
    );
  }

  const elegant = variant === "soft-power";
  return (
    <div className={cn("boot-splash-art boot-art-pieces", preview && "boot-art-preview")} aria-hidden>
      <svg viewBox="0 0 400 360" fill="none">
        {elegant ? (
          <>
            <path className="boot-piece-fill" d="M51 40 L79 27 L100 43 L121 27 L149 40 L169 66 L151 77 L137 60 V106 H63 V60 L49 77 L31 66 Z" />
            <path className="boot-piece-fill boot-piece-trousers" d="M247 30 H353 L347 59 L337 107 H307 L300 60 L293 107 H263 L253 59 Z" />
            <path className="boot-piece-fill" d="M46 205 Q46 194 59 194 H141 Q154 194 154 205 V258 H46 Z" />
            <path className="boot-piece-fill" d="M240 222 Q250 212 264 211 L280 196 Q287 191 291 199 L289 211 Q307 203 323 208 Q331 211 326 218 L309 232 H252 Z M240 258 Q250 248 264 247 L280 232 Q287 227 291 235 L289 247 Q307 239 323 244 Q331 247 326 254 L309 268 H252 Z" />
            <g className="boot-piece-lines">
              <path pathLength="1" d="M100 43 V105 M65 91 H135 M79 29 L87 53 L100 43 L113 53 L121 29 M91 39 C78 29 82 20 94 27 L100 34 L106 27 C118 20 122 29 109 39 L100 46 Z" />
              <path pathLength="1" d="M250 41 H350 M280 33 L281 105 M320 33 L319 105 M300 32 V59" />
              <path pathLength="1" d="M58 194 V207 H142 V194 M64 222 H136 M64 237 H136" />
              <path pathLength="1" d="M280 199 L294 207 M252 222 H326 M280 235 L294 243 M252 258 H326" />
            </g>
          </>
        ) : (
          <>
            <path className="boot-piece-fill boot-piece-shirt" d="M51 40 L79 27 L94 32 L100 43 L106 32 L121 27 L149 40 L169 66 L151 77 L137 60 V106 H63 V60 L49 77 L31 66 Z" />
            <path className="boot-piece-fill boot-piece-tote" d="M252 48 H348 V107 H252 Z" />
            <path className="boot-piece-fill boot-piece-shorts" d="M48 194 H152 L147 220 L135 267 L105 260 L100 224 L95 260 L65 267 L53 220 Z" />
            <path className="boot-piece-fill" d="M235 222 Q248 206 270 206 H302 Q315 206 327 218 L354 228 Q362 232 357 240 H251 Q238 238 235 222 Z M235 258 Q248 242 270 242 H302 Q315 242 327 254 L354 264 Q362 268 357 276 H251 Q238 274 235 258 Z" />
            <g className="boot-piece-lines">
              <path pathLength="1" d="M100 43 V105 M65 91 H135 M79 29 L87 53 M121 29 L113 53" />
              <path pathLength="1" d="M268 48 C268 20 294 20 294 48 M306 48 C306 20 332 20 332 48 M260 62 H340 M260 76 H340 M260 90 H340 M274 52 V104 M294 52 V104 M314 52 V104 M334 52 V104" />
              <path pathLength="1" d="M51 207 H149 M100 195 V222 M68 208 L75 257 M84 208 L87 257 M116 208 L113 257 M132 208 L125 257" />
              <path pathLength="1" d="M243 223 H351 M264 210 L276 227 M285 210 L296 227 M306 212 L317 229 M243 259 H351 M264 246 L276 263 M285 246 L296 263 M306 248 L317 265" />
            </g>
          </>
        )}
        {[
          { n: 1, cx: 159, cy: 42, label: elegant ? "Satin blouse" : "Linen shirt", x: 18, y: 121 },
          { n: 2, cx: 359, cy: 43, label: elegant ? "Wide-leg trousers" : "Raffia tote", x: 218, y: 121 },
          { n: 3, cx: 159, cy: 201, label: elegant ? "Clutch" : "Pleated shorts", x: 18, y: 281 },
          { n: 4, cx: 359, cy: 202, label: elegant ? "Kitten heels" : "Espadrilles", x: 218, y: 281 },
        ].map((piece) => (
          <g className="boot-splash-pin" data-pin={piece.n} key={piece.n}>
            <circle className="boot-piece-number" cx={piece.cx} cy={piece.cy} r="14" />
            <text className="boot-piece-number-text" x={piece.cx} y={piece.cy + 0.5}>
              {piece.n}
            </text>
            <rect className="boot-piece-label" x={piece.x} y={piece.y} width="164" height="22" rx="11" />
            <text className="boot-piece-label-text" x={piece.x + 82} y={piece.y + 14.5}>
              {piece.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** First-paint overlay, rendered by the server before React hydrates. */
export function StaticBootSplash({ variant = "tag-draw" }: { variant?: SplashId }) {
  return (
    <div id="boot-splash-html" className="boot-splash" data-splash={variant} aria-hidden="true" suppressHydrationWarning>
      {(["wordmark", "tag-draw", "pieces", "soft-power"] as const).map((id) => (
        <div className="boot-splash-static-frame" data-splash={id} key={id}>
          <SplashContent variant={id} />
        </div>
      ))}
    </div>
  );
}
