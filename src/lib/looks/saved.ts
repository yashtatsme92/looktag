import { create } from "zustand";
import {
  SAVED_LOOKS_KEY,
  mergeSavedLookIds,
  parseSavedLookIds,
  toggleSavedLookId,
} from "@looktag/shared";

function readIds(): string[] {
  try {
    return parseSavedLookIds(localStorage.getItem(SAVED_LOOKS_KEY));
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(SAVED_LOOKS_KEY, JSON.stringify(ids));
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
      ids: mergeSavedLookIds(state.ids, stored),
      hydrated: true,
    }));
  },
  has: (id) => get().ids.includes(id),
  toggle: (id) => {
    const next = toggleSavedLookId(get().ids, id);
    writeIds(next);
    set({ ids: next, hydrated: true });
    return next.includes(id);
  },
}));
