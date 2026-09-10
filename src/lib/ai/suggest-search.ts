import { isProductUrl, pickSearchDomains } from "@/lib/looks/retailers";
import {
  preferredHost,
  resolveRegion,
  shopServesRegion,
} from "@/lib/looks/region.ts";
import { enrichOfferImages } from "./product-image";
import type { CatalogShop, SuggestedOffer, SuggestSearchConfig } from "./suggest-types";
import { extractJson } from "./suggest-vision";
import {
  asOffer,
  braveSearch,
  duckDuckGoSearch,
  googleSearch,
  regionalizeOffers,
  uniqueOffers,
} from "./suggest-engines";

const SEARCH_MODEL = "grok-4-fast-non-reasoning";
const MAX_OFFERS = 4;
const SEARCH_TIMEOUT_MS = 16_000;

export async function searchOffers(
  apiKey: string,
  query: string,
  config: SuggestSearchConfig,
  shops: CatalogShop[],
): Promise<SuggestedOffer[]> {
  const engine = config.engine;
  let offers: SuggestedOffer[] = [];
  if (engine === "brave") offers = await braveSearch(query, config, shops);
  else if (engine === "google") offers = await googleSearch(query, config, shops);
  else if (engine === "duckduckgo") offers = await duckDuckGoSearch(query, config, shops);
  else offers = await xaiProductSearch(apiKey, query, config, shops);
  if (offers.length === 0 && engine !== "duckduckgo") {
    offers = await duckDuckGoSearch(query, config, shops);
  }
  const localized = regionalizeOffers(offers, shops, config.country);
  return enrichOfferImages(localized);
}

export async function xaiProductSearch(
  apiKey: string,
  query: string,
  config: SuggestSearchConfig,
  shops: CatalogShop[],
): Promise<SuggestedOffer[]> {
  if (!apiKey) return [];
  const region = resolveRegion(config.country);
  const regionalShops = shops.filter((shop) => shopServesRegion(shop.id, region.id));
  const domains = pickSearchDomains(regionalShops, region.id);
  if (domains.length === 0) return [];
  const domainSet = new Set(domains);
  const shopList = regionalShops
    .filter((shop) => {
      const host = preferredHost(shop, region.id)?.replace(/^www\./, "").toLowerCase();
      return host ? domainSet.has(host) : false;
    })
    .map((shop) => `${shop.name} (${preferredHost(shop, region.id)})`)
    .join(", ");
  const prompt = `Search the live web now for product/SKU pages to buy: ${query}
Only these shops, ${region.name} (${region.id}) storefronts only: ${shopList}
Currency ${region.currency}. Never return US, UK, or other-country pages.
Return JSON only: {"offers":[{"url":"https://...","title":"","price":"129.95","currency":"${region.currency}","retailer":"Zalando","imageUrl":"https://..."}]}
Rules:
- 2 to ${MAX_OFFERS} offers if possible, different shops.
- url MUST be the ${region.name} item page (zalando.${region.id === "GB" ? "co.uk" : region.id.toLowerCase()}, zara.com/${region.id.toLowerCase()}/, cos.com/en-${region.id.toLowerCase()}/). Never a homepage, category, search, campaign, or another country's store.
- imageUrl: the product still from that page (og:image). Empty string if unknown.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: SEARCH_MODEL,
        stream: true,
        max_tool_calls: 1,
        include: ["web_search_call.action.sources"],
        input: prompt,
        tools: [
          {
            type: "web_search",
            filters: { allowed_domains: domains },
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const found = await collectSearchUrls(response);
    const fromJson: SuggestedOffer[] = [];
    for (const row of found.jsonOffers) {
      const offer = asOffer(row, shops, config.country);
      if (offer) fromJson.push(offer);
    }
    const fromUrls = uniqueOffers(found.urls, shops, config.country);
    const merged: SuggestedOffer[] = [];
    const seen = new Set<string>();
    for (const offer of [...fromJson, ...fromUrls]) {
      if (seen.has(offer.url)) continue;
      seen.add(offer.url);
      merged.push(offer);
      if (merged.length >= MAX_OFFERS) break;
    }
    return merged;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function collectUrlsFromUnknown(value: unknown, into: string[]) {
  if (typeof value === "string") {
    if (value.startsWith("http://") || value.startsWith("https://")) into.push(value);
    const matches = value.match(/https?:\/\/[^\s"'<>\\]+/g);
    if (matches) into.push(...matches);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsFromUnknown(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectUrlsFromUnknown(item, into);
    }
  }
}

export function collectJsonOffers(value: unknown, into: unknown[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonOffers(item, into);
    return;
  }
  const rec = value as Record<string, unknown>;
  if (Array.isArray(rec.offers)) into.push(...rec.offers);
  if (typeof rec.text === "string") {
    const parsed = extractJson(rec.text) as { offers?: unknown } | null;
    if (Array.isArray(parsed?.offers)) into.push(...parsed.offers);
  }
  if (typeof rec.delta === "string") {
    const parsed = extractJson(rec.delta) as { offers?: unknown } | null;
    if (Array.isArray(parsed?.offers)) into.push(...parsed.offers);
  }
}

export async function collectSearchUrls(
  response: Response,
): Promise<{ urls: string[]; jsonOffers: unknown[] }> {
  const urls: string[] = [];
  const jsonOffers: unknown[] = [];
  const reader = response.body?.getReader();
  if (!reader) return { urls, jsonOffers };
  const decoder = new TextDecoder();
  let buffer = "";
  const enough = () => new Set(urls.filter((url) => isProductUrl(url))).size >= MAX_OFFERS;
  const stop = async () => {
    await reader.cancel().catch(() => undefined);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      while (buffer.includes("\n\n")) {
        const sep = buffer.indexOf("\n\n");
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const payload = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!payload) continue;
        if (payload === "[DONE]") {
          await stop();
          return { urls: [...new Set(urls)], jsonOffers };
        }
        try {
          const event = JSON.parse(payload) as unknown;
          collectUrlsFromUnknown(event, urls);
          collectJsonOffers(event, jsonOffers);
        } catch {
          /* partial SSE frame */
        }
        if (enough()) {
          await stop();
          return { urls: [...new Set(urls)], jsonOffers };
        }
      }
    }
  } catch {
    /* abort / timeout — return what we have */
  }
  return { urls: [...new Set(urls)], jsonOffers };
}
