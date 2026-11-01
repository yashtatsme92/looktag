import { getSql } from "@/lib/db";
import { postOtlp, resolveTelemetryProvider } from "@/lib/providers/telemetry";
import type {
  Attributes,
  ObservabilityConfig,
  PublicSignal,
  SignalKind,
  TelemetrySignal,
  TelemetrySummary,
} from "./model";
import {
  DEFAULT_CONFIG,
  clampSampleRatio,
  mergeConfig,
  nanoToMs,
  parseOtlpHeaders,
  resolveOtlpUrls,
} from "./model";
import {
  buildOperationGraph,
  buildTraceGraphs,
  filtersExtras,
  parseFiltersJson,
  type OperationGraph,
  type TraceFilter,
  type TraceGraph,
} from "./graph";
import { encodeOtlpLogs, encodeOtlpMetrics, encodeOtlpTraces, encodeProbe } from "./otlp";
import { setFlushDeferred, setTelemetrySink } from "./runtime";
import { deliverOtlp } from "./export-error";
import { effectiveSampleRatio, TraceGate, attachTraceGate } from "./sampling";
import { serverResourceAttributes } from "./identity.server";
import { productRequestsActive, whenProductIdle } from "./request-pressure";

const SETTINGS_ID = "default";
const MAX_SIGNALS = 400;

type SettingsRow = {
  id: string;
  enabled: boolean;
  traces_enabled: boolean;
  metrics_enabled: boolean;
  logs_enabled: boolean;
  service_name: string;
  otlp_endpoint: string;
  otlp_headers: string;
  sample_ratio: number;
  extras_json: string | null;
  updated_at: number;
};

type SignalRow = {
  id: string;
  kind: string;
  name: string;
  status: string;
  trace_id: string | null;
  span_id: string | null;
  parent_span_id: string | null;
  duration_ms: number | null;
  start_time: number;
  attributes_json: string;
  payload_json: string;
  created_at: number;
};

let sinkReady = false;
const deferredWrites: TelemetrySignal[] = [];
let draining = false;

export function ensureTelemetrySink() {
  if (!sinkReady) {
    sinkReady = true;
    setFlushDeferred(() => productRequestsActive());
    setTelemetrySink(async (signals) => {
      await ingestSignals(signals);
    });
  }
  traceGate(effectiveSampleRatio(1, process.env));
}

function parseExtrasRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return { ...(parsed as Record<string, unknown>) };
  } catch {
    return {};
  }
}

function mergeExtrasJson(raw: unknown, filters: TraceFilter[]): string {
  return JSON.stringify({
    ...parseExtrasRecord(raw),
    ...filtersExtras(filters),
  });
}

function rowToConfig(row: SettingsRow | undefined): ObservabilityConfig {
  const merged = !row
    ? mergeConfig(null)
    : mergeConfig({
        enabled: Boolean(row.enabled),
        tracesEnabled: Boolean(row.traces_enabled),
        metricsEnabled: Boolean(row.metrics_enabled),
        logsEnabled: Boolean(row.logs_enabled),
        serviceName: row.service_name,
        otlpEndpoint: row.otlp_endpoint,
        otlpHeaders: row.otlp_headers,
        sampleRatio: clampSampleRatio(Number(row.sample_ratio)),
        filters: parseFiltersJson(row.extras_json),
      });
  return { ...merged, sampleRatio: effectiveSampleRatio(merged.sampleRatio, process.env) };
}

export async function readConfig(): Promise<ObservabilityConfig> {
  const sql = await getSql();
  const rows = await sql<SettingsRow>`
    select id, enabled, traces_enabled, metrics_enabled, logs_enabled,
           service_name, otlp_endpoint, otlp_headers, sample_ratio, extras_json, updated_at
    from observability_settings
    where id = ${SETTINGS_ID}
    limit 1
  `;
  return rowToConfig(rows[0]);
}

export async function writeConfig(patch: Partial<ObservabilityConfig>): Promise<ObservabilityConfig> {
  const current = await readConfig();
  const next: ObservabilityConfig = {
    enabled: patch.enabled ?? current.enabled,
    tracesEnabled: patch.tracesEnabled ?? current.tracesEnabled,
    metricsEnabled: patch.metricsEnabled ?? current.metricsEnabled,
    logsEnabled: patch.logsEnabled ?? current.logsEnabled,
    serviceName: (patch.serviceName ?? current.serviceName).trim() || "looktag",
    otlpEndpoint: (patch.otlpEndpoint ?? current.otlpEndpoint).trim(),
    otlpHeaders: patch.otlpHeaders === undefined ? current.otlpHeaders : patch.otlpHeaders.trim(),
    sampleRatio: clampSampleRatio(patch.sampleRatio ?? current.sampleRatio),
    filters: patch.filters ?? current.filters,
  };
  const sql = await getSql();
  const now = Date.now();
  const extrasRows = await sql<{ extras_json: string | null }>`
    select extras_json from observability_settings where id = ${SETTINGS_ID} limit 1
  `;
  const extras = mergeExtrasJson(extrasRows[0]?.extras_json, next.filters);
  await sql`
    insert into observability_settings (
      id, enabled, traces_enabled, metrics_enabled, logs_enabled,
      service_name, otlp_endpoint, otlp_headers, sample_ratio, extras_json, updated_at
    ) values (
      ${SETTINGS_ID}, ${next.enabled}, ${next.tracesEnabled}, ${next.metricsEnabled}, ${next.logsEnabled},
      ${next.serviceName}, ${next.otlpEndpoint}, ${next.otlpHeaders}, ${next.sampleRatio}, ${extras}, ${now}
    )
    on conflict (id) do update set
      enabled = excluded.enabled,
      traces_enabled = excluded.traces_enabled,
      metrics_enabled = excluded.metrics_enabled,
      logs_enabled = excluded.logs_enabled,
      service_name = excluded.service_name,
      otlp_endpoint = excluded.otlp_endpoint,
      otlp_headers = excluded.otlp_headers,
      sample_ratio = excluded.sample_ratio,
      extras_json = excluded.extras_json,
      updated_at = excluded.updated_at
  `;
  return next;
}

function allows(config: ObservabilityConfig, signal: TelemetrySignal): boolean {
  if (!config.enabled) return false;
  if (signal.kind === "span") return config.tracesEnabled;
  if (signal.kind === "metric") return config.metricsEnabled;
  return config.logsEnabled;
}

let gate: TraceGate | null = null;
let gateRatio = Number.NaN;

function traceGate(ratio: number): TraceGate {
  if (!gate) {
    gate = new TraceGate(ratio);
    gateRatio = ratio;
    attachTraceGate(gate);
    return gate;
  }
  if (gateRatio !== ratio) {
    gate.setRatio(ratio);
    gateRatio = ratio;
  }
  return gate;
}

export async function ingestSignals(signals: TelemetrySignal[]): Promise<number> {
  if (signals.length === 0) return 0;
  const config = await readConfig();
  const ratio = effectiveSampleRatio(config.sampleRatio, process.env);
  const sampled = signals.flatMap((signal) => (allows(config, signal) ? traceGate(ratio).push(signal) : []));
  const accepted = sampled.slice(0, 60);
  if (accepted.length === 0) return 0;
  void exportSignals(accepted, config);
  // Persistence is off the request. PGLite queries are synchronous, so a batch
  // written inline stalls every other request (including publish) for the whole batch.
  deferredWrites.push(...accepted);
  if (deferredWrites.length > MAX_SIGNALS) deferredWrites.splice(0, deferredWrites.length - MAX_SIGNALS);
  void drainWrites();
  return accepted.length;
}

async function drainWrites() {
  if (draining) return;
  draining = true;
  let sinceTrim = 0;
  try {
    while (deferredWrites.length > 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (productRequestsActive()) break;
      const signal = deferredWrites.shift();
      if (!signal) break;
      await writeSignals([signal]);
      sinceTrim += 1;
      if (sinceTrim >= 40) {
        await trimSignals();
        sinceTrim = 0;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    if (sinceTrim > 0 && !productRequestsActive()) await trimSignals();
  } catch {
    // A full buffer must not take down the next request. Export already ran.
  } finally {
    draining = false;
  }
  if (deferredWrites.length > 0) {
    if (productRequestsActive()) void whenProductIdle().then(() => drainWrites());
    else void drainWrites();
  }
}

async function writeSignals(signals: TelemetrySignal[]) {
  if (signals.length === 0) return;
  const sql = await getSql();
  for (const signal of signals) {
    const startTime = startMs(signal);
    const parentSpanId = signal.kind === "span" ? signal.parentSpanId ?? null : null;
    await sql`
      insert into telemetry_signals (
        id, kind, name, status, trace_id, span_id, parent_span_id, duration_ms, start_time, attributes_json, payload_json, created_at
      ) values (
        ${signal.id},
        ${signal.kind},
        ${signalName(signal)},
        ${signal.kind === "span" ? signal.status : signal.kind === "log" ? signal.severity : ""},
        ${"traceId" in signal ? signal.traceId ?? null : null},
        ${"spanId" in signal ? signal.spanId ?? null : null},
        ${parentSpanId},
        ${signal.kind === "span" ? signal.durationMs : null},
        ${startTime},
        ${JSON.stringify(signal.attributes ?? {})},
        ${JSON.stringify(signal)},
        ${Date.now()}
      )
      on conflict (id) do nothing
    `;
  }
}

async function trimSignals() {
  const sql = await getSql();
  await sql`
    delete from telemetry_signals
    where id in (
      select id from telemetry_signals
      order by created_at desc
      offset ${MAX_SIGNALS}
    )
  `;
}

function signalName(signal: TelemetrySignal): string {
  if (signal.kind === "log") return signal.body.slice(0, 120) || "log";
  return signal.name;
}

function startMs(signal: TelemetrySignal): number {
  if (signal.kind === "span") return nanoToMs(signal.startTimeUnixNano);
  if (signal.kind === "metric") return nanoToMs(signal.timeUnixNano);
  return nanoToMs(signal.timeUnixNano);
}

async function exportSignals(signals: TelemetrySignal[], config: ObservabilityConfig) {
  if (resolveTelemetryProvider() === "none") return;
  const urls = resolveOtlpUrls(config.otlpEndpoint);
  if (!urls) return;
  const headers = {
    "content-type": "application/json",
    ...parseOtlpHeaders(config.otlpHeaders),
  };
  const serverResource = serverResourceAttributes();
  const posts: Array<Promise<void>> = [];
  for (const [kind, url] of [
    ["span", urls.traces],
    ["metric", urls.metrics],
    ["log", urls.logs],
  ] as const) {
    const group = signals.filter((signal) => signal.kind === kind);
    for (const batch of groupByResource(group, serverResource)) {
      const body =
        kind === "span"
          ? encodeOtlpTraces(batch.items as Extract<TelemetrySignal, { kind: "span" }>[], config.serviceName, batch.resource)
          : kind === "metric"
            ? encodeOtlpMetrics(batch.items as Extract<TelemetrySignal, { kind: "metric" }>[], config.serviceName, batch.resource)
            : encodeOtlpLogs(batch.items as Extract<TelemetrySignal, { kind: "log" }>[], config.serviceName, batch.resource);
      posts.push(deliverOtlp(() => postOtlp(url, headers, body)));
    }
  }
  await Promise.all(posts);
}

function groupByResource(signals: TelemetrySignal[], fallback: Attributes): Array<{ resource: Attributes; items: TelemetrySignal[] }> {
  const groups = new Map<string, { resource: Attributes; items: TelemetrySignal[] }>();
  for (const signal of signals) {
    const resource = signal.resourceAttributes ?? fallback;
    const key = JSON.stringify(resource);
    const group = groups.get(key) ?? { resource, items: [] };
    group.items.push(signal);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function listSignals(kind?: SignalKind): Promise<PublicSignal[]> {
  const sql = await getSql();
  const rows = kind
    ? await sql<SignalRow>`
        select id, kind, name, status, trace_id, span_id, parent_span_id, duration_ms, start_time, attributes_json, payload_json, created_at
        from telemetry_signals
        where kind = ${kind}
        order by created_at desc
        limit 200
      `
    : await sql<SignalRow>`
        select id, kind, name, status, trace_id, span_id, parent_span_id, duration_ms, start_time, attributes_json, payload_json, created_at
        from telemetry_signals
        order by created_at desc
        limit 200
      `;
  return rows.map(toPublic);
}

function payloadOf(row: SignalRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toPublic(row: SignalRow): PublicSignal {
  let attributes: Record<string, string | number | boolean> = {};
  try {
    const parsed = JSON.parse(row.attributes_json) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        attributes[key] = value;
      }
    }
  } catch {
    attributes = {};
  }
  const payload = payloadOf(row);
  const parent =
    row.parent_span_id ||
    (typeof payload.parentSpanId === "string" ? payload.parentSpanId : null);
  const spanKind = typeof payload.spanKind === "string" ? payload.spanKind : null;
  return {
    id: row.id,
    kind: row.kind as SignalKind,
    name: row.name,
    status: row.status,
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: parent,
    spanKind,
    durationMs: row.duration_ms,
    startTime: Number(row.start_time),
    attributes,
  };
}

export async function summarizeSignals(): Promise<TelemetrySummary> {
  const sql = await getSql();
  const rows = await sql<{
    kind: string;
    status: string;
    duration_ms: number | null;
    trace_id: string | null;
  }>`
    select kind, status, duration_ms, trace_id from telemetry_signals
    order by created_at desc
    limit 400
  `;
  const durations = rows
    .filter((row) => row.kind === "span" && typeof row.duration_ms === "number")
    .map((row) => Number(row.duration_ms))
    .sort((a, b) => a - b);
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : 0;
  const traces = new Set(
    rows.filter((row) => row.kind === "span" && row.trace_id).map((row) => row.trace_id as string),
  );
  return {
    spans: rows.filter((row) => row.kind === "span").length,
    errors: rows.filter((row) => row.kind === "span" && row.status === "ERROR").length,
    metrics: rows.filter((row) => row.kind === "metric").length,
    logs: rows.filter((row) => row.kind === "log").length,
    traces: traces.size,
    p95Ms: p95,
    lastExport: "",
  };
}

export async function listTraceBundle(kind?: SignalKind): Promise<{
  signals: PublicSignal[];
  graphs: TraceGraph[];
  operations: OperationGraph;
  summary: TelemetrySummary;
}> {
  const [signals, summary] = await Promise.all([listSignals(kind), summarizeSignals()]);
  const graphs = buildTraceGraphs(signals);
  return {
    signals,
    graphs,
    operations: buildOperationGraph(graphs),
    summary,
  };
}

export async function probeOtlp(config: ObservabilityConfig): Promise<{ ok: boolean; status: number; message: string }> {
  const urls = resolveOtlpUrls(config.otlpEndpoint);
  if (!urls) return { ok: false, status: 0, message: "Add an OTLP HTTP base URL first." };
  try {
    const response = await postOtlp(urls.traces, {
      "content-type": "application/json",
      ...parseOtlpHeaders(config.otlpHeaders),
    }, encodeProbe(config));
    const message = response.ok
      ? `Collector accepted the probe (${response.status}).`
      : `Collector returned ${response.status}.`;
    return { ok: response.ok, status: response.status, message };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Could not reach the collector.",
    };
  }
}

export function publicConfig(config: ObservabilityConfig) {
  return {
    ...config,
    otlpHeaders: "",
    hasHeaders: Boolean(config.otlpHeaders.trim()),
    headersMasked: config.otlpHeaders.trim()
      ? Object.keys(parseOtlpHeaders(config.otlpHeaders))
          .map((key) => `${key}=••••`)
          .join(", ")
      : "",
    destination: resolveOtlpUrls(config.otlpEndpoint),
    filters: config.filters,
  };
}

export const emptyConfig = DEFAULT_CONFIG;
