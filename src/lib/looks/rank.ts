import { tagOffers } from "./offers";
import type { Look, ProductTag } from "./types";

export const SCORE_PER_LOOK = 12;
export const SCORE_PER_PIN = 3;
export const SCORE_PER_COMPARED = 5;

export type RankWeights = {
  look: number;
  pin: number;
  compared: number;
};

export const DEFAULT_RANK_WEIGHTS: RankWeights = {
  look: SCORE_PER_LOOK,
  pin: SCORE_PER_PIN,
  compared: SCORE_PER_COMPARED,
};

export type CreatorRank = {
  userId: string;
  displayName: string;
  handle: string;
  looks: number;
  pins: number;
  compared: number;
  score: number;
};

export type RankedLook = {
  look: Look;
  pins: number;
  compared: number;
  score: number;
};

export function pinCount(tags: ProductTag[]): number {
  return tags.length;
}

export function comparedCount(tags: ProductTag[]): number {
  return tags.filter((tag) => tagOffers(tag).length >= 2).length;
}

export function retailerCount(tags: ProductTag[]): number {
  return new Set(
    tags.flatMap((tag) => tagOffers(tag).map((offer) => offer.retailerId).filter(Boolean)),
  ).size;
}

export function rankScore(
  looks: number,
  pins: number,
  compared: number,
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
): number {
  return looks * weights.look + pins * weights.pin + compared * weights.compared;
}

export function lookStats(look: Pick<Look, "tags">) {
  return {
    pinCount: pinCount(look.tags),
    comparedCount: comparedCount(look.tags),
    retailerCount: retailerCount(look.tags),
  };
}

export function rankLooks(looks: Look[], weights: RankWeights = DEFAULT_RANK_WEIGHTS): RankedLook[] {
  return looks
    .map((look) => {
      const stats = lookStats(look);
      return {
        look,
        pins: stats.pinCount,
        compared: stats.comparedCount,
        score: rankScore(1, stats.pinCount, stats.comparedCount, weights),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.pins !== a.pins) return b.pins - a.pins;
      return a.look.title.localeCompare(b.look.title);
    });
}
