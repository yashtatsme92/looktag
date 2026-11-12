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

/** Phone hides the bar Shop control while a pin card is open. Wider layouts keep "Shop". */
export function plateShowsBarShop(phone: boolean, pinSelected: boolean): boolean {
  return !(phone && pinSelected);
}

/** Phone "Shop whole look" still opens the first retailer. Wider layouts stay on the whole-look sheet. */
export function shopWholeOpensSheet(phone: boolean): boolean {
  return !phone;
}