import type { Attributes } from "./model.ts";
import { sanitizeAttributes } from "./model.ts";

const TEMPLATES = [
  "/houses/$labelId/$collectionId/$styleId",
  "/houses/$labelId/$collectionId",
  "/looks/$lookId/edit",
  "/houses/$labelId",
  "/looks/$lookId",
  "/creators/$userId",
  "/api/auth/$",
  "/houses/apply",
  "/admin/observability",
  "/admin/houses",
  "/admin/shops",
  "/admin/studio",
  "/admin/feed",
  "/admin/look",
  "/api/v1/me",
  "/api/version",
  "/robots.txt",
  "/sitemap.xml",
  "/houses",
  "/admin",
  "/create",
  "/design",
  "/house",
  "/login",
  "/rank",
  "/",
];

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matches(pathname: string, template: string): boolean {
  if (template === "/") return pathname === "/";
  const path = segments(pathname);
  const tmpl = segments(template);
  if (tmpl.at(-1) === "$") {
    if (path.length < tmpl.length - 1) return false;
    return tmpl.slice(0, -1).every((seg, index) => seg.startsWith("$") || seg === path[index]);
  }
  if (path.length !== tmpl.length) return false;
  return tmpl.every((seg, index) => seg.startsWith("$") || seg === path[index]);
}

function fallbackTemplate(pathname: string): string {
  const next = segments(pathname).map((seg) => {
    if (/^\d+$/.test(seg) || /^[0-9a-f-]{8,}$/i.test(seg) || seg.length > 24) return "$id";
    return seg;
  });
  return `/${next.join("/")}`;
}

/** Route pattern, never the raw id. `/looks/abc` becomes `/looks/$lookId`. */
export function routeTemplate(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path.startsWith("/_serverFn/")) return "/_serverFn/$name";
  const found = TEMPLATES.find((template) => matches(path, template));
  return found ?? fallbackTemplate(path);
}

/** Server function name without the generated suffix. Empty for document routes. */
export function serverFnName(pathname: string): string {
  if (!pathname.startsWith("/_serverFn/")) return "";
  const raw = pathname.split("/")[2] ?? "";
  const name = decodeURIComponent(raw).replace(/_createServerFn_handler$/, "");
  return name.slice(0, 80);
}

export function featureFromRoute(route: string, serverFn = ""): string {
  const hay = `${route} ${serverFn}`.toLowerCase();
  if (hay.includes("admin")) return "admin";
  if (hay.includes("auth") || hay.includes("login") || hay.includes("sign-in") || hay.includes("signin")) {
    return "auth";
  }
  if (hay.includes("shop") || hay.includes("suggest") || hay.includes("pin")) return "shop";
  if (hay.includes("house") || hay.includes("label") || hay.includes("collection") || hay.includes("style")) {
    return "houses";
  }
  if (hay.includes("look")) return "looks";
  return "app";
}

const SESSION_COOKIE = "__Host-grok-auth.session_token=";

/** anonymous or signed_in. The cookie value is not an attribute. */
export function authStateFromCookie(cookie: string | null | undefined): "anonymous" | "signed_in" {
  if (!cookie) return "anonymous";
  return cookie.split(/;\s*/).some((part) => part.startsWith(SESSION_COOKIE)) ? "signed_in" : "anonymous";
}

export function localeFromHeader(header: string | null | undefined): string {
  const tag = header?.split(",")[0]?.split(";")[0]?.trim() ?? "";
  if (!/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(tag)) return "und";
  return tag.slice(0, 35);
}

export function requestIdFromHeader(header: string | null | undefined, generated: string): string {
  if (header && /^[A-Za-z0-9_-]{8,64}$/.test(header)) return header;
  return generated;
}

/**
 * Application attributes. Identity fields on the input are ignored so a caller
 * cannot attach a user id, email, cookie, or body.
 */
export function appSpanAttributes(input: {
  route: string;
  serverFn?: string;
  authState: "anonymous" | "signed_in";
  locale: string;
  requestId: string;
  flags?: Record<string, boolean>;
  userId?: string;
  email?: string;
  cookie?: string;
  body?: string;
}): Attributes {
  const feature = featureFromRoute(input.route, input.serverFn);
  const attrs: Attributes = {
    "app.route": input.route.slice(0, 160),
    "app.feature": feature,
    "app.auth.state": input.authState,
    "app.locale": input.locale,
    "app.request_id": input.requestId.slice(0, 64),
  };
  if (input.serverFn) attrs["app.server_fn"] = input.serverFn.slice(0, 80);
  for (const [key, value] of Object.entries(input.flags ?? {})) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) continue;
    attrs[`app.flag.${key}`] = Boolean(value);
  }
  return sanitizeAttributes(attrs);
}
