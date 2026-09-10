import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { withSpan } from "@/lib/observability/instrument";
import {
  aiSearchCost,
  clampImageDataUrl,
  consumeAiSearchQuota,
  requireAiSearchUserId,
  type AiSearchKind,
} from "./limits";
import { searchOffers } from "./suggest-search";
import { clampPercent, identifyPin, readLookPhoto } from "./suggest-vision";
import type { SuggestedPiece, SuggestSearchConfig } from "./suggest-types";

export type {
  CatalogShop,
  SuggestSearchConfig,
  SuggestedOffer,
  SuggestedPiece,
} from "./suggest-types";

async function resolveClientIp(): Promise<string | undefined> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (!request) return undefined;
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    return request.headers.get("cf-connecting-ip")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function enforceAiSearchQuota(userId: string, kind: AiSearchKind): Promise<void> {
  const ip = await resolveClientIp();
  const cost = aiSearchCost(kind);
  consumeAiSearchQuota({ userId, ip, cost });
  console.info("[ai-search] metered", { kind, cost, userId, ip: ip ? "yes" : "no" });
}

export const aiStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { available: Boolean(process.env.XAI_API_KEY) };
});

export const suggestPieces = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { imageDataUrl: string; search: SuggestSearchConfig }) => input)
  .handler(async ({ data, context }) => {
    return withSpan(
      "looktag.search.suggest",
      async (span) => {
        const userId = requireAiSearchUserId(context.userId);
        await enforceAiSearchQuota(userId, "suggestPieces");
        span.setAttribute("looktag.search.engine", data.search.engine);
        span.setAttribute("looktag.search.country", (data.search.country || "DE").toUpperCase());
        span.setAttribute("looktag.search.user", userId);
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) return { ok: false as const, error: "AI is not available in this environment." };
        const shops = data.search.retailers.filter((shop) => shop.domains.length > 0);
        if (shops.length === 0) {
          return { ok: false as const, error: "Turn on at least one shop in Catalog before searching." };
        }
        const image = clampImageDataUrl(data.imageDataUrl);
        if (!image) {
          console.warn("[ai-search] rejected imageDataUrl", {
            userId,
            length: data.imageDataUrl?.length ?? 0,
          });
          return { ok: false as const, error: "That photo is too large to send." };
        }

        const vision = await readLookPhoto(apiKey, image);
        if (!vision.ok) return vision;

        const pieces: SuggestedPiece[] = [];
        for (const item of vision.items.slice(0, 3)) {
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
  .middleware([authMiddleware])
  .validator((input: { query: string; search: SuggestSearchConfig }) => input)
  .handler(async ({ data, context }) => {
    return withSpan(
      "looktag.search.shops",
      async (span) => {
        const userId = requireAiSearchUserId(context.userId);
        await enforceAiSearchQuota(userId, "suggestShops");
        span.setAttribute("looktag.search.engine", data.search.engine);
        span.setAttribute("looktag.search.country", (data.search.country || "DE").toUpperCase());
        span.setAttribute("looktag.search.user", userId);
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
  .middleware([authMiddleware])
  .validator(
    (input: {
      imageDataUrl?: string;
      x: number;
      y: number;
      hint: string;
      search: SuggestSearchConfig;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    return withSpan(
      "looktag.search.pin",
      async (span) => {
        const userId = requireAiSearchUserId(context.userId);
        await enforceAiSearchQuota(userId, "searchPin");
        span.setAttribute("looktag.search.engine", data.search.engine);
        span.setAttribute("looktag.search.country", (data.search.country || "DE").toUpperCase());
        span.setAttribute("looktag.search.user", userId);
        const apiKey = process.env.XAI_API_KEY;
        const shops = data.search.retailers.filter((shop) => shop.domains.length > 0);
        if (shops.length === 0) {
          return { ok: false as const, error: "Turn on at least one shop in Catalog before searching." };
        }
        const image = data.imageDataUrl ? clampImageDataUrl(data.imageDataUrl) : null;
        if (data.imageDataUrl && !image) {
          console.warn("[ai-search] rejected imageDataUrl", {
            userId,
            length: data.imageDataUrl.length,
          });
        }
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
