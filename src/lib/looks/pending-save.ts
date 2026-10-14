export const PENDING_SAVE_KEY = "looktag-pending-save-v1";

type StoreLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
    store?.setItem(PENDING_SAVE_KEY, lookId);
  } catch {
    // private mode
  }
}

export function hasPendingSave(store: StoreLike | null = session()): boolean {
  try {
    return Boolean(store?.getItem(PENDING_SAVE_KEY));
  } catch {
    return false;
  }
}

/** Read and clear the pending save, so it resumes exactly once. */
export function takePendingSave(store: StoreLike | null = session()): string | null {
  try {
    const id = store?.getItem(PENDING_SAVE_KEY) ?? null;
    if (id) store?.removeItem(PENDING_SAVE_KEY);
    return id || null;
  } catch {
    return null;
  }
}
