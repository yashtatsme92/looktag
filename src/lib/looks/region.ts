/** Shop region: hosts, locale paths, and currency for catalog search. */

export const SEARCH_REGIONS = [
  { id: "DE", name: "Germany", currency: "EUR", language: "de" },
  { id: "AT", name: "Austria", currency: "EUR", language: "de" },
  { id: "CH", name: "Switzerland", currency: "CHF", language: "de" },
  { id: "NL", name: "Netherlands", currency: "EUR", language: "nl" },
  { id: "BE", name: "Belgium", currency: "EUR", language: "nl" },
  { id: "FR", name: "France", currency: "EUR", language: "fr" },
  { id: "IT", name: "Italy", currency: "EUR", language: "it" },
  { id: "ES", name: "Spain", currency: "EUR", language: "es" },
  { id: "PL", name: "Poland", currency: "PLN", language: "pl" },
  { id: "SE", name: "Sweden", currency: "SEK", language: "sv" },
  { id: "GB", name: "United Kingdom", currency: "GBP", language: "en" },
  { id: "US", name: "United States", currency: "USD", language: "en" },
] as const;

export type SearchRegion = (typeof SEARCH_REGIONS)[number];

const HOST_BY_COUNTRY: Record<string, Partial<Record<string, string>>> = {
  zalando: {
    DE: "zalando.de",
    AT: "zalando.at",
    CH: "zalando.ch",
    NL: "zalando.nl",
    FR: "zalando.fr",
    IT: "zalando.it",
    ES: "zalando.es",
    GB: "zalando.co.uk",
    BE: "zalando.be",
    PL: "zalando.pl",
    SE: "zalando.de",
    US: "zalando.com",
  },
  amazon: {
    DE: "amazon.de",
    AT: "amazon.de",
    CH: "amazon.de",
    NL: "amazon.nl",
    FR: "amazon.fr",
    IT: "amazon.it",
    ES: "amazon.es",
    GB: "amazon.co.uk",
    BE: "amazon.com.be",
    PL: "amazon.pl",
    SE: "amazon.se",
    US: "amazon.com",
  },
  aboutyou: {
    DE: "aboutyou.de",
    AT: "aboutyou.de",
    CH: "aboutyou.de",
    NL: "aboutyou.nl",
    FR: "aboutyou.fr",
    BE: "aboutyou.be",
    PL: "aboutyou.pl",
  },
};

const US_ONLY = new Set([
  "nordstrom",
  "shopbop",
  "revolve",
  "aritzia",
  "reformation",
  "everlane",
  "madewell",
  "jcrew",
  "saks",
]);

const DACH_ONLY = new Set(["otto", "breuninger"]);

const HOST_HINTS: [string, string][] = [
  ["zalando.", "zalando"],
  ["aboutyou.", "aboutyou"],
  ["amazon.", "amazon"],
  ["zara.com", "zara"],
  ["hm.com", "hm"],
  ["cos.com", "cos"],
  ["arket.com", "arket"],
  ["stories.com", "stories"],
  ["massimodutti.com", "massimodutti"],
  ["mango.com", "mango"],
  ["uniqlo.com", "uniqlo"],
  ["asos.com", "asos"],
  ["sezane.com", "sezane"],
  ["otto.de", "otto"],
  ["breuninger.com", "breuninger"],
  ["nordstrom.com", "nordstrom"],
  ["shopbop.com", "shopbop"],
  ["revolve.com", "revolve"],
  ["aritzia.com", "aritzia"],
  ["thereformation.com", "reformation"],
  ["everlane.com", "everlane"],
  ["madewell.com", "madewell"],
  ["jcrew.com", "jcrew"],
  ["saksfifthavenue.com", "saks"],
  ["saks.com", "saks"],
];

export function resolveRegion(code: string | undefined): SearchRegion {
  const id = (code || "DE").trim().toUpperCase();
  return SEARCH_REGIONS.find((row) => row.id === id) ?? SEARCH_REGIONS[0];
}

export function shopIdFromHost(host: string): string | undefined {
  const name = host.replace(/^www\d?\./, "").toLowerCase();
  return HOST_HINTS.find(([hint]) => name.includes(hint))?.[1];
}

export function shopServesRegion(shopId: string, country: string): boolean {
  const cc = country.toUpperCase();
  if (US_ONLY.has(shopId)) return cc === "US" || cc === "CA";
  if (DACH_ONLY.has(shopId)) return cc === "DE" || cc === "AT" || cc === "CH";
  return true;
}

export function preferredHost(
  shop: { id: string; domains: string[] },
  country: string,
): string | undefined {
  const cc = country.toUpperCase();
  const mapped = HOST_BY_COUNTRY[shop.id]?.[cc];
  if (mapped) return mapped;
  const lower = cc.toLowerCase();
  const tld = shop.domains.find(
    (domain) => domain.endsWith(`.${lower}`) || domain.endsWith(`.co.${lower}`),
  );
  return tld ?? shop.domains[0];
}

export function localizeProductUrl(raw: string, country: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  const region = resolveRegion(country);
  const host = url.hostname.replace(/^www\d?\./, "").toLowerCase();
  const shopId = shopIdFromHost(host);
  const prefix = url.hostname.match(/^(www\d?)\./i)?.[1];

  if (shopId) {
    const preferred = preferredHost({ id: shopId, domains: [host] }, region.id);
    if (preferred && host !== preferred) {
      url.hostname = prefix ? `${prefix}.${preferred}` : preferred;
    }
  }

  rewriteLocalePath(url, shopId, region);
  return url.toString();
}

export function urlMatchesRegion(raw: string, country: string): boolean {
  const region = resolveRegion(country);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\d?\./, "").toLowerCase();
  const shopId = shopIdFromHost(host);
  if (shopId && !shopServesRegion(shopId, region.id)) return false;

  const cc = region.id.toLowerCase();
  const lang = region.language;

  if (host.startsWith("zalando.")) {
    return host === (HOST_BY_COUNTRY.zalando[region.id] ?? "zalando.de");
  }
  if (host.startsWith("amazon.")) {
    const preferred = HOST_BY_COUNTRY.amazon[region.id];
    return !preferred || host === preferred;
  }
  if (host.includes("zara.com") || host.includes("massimodutti.com")) {
    return url.pathname.toLowerCase().startsWith(`/${cc}/`);
  }
  if (host.includes("hm.com")) {
    return new RegExp(`/${lang}_${cc}/`, "i").test(url.pathname);
  }
  if (host.includes("uniqlo.com")) {
    return url.pathname.toLowerCase().startsWith(`/${cc}/`);
  }
  if (host.includes("cos.com") || host.includes("arket.com") || host.includes("stories.com")) {
    return new RegExp(`/(en|${lang})-${cc}/`, "i").test(url.pathname);
  }
  if (host.includes("asos.com") || host.includes("sezane.com") || host.includes("mango.com")) {
    if (/^\/[a-z]{2}(\/[a-z]{2})?\//i.test(url.pathname)) {
      return url.pathname.toLowerCase().startsWith(`/${cc}/`);
    }
  }
  return true;
}

function rewriteLocalePath(url: URL, shopId: string | undefined, region: SearchRegion) {
  const cc = region.id.toLowerCase();
  const lang = region.language;
  const path = url.pathname;

  if (shopId === "zara" || shopId === "massimodutti") {
    if (/^\/[a-z]{2}\/[a-z]{2}\//i.test(path)) {
      url.pathname = path.replace(/^\/[a-z]{2}\/[a-z]{2}\//i, `/${cc}/${lang}/`);
    }
    return;
  }
  if (shopId === "hm") {
    url.pathname = path.replace(/\/[a-z]{2}_[a-z]{2}\//i, `/${lang}_${cc}/`);
    return;
  }
  if (shopId === "uniqlo") {
    url.pathname = path.replace(
      /^\/(us|uk|eu|jp|au|kr|fr|de|it|es|nl|se|at|be|pl)\/[a-z]{2}\//i,
      `/${cc}/${lang}/`,
    );
    return;
  }
  if (shopId === "cos" || shopId === "arket" || shopId === "stories") {
    url.pathname = path.replace(/^\/[a-z]{2}-[a-z]{2,3}\//i, `/en-${cc}/`);
    return;
  }
  if (shopId === "mango") {
    if (/^\/[a-z]{2}(\/[a-z]{2})?\//i.test(path)) {
      url.pathname = path.replace(/^\/[a-z]{2}(\/[a-z]{2})?\//i, `/${cc}/${lang}/`);
    }
    return;
  }
  if (shopId === "asos") {
    if (/^\/[a-z]{2}\//i.test(path)) {
      url.pathname = path.replace(/^\/[a-z]{2}\//i, `/${cc}/`);
    }
    return;
  }
  if (shopId === "sezane") {
    const sezane = region.id === "GB" ? "en" : cc;
    url.pathname = path.replace(/^\/(us|uk|en|fr|de|it|es|nl)\//i, `/${sezane}/`);
  }
}
