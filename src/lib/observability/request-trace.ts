import { randomHex } from "./model.ts";
import type { Attributes } from "./model.ts";
import { emitLog, startSpan } from "./runtime.ts";
import { spanParent } from "./span-context.server.ts";
import { formatTraceparent, parseTraceparent } from "./traceparent.ts";
import {
  appSpanAttributes,
  authStateFromCookie,
  localeFromHeader,
  requestIdFromHeader,
  routeTemplate,
  serverFnName,
} from "./app-span.ts";

type HeaderSource = { get(name: string): string | null };

export type RequestTraceInput = {
  method: string;
  path: string;
  headers: HeaderSource;
  /** Test hook. When set, skip the settings read. */
  flags?: Record<string, boolean>;
  skipFlags?: boolean;
};

let flagCache: { at: number; flags: Record<string, boolean> } | null = null;

async function loadFlags(): Promise<Record<string, boolean>> {
  if (flagCache && Date.now() - flagCache.at < 10_000) return flagCache.flags;
  try {
    const { readSettings } = await import("../settings/store.server.ts");
    const { FEATURE_FLAGS } = await import("../settings/flags.ts");
    const settings = await readSettings();
    const flags: Record<string, boolean> = {};
    for (const flag of FEATURE_FLAGS) flags[flag.key] = Boolean(settings[flag.key]);
    flagCache = { at: Date.now(), flags };
    return flags;
  } catch {
    return flagCache?.flags ?? {};
  }
}

function withTraceHeaders(result: unknown, traceparent: string, requestId: string): unknown {
  if (!(result instanceof Response)) return result;
  const headers = new Headers(result.headers);
  headers.set("traceparent", traceparent);
  headers.set("x-request-id", requestId);
  const cookies = typeof result.headers.getSetCookie === "function" ? result.headers.getSetCookie() : [];
  if (cookies.length > 1) {
    headers.delete("set-cookie");
    for (const cookie of cookies) headers.append("set-cookie", cookie);
  }
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}

function requestError(method: string, route: string, status: number, traceId: string, spanId: string, requestId: string) {
  const body = `request-error ${method} ${route} ${status}`;
  emitLog("ERROR", body, {
    traceId,
    spanId,
    attributes: { "app.request_id": requestId, "http.status_code": status, "app.route": route },
  });
  console.error(
    JSON.stringify({
      msg: "request-error",
      trace_id: traceId,
      span_id: spanId,
      request_id: requestId,
      method,
      route,
      status,
    }),
  );
}

/**
 * One server span per request. An incoming traceparent is the parent, so the
 * browser span and this span share a trace id. The response always carries
 * traceparent and X-Request-Id. Headers, cookies, and the body are not recorded.
 */
export async function runRequestTrace(input: RequestTraceInput, next: () => Promise<unknown> | unknown): Promise<unknown> {
  const method = (input.method || "GET").toUpperCase();
  const route = routeTemplate(input.path || "/");
  const serverFn = serverFnName(input.path || "/");
  const incoming = parseTraceparent(input.headers.get("traceparent"));
  const requestId = requestIdFromHeader(input.headers.get("x-request-id"), randomHex(16));
  const app = appSpanAttributes({
    route,
    serverFn,
    authState: authStateFromCookie(input.headers.get("cookie")),
    locale: localeFromHeader(input.headers.get("accept-language")),
    requestId,
    flags: input.flags,
  });
  const attributes: Attributes = {
    "http.method": method,
    "http.route": route,
    ...app,
  };
  const span = startSpan(`HTTP ${method}`, {
    kind: "SERVER",
    traceId: incoming?.traceId,
    parentSpanId: incoming?.spanId,
    traceRoot: true,
    attributes,
  });
  const parentAttrs: Attributes = { ...app };
  try {
    const result = await spanParent.run(
      { traceId: span.traceId, spanId: span.spanId, requestId, attributes: parentAttrs },
      async () => {
        if (!input.skipFlags && !input.flags) {
          const flags = await loadFlags();
          for (const [key, value] of Object.entries(flags)) {
            if (!/^[A-Za-z0-9_]+$/.test(key)) continue;
            const attr = `app.flag.${key}`;
            span.setAttribute(attr, value);
            parentAttrs[attr] = value;
          }
        }
        return next();
      },
    );
    const status = result instanceof Response ? result.status : 200;
    span.setAttribute("http.status_code", status);
    if (status >= 500) {
      span.setStatus("ERROR", `HTTP ${status}`);
      requestError(method, route, status, span.traceId, span.spanId, requestId);
    }
    span.end();
    return withTraceHeaders(result, formatTraceparent({ traceId: span.traceId, spanId: span.spanId }), requestId);
  } catch (error) {
    span.setAttribute("http.status_code", 500);
    span.setStatus("ERROR");
    requestError(method, route, 500, span.traceId, span.spanId, requestId);
    span.end(error);
    throw error;
  }
}
