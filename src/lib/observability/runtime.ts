import { activeSpan } from "./active-span.ts";
import {
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
} from "../providers/telemetry/index.ts";
import type {
  Attributes,
  CompletedSpan,
  LogRecord,
  LogSeverity,
  MetricPoint,
  MetricType,
  SpanEvent,
  SpanKindName,
  SpanStatusName,
  TelemetrySignal,
} from "./model.ts";
import { newSpanId, newTraceId, sanitizeAttributes, unixNano } from "./model.ts";

export type SpanRecorder = {
  traceId: string;
  spanId: string;
  setAttribute: (key: string, value: string | number | boolean) => void;
  setAttributes: (attrs: Attributes) => void;
  addEvent: (name: string, attrs?: Attributes) => void;
  recordException: (error: unknown) => void;
  setStatus: (status: SpanStatusName, message?: string) => void;
  setSampled: (sampled: boolean) => void;
};

type Sink = (signals: TelemetrySignal[]) => void | Promise<void>;
type SpanRef = { traceId: string; spanId: string };

let sink: Sink | null = null;
const queue: TelemetrySignal[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let flushDeadline = 0;
let flushDeferred: () => boolean = () => false;
const FLUSH_QUIET_MS = 1_500;
const FLUSH_MAX_MS = 8_000;
/** One ingest call carries at most this many signals (the server keeps 40). */
const FLUSH_BATCH = 40;
const clientStack: SpanRef[] = [];

export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

/** When this returns true, the flush waits. The browser sets it while a traced fetch is in flight. */
export function setFlushDeferred(next: (() => boolean) | null) {
  flushDeferred = next ?? (() => false);
}

export function enqueueSignals(signals: TelemetrySignal[]) {
  if (signals.length === 0) return;
  const now = Date.now();
  if (queue.length === 0) flushDeadline = now + FLUSH_MAX_MS;
  queue.push(...signals);
  scheduleFlush(now);
}

function scheduleFlush(now = Date.now()) {
  if (flushTimer) clearTimeout(flushTimer);
  const wait = Math.max(0, Math.min(FLUSH_QUIET_MS, flushDeadline - now));
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSignals();
  }, wait);
}

export async function flushSignals(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (flushDeferred()) {
    scheduleFlush(Date.now());
    return;
  }
  if (queue.length === 0 || !sink || flushing) {
    if (flushing && queue.length > 0) scheduleFlush(Date.now());
    return;
  }
  flushing = true;
  const batch = queue.splice(0, FLUSH_BATCH);
  flushDeadline = 0;
  try {
    await sink(batch);
  } catch {
    // Never fail the product path because a collector is down.
  } finally {
    flushing = false;
  }
  if (queue.length > 0) scheduleFlush(Date.now());
}

function emit(signal: TelemetrySignal) {
  enqueueSignals([signal]);
}

function inheritParent(options?: { traceId?: string; parentSpanId?: string; root?: boolean }): SpanRef | undefined {
  if (options?.root) return undefined;
  if (options?.traceId || options?.parentSpanId) {
    return options.traceId ? { traceId: options.traceId, spanId: options.parentSpanId || "" } : undefined;
  }
  const server = activeSpan();
  if (server?.traceId) return { traceId: server.traceId, spanId: server.spanId };
  if (typeof window === "undefined") return undefined;
  return clientStack.at(-1);
}

export function startSpan(
  name: string,
  options?: {
    kind?: SpanKindName;
    attributes?: Attributes;
    traceId?: string;
    parentSpanId?: string;
    root?: boolean;
    traceRoot?: boolean;
    sampled?: boolean;
  },
): SpanRecorder & { end: (error?: unknown) => CompletedSpan } {
  const startMs = Date.now();
  const inheritedApp: Attributes = {};
  if (!options?.root) {
    for (const [key, value] of Object.entries(activeSpan()?.attributes ?? {})) {
      if (key.startsWith("app.")) inheritedApp[key] = value;
    }
  }
  const attributes = sanitizeAttributes({ ...inheritedApp, ...options?.attributes });
  const events: SpanEvent[] = [];
  let status: SpanStatusName = "UNSET";
  let statusMessage: string | undefined;
  let sampled = options?.sampled;
  const inherited = inheritParent(options);
  const traceId = options?.traceId || inherited?.traceId || newTraceId();
  const parentSpanId = options?.parentSpanId || (inherited?.spanId ? inherited.spanId : undefined);
  const spanId = newSpanId();
  const onClient = typeof window !== "undefined";
  if (onClient) clientStack.push({ traceId, spanId });
  const recorder: SpanRecorder & { end: (error?: unknown) => CompletedSpan } = {
    traceId,
    spanId,
    setAttribute(key, value) {
      Object.assign(attributes, sanitizeAttributes({ [key]: value }));
    },
    setAttributes(attrs) {
      Object.assign(attributes, sanitizeAttributes(attrs));
    },
    addEvent(eventName, attrs) {
      events.push({
        name: eventName.slice(0, 120),
        timeUnixNano: unixNano(),
        attributes: sanitizeAttributes(attrs),
      });
    },
    recordException(error) {
      const err = error instanceof Error ? error : new Error(String(error));
      status = "ERROR";
      statusMessage = err.message.slice(0, 280);
      events.push({
        name: "exception",
        timeUnixNano: unixNano(),
        attributes: sanitizeAttributes({
          [ATTR_EXCEPTION_TYPE]: err.name,
          [ATTR_EXCEPTION_MESSAGE]: err.message,
          [ATTR_ERROR_TYPE]: err.name,
        }),
      });
    },
    setStatus(next, message) {
      status = next;
      if (message) statusMessage = message.slice(0, 280);
    },
    setSampled(next) {
      sampled = next;
    },
    end(error) {
      if (onClient) {
        for (let idx = clientStack.length - 1; idx >= 0; idx -= 1) {
          if (clientStack[idx]?.spanId === spanId) {
            clientStack.splice(idx, 1);
            break;
          }
        }
      }
      if (error) recorder.recordException(error);
      else if (status === "UNSET") status = "OK";
      const endMs = Date.now();
      const span: CompletedSpan = {
        kind: "span",
        id: spanId,
        traceId,
        spanId,
        parentSpanId,
        name,
        spanKind: options?.kind ?? "INTERNAL",
        status,
        statusMessage,
        startTimeUnixNano: unixNano(startMs),
        endTimeUnixNano: unixNano(endMs),
        durationMs: Math.max(0, endMs - startMs),
        attributes,
        events,
        traceRoot: options?.traceRoot,
        sampled,
      };
      emit(span);
      if (status !== "ERROR") {
        recordMetric("looktag.span.duration", span.durationMs, {
          type: "histogram",
          unit: "ms",
          attributes: { "span.name": name },
        });
      } else {
        recordMetric("looktag.span.errors", 1, {
          type: "counter",
          attributes: { "span.name": name },
        });
      }
      return span;
    },
  };
  return recorder;
}

export async function withSpan<T>(
  name: string,
  fn: (span: SpanRecorder) => Promise<T> | T,
  options?: { kind?: SpanKindName; attributes?: Attributes; traceId?: string; parentSpanId?: string; root?: boolean; traceRoot?: boolean },
): Promise<T> {
  const span = startSpan(name, {
    kind: options?.kind ?? "SERVER",
    attributes: options?.attributes,
    traceId: options?.traceId,
    parentSpanId: options?.parentSpanId,
    root: options?.root,
    traceRoot: options?.traceRoot,
  });
  try {
    const result = await fn(span);
    span.end();
    return result;
  } catch (error) {
    span.end(error);
    throw error;
  }
}

export function recordMetric(
  name: string,
  value: number,
  options?: { type?: MetricType; unit?: string; description?: string; attributes?: Attributes },
) {
  if (!Number.isFinite(value)) return;
  const point: MetricPoint = {
    kind: "metric",
    id: newSpanId(),
    name,
    type: options?.type ?? "counter",
    value,
    unit: options?.unit,
    description: options?.description,
    timeUnixNano: unixNano(),
    attributes: sanitizeAttributes(options?.attributes),
  };
  emit(point);
}

export function emitLog(
  severity: LogSeverity,
  body: string,
  options?: { attributes?: Attributes; traceId?: string; spanId?: string },
) {
  const active = activeSpan();
  const record: LogRecord = {
    kind: "log",
    id: newSpanId(),
    severity,
    body: body.slice(0, 500),
    timeUnixNano: unixNano(),
    traceId: options?.traceId || active?.traceId,
    spanId: options?.spanId || active?.spanId,
    attributes: sanitizeAttributes({
      ...(active?.requestId ? { "app.request_id": active.requestId } : {}),
      ...options?.attributes,
    }),
  };
  emit(record);
}
