import type { SpanKindName, SpanStatusName, TelemetrySignal } from "./model.ts";
import { sanitizeAttributes } from "./model.ts";

/** Whole ingest body, including the resource. Larger payloads are rejected. */
export const INGEST_MAX_BYTES = 64 * 1024;
const MAX_SIGNALS = 40;

const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;
const NANO = /^\d{1,20}$/;

export function ingestPayloadBytes(input: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(input)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function ingestPayloadTooLarge(input: unknown): boolean {
  return ingestPayloadBytes(input) > INGEST_MAX_BYTES;
}

/**
 * Anonymous client signals. Invalid rows are dropped. A non-array is rejected
 * (`null`) so the handler can answer 400 instead of guessing.
 */
export function parseClientSignals(raw: unknown): TelemetrySignal[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TelemetrySignal[] = [];
  for (const row of raw.slice(0, MAX_SIGNALS)) {
    const signal = parseOne(row);
    if (signal) out.push(signal);
  }
  return out;
}

function parseOne(raw: unknown): TelemetrySignal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === "span") return parseSpan(row);
  if (row.kind === "metric") return parseMetric(row);
  if (row.kind === "log") return parseLog(row);
  return null;
}

function parseSpan(row: Record<string, unknown>): TelemetrySignal | null {
  const traceId = hex(row.traceId, TRACE_ID);
  const spanId = hex(row.spanId, SPAN_ID);
  const name = text(row.name, 160);
  if (!traceId || !spanId || !name) return null;
  const parent = row.parentSpanId === undefined || row.parentSpanId === null ? undefined : hex(row.parentSpanId, SPAN_ID);
  if (row.parentSpanId !== undefined && row.parentSpanId !== null && !parent) return null;
  const start = nano(row.startTimeUnixNano);
  const end = nano(row.endTimeUnixNano);
  if (!start || !end) return null;
  const duration = durationMs(row.durationMs);
  if (duration === null) return null;
  const spanKind = spanKindOf(row.spanKind);
  const status = statusOf(row.status);
  return {
    kind: "span",
    id: text(row.id, 64) || spanId,
    traceId,
    spanId,
    parentSpanId: parent ?? undefined,
    name,
    spanKind,
    status,
    statusMessage: row.statusMessage === undefined ? undefined : text(row.statusMessage, 280) || undefined,
    startTimeUnixNano: start,
    endTimeUnixNano: end,
    durationMs: duration,
    attributes: sanitizeAttributes(record(row.attributes)),
    events: [],
    traceRoot: row.traceRoot === true,
  };
}

function parseMetric(row: Record<string, unknown>): TelemetrySignal | null {
  const name = text(row.name, 160);
  if (!name || typeof row.value !== "number" || !Number.isFinite(row.value)) return null;
  const time = nano(row.timeUnixNano);
  if (!time) return null;
  const type = row.type === "histogram" || row.type === "gauge" ? row.type : row.type === "counter" ? "counter" : null;
  if (!type) return null;
  return {
    kind: "metric",
    id: text(row.id, 64) || name,
    name,
    type,
    value: row.value,
    unit: row.unit === undefined ? undefined : text(row.unit, 24) || undefined,
    timeUnixNano: time,
    attributes: sanitizeAttributes(record(row.attributes)),
  };
}

function parseLog(row: Record<string, unknown>): TelemetrySignal | null {
  const body = text(row.body, 500);
  if (!body) return null;
  const time = nano(row.timeUnixNano);
  if (!time) return null;
  const severity = row.severity === "DEBUG" || row.severity === "WARN" || row.severity === "ERROR" || row.severity === "INFO" ? row.severity : null;
  if (!severity) return null;
  const traceId = row.traceId === undefined || row.traceId === null ? undefined : hex(row.traceId, TRACE_ID);
  if (row.traceId !== undefined && row.traceId !== null && !traceId) return null;
  const spanId = row.spanId === undefined || row.spanId === null ? undefined : hex(row.spanId, SPAN_ID);
  if (row.spanId !== undefined && row.spanId !== null && !spanId) return null;
  return {
    kind: "log",
    id: text(row.id, 64) || "log",
    severity,
    body,
    timeUnixNano: time,
    traceId: traceId ?? undefined,
    spanId: spanId ?? undefined,
    attributes: sanitizeAttributes(record(row.attributes)),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function hex(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim().toLowerCase();
  return pattern.test(next) ? next : null;
}

function nano(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return String(Math.trunc(value));
  if (typeof value !== "string") return null;
  const next = value.trim();
  return NANO.test(next) ? next : null;
}

function durationMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(600_000, Math.round(value));
}

function spanKindOf(value: unknown): SpanKindName {
  if (value === "CLIENT" || value === "SERVER" || value === "INTERNAL") return value;
  return "INTERNAL";
}

function statusOf(value: unknown): SpanStatusName {
  if (value === "ERROR" || value === "OK" || value === "UNSET") return value;
  return "UNSET";
}
