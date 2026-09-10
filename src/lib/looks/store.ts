import { create } from "zustand";
import { deleteLook as deleteLookOnServer, listPublicLooks, saveLook } from "./api";
import { normalizeLookTags } from "./offers";
import { SEED_LOOKS } from "./seed";
import { SEED_LABEL_LOOKS } from "@/lib/labels/seed";
import type { Look } from "./types";

const FALLBACK_LOOKS: Look[] = [...SEED_LOOKS, ...SEED_LABEL_LOOKS];

type LooksState = {
  looks: Look[];
  hydrated: boolean;
  hydrate: () => void;
  refresh: () => Promise<void>;
  addLook: (look: Look) => Promise<Look>;
  replaceLook: (look: Look) => Promise<Look>;
  deleteLook: (id: string) => Promise<void>;
};

function applyLooks(looks: Look[], current: Look[]): Look[] {
  const byId = new Map(looks.map((look) => [look.id, look]));
  for (const look of current) {
    if (!byId.has(look.id)) byId.set(look.id, look);
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export const useLooksStore = create<LooksState>((set, get) => {
  let gen = 0;
  return {
    looks: FALLBACK_LOOKS,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return;
      const id = ++gen;
      const failSafe =
        typeof window === "undefined"
          ? undefined
          : window.setTimeout(() => {
              if (!get().hydrated) set({ hydrated: true });
            }, 4000);
      void listPublicLooks()
        .then((looks) => {
          if (failSafe) window.clearTimeout(failSafe);
          if (id !== gen) return;
          set((state) => ({
            looks: applyLooks(looks, state.looks),
            hydrated: true,
          }));
        })
        .catch(() => {
          if (failSafe) window.clearTimeout(failSafe);
          if (id !== gen) return;
          set({ hydrated: true });
        });
    },
    refresh: () => {
      const id = ++gen;
      return listPublicLooks()
        .then((looks) => {
          if (id !== gen) return;
          const next = looks.length
            ? [...looks].sort((a, b) => b.createdAt - a.createdAt)
            : FALLBACK_LOOKS;
          set({ looks: next, hydrated: true });
        })
        .catch(() => {
          if (id !== gen) return;
          set({ hydrated: true });
        });
    },
    addLook: async (look) => {
      const saved = await saveLook({ data: look });
      const looks = [saved, ...get().looks.filter((item) => item.id !== saved.id)];
      set({ looks });
      return saved;
    },
    replaceLook: async (look) => {
      const saved = await saveLook({ data: look });
      const looks = get().looks.map((item) => (item.id === saved.id ? saved : item));
      set({ looks });
      return saved;
    },
    deleteLook: async (id) => {
      await deleteLookOnServer({ data: id });
      set({ looks: get().looks.filter((item) => item.id !== id) });
    },
  };
});

export function useLook(id: string | undefined): Look | undefined {
  return useLooksStore((s) => s.looks.find((look) => look.id === id));
}

export function duplicateLookLocal(source: Look, creator: string, userId: string): Look {
  return normalizeLookTags({
    ...source,
    id: crypto.randomUUID(),
    userId,
    title: source.title ? `${source.title} copy` : "Untitled copy",
    creator,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: source.tags.map((tag) => ({
      ...tag,
      id: crypto.randomUUID(),
      offers: tag.offers?.map((offer) => ({ ...offer, id: crypto.randomUUID() })),
    })),
  });
}
