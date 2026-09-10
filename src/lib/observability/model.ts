import { DEFAULT_FILTERS, type TraceFilter } from "./graph.ts";

export type AttrValue = string | number | boolean;
export type Attributes = Record<string, AttrValue>;

export type SignalKind = "span" | "metric" | "log";
export type SpanStatusName = "UNSET" | "OK" | "ERROR";
export type SpanKindName = "INTERNAL" | "SERVER" | "CLIENT";
export type LogSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type MetricType = "counter" | "histogram" | "gauge";

export type SpanEvent = {
  name: string;
  timeUnixNano: string;
  attributes?: Attributes;
};

export type CompletedSpan = {
  kind: "span";
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  spanKind: SpanKindName;
  status: SpanStatusName;
  statusMessage?: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  durationMs: number;
  attributes: Attributes;
  events: SpanEvent[];
};

export type MetricPoint = {
  kind: "metric";
  id: string;
  name: string;
  description?: string;
  unit?: string;
  type: MetricType;
  value: number;
  timeUnixNano: string;
  attributes: Attributes;
};

export type LogRecord = {
  kind: "log";
  id: string;
  traceId?: string;
  spanId?: string;
  severity: LogSeverity;
  body: string;
  timeUnixNano: string;
  attributes: Attributes;
};

export type TelemetrySignal = CompletedSpan | MetricPoint | LogRecord;

export type PublicSignal = {
  id: string;
  kind: SignalKind;
  name: string;
  status: string;
  traceId: string | null;
  spanId: string | null;
  parentSpanId: string | null;
  spanKind: string | null;
  durationMs: number | null;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
};

export type TelemetrySummary = {
  spans: number;
  errors: number;
  metrics: number;
  logs: number;
  traces: number;
  p95Ms: number;
  lastExport: string;
};

export type { TraceFilter };

export type ObservabilityConfig = {
  enabled: boolean;
  tracesEnabled: boolean;
  metricsEnabled: boolean;
  logsEnabled: boolean;
  serviceName: string;
  otlpEndpoint: string;
  otlpHeaders: string;
  sampleRatio: number;
  filters: TraceFilter[];
};

export const DEFAULT_CONFIG: ObservabilityConfig = {
  enabled: true,
  tracesEnabled: true,
  metricsEnabled: true,
  logsEnabled: true,
  serviceName: "looktag",
  otlpEndpoint: "",
  otlpHeaders: "",
  sampleRatio: 1,
  filters: DEFAULT_FILTERS,
};

const SENSITIVE = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|image|dataurl/i;

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newTraceId(): string {
  return randomHex(16);
}

export function newSpanId(): string {
  return randomHex(8);
}

export function unixNano(ms = Date.now()): string {
  return (BigInt(Math.round(ms)) * 1_000_000n).toString();
}

export function nanoToMs(nano: string): number {
  try {
    return Number(BigInt(nano) / 1_000_000n);
  } catch {
    return 0;
  }
}

export function sanitizeAttributes(input?: Attributes | Record<string, unknown>): Attributes {
  const out: Attributes = {};
  if (!input) return out;
  for (const [rawKey, raw] of Object.entries(input)) {
    const key = rawKey.slice(0, 80);
    if (!key || SENSITIVE.test(key)) continue;
    if (typeof raw === "boolean") {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "string") {
      if (raw.startsWith("data:")) continue;
      out[key] = raw.slice(0, 280);
    }
  }
  return out;
}

export function parseOtlpHeaders(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string" && key.trim()) headers[key.trim()] = value;
      }
      return headers;
    } catch {
      return {};
    }
  }
  const headers: Record<string, string> = {};
  for (const part of trimmed.split(",")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

export function maskOtlpHeaders(raw: string): string {
  const headers = parseOtlpHeaders(raw);
  return Object.keys(headers)
    .map((key) => `${key}=••••`)
    .join(", ");
}

export type OtlpUrls = { traces: string; metrics: string; logs: string };

export function resolveOtlpUrls(endpoint: string): OtlpUrls | null {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (/\/v1\/(traces|metrics|logs)$/.test(trimmed)) {
    const base = trimmed.replace(/\/v1\/(traces|metrics|logs)$/, "");
    return { traces: `${base}/v1/traces`, metrics: `${base}/v1/metrics`, logs: `${base}/v1/logs` };
  }
  if (trimmed.endsWith("/v1")) {
    return { traces: `${trimmed}/traces`, metrics: `${trimmed}/metrics`, logs: `${trimmed}/logs` };
  }
  return { traces: `${trimmed}/v1/traces`, metrics: `${trimmed}/v1/metrics`, logs: `${trimmed}/v1/logs` };
}

export function clampSampleRatio(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function shouldSample(ratio: number, isError: boolean): boolean {
  if (isError) return true;
  const clamped = clampSampleRatio(ratio);
  if (clamped >= 1) return true;
  if (clamped <= 0) return false;
  return Math.random() < clamped;
}

export function configFromEnv(
  env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env,
): Partial<ObservabilityConfig> {
  const disabled = env.OTEL_SDK_DISABLED === "true" || env.OTEL_SDK_DISABLED === "1";
  const sampleRaw = env.OTEL_TRACES_SAMPLER_ARG;
  const sample = sampleRaw ? Number(sampleRaw) : undefined;
  return {
    enabled: disabled ? false : true,
    serviceName: env.OTEL_SERVICE_NAME?.trim() || undefined,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || undefined,
    otlpHeaders: env.OTEL_EXPORTER_OTLP_HEADERS?.trim() || undefined,
    sampleRatio: sample !== undefined && Number.isFinite(sample) ? clampSampleRatio(sample) : undefined,
  };
}

export function mergeConfig(
  stored: Partial<ObservabilityConfig> | null,
  env: Partial<ObservabilityConfig> = configFromEnv(),
): ObservabilityConfig {
  return {
    ...DEFAULT_CONFIG,
    ...pickDefined(env),
    ...pickDefined(stored),
    filters: stored?.filters ?? DEFAULT_CONFIG.filters,
  };
}

function pickDefined<T extends object>(input: T | null | undefined): Partial<T> {
  if (!input) return {};
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input) as [keyof T, T[keyof T]][]) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
