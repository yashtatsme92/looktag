import { createServerFn } from "@tanstack/react-start";
import { withSpan } from "@/lib/observability/instrument";
import type { SearchEngineId } from "@/lib/looks/catalog";
import { detectRetailer, isProductUrl, pickSearchDomains, type Retailer } from "@/lib/looks/retailers";
import {
  localizeProductUrl,
  preferredHost,
  resolveRegion,
  shopServesRegion,
  urlMatchesRegion,
} from "@/lib/looks/region.ts";
import { enrichOfferImages } from "./product-image";

export type CatalogShop = {
  id: string;
  name: string;
  domains: string[];
};

export type SuggestSearchConfig = {
  engine: SearchEngineId;
  country: string;
  braveApiKey: string;
  googleApiKey: string;
  googleCx: string;
  retailers: CatalogShop[];
};

export type SuggestedOffer = {
  url: string;
  price: string;
  currency: string;
  retailerId: string;
  title: string;
  imageUrl?: string;
};

export type SuggestedPiece = {
  name: string;
  brand: string;
  x: number;
  y: number;
  offers: SuggestedOffer[];
};

type VisionItem = {
  name: string;
  brand: string;
  x: number;
  y: number;
  searchQuery: string;
};

const MODEL = "grok-4.5";
const SEARCH_MODEL = "grok-4-fast-non-reasoning";
const MAX_ITEMS = 3;
const MAX_OFFERS = 4;
const SEARCH_TIMEOUT_MS = 16_000;

export const aiStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { available: Boolean(process.env.XAI_API_KEY) };
});

export const suggestPieces = createServerFn({ method: "POST" })
  .validator((input: { imageDataUrl: string; search: SuggestSearchConfig }) => input)
  .handler(async ({ data }) => {
    return withSpan(
      "looktag.search.suggest",
      async (span) => {
        span.setAttribute("looktag.search.engine", data.search.engine);
        span.setAttribute("looktag.search.country", (data.search.country || "DE").toUpperCase());
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) return { ok: false as const, error: "AI is not available in this environment." };
        const shops = data.search.retailers.filter((shop) => shop.domains.length > 0);
        if (shops.length === 0) {
          return { ok: false as const, error: "Turn on at least one shop in Catalog before searching." };
        }
        const image = clampImage(data.imageDataUrl);
        if (!image) return { ok: false as const, error: "That photo is too large to send." };

        const vision = await readLookPhoto(apiKey, image);
        if (!vision.ok) return vision;

        const pieces: SuggestedPiece[] = [];
        for (const item of vision.items.slice(0, MAX_ITEMS)) {
          const offers = await searchOffers(apiKey, item.searchQuery, data.search, shops);
          pieces.push({
            name: item.name,
            brand: item.brand,
            x: clampPercent(item.x),
            y: clampPercent(item.y),
            offers,
          });
        }
        span.setAttribute("looktag.search.pieces", pieces.length);
        span.setAttribute(
          "looktag.search.offers",
          pieces.reduce((sum, piece) => sum + piece.offers.length, 0),
        );
        span.setAttribute(
          "looktag.search.thumbs",
          pieces.reduce((sum, piece) => sum + piece.offers.filter((offer) => offer.imageUrl).length, 0),
        );
        return { ok: true as const, engine: data.search.engine, pieces };
      },
    );
  });

export const suggestShops = createServerFn({ method: "POST" })
  .validator((input: { query: string; search: SuggestSearchConfig }) => input)
  .handler(async ({ data }) => {
    return withSpan(
      "looktag.search.shops",
      async (span) => {
        span.setAttribute("looktag.search.engine", data.search.engine);
        span.setAttribute("looktag.search.country", (data.search.country || "DE").toUpperCase());
        const apiKey = process.env.XAI_API_KEY;
        const shops = data.search.retailers.filter((shop) => shop.domains.length > 0);
        if (shops.length === 0) {
          return { ok: false as const, error: "Turn on at least one shop in Catalog before searching." };
        }
        const query = data.query.trim();
        if (query.length < 2) return { ok: false as const, error: "Name the piece first." };
        if (data.search.engine === "xai" && !apiKey) {
          return { ok: false as const, error: "AI is not available in this environment." };
        }
        if (data.search.engine === "brave" && !data.search.braveApiKey.trim()) {
          return { ok: false as const, error: "Add a Brave Search API key in Catalog." };
        }
        if (data.search.engine === "google" && (!data.search.googleApiKey.trim() || !data.search.googleCx.trim())) {
          return { ok: false as const, error: "Add a Google API key and search engine ID in Catalog." };
        }
        const offers = await searchOffers(apiKey ?? "", query, data.search, shops);
        span.setAttribute("looktag.search.offers", offers.length);
        span.setAttribute("looktag.search.thumbs", offers.filter((offer) => offer.imageUrl).length);
        if (offers.length === 0) {
          return { ok: false as const, error: "No item pages found in the shops that are turned on." };
        }
        return { ok: true as const, offers };
      },
    );
  });

export const searchPin = createServerFn({ method: "POST" })
  .validator(
    (input: {
      imageDataUrl?: string;
      x: number;
      y: number;
      hint: string;
      search: SuggestSearchConfig;
    }) => input,
  )
  .handler(async ({ data }) => {
    return withSpan(
      "looktag.search.pin",
      async (span) => {
        span.setAttribute("looktag.search.engine", data.search.engine);
        span.setAttribute("looktag.search.country", (data.search.country || "DE").toUpperCase());
        const apiKey = process.env.XAI_API_KEY;
        const shops = data.search.retailers.filter((shop) => shop.domains.length > 0);
        if (shops.length === 0) {
          return { ok: false as const, error: "Turn on at least one shop in Catalog before searching." };
        }
        const image = data.imageDataUrl ? clampImage(data.imageDataUrl) : null;
        const hint = data.hint.trim();
        let name = hint;
        let brand = "";
        let query = hint;
        const named = hint.length >= 2;

        if (!named && apiKey && image) {
          const identified = await identifyPin(apiKey, image, data.x, data.y, hint);
          if (identified.ok) {
            name = identified.item.name || name;
            brand = identified.item.brand;
            query = identified.item.searchQuery || [brand, name].filter(Boolean).join(" ");
          } else {
            return identified;
          }
        } else if (!named) {
          return {
            ok: false as const,
            error: "Name the piece — colour and garment — then search.",
          };
        }

        if (query.trim().length < 2) {
          return { ok: false as const, error: "Could not tell what is under that pin." };
        }

        const offers = await searchOffers(apiKey ?? "", query, data.search, shops);
        span.setAttribute("looktag.search.offers", offers.length);
        span.setAttribute("looktag.search.thumbs", offers.filter((offer) => offer.imageUrl).length);
        if (offers.length === 0) {
          return {
            ok: false as const,
            error: "No item pages in those shops. Try a more specific name, or paste the page you wore.",
          };
        }
        return { ok: true as const, name, brand, query, offers };
      },
    );
  });

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(92, Math.max(8, Math.round(value)));
}

function clampImage(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:image/")) return null;
  if (dataUrl.length > 3_500_000) return null;
  return dataUrl;
}

async function readLookPhoto(
  apiKey: string,
  imageDataUrl: string,
): Promise<{ ok: true; items: VisionItem[] } | { ok: false; error: string }> {
  const prompt = `You are tagging a fashion look photo so a shopper can buy each worn piece.
Return JSON only: {"items":[{"name":"","brand":"","x":0,"y":0,"searchQuery":""}]}
Rules:
- Identify 2 to ${MAX_ITEMS} garments or accessories actually worn in the photo (coat, knit, bag, shoes, trousers, jewellery). Skip background furniture.
- name: short product name in English. brand: best guess or "".
- x,y: percent position of that piece on the image, 8–92. Coat ≈ torso, knit ≈ chest, bag ≈ hand/shoulder, shoes ≈ lower legs.
- searchQuery: a Google-style query to buy that piece in Germany, including brand if known, colour, and garment type. No quotes.`;

  const result = await grokChat(apiKey, {
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  if (!result.ok) return result;
  const parsed = extractJson(result.text) as { items?: unknown } | null;
  const items = Array.isArray(parsed?.items)
    ? parsed.items
        .map((row) => asVisionItem(row))
        .filter((row): row is VisionItem => Boolean(row))
    : [];
  if (items.length === 0) {
    return { ok: false, error: "The photo did not yield any wearable pieces. Try a clearer full-body shot." };
  }
  return { ok: true, items };
}

async function identifyPin(
  apiKey: string,
  imageDataUrl: string,
  x: number,
  y: number,
  hint: string,
): Promise<{ ok: true; item: VisionItem } | { ok: false; error: string }> {
  const hintLine = hint
    ? `The wearer labelled it "${hint}". Use that if it matches what you see at the pin.`
    : "No label was given — identify only from the photo.";
  const prompt = `A pin was placed on a fashion look photo at x=${Math.round(x)}%, y=${Math.round(y)}% (origin top-left of the image).
Identify ONLY the garment or accessory under that pin. Ignore everything else.
${hintLine}
Return JSON only: {"name":"","brand":"","x":${Math.round(x)},"y":${Math.round(y)},"searchQuery":""}
Rules:
- name: short English product name. brand: best guess or "".
- searchQuery: a buy-query for Germany (brand, colour, garment). No quotes.
- Do not invent other pieces.`;

  const result = await grokChat(apiKey, {
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  if (!result.ok) return result;
  const parsed = extractJson(result.text);
  const item = asVisionItem(parsed);
  if (!item) {
    return { ok: false, error: "Could not tell what is under that pin. Try a name, then search again." };
  }
  return { ok: true, item };
}

function asVisionItem(row: unknown): VisionItem | null {
  if (!row || typeof row !== "object") return null;
  const item = row as Record<string, unknown>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return null;
  return {
    name: name.slice(0, 80),
    brand: typeof item.brand === "string" ? item.brand.trim().slice(0, 40) : "",
    x: typeof item.x === "number" ? item.x : Number(item.x) || 50,
    y: typeof item.y === "number" ? item.y : Number(item.y) || 50,
    searchQuery:
      typeof item.searchQuery === "string" && item.searchQuery.trim()
        ? item.searchQuery.trim().slice(0, 140)
        : name,
  };
}

async function searchOffers(
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

async function xaiProductSearch(
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

function collectUrlsFromUnknown(value: unknown, into: string[]) {
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

function collectJsonOffers(value: unknown, into: unknown[]) {
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

async function collectSearchUrls(
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

async function duckDuckGoSearch(
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

async function braveSearch(
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

async function googleSearch(
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

function uniqueOffers(urls: string[], shops: CatalogShop[], country: string): SuggestedOffer[] {
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

function asOffer(row: unknown, shops: CatalogShop[], country: string): SuggestedOffer | null {
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

function urlToOffer(
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

function regionalizeOffers(
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

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function priceFromText(text: string): string {
  const match = text.match(/(?:EUR|€)\s*(\d{1,5}(?:[.,]\d{1,2})?)|(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i);
  const raw = match?.[1] || match?.[2] || "";
  return raw.replace(",", ".");
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

async function grokChat(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; text: string; citations: string[] } | { ok: false; error: string }> {
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, ...body }),
    });
    if (!response.ok) {
      return { ok: false, error: `xAI API error ${response.status}` };
    }
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      citations?: string[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const citations = Array.isArray(json.citations) ? json.citations.filter((item) => typeof item === "string") : [];
    return { ok: true, text, citations };
  } catch {
    return { ok: false, error: "Could not reach Grok." };
  }
}
