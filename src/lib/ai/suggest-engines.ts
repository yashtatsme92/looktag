import { detectRetailer, isProductUrl, pickSearchDomains, type Retailer } from "@/lib/looks/retailers";
import {
  localizeProductUrl,
  resolveRegion,
  shopServesRegion,
  urlMatchesRegion,
} from "@/lib/looks/region.ts";
import type { CatalogShop, SuggestedOffer, SuggestSearchConfig } from "./suggest-types";
import { fetchText } from "./suggest-vision";

const MAX_OFFERS = 4;

export async function duckDuckGoSearch(
  query: string,
  config: SuggestSearchConfig,
  shops: CatalogShop[],
): Promise<SuggestedOffer[]> {
  const region = resolveRegion(config.country);
  const domains = pickSearchDomains(shops, region.id, 8);
  if (domains.length === 0) return [];
  const siteClause = domains.map((host) => `site:${host}`).join(" OR ");
  const q = `${query} ${region.name} ${siteClause}`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const html = await fetchText(url);
  if (!html) return [];
  const hrefs = [
    ...html.matchAll(/uddg=([^&"]+)/g),
    ...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g),
  ]
    .map((match) => {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    })
    .filter(Boolean);
  return uniqueOffers(hrefs, shops, region.id);
}

export async function braveSearch(
  query: string,
  config: SuggestSearchConfig,
  shops: CatalogShop[],
): Promise<SuggestedOffer[]> {
  const key = config.braveApiKey.trim();
  if (!key) return [];
  const region = resolveRegion(config.country);
  const domains = pickSearchDomains(shops, region.id, 8);
  if (domains.length === 0) return [];
  const siteClause = domains.map((host) => `site:${host}`).join(" OR ");
  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    `${query} ${region.name} ${siteClause}`,
  )}&count=10&country=${encodeURIComponent(region.id.toLowerCase())}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!response.ok) return [];
  const body = (await response.json()) as {
    web?: { results?: { url?: string; title?: string; description?: string; thumbnail?: { src?: string } }[] };
  };
  const offers: SuggestedOffer[] = [];
  for (const row of body.web?.results ?? []) {
    if (!row.url) continue;
    const offer = urlToOffer(row.url, shops, {
      title: row.title,
      snippet: row.description,
      imageUrl: row.thumbnail?.src,
    }, config.country);
    if (offer) offers.push(offer);
  }
  return offers.slice(0, MAX_OFFERS);
}

export async function googleSearch(
  query: string,
  config: SuggestSearchConfig,
  shops: CatalogShop[],
): Promise<SuggestedOffer[]> {
  const key = config.googleApiKey.trim();
  const cx = config.googleCx.trim();
  if (!key || !cx) return [];
  const region = resolveRegion(config.country);
  const domains = pickSearchDomains(shops, region.id, 8);
  if (domains.length === 0) return [];
  const siteClause = domains.map((host) => `site:${host}`).join(" OR ");
  const endpoint = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(
    cx,
  )}&q=${encodeURIComponent(`${query} ${region.name} ${siteClause}`)}&num=8&gl=${encodeURIComponent(
    region.id.toLowerCase(),
  )}`;
  const response = await fetch(endpoint);
  if (!response.ok) return [];
  const body = (await response.json()) as {
    items?: { link?: string; title?: string; snippet?: string; pagemap?: { cse_thumbnail?: { src?: string }[] } }[];
  };
  const offers: SuggestedOffer[] = [];
  for (const row of body.items ?? []) {
    if (!row.link) continue;
    const offer = urlToOffer(row.link, shops, {
      title: row.title,
      snippet: row.snippet,
      imageUrl: row.pagemap?.cse_thumbnail?.[0]?.src,
    }, config.country);
    if (offer) offers.push(offer);
  }
  return offers.slice(0, MAX_OFFERS);
}

export function uniqueOffers(urls: string[], shops: CatalogShop[], country: string): SuggestedOffer[] {
  const offers: SuggestedOffer[] = [];
  const seen = new Set<string>();
  const take = (preferNewRetailer: boolean) => {
    for (const url of urls) {
      if (offers.length >= MAX_OFFERS) return;
      const offer = urlToOffer(url, shops, undefined, country);
      if (!offer || seen.has(offer.url)) continue;
      if (preferNewRetailer && offers.some((row) => row.retailerId === offer.retailerId)) continue;
      seen.add(offer.url);
      offers.push(offer);
    }
  };
  take(true);
  take(false);
  return offers;
}

export function asOffer(row: unknown, shops: CatalogShop[], country: string): SuggestedOffer | null {
  if (!row || typeof row !== "object") return null;
  const item = row as Record<string, unknown>;
  const url = typeof item.url === "string" ? item.url.trim() : "";
  return urlToOffer(url, shops, {
    title: typeof item.title === "string" ? item.title : "",
    price: typeof item.price === "string" || typeof item.price === "number" ? String(item.price) : "",
    currency: typeof item.currency === "string" ? item.currency : "",
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
    retailerName: typeof item.retailer === "string" ? item.retailer : "",
  }, country);
}

export function urlToOffer(
  rawUrl: string,
  shops: CatalogShop[],
  extra?: { title?: string; snippet?: string; price?: string; currency?: string; imageUrl?: string; retailerName?: string },
  country = "DE",
): SuggestedOffer | null {
  const localized = localizeProductUrl(rawUrl, country) ?? sanitizeUrl(rawUrl);
  if (!localized || !isProductUrl(localized)) return null;
  if (!urlMatchesRegion(localized, country)) return null;
  const catalog: Retailer[] = shops;
  const detected = detectRetailer(localized, catalog);
  if (!detected) return null;
  if (!shopServesRegion(detected.id, country)) return null;
  const region = resolveRegion(country);
  const price = extra?.price?.replace(/[^0-9.,]/g, "") || priceFromText(`${extra?.title ?? ""} ${extra?.snippet ?? ""}`);
  const currency =
    extra?.currency === "USD" || extra?.currency === "GBP" || extra?.currency === "CHF" || extra?.currency === "SEK" || extra?.currency === "PLN"
      ? extra.currency
      : region.currency;
  return {
    url: localized,
    title: (extra?.title ?? "").slice(0, 120),
    price,
    currency,
    retailerId: detected.id,
    imageUrl: extra?.imageUrl && extra.imageUrl.startsWith("http") ? extra.imageUrl : undefined,
  };
}

export function regionalizeOffers(
  offers: SuggestedOffer[],
  shops: CatalogShop[],
  country: string,
): SuggestedOffer[] {
  const seen = new Set<string>();
  const next: SuggestedOffer[] = [];
  for (const offer of offers) {
    const localized = urlToOffer(offer.url, shops, offer, country);
    if (!localized || seen.has(localized.url)) continue;
    seen.add(localized.url);
    next.push({ ...offer, ...localized });
    if (next.length >= MAX_OFFERS) break;
  }
  return next;
}

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function priceFromText(text: string): string {
  const match = text.match(/(?:EUR|€)\s*(\d{1,5}(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i);
  const raw = match?.[1] || match?.[2] || "";
  return raw.replace(",", ".");
}
