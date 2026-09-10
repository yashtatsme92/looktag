import { parsePrice } from "./format.ts";
import type { ProductOffer, ProductTag } from "./types.ts";

export function tagOffers(tag: ProductTag): ProductOffer[] {
  if (tag.offers && tag.offers.length > 0) return tag.offers;
  return [];
}

export function wornLink(tag: ProductTag): { url: string; retailerId: string } | undefined {
  const url = (tag.wornUrl || "").trim();
  if (url) return { url, retailerId: tag.wornRetailerId || tag.retailerId || "" };
  if (tagOffers(tag).length > 0) return undefined;
  if (tag.url) return { url: tag.url, retailerId: tag.retailerId || "" };
  return undefined;
}

export function cheapestOffer(tag: ProductTag): ProductOffer | undefined {
  return cheapestFrom(tagOffers(tag));
}

export function shopTarget(tag: ProductTag): { url: string; retailerId: string; cheapest: boolean } | undefined {
  const cheap = cheapestOffer(tag);
  if (cheap?.url) return { url: cheap.url, retailerId: cheap.retailerId, cheapest: tagOffers(tag).length > 1 };
  const worn = wornLink(tag);
  if (worn?.url) return { url: worn.url, retailerId: worn.retailerId, cheapest: false };
  return undefined;
}

export function cheapestFrom(offers: ProductOffer[]): ProductOffer | undefined {
  const priced = offers.filter((offer) => parsePrice(offer.price) > 0);
  if (priced.length === 0) return offers[0];
  const eur = priced.filter((offer) => (offer.currency || "EUR") === "EUR");
  const pool = eur.length > 0 ? eur : priced;
  return pool.reduce((best, offer) =>
    parsePrice(offer.price) < parsePrice(best.price) ? offer : best,
  );
}

export function sortedOffers(tag: ProductTag): ProductOffer[] {
  const offers = tagOffers(tag);
  return [...offers].sort((a, b) => {
    const pa = parsePrice(a.price);
    const pb = parsePrice(b.price);
    if (pa === 0 && pb === 0) return 0;
    if (pa === 0) return 1;
    if (pb === 0) return -1;
    return pa - pb;
  });
}

export function syncTag(tag: ProductTag): ProductTag {
  const offers = tagOffers(tag)
    .map((offer) => ({
      ...offer,
      id: offer.id || crypto.randomUUID(),
      currency: offer.currency || "EUR",
      imageUrl: offer.imageUrl,
    }))
    .filter((offer) => offer.url.trim());
  const wornUrl = (tag.wornUrl || "").trim() || (offers.length === 0 ? tag.url : "");
  const wornRetailerId = tag.wornRetailerId || (wornUrl ? tag.retailerId : "");
  const cheap = cheapestFrom(offers);
  return {
    ...tag,
    offers,
    wornUrl,
    wornRetailerId,
    url: cheap?.url || wornUrl || "",
    price: cheap?.price ?? "",
    currency: cheap?.currency ?? "EUR",
    retailerId: cheap?.retailerId || wornRetailerId || "",
  };
}

export function normalizeLookTags<T extends { tags: ProductTag[] }>(look: T): T {
  return {
    ...look,
    tags: look.tags.map((tag) => syncTag(tag)),
  };
}

export function replaceOffers(tag: ProductTag, offers: ProductOffer[]): ProductTag {
  return syncTag({ ...tag, offers });
}

export function replaceSystemOffers(tag: ProductTag, incoming: ProductOffer[]): ProductTag {
  return replaceOffers(tag, incoming.filter((offer) => offer.url.trim()));
}

export function removeOffer(tag: ProductTag, offerId: string): ProductTag {
  return replaceOffers(
    tag,
    tagOffers(tag).filter((offer) => offer.id !== offerId),
  );
}

export function setWornUrl(tag: ProductTag, url: string, retailerId: string): ProductTag {
  return syncTag({ ...tag, wornUrl: url, wornRetailerId: retailerId });
}
