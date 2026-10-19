import { randomBytes } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { crossSiteResponse, rejectExpoProxy } from "@/lib/auth/expo-proxy";
import { bearerFromHeaders, bearerOnlyHeaders, isRegisteredLooktagCallback } from "@/lib/auth/native";
import {
  isNativeNonce,
  nativeNonceClearCookie,
  nativeNonceCookieMatches,
  nativeNonceIdentifier,
  nativeNonceSetCookie,
  readCookie,
  signNativeNonce,
  withNonceOnLooktag,
  NATIVE_NONCE_COOKIE,
} from "@/lib/auth/native-nonce";
import { auth, authSecret } from "@/lib/auth/server";
import { getSql } from "@/lib/db";

async function storedCallbackIsLooktag(authorizationURL: string): Promise<boolean> {
  let target: URL;
  try {
    target = new URL(authorizationURL);
  } catch {
    return false;
  }
  const state = target.searchParams.get("state");
  if (!state) return false;
  const sql = await getSql();
  const rows = await sql<{ value: string }>`
    select value from verification where identifier = ${state} limit 1
  `;
  const raw = rows[0]?.value;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { callbackURL?: unknown };
    return typeof parsed.callbackURL === "string" && isRegisteredLooktagCallback(parsed.callbackURL);
  } catch {
    return false;
  }
}

async function storeAppNonce(authorizationURL: string, nonce: string): Promise<void> {
  let state: string | null = null;
  try {
    state = new URL(authorizationURL).searchParams.get("state");
  } catch {
    return;
  }
  if (!state) return;
  const sql = await getSql();
  const rows = await sql<{ value: string }>`
    select value from verification where identifier = ${state} limit 1
  `;
  const raw = rows[0]?.value;
  if (!raw) return;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  parsed.appNonce = nonce;
  await sql`update verification set value = ${JSON.stringify(parsed)} where identifier = ${state}`;
}

async function appNonceForState(state: string | null): Promise<string | null> {
  if (!state) return null;
  const sql = await getSql();
  const rows = await sql<{ value: string }>`
    select value from verification where identifier = ${state} limit 1
  `;
  const raw = rows[0]?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { appNonce?: unknown };
    return typeof parsed.appNonce === "string" && isNativeNonce(parsed.appNonce) ? parsed.appNonce : null;
  } catch {
    return null;
  }
}

async function registerNonce(nonce: string): Promise<void> {
  const sql = await getSql();
  const ident = nativeNonceIdentifier(nonce);
  const id = randomBytes(16).toString("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await sql`delete from verification where identifier = ${ident}`;
  await sql`
    insert into verification (id, identifier, value, "expiresAt")
    values (${id}, ${ident}, ${"pending"}, ${expires})
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

async function handleNativeChallenge(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const blocked = crossSiteResponse(request);
  if (blocked) return blocked;
  let nonce = "";
  try {
    const body = (await request.json()) as { nonce?: unknown };
    if (typeof body.nonce === "string") nonce = body.nonce;
  } catch {
    return new Response("Invalid nonce", { status: 400 });
  }
  if (!isNativeNonce(nonce)) return new Response("Invalid nonce", { status: 400 });
  await registerNonce(nonce);
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": nativeNonceSetCookie(signNativeNonce(nonce, authSecret())) },
  });
}

async function openNativeAttempt(
  request: Request,
): Promise<{ ok: true; nonce: string } | { ok: false; response: Response }> {
  const nonce = new URL(request.url).searchParams.get("nonce") ?? "";
  const cookie = readCookie(request.headers.get("cookie"), NATIVE_NONCE_COOKIE);
  if (!nativeNonceCookieMatches(cookie, nonce, authSecret())) {
    return { ok: false, response: new Response("Invalid authorizationURL", { status: 400 }) };
  }
  if (!(await consumeNonce(nonce))) {
    return { ok: false, response: new Response("Invalid authorizationURL", { status: 400 }) };
  }
  return { ok: true, nonce };
}

function withSetCookies(response: Response, extras: string[]): Response {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    headers.append(key, value);
  });
  for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
  for (const cookie of extras) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

/** Bearer-token requests authenticate by token only — never fall back to cookies. */
async function handle(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/native-challenge")) return handleNativeChallenge(request);

  const decision = rejectExpoProxy(request);
  const proxy = url.pathname.endsWith("/expo-authorization-proxy");
  let clearNonce = false;

  if (proxy && (decision === null || decision.status === 302)) {
    const opened = await openNativeAttempt(request);
    if (!opened.ok) return opened.response;
    clearNonce = true;
    if (decision?.status === 302) {
      const location = decision.headers.get("location") ?? "";
      return new Response(null, {
        status: 302,
        headers: {
          location: isRegisteredLooktagCallback(location)
            ? withNonceOnLooktag(location, opened.nonce)
            : location,
          "set-cookie": nativeNonceClearCookie(),
        },
      });
    }
    const authorizationURL = url.searchParams.get("authorizationURL") ?? "";
    if (!(await storedCallbackIsLooktag(authorizationURL))) {
      return new Response("Invalid authorizationURL", {
        status: 400,
        headers: { "set-cookie": nativeNonceClearCookie() },
      });
    }
    await storeAppNonce(authorizationURL, opened.nonce);
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
      ? new Request(request.url, {
          method: request.method,
          headers: bearerOnlyHeaders(request.headers, token),
          body: hasBody ? request.body : undefined,
          ...(hasBody ? { duplex: "half" } : {}),
          signal: request.signal,
        } as RequestInit)
      : request,
  );
  if (callbackNonce) response = stampLooktagNonce(response, callbackNonce);
  if (clearNonce) response = withSetCookies(response, [nativeNonceClearCookie()]);
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
