export const CREATE_DRAFT_KEY = "looktag-create-draft-v1";
export const CREATE_RESUME_KEY = "looktag-create-resume-v1";

type StoreLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): StoreLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * What actually got kept. "full" = photo + pins + text; "no-photo" = the photo was too
 * large for storage; "failed" = nothing kept (quota / private mode). Callers must not
 * claim a draft is saved unless this says so (#203).
 */
export type DraftPersistResult = "full" | "no-photo" | "failed";

export function persistCreateDraft<T extends { imageSrc: string }>(
  look: T,
  store: StoreLike | null = session(),
): DraftPersistResult {
  if (!store) return "failed";
  try {
    store.setItem(CREATE_DRAFT_KEY, JSON.stringify(look));
    return "full";
  } catch {
    try {
      store.setItem(CREATE_DRAFT_KEY, JSON.stringify({ ...look, imageSrc: "" }));
      return look.imageSrc ? "no-photo" : "full";
    } catch {
      return "failed";
    }
  }
}

/** Honest copy for Save draft — drafts live in this browser tab, not the account. */
export function draftSavedMessage(result: DraftPersistResult): { ok: boolean; text: string } {
  if (result === "full") return { ok: true, text: "Draft kept in this browser tab. Publish to save it to your account." };
  if (result === "no-photo") return { ok: false, text: "Draft kept without the photo — it was too large to store here." };
  return { ok: false, text: "Couldn’t keep a draft in this browser. Publish to save the look." };
}

export type CreateResumeIntent = "find" | "publish" | "draft";

export function rememberCreateResume(intent: CreateResumeIntent, store: StoreLike | null = session()) {
  try {
    store?.setItem(CREATE_RESUME_KEY, intent);
  } catch {
    // private mode
  }
}

/** Read and clear: the resume runs once (#203 A2/B4). */
export function takeCreateResume(store: StoreLike | null = session()): CreateResumeIntent | null {
  try {
    const raw = store?.getItem(CREATE_RESUME_KEY) ?? null;
    store?.removeItem(CREATE_RESUME_KEY);
    return raw === "find" || raw === "publish" || raw === "draft" ? raw : null;
  } catch {
    return null;
  }
}

export function clearCreateResume(store: StoreLike | null = session()) {
  try {
    store?.removeItem(CREATE_RESUME_KEY);
  } catch {
    // private mode
  }
}
