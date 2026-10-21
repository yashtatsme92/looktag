import type { ShopHit, ShopRegion } from "./types";

export const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1";

/** Google Custom Search. The host lives only in this file. */
export async function search(
  query: string,
  region: ShopRegion,
  domains: string[],
  apiKey = "",
  cx = "",
): Promise<ShopHit[]> {
  const key = apiKey.trim();
  const engine = cx.trim();
  if (!key || !engine || domains.length === 0) return [];
  const siteClause = domains.map((host) => `site:${host}`).join(" OR ");
  const endpoint = `${GOOGLE_CSE_URL}?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(
    engine,
  )}&q=${encodeURIComponent(`${query} ${region.name} ${siteClause}`)}&num=8&gl=${encodeURIComponent(
    region.id.toLowerCase(),
  )}`;
  const response = await fetch(endpoint);
  if (!response.ok) return [];
  const body = (await response.json()) as {
    items?: { link?: string; title?: string; snippet?: string; pagemap?: { cse_thumbnail?: { src?: string }[] } }[];
  };
  const hits: ShopHit[] = [];
  for (const row of body.items ?? []) {
    if (!row.link) continue;
    hits.push({
      url: row.link,
      title: row.title,
      snippet: row.snippet,
      imageUrl: row.pagemap?.cse_thumbnail?.[0]?.src,
    });
  }
  return hits;
}
