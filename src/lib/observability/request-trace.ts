import { randomHex } from "./model.ts";
import type { Attributes } from "./model.ts";
import { emitLog, startSpan } from "./runtime.ts";
import { spanParent } from "./span-context.server.ts";
import { flagsForSampled, formatTraceparent, parseTraceparent } from "./traceparent.ts";
import { effectiveSampleRatio, headSampleDecision, recordTraceDecision } from "./sampling.ts";
import { isIngestServerFnPath, TELEMETRY_REQUEST_HEADER } from "./client-fetch.ts";
import { beginProductRequest, endProductRequest } from "./request-pressure.ts";
import type { ResourceEnv } from "./resource.ts";
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
  /** Test hook. Defaults to process.env. */
  env?: ResourceEnv;
  /** Test hook for the head sampler. */
  random?: () => number;
  /** Internal callers only. Browser traceparents are not trusted. */
  trustParent?: boolean;
};

let flagCache: { at: number; flags: Record<string, boolean> } | null = null;
let flagsInflight: Promise<Record<string, boolean>> | null = null;

async function loadFlags(): Promise<Record<string, boolean>> {
  if (flagCache && Date.now() - flagCache.at < 10_000) return flagCache.flags;
  if (flagsInflight) return flagsInflight;
  flagsInflight = (async () => {
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
    } finally {
      flagsInflight = null;
    }
  })();
  return flagsInflight;
}

function isWebResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Response;
  return typeof candidate.status === "number" && !!candidate.headers && typeof candidate.headers.set === "function";
}

function withTraceHeaders(result: unknown, traceparent: string, requestId: string): unknown {
  if (!isWebResponse(result)) return result;
  try {
    result.headers.set("traceparent", traceparent);
    result.headers.set("x-request-id", requestId);
    return result;
  } catch {
    const headers = new Headers(result.headers);
    headers.set("traceparent", traceparent);
    headers.set("x-request-id", requestId);
    const cookies = typeof result.headers.getSetCookie === "function" ? result.headers.getSetCookie() : [];
    if (cookies.length > 0) {
      headers.delete("set-cookie");
      for (const cookie of cookies) headers.append("set-cookie", cookie);
    }
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
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
 * One server span per request. An incoming traceparent continues the trace id
 * so the browser span and this span stay one trace. The sampled flag is the
 * server's ratio for browser parents (they cannot force `-01`). A trusted
 * parent still wins. 5xx forces the trace to be kept, and the response flag
 * matches that decision. The telemetry header skips tracing only for the
 * ingest server function itself. Headers, cookies, and the body are not recorded.
 */
export async function runRequestTrace(input: RequestTraceInput, next: () => Promise<unknown> | unknown): Promise<unknown> {
  beginProductRequest();
  try {
    const path = input.path || "/";
    if (input.headers.get(TELEMETRY_REQUEST_HEADER) === "1" && isIngestServerFnPath(path)) return await next();
    const method = (input.method || "GET").toUpperCase();
    const route = routeTemplate(path);
    const serverFn = serverFnName(path);
    const incoming = parseTraceparent(input.headers.get("traceparent"));
    const env = input.env ?? (typeof process !== "undefined" ? process.env : {});
    const ratio = effectiveSampleRatio(1, env);
    let sampled = headSampleDecision({
      incomingFlags: incoming?.flags,
      ratio,
      random: input.random,
      trustParent: input.trustParent === true,
    });
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
      sampled,
      attributes,
    });
    recordTraceDecision(span.traceId, sampled);
    const parentAttrs: Attributes = { ...app };
    try {
      const result = await spanParent.run(
        { traceId: span.traceId, spanId: span.spanId, requestId, attributes: parentAttrs },
        async () => {
          if (!input.skipFlags && !input.flags) {
            if (flagCache) {
              for (const [key, value] of Object.entries(flagCache.flags)) {
                if (!/^[A-Za-z0-9_]+$/.test(key)) continue;
                const attr = `app.flag.${key}`;
                span.setAttribute(attr, value);
                parentAttrs[attr] = value;
              }
            }
            if (!flagCache || Date.now() - flagCache.at >= 10_000) void loadFlags();
          }
          return next();
        },
      );
      const status = isWebResponse(result) ? result.status : 200;
      span.setAttribute("http.status_code", status);
      if (status >= 500) {
        sampled = true;
        span.setStatus("ERROR", `HTTP ${status}`);
        requestError(method, route, status, span.traceId, span.spanId, requestId);
      }
      span.setSampled(sampled);
      recordTraceDecision(span.traceId, sampled);
      span.end();
      const flags = flagsForSampled(sampled, incoming?.flags);
      return withTraceHeaders(result, formatTraceparent({ traceId: span.traceId, spanId: span.spanId, flags }), requestId);
    } catch (error) {
      sampled = true;
      span.setSampled(sampled);
      recordTraceDecision(span.traceId, true);
      span.setAttribute("http.status_code", 500);
      span.setStatus("ERROR");
      requestError(method, route, 500, span.traceId, span.spanId, requestId);
      span.end(error);
      throw error;
    }
  } finally {
    endProductRequest();
  }
}
