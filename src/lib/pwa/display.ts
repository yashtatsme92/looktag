const INSTALL_HINT_KEY = "looktag-install-hint-v1";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredInstall: BeforeInstallPromptEvent | null = null;
let captureStarted = false;

const installOpenListeners = new Set<(open: boolean) => void>();

export function startInstallCapture() {
  if (captureStarted || typeof window === "undefined") return;
  captureStarted = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("looktag:install-ready"));
  });
}

export function takeDeferredInstall(): BeforeInstallPromptEvent | null {
  const event = deferredInstall;
  deferredInstall = null;
  return event;
}

export function peekDeferredInstall(): BeforeInstallPromptEvent | null {
  return deferredInstall;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOs;
}

export function isAndroidDevice(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function readInstallHintDone(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === "done";
  } catch {
    return false;
  }
}

export function markInstallHintDone() {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, "done");
  } catch {
    // private mode
  }
}

/** Full navigation so the platform install tutorial can intercept the request. */
export function openIosInstallTutorial() {
  window.location.assign("/?install=1&platform=ios");
}

export function requestInstallSheet() {
  installOpenListeners.forEach((listener) => listener(true));
}

export function onInstallSheetRequest(listener: (open: boolean) => void) {
  installOpenListeners.add(listener);
  return () => {
    installOpenListeners.delete(listener);
  };
}
