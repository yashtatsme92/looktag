import { createFileRoute } from "@tanstack/react-router";
import { rejectExpoProxy } from "@/lib/auth/expo-proxy";
import { bearerFromHeaders, bearerOnlyHeaders } from "@/lib/auth/native";
import { auth } from "@/lib/auth/server";
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
    return typeof parsed.callbackURL === "string" && parsed.callbackURL.startsWith("looktag://");
  } catch {
    return false;
  }
}

/** Bearer-token requests authenticate by token only — never fall back to cookies. */
async function handle(request: Request) {
  const blocked = rejectExpoProxy(request);
  if (blocked) return blocked;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/expo-authorization-proxy")) {
    const authorizationURL = url.searchParams.get("authorizationURL") ?? "";
    if (!(await storedCallbackIsLooktag(authorizationURL))) {
      return new Response("Invalid authorizationURL", { status: 400 });
    }
  }
  const token = bearerFromHeaders(request.headers);
  if (!token) return auth.handler(request);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return auth.handler(
    new Request(request.url, {
      method: request.method,
      headers: bearerOnlyHeaders(request.headers, token),
      body: hasBody ? request.body : undefined,
      ...(hasBody ? { duplex: "half" } : {}),
      signal: request.signal,
    } as RequestInit),
  );
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
