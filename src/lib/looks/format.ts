function numericPrice(price: string): number | null {
  const cleaned = price.replace(/[^0-9.,]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function formatMoney(price: string, currency = "EUR"): string {
  const n = numericPrice(price);
  if (n === null) return price.trim() || "—";
  const code = currency || "EUR";
  const locale = code === "EUR" ? "de-DE" : code === "GBP" ? "en-GB" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${cleanedFallback(n)} ${code}`;
  }
}

function cleanedFallback(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export function parsePrice(price: string): number {
  return numericPrice(price) ?? 0;
}

type SystemPriced = { price: string; currency?: string };

function cheapestSystem(tag: { price: string; currency?: string; offers?: SystemPriced[] }): SystemPriced {
  const offers = tag.offers ?? [];
  const priced = offers.filter((offer) => parsePrice(offer.price) > 0);
  if (priced.length === 0) return { price: "", currency: tag.currency };
  const eur = priced.filter((offer) => (offer.currency || "EUR") === "EUR");
  const pool = eur.length > 0 ? eur : priced;
  return pool.reduce((best, offer) => (parsePrice(offer.price) < parsePrice(best.price) ? offer : best));
}

export function lookTotal(tags: { price: string; currency?: string; offers?: SystemPriced[] }[]): number {
  return tags.reduce((sum, tag) => sum + parsePrice(cheapestSystem(tag).price), 0);
}

export function lookCurrency(tags: { currency: string; offers?: SystemPriced[] }[]): string {
  const firstOffer = tags.find((tag) => tag.offers?.some((offer) => offer.currency))?.offers?.find(
    (offer) => offer.currency,
  );
  if (firstOffer?.currency) return firstOffer.currency;
  return tags.find((tag) => tag.currency)?.currency || "EUR";
}

/** Soft price band for plate captions — not a checkout total. */
export function lookPriceBand(
  tags: { price: string; currency?: string; offers?: SystemPriced[] }[],
): string | null {
  const total = lookTotal(tags);
  if (total <= 0) return null;
  const currency = lookCurrency(
    tags.map((tag) => ({ currency: tag.currency || "EUR", offers: tag.offers })),
  );
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "USD" ? "$" : `${currency} `;
  if (total < 100) return `under ${symbol}100`;
  if (total < 250) return `${symbol}100–${symbol}250`;
  if (total < 500) return `${symbol}250–${symbol}500`;
  return `${symbol}500+`;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(ts);
}
