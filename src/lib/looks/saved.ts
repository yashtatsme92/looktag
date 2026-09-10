import { create } from "zustand";

const SAVED_KEY = "looktag-saved-v1";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
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

type SavedState = {
  ids: string[];
  hydrated: boolean;
  hydrate: () => void;
  has: (id: string) => boolean;
  toggle: (id: string) => boolean;
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
    const ids = get().ids;
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [id, ...ids];
    writeIds(next);
    set({ ids: next, hydrated: true });
    return next.includes(id);
  },
}));
