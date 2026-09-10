import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  clampSampleRatio,
  mergeConfig,
  newSpanId,
  newTraceId,
  parseOtlpHeaders,
  resolveOtlpUrls,
  sanitizeAttributes,
  unixNano,
} from "./model.ts";
import { encodeOtlpLogs, encodeOtlpMetrics, encodeOtlpTraces, otlpValue } from "./otlp.ts";

describe("OTLP encoding", () => {
  it("uses 32-char trace ids and 16-char span ids", () => {
    assert.equal(newTraceId().length, 32);
    assert.equal(newSpanId().length, 16);
    assert.match(newTraceId(), /^[0-9a-f]+$/);
  });

  it("encodes unix nano timestamps as decimal strings", () => {
    const nano = unixNano(1_700_000_000_000);
    assert.equal(nano, "1700000000000000000");
  });

  it("maps attribute types to OTLP any-value", () => {
    assert.deepEqual(otlpValue("looktag"), { stringValue: "looktag" });
    assert.deepEqual(otlpValue(12), { intValue: "12" });
    assert.deepEqual(otlpValue(12.5), { doubleValue: 12.5 });
    assert.deepEqual(otlpValue(true), { boolValue: true });
  });

  it("encodes a span as resourceSpans JSON, not a vendor payload", () => {
    const payload = encodeOtlpTraces(
      [
        {
          kind: "span",
          id: "1",
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
          name: "looktag.looks.list",
          spanKind: "SERVER",
          status: "OK",
          startTimeUnixNano: "1",
          endTimeUnixNano: "2",
          durationMs: 8,
          attributes: { "looktag.looks.count": 3 },
          events: [],
        },
      ],
      "looktag",
    );
    const span = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    const resource = payload.resourceSpans[0]?.resource.attributes ?? [];
    assert.equal(span?.name, "looktag.looks.list");
    assert.equal(span?.kind, 2);
    assert.equal(span?.status.code, 1);
    assert.equal(span?.traceId.length, 32);
    assert.ok(resource.some((attr) => attr.key === ATTR_SERVICE_NAME));
  });

  it("encodes metrics and logs with the same resource identity", () => {
    const metrics = encodeOtlpMetrics(
      [
        {
          kind: "metric",
          id: "m1",
          name: "looktag.span.duration",
          type: "histogram",
          value: 18,
          timeUnixNano: "3",
          unit: "ms",
          attributes: {},
        },
      ],
      "looktag",
    );
    const logs = encodeOtlpLogs(
      [
        {
          kind: "log",
          id: "l1",
          severity: "ERROR",
          body: "export failed",
          timeUnixNano: "4",
          attributes: {},
        },
      ],
      "looktag",
    );
    assert.ok(metrics.resourceMetrics[0]?.scopeMetrics[0]?.metrics[0]?.histogram);
    assert.equal(logs.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]?.severityNumber, 17);
  });
});

describe("OTLP destination", () => {
  it("resolves a collector base URL to the standard /v1 signal paths", () => {
    assert.deepEqual(resolveOtlpUrls("https://otlp.example.com"), {
      traces: "https://otlp.example.com/v1/traces",
      metrics: "https://otlp.example.com/v1/metrics",
      logs: "https://otlp.example.com/v1/logs",
    });
  });

  it("accepts a traces URL and still derives metrics and logs", () => {
    const urls = resolveOtlpUrls("https://otlp.example.com/v1/traces");
    assert.equal(urls?.metrics, "https://otlp.example.com/v1/metrics");
  });

  it("rejects empty or non-http endpoints", () => {
    assert.equal(resolveOtlpUrls(""), null);
    assert.equal(resolveOtlpUrls("otlp.example.com"), null);
  });

  it("parses OTEL_EXPORTER_OTLP_HEADERS as k=v pairs or JSON", () => {
    assert.deepEqual(parseOtlpHeaders("Authorization=Bearer abc, X-Scope=looktag"), {
      Authorization: "Bearer abc",
      "X-Scope": "looktag",
    });
    assert.deepEqual(parseOtlpHeaders('{"Authorization":"Bearer abc"}'), {
      Authorization: "Bearer abc",
    });
  });
});

describe("config and sanitization", () => {
  it("prefers saved settings over env, env over defaults", () => {
    const merged = mergeConfig(
      { otlpEndpoint: "https://collector.internal" },
      { enabled: true, serviceName: "from-env", otlpEndpoint: "https://env.example" },
    );
    assert.equal(merged.serviceName, "from-env");
    assert.equal(merged.otlpEndpoint, "https://collector.internal");
  });

  it("drops secrets and data URLs from attributes", () => {
    const attrs = sanitizeAttributes({
      "url.path": "/looks/1",
      authorization: "Bearer secret",
      password: "nope",
      photo: "data:image/png;base64,abc",
      "looktag.looks.count": 4,
    });
    assert.deepEqual(attrs, { "url.path": "/looks/1", "looktag.looks.count": 4 });
  });

  it("clamps sample ratio to 0–1", () => {
    assert.equal(clampSampleRatio(2), 1);
    assert.equal(clampSampleRatio(-1), 0);
  });
});
