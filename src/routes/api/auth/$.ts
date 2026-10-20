import { randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { crossSiteResponse, rejectExpoProxy } from "@/lib/auth/expo-proxy";
import { bearerFromHeaders, bearerOnlyHeaders, isRegisteredLooktagCallback } from "@/lib/auth/native";
import {
  isStrongNativeNonce,
  looktagProxyLocation,
  nonceEquals,
  withNonceOnLooktag,
} from "@/lib/auth/native-callback";
import { allowNativeNonceIssue, nativeNonceClientKey, nativeNonceIdentifier } from "@/lib/auth/native-nonce";
import { auth } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

function isJsonContentType(header: string | null): boolean {
  if (!header) return false;
  return header.split(";")[0]?.trim().toLowerCase() === "application/json";
}

function foreignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return origin === "null";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return true;
  }
  if (parsed.protocol === "looktag:") return false;
  return parsed.origin !== new URL(request.url).origin;
}

async function deleteExpiredNonces(): Promise<void> {
  const sql = await getSql();
  await sql`delete from verification where identifier like ${"native-nonce:%"} and "expiresAt" <= now()`;
}

async function nonceInUse(nonce: string): Promise<boolean> {
  const sql = await getSql();
  const ident = nativeNonceIdentifier(nonce);
  const rows = await sql<{ identifier: string }>`
    select identifier from verification where identifier = ${ident} and "expiresAt" > now() limit 1
  `;
  return rows.length > 0;
}

async function registerNonce(nonce: string, state: string): Promise<void> {
  const sql = await getSql();
  const ident = nativeNonceIdentifier(nonce);
  const id = randomBytes(16).toString("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await sql`delete from verification where identifier = ${ident} and "expiresAt" <= now()`;
  await sql`
    insert into verification (id, identifier, value, "expiresAt")
    values (${id}, ${ident}, ${state}, ${expires})
  `;
}

/** Delete the one-time row. A replay, or a nonce that was never registered, returns false. */
async function consumeNonce(nonce: string): Promise<boolean> {
  const sql = await getSql();
  const ident = nativeNonceIdentifier(nonce);
  const rows = await sql<{ identifier: string }>`
    delete from verification
    where identifier = ${ident} and "expiresAt" > now()
    returning identifier
  `;
  return rows.length > 0;
}

async function readVerification(identifier: string): Promise<Record<string, unknown> | null> {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`
    select value from verification where identifier = ${identifier} limit 1
  `;
  const raw = rows[0]?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function appNonceForState(state: string | null): Promise<string | null> {
  if (!state) return null;
  const parsed = await readVerification(state);
  const nonce = parsed?.appNonce;
  return typeof nonce === "string" && isStrongNativeNonce(nonce) ? nonce : null;
}

async function storedCallbackIsLooktag(authorizationURL: string): Promise<boolean> {
  let state: string | null = null;
  try {
    state = new URL(authorizationURL).searchParams.get("state");
  } catch {
    return false;
  }
  if (!state) return false;
  const parsed = await readVerification(state);
  return typeof parsed?.callbackURL === "string" && isRegisteredLooktagCallback(parsed.callbackURL);
}

async function storeAppNonce(state: string, nonce: string): Promise<boolean> {
  const parsed = await readVerification(state);
  if (!parsed) return false;
  parsed.appNonce = nonce;
  const sql = await getSql();
  const rows = await sql<{ identifier: string }>`
    update verification set value = ${JSON.stringify(parsed)} where identifier = ${state} returning identifier
  `;
  return rows.length > 0;
}

function withJsonBody(request: Request, body: unknown): Request {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

/**
 * A looktag sign-in must carry the app's nonce in the same fetch that creates
 * the OAuth state. The browser that later opens the proxy does not have this
 * fetch's cookie jar, so the nonce is stored on the state, not in a cookie.
 * Returns null when this is an ordinary web sign-in and should pass through.
 */
async function prepareNativeSignIn(
  request: Request,
): Promise<Response | { request: Request; nonce: string } | null> {
  const raw = await request.clone().text();
  const contentType = request.headers.get("content-type");
  let body: Record<string, unknown> | null = null;
  if (isJsonContentType(contentType)) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  const callback = typeof body?.callbackURL === "string" ? body.callbackURL : "";
  const wantsNative = isRegisteredLooktagCallback(callback) || (!body && raw.includes("looktag://"));
  if (!wantsNative) return null;
  if (!body) return new Response("Invalid nonce", { status: 400 });

  if (foreignOrigin(request)) return new Response("Forbidden", { status: 403 });
  const blocked = crossSiteResponse(request);
  if (blocked) return blocked;
  if (!allowNativeNonceIssue(nativeNonceClientKey(request))) {
    return new Response("Too many requests", { status: 429 });
  }

  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  if (!isStrongNativeNonce(nonce)) return new Response("Invalid nonce", { status: 400 });
  await deleteExpiredNonces();
  if (await nonceInUse(nonce)) return new Response("Invalid nonce", { status: 400 });

  const forwarded: Record<string, unknown> = {};
  for (const key of [
    "provider",
    "callbackURL",
    "errorCallbackURL",
    "newUserCallbackURL",
    "disableRedirect",
    "scopes",
    "requestSignUp",
    "loginHint",
    "idToken",
  ]) {
    if (key in body) forwarded[key] = body[key];
  }
  forwarded.additionalData = { appNonce: nonce };
  return { request: withJsonBody(request, forwarded), nonce };
}

async function issuedAuthorizeUrl(response: Response): Promise<string | null> {
  const location = response.headers.get("location");
  if (location) return location;
  try {
    const data = (await response.clone().json()) as { url?: unknown };
    return typeof data.url === "string" ? data.url : null;
  } catch {
    return null;
  }
}

async function bindNonce(response: Response, nonce: string): Promise<Response | null> {
  const authorize = await issuedAuthorizeUrl(response);
  if (!authorize) return null;
  let state: string | null = null;
  try {
    state = new URL(authorize).searchParams.get("state");
  } catch {
    return null;
  }
  if (!state) return null;
  await registerNonce(nonce, state);
  if (!(await storeAppNonce(state, nonce))) return null;
  return response;
}

async function openNativeAttempt(
  authorizationURL: string,
  nonce: string,
): Promise<{ ok: true; nonce: string } | { ok: false; response: Response }> {
  const fail = () => ({ ok: false as const, response: new Response("Invalid authorizationURL", { status: 400 }) });
  if (!isStrongNativeNonce(nonce)) return fail();
  let target: URL;
  try {
    target = new URL(authorizationURL);
  } catch {
    return fail();
  }

  if (target.protocol === "looktag:") {
    if (!isRegisteredLooktagCallback(authorizationURL)) return fail();
  } else {
    const stored = await appNonceForState(target.searchParams.get("state"));
    if (!stored || !nonceEquals(stored, nonce)) return fail();
    if (!(await storedCallbackIsLooktag(authorizationURL))) return fail();
  }

  if (!(await consumeNonce(nonce))) return fail();
  return { ok: true, nonce };
}

function stampLooktagNonce(response: Response, nonce: string): Response {
  const location = response.headers.get("location");
  if (!location || !isRegisteredLooktagCallback(location)) return response;
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" || key.toLowerCase() === "location") return;
    headers.append(key, value);
  });
  for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
  headers.set("location", withNonceOnLooktag(location, nonce));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** A native callback's session rides the deep link, not a web Set-Cookie. */
function stripSetCookies(response: Response): Response {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers.append(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Bearer-token requests authenticate by token only — never fall back to cookies. */
async function handle(request: Request) {
  const url = new URL(request.url);

  let requestForAuth = request;
  let issuedNonce: string | null = null;
  if (request.method === "POST" && url.pathname.endsWith("/sign-in/social")) {
    const prepared = await prepareNativeSignIn(request);
    if (prepared instanceof Response) return prepared;
    if (prepared) {
      requestForAuth = prepared.request;
      issuedNonce = prepared.nonce;
    }
  }

  const decision = rejectExpoProxy(request);
  const proxy = url.pathname.endsWith("/expo-authorization-proxy");

  if (proxy && (decision === null || decision?.status === 302)) {
    const authorizationURL =
      decision?.status === 302
        ? (decision.headers.get("location") ?? "")
        : (url.searchParams.get("authorizationURL") ?? "");
    const opened = await openNativeAttempt(authorizationURL, url.searchParams.get("nonce") ?? "");
    if (!opened.ok) return opened.response;
    if (decision?.status === 302) {
      return new Response(null, {
        status: 302,
        headers: { location: looktagProxyLocation(authorizationURL, opened.nonce) },
      });
    }
  } else if (decision) {
    return decision;
  }

  const callbackNonce = url.pathname.includes("/callback/")
    ? await appNonceForState(url.searchParams.get("state"))
    : null;

  const token = bearerFromHeaders(request.headers);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let response = await auth.handler(
    token
      ? new Request(requestForAuth.url, {
          method: requestForAuth.method,
          headers: bearerOnlyHeaders(requestForAuth.headers, token),
          body: hasBody ? requestForAuth.body : undefined,
          ...(hasBody ? { duplex: "half" } : {}),
          signal: requestForAuth.signal,
        } as RequestInit)
      : requestForAuth,
  );
  if (issuedNonce) {
    if (response.status >= 400) return response;
    const bound = await bindNonce(response, issuedNonce);
    if (!bound) return new Response("Invalid nonce", { status: 400 });
    return bound;
  }
  if (callbackNonce) {
    response = stampLooktagNonce(response, callbackNonce);
    response = stripSetCookies(response);
  }
  return response;
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
