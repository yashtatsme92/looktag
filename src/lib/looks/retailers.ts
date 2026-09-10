import { preferredHost, shopServesRegion } from "./region.ts";

export type Retailer = {
  id: string;
  name: string;
  domains: string[];
};

export const RETAILERS: Retailer[] = [
  {
    id: "zalando",
    name: "Zalando",
    domains: [
      "zalando.de",
      "zalando.com",
      "zalando.co.uk",
      "zalando.fr",
      "zalando.nl",
      "zalando.it",
      "zalando.es",
      "zalando.at",
      "zalando.ch",
      "zalando.pl",
      "zalando.be",
    ],
  },
  { id: "aboutyou", name: "ABOUT YOU", domains: ["aboutyou.de", "aboutyou.com"] },
  { id: "otto", name: "Otto", domains: ["otto.de"] },
  { id: "breuninger", name: "Breuninger", domains: ["breuninger.com"] },
  { id: "zara", name: "Zara", domains: ["zara.com"] },
  { id: "hm", name: "H&M", domains: ["hm.com"] },
  { id: "cos", name: "COS", domains: ["cos.com"] },
  { id: "arket", name: "Arket", domains: ["arket.com"] },
  { id: "stories", name: "& Other Stories", domains: ["stories.com"] },
  { id: "massimodutti", name: "Massimo Dutti", domains: ["massimodutti.com"] },
  { id: "mango", name: "Mango", domains: ["mango.com", "shop.mango.com"] },
  { id: "uniqlo", name: "Uniqlo", domains: ["uniqlo.com"] },
  { id: "asos", name: "ASOS", domains: ["asos.com"] },
  { id: "nordstrom", name: "Nordstrom", domains: ["nordstrom.com"] },
  { id: "farfetch", name: "Farfetch", domains: ["farfetch.com"] },
  { id: "ssense", name: "SSENSE", domains: ["ssense.com"] },
  { id: "netaporter", name: "Net-a-Porter", domains: ["net-a-porter.com"] },
  { id: "mrporter", name: "Mr Porter", domains: ["mrporter.com"] },
  { id: "shopbop", name: "Shopbop", domains: ["shopbop.com"] },
  { id: "revolve", name: "Revolve", domains: ["revolve.com"] },
  { id: "aritzia", name: "Aritzia", domains: ["aritzia.com"] },
  { id: "reformation", name: "Reformation", domains: ["thereformation.com"] },
  { id: "sezane", name: "Sézane", domains: ["sezane.com"] },
  { id: "everlane", name: "Everlane", domains: ["everlane.com"] },
  { id: "madewell", name: "Madewell", domains: ["madewell.com"] },
  { id: "jcrew", name: "J.Crew", domains: ["jcrew.com"] },
  { id: "nike", name: "Nike", domains: ["nike.com"] },
  { id: "adidas", name: "Adidas", domains: ["adidas.com"] },
  { id: "toteme", name: "Toteme", domains: ["toteme.com"] },
  { id: "ganni", name: "Ganni", domains: ["ganni.com"] },
  { id: "mytheresa", name: "Mytheresa", domains: ["mytheresa.com"] },
  { id: "saks", name: "Saks", domains: ["saksfifthavenue.com", "saks.com"] },
  { id: "amazon", name: "Amazon", domains: ["amazon.de", "amazon.com", "amazon.co.uk"] },
  { id: "etsy", name: "Etsy", domains: ["etsy.com"] },
];

const SEARCH_DOMAIN_PRIORITY = [
  "zalando",
  "zara",
  "cos",
  "hm",
  "uniqlo",
  "arket",
  "stories",
  "massimodutti",
  "mango",
  "sezane",
];

export function shopPriorityScore(id: string): number {
  const index = SEARCH_DOMAIN_PRIORITY.indexOf(id);
  if (index < 0) return 0;
  return (SEARCH_DOMAIN_PRIORITY.length - index) * 4;
}

/** One host per shop, brand shops first, regional TLD when the catalog has one. xAI web_search allows at most 5 domains. */
export function pickSearchDomains(
  shops: { id: string; domains: string[] }[],
  country = "DE",
  limit = 5,
): string[] {
  const eligible = shops.filter((shop) => shopServesRegion(shop.id, country));
  const byId = new Map(eligible.map((shop) => [shop.id, shop]));
  const picked: string[] = [];
  const used = new Set<string>();
  const push = (shop: { id: string; domains: string[] } | undefined) => {
    if (!shop || picked.length >= limit) return;
    const host = preferredHost(shop, country)?.replace(/^www\./, "").toLowerCase();
    if (!host || used.has(host)) return;
    used.add(host);
    picked.push(host);
  };
  for (const id of SEARCH_DOMAIN_PRIORITY) push(byId.get(id));
  for (const shop of eligible) push(shop);
  return picked;
}

const HOMEISH_SEGMENTS = new Set([
  "women",
  "men",
  "kids",
  "home",
  "sale",
  "damen",
  "herren",
  "kinder",
  "login",
  "account",
  "cart",
  "wishlist",
  "search",
  "shop",
  "stores",
  "hilfe",
  "help",
  "customer-service",
]);

export function mergeRetailers(extra: Retailer[] = []): Retailer[] {
  const byId = new Map<string, Retailer>();
  for (const retailer of RETAILERS) byId.set(retailer.id, retailer);
  for (const retailer of extra) {
    const current = byId.get(retailer.id);
    byId.set(retailer.id, current ? { ...current, ...retailer, domains: retailer.domains } : retailer);
  }
  return [...byId.values()];
}

export function getRetailer(id: string | undefined, catalog: Retailer[] = RETAILERS): Retailer | undefined {
  if (!id) return undefined;
  return catalog.find((retailer) => retailer.id === id) ?? RETAILERS.find((retailer) => retailer.id === id);
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function detectRetailer(url: string, catalog: Retailer[] = RETAILERS): Retailer | undefined {
  const host = hostnameOf(url);
  if (!host) return undefined;
  const list = catalog.length ? catalog : RETAILERS;
  const found = list.find((retailer) =>
    retailer.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  );
  if (found) return found;
  return RETAILERS.find((retailer) =>
    retailer.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  );
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** True for an item page — rejects shop homepages and locale/category roots. */
export function isProductUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const segments = path.split("/").filter(Boolean);
    if (path === "/" || segments.length === 0) return false;
    if (segments.length === 1 && /^[a-z]{2}(-[a-z]{2})?$/i.test(segments[0])) return false;
    if (segments.length === 1 && HOMEISH_SEGMENTS.has(segments[0].toLowerCase())) return false;

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("zalando.")) {
      return /-[a-z0-9]{5,}-[a-z0-9]{3}\.html$/i.test(path);
    }
    if (host.includes("aboutyou.")) return /\/p\//i.test(path);
    if (host.includes("zara.com")) return /p\d+\.html/i.test(path);
    if (host.includes("hm.com")) return /productpage/i.test(path);
    if (host.includes("mango.com")) return /\/p\//i.test(path);
    if (host.includes("uniqlo.com")) return /\/products\//i.test(path);
    if (host.includes("amazon.")) return /\/(dp|gp\/product)\//i.test(path);
    if (host.includes("cos.com") || host.includes("arket.com") || host.includes("stories.com")) {
      return /\/product\//i.test(path);
    }
    if (host.includes("sezane.com")) return /\/product\//i.test(path);

    return true;
  } catch {
    return false;
  }
}

export function retailerLabel(
  tag: { retailerId: string; url: string },
  catalog: Retailer[] = RETAILERS,
): string {
  const named = getRetailer(tag.retailerId, catalog)?.name;
  if (named) return named;
  const detected = detectRetailer(tag.url, catalog)?.name;
  if (detected) return detected;
  const host = hostnameOf(tag.url);
  return host || "Shop";
}
