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
 * Parent-based head decision. An incoming traceparent's sampled flag wins.
 * With no parent, the ratio applies. Errors are upgraded by the caller so the
 * response flag still matches what is exported.
 */
export function headSampleDecision(input: {
  incomingFlags?: string;
  ratio: number;
  random?: () => number;
}): boolean {
  if (input.incomingFlags !== undefined) return traceFlagsSampled(input.incomingFlags);
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
  private readonly ratio: number;
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

  push(signal: TelemetrySignal): TelemetrySignal[] {
    if (signal.kind !== "span") return [signal];
    this.note(signal.traceId);
    return this.consider(signal);
  }

  private note(traceId: string) {
    const now = this.now();
    for (const [id, at] of [...this.seen]) {
      if (id === traceId) continue;
      if (now - at >= this.ttlMs) this.forget(id);
    }
    const previous = this.seen.get(traceId);
    if (previous !== undefined && now - previous >= this.ttlMs) this.forget(traceId);
    this.seen.delete(traceId);
    this.seen.set(traceId, now);
    while (this.seen.size > this.maxSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined || oldest === traceId) break;
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
    if (prior === true) return [span];
    if (prior === false) return [];
    // Children and the browser HTTP span wait for the request span so a 5xx
    // can still keep them. Other roots (navigation, funnel) are decided now.
    const child = Boolean(span.parentSpanId) && !span.traceRoot;
    const browserHttp = span.spanKind === "CLIENT" && span.name.startsWith("HTTP ") && !span.traceRoot;
    if (!child && !browserHttp) {
      const sampled =
        typeof span.sampled === "boolean"
          ? span.sampled
          : clampSampleRatio(this.ratio) >= 1 || (this.ratio > 0 && this.random() < clampSampleRatio(this.ratio));
      return this.decide(span, sampled);
    }
    const list = this.held.get(span.traceId) ?? [];
    list.push(span);
    this.held.set(span.traceId, list);
    return [];
  }
}
