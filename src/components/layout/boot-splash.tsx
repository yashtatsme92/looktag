import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  BOOT_CROSSFADE_MS,
  BOOT_FEED_READY_EVENT,
  BOOT_MAX_WAIT_MS,
  BOOT_MIN_ANIMATION_MS,
  BOOT_REPLAY_EVENT,
  BOOT_ROUTE_READY_EVENT,
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
    let routeReadySeen = false;
    function routeReady() {
      if (routeReadySeen) return;
      routeReadySeen = true;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const remaining = reducedMotion ? 0 : Math.max(0, BOOT_MIN_ANIMATION_MS - elapsed());
      animationTimer = window.setTimeout(() => setPhase("out"), remaining);
    }
    if (
      document.documentElement.dataset.feedReady === "true" ||
      document.documentElement.dataset.routeReady === "true"
    ) routeReady();
    window.addEventListener(BOOT_FEED_READY_EVENT, routeReady);
    window.addEventListener(BOOT_ROUTE_READY_EVENT, routeReady);
    if (previewReplay.current) routeReady();
    return () => {
      window.clearTimeout(maxTimer);
      if (animationTimer !== undefined) window.clearTimeout(animationTimer);
      window.removeEventListener(BOOT_FEED_READY_EVENT, routeReady);
      window.removeEventListener(BOOT_ROUTE_READY_EVENT, routeReady);
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
      <div className="boot-splash-side">
        {wordmark}
        <p className="boot-splash-count">4 pieces tagged</p>
      </div>
      <BootArtwork variant={variant} />
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
        <svg viewBox="0 0 64 40" width="72" height="45" fill="none">
          <path
            className="boot-tag-outline"
            pathLength="100"
            d="M18 3H59a2 2 0 0 1 2 2v30a2 2 0 0 1-2 2H18L3 20Z"
          />
          <circle className="boot-tag-eyelet" pathLength="100" cx="17" cy="20" r="3.2" />
        </svg>
      </div>
    );
  }

  const elegant = variant === "soft-power";
  const pieces = elegant
    ? [
        { n: 1, left: 55, top: 16.67, label: "Satin blouse", delay: 300, direction: "right" },
        { n: 2, left: 48.75, top: 63.33, label: "Wide-leg trousers", delay: 450, direction: "right" },
        { n: 3, left: 52.08, top: 83, label: "Clutch", delay: 600, direction: "right" },
        { n: 4, left: 60.83, top: 92.33, label: "Kitten heels", delay: 750, direction: "right" },
      ]
    : [
        { n: 1, left: 55.8, top: 20.2, label: "Linen shirt", delay: 300, direction: "right" },
        { n: 2, left: 85.5, top: 49.6, label: "Raffia tote", delay: 450, direction: "left" },
        { n: 3, left: 33.7, top: 62, label: "Pleated shorts", delay: 600, direction: "left" },
        { n: 4, left: 57, top: 90.7, label: "Espadrilles", delay: 750, direction: "right" },
      ];
  return (
    <div
      className={cn("boot-splash-art boot-art-pieces", preview && "boot-art-preview")}
      data-design={variant}
      aria-hidden
    >
      <svg viewBox={elegant ? "-14 0 240 300" : "24 12 172 258"} fill="none">
        {elegant ? (
          <>
            <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
              <path
                fill="#fff"
                d="M54 10 Q74 16 94 10 L120 22 L132 92 L120 94 L110 40 Q114 70 110 100 L38 100 Q34 70 38 40 L28 94 L16 92 L28 22 Z"
              />
              <path
                fill="none"
                d="M66 13 Q74 24 82 13M74 24 Q62 28 64 38 Q72 36 74 24 Q76 36 84 38 Q86 28 74 24M72 26 L66 54M76 26 L81 52M17 86 L29 88M131 86 L119 88"
              />
            </g>
            <path
              stroke="#8A8A8A"
              strokeWidth=".7"
              fill="none"
              strokeLinecap="round"
              d="M44 46 Q50 72 44 98M104 46 Q98 72 104 98M58 60 Q60 80 56 98M90 60 Q88 80 92 98M24 60 Q26 72 22 84M124 60 Q122 72 126 84"
            />
            <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
              <path fill="#D4D4D4" d="M48 106 H100 L112 232 H78 L74 136 L70 232 H36 Z" />
            </g>
            <path
              stroke="#8A8A8A"
              strokeWidth=".7"
              fill="none"
              strokeLinecap="round"
              d="M48 114H100M60 116 L54 230M88 116 L94 230M66 114V126M82 114V126M74 106V118"
            />
            <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
              <path fill="#E2E2E2" d="M44 240 H104 V258 H44 Z" />
              <path fill="none" d="M44 240 L74 252 L104 240" />
            </g>
            <rect x="71" y="250" width="6" height="4" rx="1" fill="#111" />
            <g transform="translate(-4,29) scale(.9,.9)">
              <path
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="#fff"
                d="M18 288 Q30 276 52 272 Q56 278 60 284 Q40 290 18 288Z"
              />
              <path
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
                d="M60 284 Q68 278 75 276"
              />
              <path
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="#111"
                d="M72 277 L75 277 L73 293 L71 293 Z"
              />
              <path
                stroke="#8A8A8A"
                strokeWidth=".7"
                fill="none"
                strokeLinecap="round"
                d="M24 286 Q40 282 56 280"
              />
              <g transform="translate(60 0)">
                <path
                  stroke="#111"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="#fff"
                  d="M18 288 Q30 276 52 272 Q56 278 60 284 Q40 290 18 288Z"
                />
                <path
                  stroke="#111"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                  d="M60 284 Q68 278 75 276"
                />
                <path
                  stroke="#111"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="#111"
                  d="M72 277 L75 277 L73 293 L71 293 Z"
                />
                <path
                  stroke="#8A8A8A"
                  strokeWidth=".7"
                  fill="none"
                  strokeLinecap="round"
                  d="M24 286 Q40 282 56 280"
                />
              </g>
            </g>
          </>
        ) : (
          <>
            <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
              <path d="M158 118 Q171 92 184 118" fill="none" strokeWidth="1.4" />
              <path d="M150 118 H192 L188 166 H154 Z" fill="#E2E2E2" />
            </g>
            <path
              d="M152 128H190M152 138H190M153 148H189M154 158H188M162 118V166M171 118V166M180 118V166"
              stroke="#8A8A8A"
              strokeWidth=".7"
              fill="none"
              strokeLinecap="round"
            />
            <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
              <path d="M62 132 H138 L146 202 H106 L100 154 L94 202 H54 Z" fill="#D4D4D4" />
            </g>
            <path
              d="M60 142H140M80 142L77 176M120 142L123 176M100 142V152"
              stroke="#8A8A8A"
              strokeWidth=".7"
              fill="none"
              strokeLinecap="round"
            />
            <g stroke="#111" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
              <path
                d="M70 30 L88 22 Q100 30 112 22 L130 30 L162 52 L170 92 L152 96 L146 72 L144 124 L56 124 L54 72 L48 96 L30 92 L38 52 Z"
                fill="#fff"
              />
              <path
                d="M88 22 L100 44 L112 22M100 44V124M32 84 L50 88M168 84 L150 88"
                fill="none"
              />
            </g>
            <path
              d="M60 60 Q66 90 62 118M140 60 Q134 90 138 118M44 60 L50 80M156 60 L150 80"
              stroke="#8A8A8A"
              strokeWidth=".7"
              fill="none"
              strokeLinecap="round"
            />
            <g fill="#111">
              <circle cx="103" cy="58" r="1" />
              <circle cx="103" cy="78" r="1" />
              <circle cx="103" cy="98" r="1" />
            </g>
            <g transform="translate(-8 0)">
              <path
                d="M56 252 H106 Q108 258 104 260 H58 Q54 258 56 252Z"
                fill="#E2E2E2"
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d="M60 254.5H103M60 257.5H103"
                stroke="#8A8A8A"
                strokeWidth=".7"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M58 252 Q60 240 74 238 Q90 236 104 252 Z"
                fill="#fff"
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d="M68 241 Q78 231 92 242"
                fill="none"
                stroke="#8A8A8A"
                strokeWidth=".7"
                strokeLinecap="round"
              />
            </g>
            <g transform="translate(44 0)">
              <path
                d="M56 252 H106 Q108 258 104 260 H58 Q54 258 56 252Z"
                fill="#E2E2E2"
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d="M60 254.5H103M60 257.5H103"
                stroke="#8A8A8A"
                strokeWidth=".7"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M58 252 Q60 240 74 238 Q90 236 104 252 Z"
                fill="#fff"
                stroke="#111"
                strokeWidth="1.1"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d="M68 241 Q78 231 92 242"
                fill="none"
                stroke="#8A8A8A"
                strokeWidth=".7"
                strokeLinecap="round"
              />
            </g>
          </>
        )}
      </svg>
      {pieces.map((piece) => (
        <span
          className="boot-splash-pin"
          data-pin={piece.n}
          key={piece.n}
          style={{ left: `${piece.left}%`, top: `${piece.top}%`, animationDelay: `${piece.delay}ms` }}
        >
          {piece.n}
        </span>
      ))}
      {pieces.map((piece) => (
        <span
          className={cn("boot-piece-label", piece.direction === "left" && "boot-piece-label-left")}
          data-label={piece.n}
          key={`label-${piece.n}`}
          style={{
            left: `${piece.left}%`,
            top: `${piece.top}%`,
            animationDelay: `${piece.delay + 80}ms`,
          }}
        >
          {piece.label}
        </span>
      ))}
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
