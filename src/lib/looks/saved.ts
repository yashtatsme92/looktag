import { create } from "zustand";

export const SAVED_KEY = "looktag-saved-v1";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch {
    // private mode
  }
}

/** Newest id first. Ids with no published look are skipped, and repeats collapse. */
export function resolveSavedLooks<T extends { id: string }>(ids: readonly string[], catalog: readonly T[]): T[] {
  const byId = new Map(catalog.map((look) => [look.id, look]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const look = byId.get(id);
    if (look) out.push(look);
  }
  return out;
}

/**
 * Published catalog wins once it has loaded, so a deleted or unpublished id is skipped.
 * Before that, only looks already in memory can show, which is how a tap appears at once.
 */
export function savedLooksForPage<T extends { id: string }>(input: {
  savedIds: readonly string[];
  memoryLooks: readonly T[];
  publishedLooks: readonly T[] | null;
}): T[] {
  return resolveSavedLooks(input.savedIds, input.publishedLooks ?? input.memoryLooks);
}

/** Record or remove one id. Guests still store the save, and the sign-in sheet stays on the first tap. */
export function applySaveTap(input: {
  ids: readonly string[];
  lookId: string;
  signedIn: boolean;
}): { ids: string[]; saved: boolean; promptSignIn: boolean } {
  if (input.ids.includes(input.lookId)) {
    return {
      ids: input.ids.filter((id) => id !== input.lookId),
      saved: false,
      promptSignIn: false,
    };
  }
  return {
    ids: [input.lookId, ...input.ids],
    saved: true,
    promptSignIn: !input.signedIn,
  };
}

/** The sign-in handoff adds a pending id once. An id already stored is not copied again. */
export function carryOverSave(ids: readonly string[], pendingId: string | null): string[] {
  if (!pendingId || ids.includes(pendingId)) return [...ids];
  return [pendingId, ...ids];
}

type SavedState = {
  ids: string[];
  hydrated: boolean;
  hydrate: () => void;
  has: (id: string) => boolean;
  toggle: (id: string) => boolean;
  replace: (ids: string[]) => void;
};

export const useSavedLooks = create<SavedState>((set, get) => ({
  ids: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const stored = readIds();
    set((state) => ({
      ids: [...new Set([...state.ids, ...stored])],
      hydrated: true,
    }));
  },
  has: (id) => get().ids.includes(id),
  toggle: (id) => {
    get().hydrate();
    const next = applySaveTap({ ids: get().ids, lookId: id, signedIn: true });
    writeIds(next.ids);
    set({ ids: next.ids, hydrated: true });
    return next.saved;
  },
  replace: (ids) => {
    writeIds(ids);
    set({ ids, hydrated: true });
  },
}));

