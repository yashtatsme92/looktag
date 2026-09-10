/** Pull a product still from a shop page so search rows are not blank. */

const FETCH_MS = 2_400;

export function extractOgImage(html: string, pageUrl: string): string | undefined {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const abs = absolutize(match?.[1], pageUrl);
    if (abs) return abs;
  }
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of scripts) {
    try {
      const abs = absolutize(jsonLdImage(JSON.parse(block[1] ?? "")), pageUrl);
      if (abs) return abs;
    } catch {
      /* ignore broken JSON-LD */
    }
  }
  return undefined;
}

export function jsonLdImage(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === "string" && data.startsWith("http")) return data;
  if (Array.isArray(data)) {
    for (const row of data) {
      const found = jsonLdImage(row);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof data !== "object") return undefined;
  const rec = data as Record<string, unknown>;
  const image = rec.image;
  if (typeof image === "string") return image;
  if (Array.isArray(image) && typeof image[0] === "string") return image[0];
  if (image && typeof image === "object" && typeof (image as { url?: string }).url === "string") {
    return (image as { url: string }).url;
  }
  return jsonLdImage(rec["@graph"]);
}

export function absolutize(raw: string | undefined, pageUrl: string): string | undefined {
  const value = (raw ?? "").trim().replace(/&/g, "&");
  if (!value || value.startsWith("data:")) return undefined;
  try {
    const url = new URL(value, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function fetchProductImage(pageUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(pageUrl, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (!response.ok) return undefined;
    const html = await response.text();
    return extractOgImage(html.slice(0, 80_000), pageUrl);
  } catch {
    return undefined;
  }
}

export async function enrichOfferImages<T extends { url: string; imageUrl?: string }>(
  offers: T[],
): Promise<T[]> {
  const missing = offers.filter((offer) => !offer.imageUrl);
  if (missing.length === 0) return offers;
  const found = await Promise.all(
    missing.map(async (offer) => [offer.url, await fetchProductImage(offer.url)] as const),
  );
  const map = new Map(found.filter((row) => row[1]));
  if (map.size === 0) return offers;
  return offers.map((offer) =>
    offer.imageUrl ? offer : { ...offer, imageUrl: map.get(offer.url) },
  );
}
