import { create } from "zustand";
import { MOODS, type MoodId } from "@/lib/looks/moods";
import type { Look } from "@/lib/looks/types";

/** Session threshold: mood strip appears after this many More like this taps. */
export const MLT_MOOD_STRIP_AFTER = 2;

export type MoreLikeSeed = {
  lookId: string;
  moods: string[];
  title: string;
};

type MoreLikeState = {
  activationCount: number;
  seeds: MoreLikeSeed[];
  /** Active bias that reweights the home feed until cleared. */
  bias: MoreLikeSeed | null;
  /** One-shot flag: feed should run reweight enter animation. */
  pendingAnimate: boolean;
  activate: (look: Pick<Look, "id" | "moods" | "title">) => void;
  takePendingAnimate: () => MoreLikeSeed | null;
  clearBias: () => void;
  hintMoods: () => MoodId[];
  showMoodStrip: () => boolean;
};

function asMoodId(id: string): MoodId | null {
  return MOODS.some((mood) => mood.id === id) ? (id as MoodId) : null;
}

function overlap(moods: string[] | undefined, wanted: string[]): number {
  if (!moods?.length || wanted.length === 0) return 0;
  const set = new Set(wanted);
  return moods.filter((mood) => set.has(mood)).length;
}

/**
 * Reorder feed slots by mood overlap with the seed.
 * Seed itself is deprioritized so “more like” fills the next slots.
 */
export function reweightLooks(looks: Look[], seed: MoreLikeSeed): Look[] {
  const wanted = seed.moods.filter(Boolean);
  return [...looks].sort((a, b) => {
    const scoreA = overlap(a.moods, wanted) * 10 + (a.id === seed.lookId ? -100 : 0);
    const scoreB = overlap(b.moods, wanted) * 10 + (b.id === seed.lookId ? -100 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.title.localeCompare(b.title);
  });
}

export const useMoreLikeThis = create<MoreLikeState>((set, get) => ({
  activationCount: 0,
  seeds: [],
  bias: null,
  pendingAnimate: false,
  activate: (look) => {
    const seed: MoreLikeSeed = {
      lookId: look.id,
      moods: [...(look.moods ?? [])],
      title: look.title,
    };
    set((state) => ({
      activationCount: state.activationCount + 1,
      seeds: [seed, ...state.seeds].slice(0, 12),
      bias: seed,
      pendingAnimate: true,
    }));
  },
  takePendingAnimate: () => {
    const { pendingAnimate, bias } = get();
    if (!pendingAnimate || !bias) return null;
    set({ pendingAnimate: false });
    return bias;
  },
  clearBias: () => set({ bias: null, pendingAnimate: false }),
  hintMoods: () => {
    const counts = new Map<string, number>();
    for (const seed of get().seeds) {
      for (const mood of seed.moods) {
        if (!mood) continue;
        counts.set(mood, (counts.get(mood) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id]) => asMoodId(id))
      .filter((id): id is MoodId => Boolean(id))
      .slice(0, 4);
  },
  showMoodStrip: () => get().activationCount >= MLT_MOOD_STRIP_AFTER,
}));
