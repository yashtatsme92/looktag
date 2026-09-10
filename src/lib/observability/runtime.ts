import {
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
} from "@opentelemetry/semantic-conventions";
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
} from "./model";
import { newSpanId, newTraceId, sanitizeAttributes, unixNano } from "./model";

export type SpanRecorder = {
  traceId: string;
  spanId: string;
  setAttribute: (key: string, value: string | number | boolean) => void;
  setAttributes: (attrs: Attributes) => void;
  addEvent: (name: string, attrs?: Attributes) => void;
  recordException: (error: unknown) => void;
  setStatus: (status: SpanStatusName, message?: string) => void;
};

type Sink = (signals: TelemetrySignal[]) => void | Promise<void>;
type SpanRef = { traceId: string; spanId: string };

let sink: Sink | null = null;
const queue: TelemetrySignal[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const clientStack: SpanRef[] = [];

export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

export function enqueueSignals(signals: TelemetrySignal[]) {
  if (signals.length === 0) return;
  queue.push(...signals);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushSignals();
  }, 40);
}

export async function flushSignals(): Promise<void> {
  if (queue.length === 0 || !sink) return;
  const batch = queue.splice(0, 60);
  try {
    await sink(batch);
  } catch {
    // Never fail the product path because a collector is down.
  }
  if (queue.length > 0) await flushSignals();
}

function emit(signal: TelemetrySignal) {
  enqueueSignals([signal]);
}

function inheritParent(options?: { traceId?: string; parentSpanId?: string }): SpanRef | undefined {
  if (options?.traceId || options?.parentSpanId) {
    return options.traceId ? { traceId: options.traceId, spanId: options.parentSpanId || "" } : undefined;
  }
  if (typeof window === "undefined") return undefined;
  return clientStack.at(-1);
}

export function startSpan(
  name: string,
  options?: { kind?: SpanKindName; attributes?: Attributes; traceId?: string; parentSpanId?: string },
): SpanRecorder & { end: (error?: unknown) => CompletedSpan } {
  const startMs = Date.now();
  const attributes = sanitizeAttributes(options?.attributes);
  const events: SpanEvent[] = [];
  let status: SpanStatusName = "UNSET";
  let statusMessage: string | undefined;
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
  options?: { kind?: SpanKindName; attributes?: Attributes; traceId?: string; parentSpanId?: string },
): Promise<T> {
  const span = startSpan(name, { kind: options?.kind ?? "SERVER", attributes: options?.attributes, traceId: options?.traceId, parentSpanId: options?.parentSpanId });
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
  const record: LogRecord = {
    kind: "log",
    id: newSpanId(),
    severity,
    body: body.slice(0, 500),
    timeUnixNano: unixNano(),
    traceId: options?.traceId,
    spanId: options?.spanId,
    attributes: sanitizeAttributes(options?.attributes),
  };
  emit(record);
}
