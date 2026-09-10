export const BOOT_SKIP_KEY = "looktag-boot-v1";
export const BOOT_REPLAY_EVENT = "looktag:replay-boot";
export const BOOT_HOLD_MS = 2000;

export function isSharePath(pathname: string): boolean {
  if (/^\/looks\/[^/]+$/.test(pathname)) return true;
  if (/^\/houses\/[^/]+\/[^/]+$/.test(pathname)) return true;
  if (/^\/houses\/[^/]+$/.test(pathname)) return true;
  return false;
}

export function hasBootPlayed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(BOOT_SKIP_KEY) === "done";
  } catch {
    return false;
  }
}

export function markBootPlayed() {
  try {
    sessionStorage.setItem(BOOT_SKIP_KEY, "done");
  } catch {
    // private mode
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("boot-done");
  }
}

export function replayBootSplash() {
  try {
    sessionStorage.removeItem(BOOT_SKIP_KEY);
  } catch {
    // private mode
  }
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("boot-done");
  }
  window.dispatchEvent(new Event(BOOT_REPLAY_EVENT));
}
