import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  BOOT_HOLD_MS,
  BOOT_REPLAY_EVENT,
  hasBootPlayed,
  isSharePath,
  markBootPlayed,
} from "@/lib/pwa/boot";
import { bootNativeShell, restyleNativeChrome } from "@/lib/native/shell";
import { parseSplashId, readStoredSplash, type SplashId } from "@/lib/pwa/splash";
import { useSettingsStore } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

type Phase = "in" | "out" | "done";

const COAT =
  "M100 70 C86 64 74 66 66 76 C52 88 44 110 42 134 L38 170 C36 176 46 178 54 170 L62 142 L60 250 C60 258 70 264 84 264 L116 264 C130 264 140 258 140 250 L138 142 L146 170 C154 178 164 176 162 170 L158 134 C156 110 148 88 134 76 C126 66 114 64 100 70 Z";

let bootClock = 0;

export function BootSplash({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const skipLaunch = isSharePath(pathname);
  const splashId = useSettingsStore((s) => parseSplashId(s.splashId));
  const [variant, setVariant] = useState<SplashId>(() => readStoredSplash());
  const [phase, setPhase] = useState<Phase>(() => (skipLaunch ? "done" : "in"));

  useEffect(() => {
    setVariant(splashId);
  }, [splashId]);

  function finish() {
    markBootPlayed();
    setPhase("done");
  }

  useLayoutEffect(() => {
    if (skipLaunch || hasBootPlayed() || document.documentElement.classList.contains("boot-done")) {
      markBootPlayed();
      setPhase("done");
      return;
    }
    void bootNativeShell();
  }, [skipLaunch]);

  useEffect(() => {
    function replay() {
      bootClock = Date.now();
      document.documentElement.classList.remove("boot-done");
      void bootNativeShell();
      setVariant(readStoredSplash());
      setPhase("in");
    }
    window.addEventListener(BOOT_REPLAY_EVENT, replay);
    return () => window.removeEventListener(BOOT_REPLAY_EVENT, replay);
  }, []);

  useEffect(() => {
    if (phase !== "in") return;
    if (!bootClock) bootClock = Date.now();
    const left = Math.max(80, BOOT_HOLD_MS - (Date.now() - bootClock));
    const timer = window.setTimeout(() => setPhase("out"), left);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const timer = window.setTimeout(() => finish(), 420);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;
    void restyleNativeChrome();
  }, [phase]);

  return (
    <>
      {phase !== "done" ? (
        <div
          className={cn("boot-splash", phase === "out" && "boot-splash-out")}
          data-boot={phase}
          data-splash={variant}
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
          {variant !== "minimal" ? <div className="boot-splash-grain" aria-hidden /> : null}
          {variant === "numbered" || variant === "atelier" ? (
            <p className="boot-splash-index">Look 01</p>
          ) : null}
          <BootArtwork variant={variant} />
          <div className="boot-splash-mark">
            <p className="boot-splash-word">Looktag</p>
            {variant !== "minimal" ? <p className="boot-splash-kicker">Shoppable looks</p> : null}
            {variant !== "minimal" && variant !== "quiet" ? (
              <p className="boot-splash-line">Tap to enter</p>
            ) : null}
          </div>
          {variant !== "minimal" ? (
            <div className="boot-splash-bar" aria-hidden>
              <span />
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </>
  );
}

export function BootArtwork({ variant, preview }: { variant: SplashId; preview?: boolean }) {
  if (variant === "minimal") {
    return <div className="boot-splash-art boot-art-empty" aria-hidden />;
  }
  if (variant === "quiet") {
    return (
      <div className={cn("boot-splash-art", preview && "boot-art-preview")} aria-hidden>
        <span className="boot-quiet-rule" />
      </div>
    );
  }

  const pins =
    variant === "atelier"
      ? [
          { n: 1, top: "28%", left: "58%" },
          { n: 2, top: "46%", left: "38%" },
          { n: 3, top: "62%", left: "55%" },
          { n: 4, top: "78%", left: "44%" },
        ]
      : variant === "numbered"
        ? [
            { n: 1, top: "32%", left: "57%" },
            { n: 2, top: "52%", left: "40%" },
            { n: 3, top: "72%", left: "54%" },
          ]
        : [{ n: 1, top: "36%", left: "57%" }];

  return (
    <div className={cn("boot-splash-art", preview && "boot-art-preview")} aria-hidden>
      <svg className="boot-splash-svg" viewBox="0 0 200 360" fill="none">
        <rect className="boot-art-plate" x="36" y="18" width="128" height="324" />
        {variant === "atelier" ? (
          <>
            <line className="boot-art-guide" x1="100" y1="28" x2="100" y2="330" pathLength="1" />
            <line className="boot-art-guide boot-art-g2" x1="48" y1="78" x2="152" y2="78" pathLength="1" />
            <line className="boot-art-guide boot-art-g2" x1="52" y1="262" x2="148" y2="262" pathLength="1" />
            <line className="boot-art-guide" x1="48" y1="168" x2="152" y2="168" pathLength="1" />
          </>
        ) : variant === "numbered" ? (
          <>
            <line className="boot-art-guide" x1="100" y1="28" x2="100" y2="330" pathLength="1" />
            <line className="boot-art-guide boot-art-g2" x1="52" y1="262" x2="148" y2="262" pathLength="1" />
          </>
        ) : (
          <>
            <line className="boot-art-guide" x1="100" y1="28" x2="100" y2="330" pathLength="1" />
            <line className="boot-art-guide boot-art-g2" x1="48" y1="78" x2="152" y2="78" pathLength="1" />
            <line className="boot-art-guide boot-art-g2" x1="52" y1="262" x2="148" y2="262" pathLength="1" />
          </>
        )}
        <ellipse className="boot-art-stroke boot-art-d1" cx="100" cy="42" rx="9.5" ry="13" pathLength="1" />
        <path className="boot-art-stroke boot-art-d2" pathLength="1" d={COAT.replace(" Z", "")} />
        <path
          className="boot-art-stroke boot-art-d3"
          pathLength="1"
          d="M88 76 L100 132 L112 76 M100 132 L100 264 M76 174 L90 174 M110 174 L124 174"
        />
        <path
          className="boot-art-stroke boot-art-d4"
          pathLength="1"
          d="M86 264 L84 338 M78 338 L90 338 M114 264 L116 338 M110 338 L122 338 M96 264 L95 332 M104 264 L105 332"
        />
        {variant === "atelier" ? (
          <path
            className="boot-art-stroke boot-art-d3"
            pathLength="1"
            d="M72 250 C70 280 74 310 78 338 M128 250 C130 280 126 310 122 338"
          />
        ) : null}
      </svg>
      <div className="boot-art-ink">
        <svg className="boot-splash-svg" viewBox="0 0 200 360" fill="none">
          <path className="boot-art-fill" d={COAT} />
        </svg>
      </div>
      {pins.map((pin) => (
        <span key={pin.n} className="boot-splash-pin" style={{ top: pin.top, left: pin.left }}>
          {pin.n}
        </span>
      ))}
    </div>
  );
}
