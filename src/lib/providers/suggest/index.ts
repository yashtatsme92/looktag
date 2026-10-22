import { unknownProvider } from "../unknown.ts";

const SUGGEST_PROVIDERS = ["shop-search"] as const;

/**
 * Suggest has no vendor of its own. Unset (or `shop-search`) uses shop search.
 * Any other value is a typo and throws.
 */
export function resolveSuggestProvider(env: { SUGGEST_PROVIDER?: string } = process.env): "shop-search" {
  const named = env.SUGGEST_PROVIDER?.trim().toLowerCase();
  if (named && named !== "shop-search") unknownProvider("SUGGEST_PROVIDER", named, SUGGEST_PROVIDERS);
  return "shop-search";
}
