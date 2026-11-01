/**
 * Footer links. The footer itself always renders; each link has its own
 * on/off switch and every link ships off.
 *
 * A link is on when Admin → Footer links turns it on (stored in
 * `looktag_settings.extras_json.footerLinks`) or when its id is listed in
 * `FOOTER_LINKS_ENABLED` (comma-separated, e.g. "privacy,contact").
 * Unknown ids are ignored with a warning that names only the id.
 * A link with no usable href (e.g. a social URL that is not configured) never renders.
 */

export const FOOTER_LINK_IDS = [
  "impressum",
  "privacy",
  "terms",
  "contact",
  "about",
  "instagram",
  "tiktok",
  "x",
  "domain",
] as const;

export type FooterLinkId = (typeof FOOTER_LINK_IDS)[number];

export type FooterLink = {
  id: FooterLinkId;
  label: string;
  href: string;
  enabled: boolean;
  external?: boolean;
};

export const DEFAULT_CONTACT_EMAIL = "hello@thelooktag.com";

type Env = Record<string, string | undefined>;

const envValue = (env: Env, key: string) => String(env[key] ?? "").trim();

export function isFooterLinkId(id: string): id is FooterLinkId {
  return (FOOTER_LINK_IDS as readonly string[]).includes(id);
}

/** Contact mailbox from CONTACT_EMAIL, default hello@thelooktag.com. */
export function contactEmail(env: Env = typeof process !== "undefined" ? process.env : {}): string {
  const value = envValue(env, "CONTACT_EMAIL");
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : DEFAULT_CONTACT_EMAIL;
}

/** Comma-separated ids → known ids (deduped, in input order). Unknown ids call `warn(id)`. */
export function parseFooterIds(
  raw: string | undefined | null,
  warn: (id: string) => void = (id) => console.warn(`[footer] unknown footer link id: ${id}`),
): FooterLinkId[] {
  const out: FooterLinkId[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const id = part.trim().toLowerCase();
    if (!id) continue;
    if (!isFooterLinkId(id)) {
      warn(id.replace(/[^\w.-]/g, "").slice(0, 40));
      continue;
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function hostLabel(appUrl: string): string {
  try {
    return new URL(appUrl).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safeHttpUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Every footer link with its href, all `enabled: false`. */
export function footerLinkCatalog(env: Env = typeof process !== "undefined" ? process.env : {}): FooterLink[] {
  const appUrl = envValue(env, "APP_URL").replace(/\/+$/, "");
  const email = contactEmail(env);
  return [
    { id: "impressum", label: "Impressum", href: "/impressum", enabled: false },
    { id: "privacy", label: "Privacy", href: "/privacy", enabled: false },
    { id: "terms", label: "Terms", href: "/terms", enabled: false },
    { id: "contact", label: "Contact", href: `mailto:${email}`, enabled: false, external: true },
    { id: "about", label: "About", href: "/about", enabled: false },
    { id: "instagram", label: "Instagram", href: safeHttpUrl(envValue(env, "FOOTER_INSTAGRAM_URL")), enabled: false, external: true },
    { id: "tiktok", label: "TikTok", href: safeHttpUrl(envValue(env, "FOOTER_TIKTOK_URL")), enabled: false, external: true },
    { id: "x", label: "X", href: safeHttpUrl(envValue(env, "FOOTER_X_URL")), enabled: false, external: true },
    { id: "domain", label: hostLabel(appUrl), href: appUrl ? `${appUrl}/` : "", enabled: false },
  ];
}

/**
 * Resolve the footer. `adminIds` come from Studio settings, `envIds` from
 * FOOTER_LINKS_ENABLED. Either one turns a link on. Returns every link with
 * its `enabled` flag; use `visibleFooterLinks` for what to render.
 */
export function resolveFooterLinks({
  adminIds = "",
  env = typeof process !== "undefined" ? process.env : {},
  warn,
}: {
  adminIds?: string;
  env?: Env;
  warn?: (id: string) => void;
} = {}): FooterLink[] {
  const on = new Set<FooterLinkId>([
    ...parseFooterIds(adminIds, warn),
    ...parseFooterIds(env.FOOTER_LINKS_ENABLED, warn),
  ]);
  return footerLinkCatalog(env).map((link) => ({ ...link, enabled: on.has(link.id) }));
}

/** Only links that are on and have a non-empty label and a real href. */
export function visibleFooterLinks(links: readonly FooterLink[]): FooterLink[] {
  return links.filter(
    (link) => link.enabled && link.label.trim() && link.href.trim() && link.href.trim() !== "#",
  );
}

export const FOOTER_LINK_LABELS: Record<FooterLinkId, string> = {
  impressum: "Impressum",
  privacy: "Privacy",
  terms: "Terms",
  contact: "Contact",
  about: "About",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  domain: "Domain label",
};

/** Toggle one id inside a comma-separated admin value. */
export function toggleFooterId(current: string, id: FooterLinkId, on: boolean): string {
  const ids = parseFooterIds(current, () => {}).filter((x) => x !== id);
  if (on) ids.push(id);
  return FOOTER_LINK_IDS.filter((x) => ids.includes(x)).join(",");
}
