import type { CompletedSpan, TelemetrySignal } from "./model.ts";
import { clampSampleRatio } from "./model.ts";
import { deploymentEnvironmentName, type ResourceEnv } from "./resource.ts";

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

function httpStatus(span: CompletedSpan): number | undefined {
  const value = span.attributes["http.status_code"];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function failed(span: CompletedSpan): boolean {
  const status = httpStatus(span);
  return span.status === "ERROR" || (status !== undefined && status >= 500);
}

/**
 * Tail-ish gate. Children wait for the request span. An error (5xx or exception)
 * keeps the whole trace, including spans that would have been sampled out.
 */
export class TraceGate {
  private readonly keep = new Map<string, boolean>();
  private readonly held = new Map<string, CompletedSpan[]>();
  private readonly ratio: number;
  private readonly random: () => number;

  constructor(ratio: number, random: () => number = Math.random) {
    this.ratio = ratio;
    this.random = random;
  }

  push(signal: TelemetrySignal): TelemetrySignal[] {
    if (signal.kind !== "span") return [signal];
    return this.consider(signal);
  }

  private consider(span: CompletedSpan): CompletedSpan[] {
    if (failed(span)) {
      this.keep.set(span.traceId, true);
      const prev = this.held.get(span.traceId) ?? [];
      this.held.delete(span.traceId);
      return [...prev, span];
    }
    const prior = this.keep.get(span.traceId);
    if (prior === true) return [span];
    if (prior === false) return [];
    // Children and the browser HTTP span wait for the request span so a 5xx
    // can still keep them. Other roots (navigation, funnel) are decided now.
    const child = Boolean(span.parentSpanId) && !span.traceRoot;
    const browserHttp = span.spanKind === "CLIENT" && span.name.startsWith("HTTP ") && !span.traceRoot;
    if (!child && !browserHttp) {
      const ratio = clampSampleRatio(this.ratio);
      const sampled = ratio >= 1 || (ratio > 0 && this.random() < ratio);
      this.keep.set(span.traceId, sampled);
      const prev = this.held.get(span.traceId) ?? [];
      this.held.delete(span.traceId);
      return sampled ? [...prev, span] : [];
    }
    const list = this.held.get(span.traceId) ?? [];
    list.push(span);
    this.held.set(span.traceId, list);
    return [];
  }
}
