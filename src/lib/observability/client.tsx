import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ATTR_HTTP_ROUTE, ATTR_URL_PATH } from "@opentelemetry/semantic-conventions";
import { isSharePath } from "@/lib/pwa/boot";
import { chromeLayout, layoutSurface } from "@/lib/pwa/use-wide-layout";
import { shareKindFromPath } from "@/lib/share-meta";
import { ingestClientSignals } from "./api";
import { emitLog, flushSignals, recordMetric, setTelemetrySink, startSpan } from "./runtime";

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setTelemetrySink(async (signals) => {
      try {
        await ingestClientSignals({ data: { signals } });
      } catch {
        // Offline / first paint — keep browsing.
      }
    });
    const flush = () => {
      void flushSignals();
    };
    const interval = window.setInterval(flush, 4000);
    window.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      setTelemetrySink(null);
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
