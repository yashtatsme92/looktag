import type { FashionCollection, FashionLabel } from "./labels/model.ts";
import type { Look, ProductTag } from "./looks/types.ts";
import { isSharePath } from "./pwa/boot.ts";

export { isSharePath };

const APP_NAME = "Looktag";

export type SharePageKind = "look" | "house" | "collection";

export function shareKindFromPath(pathname: string): SharePageKind | "app" {
  if (/^\/looks\/[^/]+$/.test(pathname)) return "look";
  if (/^\/houses\/[^/]+\/[^/]+$/.test(pathname)) return "collection";
  if (/^\/houses\/[^/]+$/.test(pathname)) return "house";
  return "app";
}

type HeaderReader = {
  url?: string;
  headers?: { get(name: string): string | null };
};

export function configuredOrigin(): string {
  if (typeof process === "undefined") return "";
  const env = process.env.APP_URL || process.env.PUBLIC_ORIGIN || process.env.VITE_APP_URL || "";
  return String(env).replace(/\/$/, "");
}

export function originFromRequestLike(input: HeaderReader): string {
  const forwardedHost = input.headers?.get("x-forwarded-host") ?? "";
  const headerHost = input.headers?.get("host") ?? "";
  const host = (forwardedHost || headerHost).split(",")[0].trim();
  const forwardedProto = (input.headers?.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  let proto = forwardedProto;
  if (!proto && input.url) {
    try {
      proto = new URL(input.url).protocol.replace(":", "");
    } catch {
      proto = "";
    }
  }
  if (!proto) {
    proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  }
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  if (input.url) {
    try {
      const url = new URL(input.url);
      return `${url.protocol}//${url.host}`.replace(/\/$/, "");
    } catch {
      return "";
    }
  }
  return "";
}

export function resolveOrigin(fallback = ""): string {
  const configured = configuredOrigin();
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return fallback;
}

export function absoluteUrl(path: string, origin = resolveOrigin()): string {
  if (!path) return origin;
  if (/^https?:\/\//i.test(path)) return path;
  if (!origin) return path.startsWith("/") ? path : `/${path}`;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isCrawler(userAgent: string): boolean {
  return /bot|crawler|spider|crawling|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|embedly|pinterest|googlebot|bingbot|applebot|preview|ia_archiver|semrush|ahrefs/i.test(
    userAgent,
  );
}

export type ShareSurface = "crawler" | "web" | "native";

/** Best-effort layout surface from a request UA (share loaders have no viewport). */
export function surfaceFromUserAgent(userAgent: string): ShareSurface {
  if (isCrawler(userAgent)) return "crawler";
  if (/iPad|Tablet|PlayBook/i.test(userAgent)) return "web";
  if (/Mobi|Android|iPhone|iPod|webOS|BlackBerry/i.test(userAgent)) return "native";
  return "web";
}

export function shareCacheHeaders(found: boolean): Record<string, string> {
  if (!found) {
    return {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    };
  }
  return {
    "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    "X-Robots-Tag": "index, follow",
    Vary: "Accept",
  };
}

export type ShareMeta = {
  kind: SharePageKind;
  title: string;
  description: string;
  canonical: string;
  image: string;
  jsonLd: Record<string, unknown>;
};

function productJsonLd(tag: ProductTag, position: number) {
  const price = String(tag.price || "").trim();
  const currency = String(tag.currency || "EUR");
  return {
    "@type": "ListItem",
    position,
    item: {
      "@type": "Product",
      name: tag.name || `Piece ${position}`,
      brand: tag.brand ? { "@type": "Brand", name: tag.brand } : undefined,
      url: tag.url || undefined,
      offers: tag.url
        ? {
            "@type": "Offer",
            url: tag.url,
            price: price || undefined,
            priceCurrency: currency,
            availability: "https://schema.org/InStock",
          }
        : undefined,
    },
  };
}

export function lookShareMeta(look: Look, origin = resolveOrigin()): ShareMeta {
  const canonical = absoluteUrl(`/looks/${look.id}`, origin);
  const image = absoluteUrl(look.imageSrc || "/og.jpg", origin);
  const description =
    look.caption.trim() || `Shop ${look.title} by ${look.creator} on ${APP_NAME}.`;
  const pieces = look.tags.map((tag, index) => productJsonLd(tag, index + 1));
  return {
    kind: "look",
    title: `${look.title} — ${APP_NAME}`,
    description,
    canonical,
    image,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemPage",
      name: look.title,
      description,
      url: canonical,
      image,
      author: { "@type": "Person", name: look.creator },
      isPartOf: { "@type": "WebSite", name: APP_NAME, url: origin || canonical },
      mainEntity: {
        "@type": "ItemList",
        name: look.title,
        numberOfItems: pieces.length,
        itemListElement: pieces,
      },
    },
  };
}

export function houseShareMeta(
  label: FashionLabel,
  origin = resolveOrigin(),
  imageSrc = "",
): ShareMeta {
  const canonical = absoluteUrl(`/houses/${label.id}`, origin);
  const description =
    label.bio.trim() || `${label.name} in ${label.city} — a fashion label on ${APP_NAME}.`;
  const title = label.scouted
    ? `${label.name} — Scouted on ${APP_NAME}`
    : `${label.name} — ${APP_NAME}`;
  const image = absoluteUrl(imageSrc || "/og.jpg", origin);
  return {
    kind: "house",
    title,
    description,
    canonical,
    image,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Brand",
      name: label.name,
      description,
      url: canonical,
      image,
      slogan: label.scouted ? "Scouted" : undefined,
      address: label.city ? { "@type": "PostalAddress", addressLocality: label.city } : undefined,
    },
  };
}

export function collectionShareMeta(
  label: FashionLabel,
  collection: FashionCollection,
  origin = resolveOrigin(),
  imageSrc = "",
): ShareMeta {
  const canonical = absoluteUrl(`/houses/${label.id}/${collection.slug}`, origin);
  const description =
    collection.caption.trim() ||
    `${collection.name} by ${label.name} — a collection on ${APP_NAME}.`;
  const title = `${collection.name} — ${label.name}`;
  const image = absoluteUrl(imageSrc || "/og.jpg", origin);
  return {
    kind: "collection",
    title,
    description,
    canonical,
    image,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: collection.name,
      description,
      url: canonical,
      image,
      isPartOf: {
        "@type": "Brand",
        name: label.name,
        url: absoluteUrl(`/houses/${label.id}`, origin),
      },
      about: collection.season || undefined,
    },
  };
}

export function notFoundShareHead(kind: SharePageKind) {
  const noun = kind === "house" ? "House" : kind === "collection" ? "Collection" : "Look";
  return {
    meta: [{ title: `${noun} not found — ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  };
}

export function shareHead(meta: ShareMeta) {
  const ogType = meta.kind === "house" ? "profile" : meta.kind === "collection" ? "website" : "article";
  return {
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      { name: "robots", content: "index,follow" },
      { name: "looktag:share", content: meta.kind },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:title", content: meta.title },
      { property: "og:description", content: meta.description },
      { property: "og:url", content: meta.canonical },
      { property: "og:type", content: ogType },
      { property: "og:image", content: meta.image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: meta.title },
      { name: "twitter:description", content: meta.description },
      { name: "twitter:image", content: meta.image },
    ],
    links: [{ rel: "canonical", href: meta.canonical }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(meta.jsonLd),
      },
    ],
  };
}
