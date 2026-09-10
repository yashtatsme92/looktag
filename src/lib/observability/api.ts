import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin/guard.server";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import type { ObservabilityConfig, SignalKind, TelemetrySignal } from "./model";
import { sanitizeAttributes } from "./model";
import { createTraceFilter, parseTraceFilter, type TraceFilter } from "./graph";
import {
  ensureTelemetrySink,
  ingestSignals,
  listTraceBundle,
  probeOtlp,
  publicConfig,
  readConfig,
  writeConfig,
} from "./store.server";

const HEADER_KEEP = "__keep__";

/** Admin + same-site gate for observability read/ingest/write server fns. */
async function requireObservabilityAdmin(): Promise<void> {
  assertSameSiteRequest();
  await requireAdmin();
}

export const getObservability = createServerFn({ method: "GET" }).handler(async () => {
  await requireObservabilityAdmin();
  ensureTelemetrySink();
  const config = await readConfig();
  const bundle = await listTraceBundle();
  return { config: publicConfig(config), ...bundle };
});

export const listObservabilitySignals = createServerFn({ method: "GET" })
  .validator((input: { kind?: SignalKind }) => input)
  .handler(async ({ data }) => {
    await requireObservabilityAdmin();
    ensureTelemetrySink();
    return listTraceBundle(data.kind);
  });

export const saveObservability = createServerFn({ method: "POST" })
  .validator((input: Partial<ObservabilityConfig> & { otlpHeaders?: string; filters?: TraceFilter[] }) => input)
  .handler(async ({ data }) => {
    await requireObservabilityAdmin();
    const patch: Partial<ObservabilityConfig> = { ...data };
    if (data.otlpHeaders === HEADER_KEEP) delete patch.otlpHeaders;
    if (data.filters) {
      patch.filters = data.filters.map(parseTraceFilter).filter((row): row is TraceFilter => Boolean(row));
    }
    const config = await writeConfig(patch);
    return publicConfig(config);
  });

export const saveObservabilityFilters = createServerFn({ method: "POST" })
  .validator((input: { filters: TraceFilter[] }) => input)
  .handler(async ({ data }) => {
    await requireObservabilityAdmin();
    const filters = data.filters.map((row) => createTraceFilter(row));
    const config = await writeConfig({ filters });
    return publicConfig(config);
  });

export const probeObservability = createServerFn({ method: "POST" }).handler(async () => {
  await requireObservabilityAdmin();
  const config = await readConfig();
  return probeOtlp(config);
});

export const ingestClientSignals = createServerFn({ method: "POST" })
  .validator((input: { signals: unknown }) => input)
  .handler(async ({ data }) => {
    await requireObservabilityAdmin();
    ensureTelemetrySink();
    const signals = Array.isArray(data.signals)
      ? data.signals.map(asSignal).filter((row): row is TelemetrySignal => Boolean(row))
      : [];
    const accepted = await ingestSignals(signals.slice(0, 40));
    return { accepted };
  });

function asSignal(raw: unknown): TelemetrySignal | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === "span") {
    if (typeof row.name !== "string" || typeof row.traceId !== "string" || typeof row.spanId !== "string") {
      return null;
    }
    return {
      kind: "span",
      id: String(row.id || row.spanId).slice(0, 64),
      traceId: row.traceId.slice(0, 32),
      spanId: row.spanId.slice(0, 16),
      parentSpanId: typeof row.parentSpanId === "string" ? row.parentSpanId.slice(0, 16) : undefined,
      name: row.name.slice(0, 160),
      spanKind: row.spanKind === "CLIENT" || row.spanKind === "SERVER" ? row.spanKind : "INTERNAL",
      status: row.status === "ERROR" || row.status === "OK" ? row.status : "UNSET",
      statusMessage: typeof row.statusMessage === "string" ? row.statusMessage.slice(0, 280) : undefined,
      startTimeUnixNano: String(row.startTimeUnixNano || ""),
      endTimeUnixNano: String(row.endTimeUnixNano || ""),
      durationMs: typeof row.durationMs === "number" ? Math.max(0, Math.round(row.durationMs)) : 0,
      attributes: sanitizeAttributes(row.attributes as Record<string, unknown>),
      events: [],
    };
  }
  if (row.kind === "metric") {
    if (typeof row.name !== "string" || typeof row.value !== "number") return null;
    return {
      kind: "metric",
      id: String(row.id || row.name).slice(0, 64),
      name: row.name.slice(0, 160),
      type: row.type === "histogram" || row.type === "gauge" ? row.type : "counter",
      value: row.value,
      unit: typeof row.unit === "string" ? row.unit.slice(0, 24) : undefined,
      timeUnixNano: String(row.timeUnixNano || ""),
      attributes: sanitizeAttributes(row.attributes as Record<string, unknown>),
    };
  }
  if (row.kind === "log") {
    if (typeof row.body !== "string") return null;
    return {
      kind: "log",
      id: String(row.id || "log").slice(0, 64),
      severity: row.severity === "DEBUG" || row.severity === "WARN" || row.severity === "ERROR" ? row.severity : "INFO",
      body: row.body.slice(0, 500),
      timeUnixNano: String(row.timeUnixNano || ""),
      traceId: typeof row.traceId === "string" ? row.traceId.slice(0, 32) : undefined,
      spanId: typeof row.spanId === "string" ? row.spanId.slice(0, 16) : undefined,
      attributes: sanitizeAttributes(row.attributes as Record<string, unknown>),
    };
  }
  return null;
}

export const HEADER_KEEP_VALUE = HEADER_KEEP;
