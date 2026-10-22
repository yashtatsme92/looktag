import type { ShopHit, ShopRegion } from "./types";

export const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

/** Brave web search. The host lives only in this file. */
export async function search(
  query: string,
  region: ShopRegion,
  domains: string[],
  apiKey = "",
): Promise<ShopHit[]> {
  const key = apiKey.trim();
  if (!key || domains.length === 0) return [];
  const siteClause = domains.map((host) => `site:${host}`).join(" OR ");
  const endpoint = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(
    `${query} ${region.name} ${siteClause}`,
  )}&count=10&country=${encodeURIComponent(region.id.toLowerCase())}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!response.ok) return [];
  const body = (await response.json()) as {
    web?: { results?: { url?: string; title?: string; description?: string; thumbnail?: { src?: string } }[] };
  };
  const hits: ShopHit[] = [];
  for (const row of body.web?.results ?? []) {
    if (!row.url) continue;
    hits.push({
      url: row.url,
      title: row.title,
      snippet: row.description,
      imageUrl: row.thumbnail?.src,
    });
  }
  return hits;
}
