import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { toast } from "sonner";
import { bootAnalyticsFromEnv } from "@/lib/analytics/browser";
import {
  ANALYTICS_DESC,
  ANALYTICS_NAME,
  CHOICES_BODY,
  CHOICES_TITLE,
  ESSENTIAL_DESC,
  ESSENTIAL_NAME,
  ESSENTIAL_STATE,
  INDIA_ITEMS,
  PRIVACY_POLICY_LABEL,
  TOAST_ACCEPT,
  TOAST_DECLINE,
  TOAST_OPT_OUT,
  TOAST_SAVED_OFF,
  TOAST_SAVED_ON,
  bannerCopy,
} from "@/lib/consent/copy";
import { clearPosthogStorage, postConsentDecision, type ConsentBoot } from "@/lib/consent/client";
import { triggerLookShop } from "@/lib/consent/look-shop";
import {
  choiceStatus,
  consentView,
  decisionForAction,
  type ConsentAction,
  type ConsentView,
  type StoredConsent,
} from "@/lib/consent/policy";
import type { ConsentRegion } from "@/lib/consent/region";
import { noticeCountsAsSeen } from "@/lib/consent/seen";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useChromeLayout } from "@/lib/pwa/use-wide-layout";
import "./consent.css";

type ConsentContextValue = {
  view: ConsentView;
  chrome: "phone" | "tablet" | "desktop";
  show: boolean;
  look: boolean;
  analyticsOn: boolean;
  act: (action: ConsentAction) => void;
  openChoices: () => void;
  openIndia: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

const EMPTY_VIEW = consentView({
  region: "eu",
  stored: { value: null, basis: null, at: null, version: null },
  gpc: false,
});

export function useConsent(): ConsentContextValue {
  return useContext(ConsentContext) ?? {
    view: EMPTY_VIEW,
    chrome: "phone",
    show: false,
    look: false,
    analyticsOn: false,
    act: () => {},
    openChoices: () => {},
    openIndia: () => {},
  };
}

export function useConsentLookDock(): boolean {
  const ctx = useConsent();
  return ctx.show && ctx.look && ctx.chrome === "phone";
}

const LEGAL = new Set(["/privacy", "/impressum", "/terms"]);

function isLookPath(pathname: string): boolean {
  return /^\/looks\/[^/]+$/.test(pathname);
}

export function ConsentProvider({ boot, children }: { boot: ConsentBoot; children: ReactNode }) {
  const [stored, setStored] = useState<StoredConsent>(boot.stored);
  const [region] = useState<ConsentRegion>(boot.region);
  const [gpc, setGpc] = useState(boot.gpc);
  const [dismissed, setDismissed] = useState(false);
  const [seenHeld, setSeenHeld] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [indiaOpen, setIndiaOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const chrome = useChromeLayout();
  const seenOnce = useRef(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl) setGpc(true);
  }, []);

  useEffect(() => {
    const check = () => {
      const node = document.querySelector("[data-overlay-root]");
      setOverlayOpen(Boolean(node) && !node?.closest("[data-consent-dialog]"));
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "data-overlay-root"],
    });
    return () => obs.disconnect();
  }, []);

  const view = useMemo(() => {
    const next = consentView({ region, stored, gpc });
    if (
      seenHeld &&
      next.banner === null &&
      next.effectiveBasis === "notice" &&
      next.effectiveValue === "granted"
    ) {
      return { ...next, banner: "notice" as const, pendingSeen: false };
    }
    return next;
  }, [region, stored, gpc, seenHeld]);

  useEffect(() => {
    if (view.effectiveBasis === "gpc" && view.effectiveValue === "denied" && stored.value === "granted") {
      clearPosthogStorage();
    }
  }, [view.effectiveBasis, view.effectiveValue, stored.value]);

  const act = useCallback((action: ConsentAction) => {
    if (action === "seen") {
      if (seenOnce.current) return;
      seenOnce.current = true;
    } else {
      seenOnce.current = true;
    }
    const decision = decisionForAction(action);
    queue.current = queue.current.then(async () => {
      const next = await postConsentDecision(decision.value, decision.basis);
      if (action === "seen") {
        setStored(next);
        setSeenHeld(true);
        if (next.value === "granted") void bootAnalyticsFromEnv();
        return;
      }
      setSeenHeld(false);
      setStored(next);
      if (next.value === "denied") clearPosthogStorage();
      else void bootAnalyticsFromEnv();
      if (action === "accept") toast.success(TOAST_ACCEPT);
      else if (action === "decline") toast.message(TOAST_DECLINE);
      else if (action === "opt-out") toast.message(TOAST_OPT_OUT);
      else if (action === "save-on") toast.success(TOAST_SAVED_ON);
      else if (action === "save-off") toast.success(TOAST_SAVED_OFF);
      setDismissed(true);
      setChoicesOpen(false);
      setIndiaOpen(false);
    }).catch(() => {});
  }, []);

  const legal = LEGAL.has(pathname);
  const look = isLookPath(pathname);
  const show = Boolean(view.banner) && !dismissed && !legal && !overlayOpen && !choicesOpen && !indiaOpen;

  const value: ConsentContextValue = {
    view,
    chrome,
    show,
    look,
    analyticsOn: view.load,
    act,
    openChoices: () => setChoicesOpen(true),
    openIndia: () => setIndiaOpen(true),
  };

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {show && chrome !== "phone" && !look ? <ConsentCard /> : null}
      <ConsentDialog open={choicesOpen} phone={chrome === "phone"} title={CHOICES_TITLE} onClose={() => setChoicesOpen(false)}>
        <ChoicesBody view={view} onSave={(on) => act(on ? "save-on" : "save-off")} onCancel={() => setChoicesOpen(false)} />
      </ConsentDialog>
      <ConsentDialog open={indiaOpen} phone={chrome === "phone"} title="Your consent for analytics" onClose={() => setIndiaOpen(false)}>
        <IndiaBody onDecline={() => act("decline")} onAccept={() => act("accept")} />
      </ConsentDialog>
    </ConsentContext.Provider>
  );
}

function useSeen(active: boolean, ref: RefObject<HTMLElement | null>) {
  const { act } = useConsent();
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    let started = 0;
    let timer = 0;
    let ratio = 0;
    let done = false;
    const clear = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      started = 0;
    };
    const evaluate = () => {
      if (done) return;
      const blocked = Boolean(document.querySelector("[data-overlay-root]:not([data-consent-banner] *)"));
      const elapsed = started ? Date.now() - started : 0;
      if (noticeCountsAsSeen({ ratio, elapsedMs: elapsed, visibility: document.visibilityState, blocked })) {
        done = true;
        clear();
        actRef.current("seen");
        return;
      }
      const ready = ratio >= 0.5 && document.visibilityState === "visible" && !blocked;
      if (!ready) {
        clear();
        return;
      }
      if (!started) {
        started = Date.now();
        timer = window.setTimeout(evaluate, 1000);
      }
    };
    const io = new IntersectionObserver((entries) => {
      ratio = entries[0]?.intersectionRatio ?? 0;
      evaluate();
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    document.addEventListener("visibilitychange", evaluate);
    return () => {
      clear();
      io.disconnect();
      document.removeEventListener("visibilitychange", evaluate);
    };
  }, [active, ref]);
}

function BannerFrame({
  className,
  testId,
  children,
}: {
  className: string;
  testId: string;
  children: ReactNode;
}) {
  const { view } = useConsent();
  const ref = useRef<HTMLElement>(null);
  useSeen(view.pendingSeen, ref);
  return (
    <section ref={ref} className={className} role="region" aria-label="Privacy choice" data-consent-banner={testId}>
      {children}
    </section>
  );
}

function ActionRow({ reviewOnCompact = false }: { reviewOnCompact?: boolean }) {
  const { view, act, openChoices, openIndia } = useConsent();
  const copy = bannerCopy(view.banner || "opt-in", view.region, true);
  const kind = view.banner;
  const secondary = () => {
    if (kind === "gpc") openChoices();
    else if (kind === "notice") act("opt-out");
    else act("decline");
  };
  const primary = () => {
    if (kind === "gpc") act("gpc-ok");
    else if (kind === "india" && reviewOnCompact) openIndia();
    else if (kind === "india") act("accept");
    else if (kind === "notice") act("ok");
    else act("accept");
  };
  const primaryLabel = kind === "india" && reviewOnCompact ? "Review" : copy.primary;
  const secondaryLabel = copy.secondary;
  return (
    <div className="consent-actions">
      <button type="button" className="consent-btn consent-btn-ghost" onClick={secondary}>{secondaryLabel}</button>
      <button type="button" className="consent-btn consent-btn-primary" onClick={primary}>{primaryLabel}</button>
    </div>
  );
}

function FullCopy({ phone }: { phone: boolean }) {
  const { view } = useConsent();
  const copy = bannerCopy(view.banner || "opt-in", view.region, phone);
  return (
    <>
      <h2 className="consent-title">{copy.title}</h2>
      <p className="consent-body">{copy.body}</p>
      {view.banner === "india" ? (
        <>
          <ul className="consent-items">
            {INDIA_ITEMS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="consent-body">
            Withdraw any time in Privacy choices, as easily as you gave it. Our{" "}
            <Link to="/privacy" className="consent-link">{PRIVACY_POLICY_LABEL}</Link>
            {" "}explains your rights and how to complain, including to the Data Protection Board of India.
          </p>
        </>
      ) : (
        <p className="consent-links">
          <Link to="/privacy" className="consent-link">{PRIVACY_POLICY_LABEL}</Link>
        </p>
      )}
      <ActionRow reviewOnCompact={false} />
    </>
  );
}

export function ConsentPhoneDock() {
  const { show, look, chrome } = useConsent();
  if (!show || chrome !== "phone") return null;
  if (look) {
    return (
      <BannerFrame className="consent-banner consent-dock consent-look-dock" testId="look">
        <CompactLine />
      </BannerFrame>
    );
  }
  return (
    <BannerFrame className="consent-banner consent-dock" testId="feed">
      <FullCopy phone />
    </BannerFrame>
  );
}

function CompactLine() {
  const { view, openChoices } = useConsent();
  const copy = bannerCopy(view.banner || "opt-in", view.region, true);
  return (
    <>
      <p className="consent-look-line">
        <span>{copy.line}</span>
        {view.banner === "india" ? null : (
          <button type="button" className="consent-link" onClick={openChoices}>Details</button>
        )}
      </p>
      <ActionRow reviewOnCompact />
      <div className="consent-look-rule" />
      <button
        type="button"
        className="look-plate-shop look-plate-shop-ink look-plate-shop-full"
        data-consent-shop=""
        onClick={() => triggerLookShop()}
      >
        Shop
      </button>
    </>
  );
}

export function ConsentLookStrip() {
  const { show, look, chrome, view } = useConsent();
  if (!show || !look || chrome === "phone") return null;
  const copy = bannerCopy(view.banner || "opt-in", view.region, false);
  return (
    <BannerFrame className="consent-banner consent-strip" testId="strip">
      <p className="consent-strip-copy">
        <span className="consent-strip-title">{copy.title}</span>
        <span className="consent-strip-sentence">{copy.strip}</span>
        {copy.privacyOnStrip ? <Link to="/privacy" className="consent-link">{PRIVACY_POLICY_LABEL}</Link> : null}
      </p>
      <ActionRow reviewOnCompact={view.banner === "india"} />
    </BannerFrame>
  );
}

function ConsentCard() {
  const { view } = useConsent();
  const ref = useRef<HTMLElement>(null);
  useSeen(view.pendingSeen, ref);
  if (typeof document === "undefined") return null;
  return createPortal(
    <section ref={ref} className="consent-banner consent-card" role="region" aria-label="Privacy choice" data-consent-banner="card">
      <FullCopy phone={false} />
    </section>,
    document.body,
  );
}

function ChoicesBody({
  view,
  onSave,
  onCancel,
}: {
  view: ConsentView;
  onSave: (on: boolean) => void;
  onCancel: () => void;
}) {
  const [on, setOn] = useState(view.effectiveValue === "granted");
  const status = choiceStatus(view);
  return (
    <>
      <p className="consent-body">{CHOICES_BODY}</p>
      <div className="consent-option">
        <p className="consent-option-name">
          {ESSENTIAL_NAME} <span className="consent-option-state">{ESSENTIAL_STATE}</span>
        </p>
        <p className="consent-option-desc">{ESSENTIAL_DESC}</p>
      </div>
      <div className="consent-option">
        <p className="consent-option-name">{ANALYTICS_NAME}</p>
        <p className="consent-option-desc">{ANALYTICS_DESC}</p>
        <div className="consent-segments" role="radiogroup" aria-label="Analytics">
          <button type="button" role="radio" aria-checked={!on} className={!on ? "consent-btn consent-btn-primary is-wide" : "consent-btn consent-btn-ghost is-wide"} onClick={() => setOn(false)}>Off</button>
          <button type="button" role="radio" aria-checked={on} className={on ? "consent-btn consent-btn-primary is-wide" : "consent-btn consent-btn-ghost is-wide"} onClick={() => setOn(true)}>On</button>
        </div>
      </div>
      <p className="consent-status">
        {status.emphasis ? <StatusText text={status.text} emphasis={status.emphasis} /> : status.text}
      </p>
      <p className="consent-links"><Link to="/privacy" className="consent-link">{PRIVACY_POLICY_LABEL}</Link></p>
      <div className="consent-actions">
        <button type="button" className="consent-btn consent-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="consent-btn consent-btn-primary" onClick={() => onSave(on)}>Save</button>
      </div>
    </>
  );
}

function StatusText({ text, emphasis }: { text: string; emphasis: "Off" | "On" }) {
  const at = text.indexOf(emphasis);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong>{emphasis}</strong>
      {text.slice(at + emphasis.length)}
    </>
  );
}

function IndiaBody({ onDecline, onAccept }: { onDecline: () => void; onAccept: () => void }) {
  return (
    <>
      <p className="consent-body">{bannerCopy("india", "in", false).body}</p>
      <ul className="consent-items">
        {INDIA_ITEMS.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="consent-body">
        Withdraw any time in Privacy choices, as easily as you gave it. Our{" "}
        <Link to="/privacy" className="consent-link">{PRIVACY_POLICY_LABEL}</Link>
        {" "}explains your rights and how to complain, including to the Data Protection Board of India.
      </p>
      <div className="consent-actions">
        <button type="button" className="consent-btn consent-btn-ghost" onClick={onDecline}>Decline</button>
        <button type="button" className="consent-btn consent-btn-primary" onClick={onAccept}>Accept</button>
      </div>
    </>
  );
}

function ConsentDialog({
  open,
  phone,
  title,
  onClose,
  children,
}: {
  open: boolean;
  phone: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(open, ref, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div data-consent-dialog="">
      <div className="consent-scrim" onClick={onClose} />
      <div
        ref={ref}
        className={phone ? "consent-dialog consent-dialog-sheet" : "consent-dialog consent-dialog-modal"}
        role="dialog"
        aria-labelledby="consent-dialog-title"
        tabIndex={-1}
        data-overlay-root=""
      >
        {phone ? <div className="consent-handle" /> : (
          <button type="button" className="consent-close" aria-label="Close" onClick={onClose}><X className="size-4" /></button>
        )}
        <h2 id="consent-dialog-title" className="consent-dialog-title">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
