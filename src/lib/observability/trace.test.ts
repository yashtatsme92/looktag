import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appSpanAttributes, authStateFromCookie, featureFromRoute, routeTemplate, serverFnName } from "./app-span.ts";
import { deliverOtlp, otlpExportErrorCount, recordOtlpExportError } from "./export-error.ts";
import { configFromEnv, sanitizeAttributes } from "./model.ts";
import { encodeOtlpLogs, encodeOtlpMetrics, encodeOtlpTraces } from "./otlp.ts";
import { buildResourceAttributes, browserFamily, browserResourceFromClient } from "./resource.ts";
import { effectiveSampleRatio, TraceGate } from "./sampling.ts";
import { stripSqlValues } from "./sql-statement.ts";
import { formatTraceparent, parseTraceparent } from "./traceparent.ts";
import { flushSignals, setTelemetrySink, startSpan } from "./runtime.ts";
import { traceDbQuery } from "./db-span.ts";
import { runRequestTrace } from "./request-trace.ts";
import type { Attributes, CompletedSpan, TelemetrySignal } from "./model.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function attr(
  payload: { resource: { attributes: ReadonlyArray<{ key: string; value: object }> } },
  key: string,
): string | undefined {
  const found = payload.resource.attributes.find((row) => row.key === key);
  if (!found) return undefined;
  const value = found.value as { stringValue?: string; intValue?: string };
  return value.stringValue ?? value.intValue;
}

function resourceOf(kind: "traces" | "metrics" | "logs", resource: Attributes) {
  if (kind === "traces") {
    return encodeOtlpTraces(
      [
        {
          kind: "span",
          id: "1",
          traceId: "a".repeat(32),
          spanId: "b".repeat(16),
          name: "HTTP GET",
          spanKind: "SERVER",
          status: "OK",
          startTimeUnixNano: "1",
          endTimeUnixNano: "2",
          durationMs: 1,
          attributes: {},
          events: [],
        },
      ],
      "looktag",
      resource,
    ).resourceSpans[0];
  }
  if (kind === "metrics") {
    return encodeOtlpMetrics(
      [{ kind: "metric", id: "m", name: "looktag.span.duration", type: "counter", value: 1, timeUnixNano: "3", attributes: {} }],
      "looktag",
      resource,
    ).resourceMetrics[0];
  }
  return encodeOtlpLogs(
    [{ kind: "log", id: "l", severity: "INFO", body: "ok", timeUnixNano: "4", attributes: {} }],
    "looktag",
    resource,
  ).resourceLogs[0];
}

describe("resource attributes", () => {
  it("encodes Render production identity on traces, metrics, and logs", () => {
    const resource = buildResourceAttributes({
      env: {
        RENDER: "true",
        OTEL_SERVICE_NAME: "looktag",
        RENDER_INSTANCE_ID: "srv-1",
        RENDER_DEPLOY_ID: "dep-1",
        RENDER_GIT_COMMIT: SHA,
        RENDER_GIT_BRANCH: "main",
        RENDER_REGION: "frankfurt",
      },
      version: "2.5.36",
      hostname: "host-1",
      runtimeVersion: "v22.11.0",
      builtAt: "2026-11-01T00:00:00.000Z",
    });
    for (const kind of ["traces", "metrics", "logs"] as const) {
      const encoded = resourceOf(kind, resource);
      assert.equal(attr(encoded, "service.name"), "looktag");
      assert.equal(attr(encoded, "service.namespace"), "looktag");
      assert.equal(attr(encoded, "service.version"), "2.5.36");
      assert.equal(attr(encoded, "service.instance.id"), "srv-1");
      assert.equal(attr(encoded, "deployment.environment.name"), "production");
      assert.equal(attr(encoded, "deployment.id"), "dep-1");
      assert.equal(attr(encoded, "vcs.ref.head.revision"), SHA);
      assert.equal(attr(encoded, "vcs.ref.head.name"), "main");
      assert.equal(attr(encoded, "vcs.repository.url.full"), "https://github.com/yashtatsme92/looktag");
      assert.equal(attr(encoded, "cloud.provider"), "render");
      assert.equal(attr(encoded, "cloud.region"), "frankfurt");
      assert.equal(attr(encoded, "host.name"), "host-1");
      assert.equal(attr(encoded, "process.runtime.name"), "nodejs");
      assert.equal(attr(encoded, "process.runtime.version"), "v22.11.0");
      assert.equal(attr(encoded, "telemetry.sdk.name"), "looktag");
      assert.equal(attr(encoded, "telemetry.sdk.language"), "nodejs");
      assert.equal(attr(encoded, "app.build.time"), "2026-11-01T00:00:00.000Z");
      assert.equal(attr(encoded, "app.preview.pr"), undefined);
    }
  });

  it("encodes a Netlify preview, including the PR number", () => {
    const resource = buildResourceAttributes({
      env: {
        NETLIFY: "true",
        CONTEXT: "deploy-preview",
        DEPLOY_ID: "nl-1",
        COMMIT_REF: SHA,
        BRANCH: "feat/tempo",
        REVIEW_ID: "185",
      },
      version: "2.5.36",
      hostname: "netlify",
      runtimeVersion: "v22.11.0",
      builtAt: "2026-11-01T00:00:00.000Z",
    });
    assert.equal(resource["deployment.environment.name"], "preview");
    assert.equal(resource["cloud.provider"], "netlify");
    assert.equal(resource["deployment.id"], "nl-1");
    assert.equal(resource["app.preview.pr"], "185");
    assert.equal(resource["vcs.ref.head.name"], "feat/tempo");
    assert.equal(resource["cloud.region"], undefined);
  });

  it("truncates the browser user agent to family and major", () => {
    const ua = "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36";
    const resource = buildResourceAttributes({
      serviceName: "looktag-web",
      version: "2.5.36",
      revision: SHA,
      browser: { platform: "MacIntel", userAgent: ua },
      env: { APP_ENV: "production" },
    });
    assert.equal(resource["service.name"], "looktag-web");
    assert.equal(resource["user_agent.original"], "Chrome/120");
    assert.equal(JSON.stringify(resource).includes("Mozilla"), false);
    assert.equal(resource["process.runtime.name"], undefined);
    assert.equal(browserFamily(ua), "Chrome/120");
  });
});

describe("trace continuity", () => {
  it("continues the browser traceparent and parents pg.query under the server span", async () => {
    const seen: TelemetrySignal[] = [];
    setTelemetrySink((signals) => {
      seen.push(...signals);
    });
    const browser = startSpan("HTTP GET", { kind: "CLIENT", root: true, attributes: { "http.route": "/looks/$lookId" } });
    const header = formatTraceparent({ traceId: browser.traceId, spanId: browser.spanId });
    browser.end();
    const secret = "secret@example.com";
    const response = await runRequestTrace(
      {
        method: "POST",
        path: "/looks/abc",
        skipFlags: true,
        headers: {
          get(name: string) {
            if (name === "traceparent") return header;
            if (name === "cookie") return `__Host-grok-auth.session_token=${secret}; other=1`;
            if (name === "authorization") return `Bearer ${secret}`;
            if (name === "accept-language") return "en-US,en;q=0.8";
            return null;
          },
        },
      },
      async () => {
        await traceDbQuery(`select * from looks where email = '${secret}' and id = $1`, async () => []);
        return new Response("ok", { status: 200 });
      },
    );
    await flushSignals();
    assert.ok(response instanceof Response);
    const traceparent = response.headers.get("traceparent") ?? "";
    assert.ok(traceparent.startsWith(`00-${browser.traceId}-`));
    assert.ok(response.headers.get("x-request-id"));
    const http = seen.find((signal): signal is CompletedSpan => signal.kind === "span" && signal.spanKind === "SERVER");
    const pg = seen.find((signal): signal is CompletedSpan => signal.kind === "span" && signal.name === "pg.query");
    assert.ok(http);
    assert.ok(pg);
    assert.equal(http.traceId, browser.traceId);
    assert.equal(http.parentSpanId, browser.spanId);
    assert.equal(pg.traceId, browser.traceId);
    assert.equal(pg.parentSpanId, http.spanId);
    assert.equal(http.attributes["http.method"], "POST");
    assert.equal(http.attributes["http.route"], "/looks/$lookId");
    assert.equal(http.attributes["http.status_code"], 200);
    assert.equal(http.attributes["app.feature"], "looks");
    assert.equal(http.attributes["app.auth.state"], "signed_in");
    assert.equal(http.attributes["app.locale"], "en-US");
    assert.equal(pg.attributes["db.system"], "postgresql");
    const statement = String(pg.attributes["db.statement"]);
    assert.equal(statement.includes(secret), false);
    assert.equal(statement.includes("?"), true);
    const blob = JSON.stringify(http.attributes) + JSON.stringify(pg.attributes);
    assert.equal(blob.includes(secret), false);
    assert.equal(blob.includes("Bearer"), false);
    assert.equal(http.attributes["user.id"], undefined);
    setTelemetrySink(null);
  });

  it("ignores a bad traceparent and still returns one", async () => {
    setTelemetrySink(() => undefined);
    const response = await runRequestTrace(
      {
        method: "GET",
        path: "/api/version",
        skipFlags: true,
        headers: { get: (name) => (name === "traceparent" ? "not-a-trace" : null) },
      },
      async () => new Response("ok", { status: 200 }),
    );
    await flushSignals();
    assert.ok(response instanceof Response);
    assert.ok(parseTraceparent(response.headers.get("traceparent")));
    setTelemetrySink(null);
  });
});

describe("sampling", () => {
  it("drops successful traces at ratio 0 and keeps traces that end in error", () => {
    const gate = new TraceGate(0, () => 0.99);
    const ok = gate.push(rootSpan("a".repeat(32), "OK"));
    assert.deepEqual(ok, []);
    const child = gate.push(childSpan("c".repeat(32), "OK"));
    assert.deepEqual(child, []);
    const kept = gate.push(rootSpan("c".repeat(32), "OK", 500));
    assert.equal(kept.length, 2);
    assert.equal(kept.every((span) => span.kind === "span" && span.traceId === "c".repeat(32)), true);
    const thrown = gate.push(rootSpan("d".repeat(32), "ERROR"));
    assert.equal(thrown.length, 1);
  });

  it("uses 0.1 in production unless the sampler arg is set", () => {
    assert.equal(effectiveSampleRatio(1, { RENDER: "true" }), 0.1);
    assert.equal(effectiveSampleRatio(1, { RENDER: "true", OTEL_TRACES_SAMPLER_ARG: "1" }), 1);
    assert.equal(effectiveSampleRatio(1, { APP_ENV: "development" }), 1);
    assert.equal(effectiveSampleRatio(0.4, { RENDER: "true" }), 0.4);
  });
});

describe("app attributes", () => {
  it("does not record ids, cookies, emails, or bodies", () => {
    const attrs = appSpanAttributes({
      route: routeTemplate("/houses/house_1/collection/style"),
      serverFn: serverFnName("/_serverFn/saveLook_createServerFn_handler"),
      authState: authStateFromCookie(null),
      locale: "de",
      requestId: "req-12345678",
      flags: { shopWholeLookPhone: true },
      userId: "user-1",
      email: "a@b.c",
      cookie: "session=secret",
      body: "raw-body",
    });
    assert.equal(attrs["app.auth.state"], "anonymous");
    assert.equal(attrs["app.flag.shopWholeLookPhone"], true);
    assert.equal(attrs["user.id"], undefined);
    assert.equal(JSON.stringify(attrs).includes("user-1"), false);
    assert.equal(JSON.stringify(attrs).includes("a@b.c"), false);
    assert.equal(JSON.stringify(attrs).includes("raw-body"), false);
    assert.equal(JSON.stringify(attrs).includes("secret"), false);
    assert.equal(featureFromRoute("/admin/houses"), "admin");
    const cleaned = sanitizeAttributes({ "user.id": "u", authorization: "Bearer x", email: "a@b.c", "app.route": "/looks/$lookId" });
    assert.deepEqual(cleaned, { "app.route": "/looks/$lookId" });
  });

  it("keeps the client trace id on a looktag-web resource and strips secrets", () => {
    const resource = browserResourceFromClient({
      "service.name": "looktag-web",
      "service.version": "2.5.36",
      "vcs.ref.head.revision": SHA,
      "user_agent.original": "Chrome/120",
      authorization: "Bearer secret-token",
      cookie: "a=b",
    });
    assert.equal(resource?.["service.name"], "looktag-web");
    assert.equal(resource?.["vcs.ref.head.revision"], SHA);
    assert.equal(JSON.stringify(resource).includes("secret-token"), false);
    assert.equal(browserResourceFromClient({ "service.name": "other" }), undefined);
  });
});

describe("export", () => {
  it("prefers the traces endpoint and does not fail the caller when the collector throws", async () => {
    assert.equal(
      configFromEnv({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://tempo.example/v1/traces", OTEL_EXPORTER_OTLP_ENDPOINT: "https://other.example" }).otlpEndpoint,
      "https://tempo.example/v1/traces",
    );
    const before = otlpExportErrorCount();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.join(" "));
    };
    try {
      await deliverOtlp(async () => {
        throw new Error("network down Authorization=Basic super-secret-token");
      });
    } finally {
      console.error = original;
    }
    assert.equal(otlpExportErrorCount(), before + 1);
    assert.equal(errors.some((line) => String(line).includes("super-secret-token")), false);
    recordOtlpExportError();
    assert.equal(otlpExportErrorCount(), before + 2);
  });

  it("strips SQL literals and leaves parameters out of the statement", () => {
    const sql = stripSqlValues("select * from users where email = 'secret@example.com' and id = $1");
    assert.equal(sql.includes("secret@example.com"), false);
    assert.match(sql, /email = \?/);
  });
});

function rootSpan(traceId: string, status: "OK" | "ERROR", httpStatus?: number): CompletedSpan {
  return {
    kind: "span",
    id: "r",
    traceId,
    spanId: "1".repeat(16),
    name: "HTTP GET",
    spanKind: "SERVER",
    status,
    startTimeUnixNano: "1",
    endTimeUnixNano: "2",
    durationMs: 1,
    traceRoot: true,
    attributes: httpStatus ? { "http.status_code": httpStatus } : {},
    events: [],
  };
}

function childSpan(traceId: string, status: "OK" | "ERROR"): CompletedSpan {
  return {
    kind: "span",
    id: "c",
    traceId,
    spanId: "2".repeat(16),
    parentSpanId: "1".repeat(16),
    name: "pg.query",
    spanKind: "CLIENT",
    status,
    startTimeUnixNano: "1",
    endTimeUnixNano: "2",
    durationMs: 1,
    attributes: {},
    events: [],
  };
}
