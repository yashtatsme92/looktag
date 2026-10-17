export const PENDING_SAVE_KEY = "looktag-pending-save-v1";

type StoreLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PendingSave = {
  id: string;
  intent: "save";
};

function session(): StoreLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Remember the look a guest tried to save, so it can be saved after sign-in. */
export function rememberPendingSave(lookId: string, store: StoreLike | null = session()) {
  try {
    store?.setItem(PENDING_SAVE_KEY, JSON.stringify({ id: lookId, intent: "save" } satisfies PendingSave));
  } catch {
    // private mode
  }
}

export function clearPendingSave(store: StoreLike | null = session()) {
  try {
    store?.removeItem(PENDING_SAVE_KEY);
  } catch {
    // private mode
  }
}

export function hasPendingSave(store: StoreLike | null = session()): boolean {
  try {
    const raw = store?.getItem(PENDING_SAVE_KEY);
    if (!raw) return false;
    const pending = JSON.parse(raw) as Partial<PendingSave>;
    return pending.intent === "save" && typeof pending.id === "string" && pending.id.length > 0;
  } catch {
    return false;
  }
}

/** Read and clear the pending save, so it resumes exactly once. */
export function takePendingSave(store: StoreLike | null = session()): string | null {
  try {
    const raw = store?.getItem(PENDING_SAVE_KEY) ?? null;
    if (raw) store?.removeItem(PENDING_SAVE_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Partial<PendingSave>;
    return pending.intent === "save" && typeof pending.id === "string" && pending.id.length > 0
      ? pending.id
      : null;
  } catch {
    return null;
  }
}
