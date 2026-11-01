import type { CompletedSpan, TelemetrySignal } from "./model.ts";
import { clampSampleRatio } from "./model.ts";
import { deploymentEnvironmentName, type ResourceEnv } from "./resource.ts";
import { traceFlagsSampled } from "./traceparent.ts";

/**
 * Production samples 1 in 10 successful traces. OTEL_TRACES_SAMPLER_ARG overrides
 * that and any stored default of 1. A stored ratio other than 1 is an admin choice.
 */
export function effectiveSampleRatio(stored: number, env: ResourceEnv = {}): number {
  const raw = env.OTEL_TRACES_SAMPLER_ARG;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) {
    return clampSampleRatio(Number(raw));
  }
  if (deploymentEnvironmentName(env) === "production" && (!Number.isFinite(stored) || stored === 1)) {
    return 0.1;
  }
  return clampSampleRatio(stored);
}

/**
 * Head decision. A trusted parent (another service we run) keeps its sampled
 * flag. Browser parents are not trusted: the server's own ratio decides, and
 * the trace id is still continued. Errors are upgraded by the caller.
 */
export function headSampleDecision(input: {
  incomingFlags?: string;
  ratio: number;
  random?: () => number;
  trustParent?: boolean;
}): boolean {
  if (input.trustParent && input.incomingFlags !== undefined) return traceFlagsSampled(input.incomingFlags);
  const ratio = clampSampleRatio(input.ratio);
  if (ratio >= 1) return true;
  if (ratio <= 0) return false;
  return (input.random ?? Math.random)() < ratio;
}

function httpStatus(span: CompletedSpan): number | undefined {
  const value = span.attributes["http.status_code"];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function failed(span: CompletedSpan): boolean {
  const status = httpStatus(span);
  return span.status === "ERROR" || (status !== undefined && status >= 500);
}

export const TRACE_GATE_TTL_MS = 60_000;
export const TRACE_GATE_MAX_TRACES = 1024;

/**
 * Tail-ish gate. Children wait for the request span. An error (5xx or exception)
 * keeps the whole trace, including spans that would have been sampled out.
 * `keep` and `held` expire after a TTL and are capped so a long-lived process
 * cannot grow them without bound.
 */
export class TraceGate {
  private readonly keep = new Map<string, boolean>();
  private readonly held = new Map<string, CompletedSpan[]>();
  private readonly seen = new Map<string, number>();
  private ratio: number;
  private readonly random: () => number;
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly now: () => number;

  constructor(
    ratio: number,
    random: () => number = Math.random,
    options?: { ttlMs?: number; maxSize?: number; now?: () => number },
  ) {
    this.ratio = ratio;
    this.random = random;
    this.ttlMs = options?.ttlMs ?? TRACE_GATE_TTL_MS;
    this.maxSize = Math.max(1, options?.maxSize ?? TRACE_GATE_MAX_TRACES);
    this.now = options?.now ?? Date.now;
  }

  get traceCount(): number {
    return this.seen.size;
  }

  /** The server calls this when it handles a request, before the span is flushed. */
  record(traceId: string, sampled: boolean): void {
    this.touch(traceId);
    if (this.keep.get(traceId) === true) return;
    this.keep.set(traceId, sampled);
  }

  setRatio(ratio: number): void {
    this.ratio = ratio;
  }

  push(signal: TelemetrySignal): TelemetrySignal[] {
    if (signal.kind !== "span") return [signal];
    this.touch(signal.traceId);
    return this.consider(signal);
  }

  /** LRU map: the front is the oldest trace. Expiry and the cap are O(1) per span. */
  private touch(traceId: string) {
    const now = this.now();
    this.expireFront(now);
    this.seen.delete(traceId);
    this.seen.set(traceId, now);
    while (this.seen.size > this.maxSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined || oldest === traceId) break;
      this.forget(oldest);
    }
  }

  private expireFront(now: number) {
    while (this.seen.size > 0) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      const at = this.seen.get(oldest);
      if (at === undefined || now - at < this.ttlMs) break;
      this.forget(oldest);
    }
  }

  private forget(traceId: string) {
    this.keep.delete(traceId);
    this.held.delete(traceId);
    this.seen.delete(traceId);
  }

  private decide(span: CompletedSpan, sampled: boolean): CompletedSpan[] {
    this.keep.set(span.traceId, sampled);
    const prev = this.held.get(span.traceId) ?? [];
    this.held.delete(span.traceId);
    return sampled ? [...prev, span] : [];
  }

  private consider(span: CompletedSpan): CompletedSpan[] {
    if (failed(span)) return this.decide(span, true);
    const prior = this.keep.get(span.traceId);
    const browserHttp = span.spanKind === "CLIENT" && span.name.startsWith("HTTP ");
    // The browser span is the parent. It does not wait for a server span that
    // may already have been sampled on the request path. A recorded decision
    // (set when the server handled that trace id) wins. Otherwise the ratio
    // decides now — a client `sampled` bit is not trusted.
    if (browserHttp) {
      if (prior === true) return [span];
      if (prior === false) return [];
      return this.decide(span, this.ratioKeeps());
    }
    const child = Boolean(span.parentSpanId) && !span.traceRoot;
    if (child) {
      if (prior === true) return [span];
      const list = this.held.get(span.traceId) ?? [];
      list.push(span);
      this.held.set(span.traceId, list);
      return [];
    }
    if (prior === true) return this.decide(span, true);
    const sampled = typeof span.sampled === "boolean" ? span.sampled : this.ratioKeeps();
    return this.decide(span, sampled);
  }

  private ratioKeeps(): boolean {
    const ratio = clampSampleRatio(this.ratio);
    if (ratio >= 1) return true;
    if (ratio <= 0) return false;
    return this.random() < ratio;
  }
}

let attachedGate: TraceGate | null = null;

/** Store binds the process gate so a request can record its decision before the span is flushed. */
export function attachTraceGate(gate: TraceGate | null): void {
  attachedGate = gate;
}

export function recordTraceDecision(traceId: string, sampled: boolean): void {
  attachedGate?.record(traceId, sampled);
}
