import { search as braveSearch } from "./brave.ts";
import { search as googleSearch } from "./google-cse.ts";
import type { ShopHit, ShopRegion, ShopSearchProviderName } from "./types.ts";

export type { ShopHit, ShopRegion, ShopSearch, ShopSearchProviderName } from "./types.ts";

type Env = {
  SHOP_SEARCH_PROVIDER?: string;
  BRAVE_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_CX?: string;
};

/** `SHOP_SEARCH_PROVIDER=brave|google-cse`. Default brave. Per-request engines still call an adapter directly. */
export function resolveShopSearchProvider(env: Env = process.env): ShopSearchProviderName {
  const named = env.SHOP_SEARCH_PROVIDER?.trim().toLowerCase();
  if (named === "google-cse" || named === "google") return "google-cse";
  return "brave";
}

export async function search(
  query: string,
  region: ShopRegion,
  domains: string[],
  env: Env = process.env,
): Promise<ShopHit[]> {
  if (resolveShopSearchProvider(env) === "google-cse") {
    return googleSearch(query, region, domains, env.GOOGLE_API_KEY, env.GOOGLE_CX);
  }
  return braveSearch(query, region, domains, env.BRAVE_API_KEY);
}
