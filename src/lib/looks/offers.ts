import { parsePrice } from "./format.ts";
import type { ProductOffer, ProductTag } from "./types.ts";

export type OfferSortMode = "default" | "price-asc" | "price-desc";

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

function asWornOffer(offers: ProductOffer[], wornUrl: string | undefined): ProductOffer | undefined {
  const worn = (wornUrl || "").trim();
  if (!worn) return undefined;
  return offers.find((offer) => offer.url.trim() === worn);
}

/** The offer for the piece as worn, else the first offer in creator order. */
export function primaryOffer(tag: ProductTag): ProductOffer | undefined {
  const offers = tagOffers(tag).filter((offer) => offer.url.trim());
  return asWornOffer(offers, tag.wornUrl) ?? offers[0];
}

/** Shop the piece as worn, else the first live page, else the tag link. */
export function visualShopTarget(
  tag: ProductTag,
): { url: string; retailerId: string } | undefined {
  const wornUrl = (tag.wornUrl || "").trim();
  if (wornUrl) return { url: wornUrl, retailerId: tag.wornRetailerId || tag.retailerId || "" };
  const offer = tagOffers(tag).find((row) => row.url.trim());
  if (offer?.url) return { url: offer.url, retailerId: offer.retailerId };
  const url = tag.url.trim();
  if (url) return { url, retailerId: tag.retailerId || "" };
  return undefined;
}

export function shopTarget(tag: ProductTag): { url: string; retailerId: string } | undefined {
  return visualShopTarget(tag);
}

/** Default keeps creator order with the as-worn offer first. Price sorts leave unpriced offers last. */
export function sortOffers(
  offers: ProductOffer[],
  mode: OfferSortMode = "default",
  wornUrl = "",
): ProductOffer[] {
  const copy = [...offers];
  if (mode === "default") {
    const worn = wornUrl.trim();
    if (!worn) return copy;
    const index = copy.findIndex((offer) => offer.url.trim() === worn);
    if (index <= 0) return copy;
    const [match] = copy.splice(index, 1);
    return match ? [match, ...copy] : copy;
  }
  return copy.sort((a, b) => {
    const pa = parsePrice(a.price);
    const pb = parsePrice(b.price);
    const aMissing = pa <= 0;
    const bMissing = pb <= 0;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return mode === "price-asc" ? pa - pb : pb - pa;
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
  const primary = asWornOffer(offers, wornUrl) ?? offers[0];
  return {
    ...tag,
    offers,
    wornUrl,
    wornRetailerId,
    url: primary?.url || wornUrl || "",
    price: primary?.price ?? "",
    currency: primary?.currency ?? tag.currency ?? "EUR",
    retailerId: primary?.retailerId || wornRetailerId || "",
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
