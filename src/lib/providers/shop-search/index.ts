import { search as braveSearch } from "./brave.ts";
import { search as duckDuckGoSearch } from "./duckduckgo.ts";
import { search as googleSearch } from "./google-cse.ts";
import type { ShopHit, ShopRegion, ShopSearchProviderName } from "./types.ts";
import { unknownProvider } from "../unknown.ts";

export type { ShopHit, ShopRegion, ShopSearch, ShopSearchProviderName } from "./types.ts";

type Env = {
  SHOP_SEARCH_PROVIDER?: string;
  BRAVE_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_CX?: string;
};

const SHOP_SEARCH_PROVIDERS = ["brave", "google-cse", "duckduckgo"] as const;

export type ShopEngineName = "brave" | "google" | "google-cse" | "duckduckgo";

/** `SHOP_SEARCH_PROVIDER=brave|google-cse|duckduckgo`. Default brave. */
export function resolveShopSearchProvider(env: Env = process.env): ShopSearchProviderName {
  const named = env.SHOP_SEARCH_PROVIDER?.trim().toLowerCase();
  if (!named || named === "brave") return "brave";
  if (named === "google-cse" || named === "google") return "google-cse";
  if (named === "duckduckgo") return "duckduckgo";
  unknownProvider("SHOP_SEARCH_PROVIDER", named, SHOP_SEARCH_PROVIDERS);
}

export async function searchEngine(
  engine: string,
  query: string,
  region: ShopRegion,
  domains: string[],
  keys: { braveApiKey?: string; googleApiKey?: string; googleCx?: string } = {},
): Promise<ShopHit[]> {
  if (engine === "google" || engine === "google-cse") {
    return googleSearch(query, region, domains, keys.googleApiKey, keys.googleCx);
  }
  if (engine === "duckduckgo") return duckDuckGoSearch(query, region, domains);
  if (engine === "brave") return braveSearch(query, region, domains, keys.braveApiKey);
  unknownProvider("shop search engine", engine, ["brave", "google-cse", "duckduckgo"]);
}

export async function search(
  query: string,
  region: ShopRegion,
  domains: string[],
  env: Env = process.env,
): Promise<ShopHit[]> {
  const name = resolveShopSearchProvider(env);
  if (name === "google-cse") {
    return googleSearch(query, region, domains, env.GOOGLE_API_KEY, env.GOOGLE_CX);
  }
  if (name === "duckduckgo") return duckDuckGoSearch(query, region, domains);
  return braveSearch(query, region, domains, env.BRAVE_API_KEY);
}
