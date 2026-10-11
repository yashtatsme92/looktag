import { visualShopTarget } from "./offers.ts";
import type { ProductTag } from "./types.ts";

/** `Shop whole look` opens one destination: the first pin that has a visual shop target. */
export function firstShopTag(tags: ProductTag[]): { tag: ProductTag; url: string; retailerId: string } | undefined {
  for (const tag of tags) {
    const target = visualShopTarget(tag);
    if (target?.url) return { tag, url: target.url, retailerId: target.retailerId };
  }
  return undefined;
}
