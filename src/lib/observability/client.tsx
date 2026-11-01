import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ATTR_HTTP_ROUTE, ATTR_URL_PATH } from "@/lib/providers/telemetry";
import { isSharePath } from "@/lib/pwa/boot";
import { chromeLayout, layoutSurface } from "@/lib/pwa/use-wide-layout";
import { shareKindFromPath } from "@/lib/share-meta";
import { ingestClientSignals } from "./api";
import { emitLog, flushSignals, recordMetric, setFlushDeferred, setTelemetrySink, startSpan } from "./runtime";
import { featureFromRoute, routeTemplate } from "./app-span";
import { formatTraceparent } from "./traceparent";
import { buildResourceAttributes } from "./resource";
import { TELEMETRY_REQUEST_HEADER, applyClientHttpStatus, isTelemetryTransport, telemetryFunctionPath } from "./client-fetch";

let insideTelemetryFlush = 0;
let inflightTraces = 0;

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const resource = browserResource();
    const original = window.fetch.bind(window);
    setTelemetrySink(async (signals) => {
      insideTelemetryFlush += 1;
      try {
        await ingestClientSignals({
          data: { signals, resource },
          headers: { [TELEMETRY_REQUEST_HEADER]: "1" },
          fetch: (input, init) => original(input, withTelemetryHeader(init)),
        });
      } catch {
        // Offline / first paint — keep browsing.
      } finally {
        insideTelemetryFlush -= 1;
      }
    });
    setFlushDeferred(() => inflightTraces > 0);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (insideTelemetryFlush > 0 || isTelemetryRequest(input, init)) return original(input, init);
      return tracedFetch(original, input, init);
    };
    const flush = () => {
      void flushSignals();
    };
    const interval = window.setInterval(() => {
      if (inflightTraces > 0) return;
      flush();
    }, 8_000);
    window.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.fetch = original;
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      setTelemetrySink(null);
      setFlushDeferred(null);
    };
  }, []);

  useEffect(() => {
    const surface = layoutSurface();
    const chrome = chromeLayout();
    const span = startSpan("ui.navigation", {
      kind: "CLIENT",
      attributes: {
        [ATTR_URL_PATH]: pathname,
        [ATTR_HTTP_ROUTE]: pathname,
        "looktag.share.page": isSharePath(pathname),
        "looktag.share.kind": shareKindFromPath(pathname),
        "looktag.ui.surface": surface,
        "looktag.ui.chrome": chrome,
        "looktag.ui.viewport_w": window.innerWidth,
        "looktag.ui.viewport_h": window.innerHeight,
      },
    });
    recordMetric("looktag.ui.navigation", 1, {
      type: "counter",
      attributes: {
        "looktag.ui.surface": surface,
        "looktag.ui.chrome": chrome,
        "looktag.share.kind": shareKindFromPath(pathname),
      },
    });
    return () => {
      span.end();
    };
  }, [pathname]);

  useEffect(() => {
    function onError(event: ErrorEvent) {
      emitLog("ERROR", event.message || "Unhandled error", {
        attributes: { [ATTR_URL_PATH]: window.location.pathname, "error.type": "ErrorEvent" },
      });
    }
    function onRejection(event: PromiseRejectionEvent) {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason || "rejection");
      emitLog("ERROR", message.slice(0, 280), {
        attributes: { [ATTR_URL_PATH]: window.location.pathname, "error.type": "unhandledrejection" },
      });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    observeVitals();
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return children;
}

function browserResource() {
  return buildResourceAttributes({
    serviceName: "looktag-web",
    version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined,
    revision: typeof __APP_REVISION__ === "string" ? __APP_REVISION__ : undefined,
    branch: typeof __APP_BRANCH__ === "string" ? __APP_BRANCH__ : undefined,
    builtAt: typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : undefined,
    deploymentId: typeof __APP_DEPLOYMENT_ID__ === "string" ? __APP_DEPLOYMENT_ID__ : undefined,
    previewPr: typeof __APP_PREVIEW_PR__ === "string" ? __APP_PREVIEW_PR__ : undefined,
    cloudProvider: typeof __APP_CLOUD_PROVIDER__ === "string" ? __APP_CLOUD_PROVIDER__ : undefined,
    cloudRegion: typeof __APP_CLOUD_REGION__ === "string" ? __APP_CLOUD_REGION__ : undefined,
    env: {
      APP_ENV: typeof __APP_DEPLOYMENT_ENV__ === "string" ? __APP_DEPLOYMENT_ENV__ : undefined,
    },
    browser: {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
    },
  });
}

function sameOriginUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url;
  } catch {
    return null;
  }
}

function withTelemetryHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(TELEMETRY_REQUEST_HEADER, "1");
  return { ...init, headers };
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
}

function isTelemetryRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url = sameOriginUrl(input);
  if (!url) return false;
  const serverFnUrl = (ingestClientSignals as { url?: string }).url;
  return isTelemetryTransport({
    pathname: url.pathname,
    headers: requestHeaders(input, init),
    telemetryPathname: telemetryFunctionPath(serverFnUrl, window.location.href),
    insideFlush: false,
  });
}

function isAppFetch(url: URL): boolean {
  const path = url.pathname;
  if (path.startsWith("/@") || path.startsWith("/src/") || path.startsWith("/node_modules/")) return false;
  if (/\.(?:tsx?|jsx?|mjs|css|map|svg|png|jpe?g|webp|gif|woff2?|ico)$/i.test(path)) return false;
  return true;
}

function tracedFetch(
  original: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = sameOriginUrl(input);
  if (!url || !isAppFetch(url) || isTelemetryRequest(input, init)) return original(input, init);
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const route = routeTemplate(url.pathname);
  const span = startSpan(`HTTP ${method}`, {
    kind: "CLIENT",
    root: true,
    attributes: {
      "http.method": method,
      "http.route": route,
      "app.route": route,
      "app.feature": featureFromRoute(route),
    },
  });
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("traceparent", formatTraceparent({ traceId: span.traceId, spanId: span.spanId }));
  inflightTraces += 1;
  return original(input, { ...init, headers })
    .then((response) => {
      applyClientHttpStatus(response.status, span);
      span.end();
      return response;
    })
    .catch((error: unknown) => {
      span.end(error);
      throw error;
    })
    .finally(() => {
      inflightTraces = Math.max(0, inflightTraces - 1);
    });
}

function observeVitals() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const lcp = new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      if (!entry) return;
      recordMetric("browser.largest_contentful_paint", Math.round(entry.startTime), {
        type: "gauge",
        unit: "ms",
      });
    });
    lcp.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    // Safari without LCP.
  }
  try {
    let cls = 0;
    const shift = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (entry.hadRecentInput) continue;
        cls += entry.value ?? 0;
      }
      recordMetric("browser.cumulative_layout_shift", Number(cls.toFixed(4)), {
        type: "gauge",
        unit: "1",
      });
    });
    shift.observe({ type: "layout-shift", buffered: true });
  } catch {
    // Unsupported.
  }
}
