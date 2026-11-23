import { readFileSync } from "node:fs";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  ATTR_VCS_REF_HEAD_REVISION,
  appEnv,
} from "../providers/telemetry/index.ts";
import { readPackageVersion, resolveRuntimeCommit } from "../build-commit.ts";
import type {
  AttrValue,
  Attributes,
  CompletedSpan,
  LogRecord,
  MetricPoint,
  ObservabilityConfig,
  SpanKindName,
  SpanStatusName,
} from "./model.ts";
import { unixNano } from "./model.ts";

const SPAN_KIND: Record<SpanKindName, number> = {
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
};

const SPAN_STATUS: Record<SpanStatusName, number> = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

const SEVERITY: Record<LogRecord["severity"], number> = {
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
};

const HISTOGRAM_BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export type OtlpAnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

export type OtlpKeyValue = { key: string; value: OtlpAnyValue };

export function otlpValue(value: AttrValue): OtlpAnyValue {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value) && Number.isSafeInteger(value)) return { intValue: String(value) };
    return { doubleValue: value };
  }
  return { stringValue: value };
}

export function otlpAttributes(attrs: Attributes): OtlpKeyValue[] {
  return Object.entries(attrs).map(([key, value]) => ({ key, value: otlpValue(value) }));
}

export type TraceResourceIdentity = {
  version: string;
  commit: string;
  environment?: string;
};

/** Same version and commit `/api/version` reports. Vite bakes both; runtime env fills an unknown commit. */
export function traceResourceIdentity(
  env: NodeJS.ProcessEnv = typeof process === "undefined" ? {} : process.env,
): Pick<TraceResourceIdentity, "version" | "commit"> {
  const bakedVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__.trim() : "";
  const version = bakedVersion || readPackageVersion(
    JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: unknown },
  );
  const bakedCommit = typeof __APP_COMMIT__ === "string" && __APP_COMMIT__.trim() ? __APP_COMMIT__ : "unknown";
  return { version, commit: resolveRuntimeCommit(bakedCommit, env) };
}

export function resourceAttributes(serviceName: string, identity?: TraceResourceIdentity): Attributes {
  const defaults = identity ? null : traceResourceIdentity();
  const version = identity?.version ?? defaults?.version ?? "unknown";
  const commit = identity?.commit ?? defaults?.commit ?? "unknown";
  const envName = identity?.environment ?? (typeof process === "undefined" ? "development" : appEnv());
  return {
    [ATTR_SERVICE_NAME]: serviceName || "looktag",
    [ATTR_SERVICE_VERSION]: version,
    [ATTR_VCS_REF_HEAD_REVISION]: commit,
    [ATTR_TELEMETRY_SDK_NAME]: "looktag",
    [ATTR_TELEMETRY_SDK_LANGUAGE]: "javascript",
    [ATTR_TELEMETRY_SDK_VERSION]: version,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: String(envName),
  };
}

function resource(serviceName: string) {
  return { attributes: otlpAttributes(resourceAttributes(serviceName)) };
}

function scope(serviceName: string) {
  const version = String(resourceAttributes(serviceName)[ATTR_SERVICE_VERSION] ?? "");
  return { name: "looktag", version };
}

export function encodeOtlpTraces(spans: CompletedSpan[], serviceName: string) {
  return {
    resourceSpans: [
      {
        resource: resource(serviceName),
        scopeSpans: [
          {
            scope: scope(serviceName),
            spans: spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              parentSpanId: span.parentSpanId || undefined,
              name: span.name,
              kind: SPAN_KIND[span.spanKind],
              startTimeUnixNano: span.startTimeUnixNano,
              endTimeUnixNano: span.endTimeUnixNano,
              attributes: otlpAttributes(span.attributes),
              events: span.events.map((event) => ({
                timeUnixNano: event.timeUnixNano,
                name: event.name,
                attributes: otlpAttributes(event.attributes ?? {}),
              })),
              status: {
                code: SPAN_STATUS[span.status],
                message: span.statusMessage || undefined,
              },
            })),
          },
        ],
      },
    ],
  };
}

function histogramBuckets(value: number) {
  const counts = HISTOGRAM_BOUNDS.map(() => 0);
  let placed = false;
  for (let i = 0; i < HISTOGRAM_BOUNDS.length; i += 1) {
    if (value <= HISTOGRAM_BOUNDS[i]) {
      counts[i] = 1;
      placed = true;
      break;
    }
  }
  const overflow = placed ? 0 : 1;
  return { explicitBounds: HISTOGRAM_BOUNDS, bucketCounts: [...counts, overflow].map(String) };
}

export function encodeOtlpMetrics(points: MetricPoint[], serviceName: string) {
  return {
    resourceMetrics: [
      {
        resource: resource(serviceName),
        scopeMetrics: [
          {
            scope: scope(serviceName),
            metrics: points.map((point) => {
              const attributes = otlpAttributes(point.attributes);
              if (point.type === "histogram") {
                const buckets = histogramBuckets(point.value);
                return {
                  name: point.name,
                  description: point.description || "",
                  unit: point.unit || "ms",
                  histogram: {
                    aggregationTemporality: 2,
                    dataPoints: [
                      {
                        attributes,
                        timeUnixNano: point.timeUnixNano,
                        count: "1",
                        sum: point.value,
                        ...buckets,
                      },
                    ],
                  },
                };
              }
              if (point.type === "gauge") {
                return {
                  name: point.name,
                  description: point.description || "",
                  unit: point.unit || "1",
                  gauge: {
                    dataPoints: [
                      {
                        attributes,
                        timeUnixNano: point.timeUnixNano,
                        asDouble: point.value,
                      },
                    ],
                  },
                };
              }
              return {
                name: point.name,
                description: point.description || "",
                unit: point.unit || "1",
                sum: {
                  aggregationTemporality: 2,
                  isMonotonic: true,
                  dataPoints: [
                    {
                      attributes,
                      timeUnixNano: point.timeUnixNano,
                      asDouble: point.value,
                    },
                  ],
                },
              };
            }),
          },
        ],
      },
    ],
  };
}

export function encodeOtlpLogs(records: LogRecord[], serviceName: string) {
  return {
    resourceLogs: [
      {
        resource: resource(serviceName),
        scopeLogs: [
          {
            scope: scope(serviceName),
            logRecords: records.map((record) => ({
              timeUnixNano: record.timeUnixNano,
              severityNumber: SEVERITY[record.severity],
              severityText: record.severity,
              body: { stringValue: record.body },
              attributes: otlpAttributes(record.attributes),
              traceId: record.traceId || undefined,
              spanId: record.spanId || undefined,
            })),
          },
        ],
      },
    ],
  };
}

export function probeSpan(serviceName: string): CompletedSpan {
  const start = Date.now() - 4;
  return {
    kind: "span",
    id: `probe-${start}`,
    traceId: "b".repeat(32),
    spanId: "c".repeat(16),
    name: "looktag.otlp.probe",
    spanKind: "INTERNAL",
    status: "OK",
    startTimeUnixNano: unixNano(start),
    endTimeUnixNano: unixNano(Date.now()),
    durationMs: 4,
    attributes: {
      [ATTR_SERVICE_NAME]: serviceName,
      "looktag.probe": true,
    },
    events: [],
  };
}

export function encodeProbe(config: ObservabilityConfig) {
  return encodeOtlpTraces([probeSpan(config.serviceName)], config.serviceName);
}
