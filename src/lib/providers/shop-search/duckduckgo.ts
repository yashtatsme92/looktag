import type { ShopHit, ShopRegion } from "./types.ts";

export const DUCKDUCKGO_SEARCH_URL = "https://html.duckduckgo.com/html/";

/** DuckDuckGo HTML results. The host lives only in this file. */
export async function search(query: string, region: ShopRegion, domains: string[]): Promise<ShopHit[]> {
  if (domains.length === 0) return [];
  const siteClause = domains.map((host) => `site:${host}`).join(" OR ");
  const q = `${query} ${region.name} ${siteClause}`;
  const url = `${DUCKDUCKGO_SEARCH_URL}?q=${encodeURIComponent(q)}`;
  let html = "";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (response.ok) html = await response.text();
  } catch {
    return [];
  }
  if (!html) return [];
  const hrefs = [
    ...html.matchAll(/uddg=([^&"]+)/g),
    ...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g),
  ]
    .map((match) => {
      try {
        return decodeURIComponent(match[1] ?? "");
      } catch {
        return match[1] ?? "";
      }
    })
    .filter(Boolean);
  return hrefs.map((hit) => ({ url: hit }));
}
