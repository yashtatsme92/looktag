import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appSpanAttributes, authStateFromCookie, featureFromRoute, routeTemplate, serverFnName } from "./app-span.ts";
import { deliverOtlp, otlpExportErrorCount, recordOtlpExportError } from "./export-error.ts";
import { configFromEnv, sanitizeAttributes } from "./model.ts";
import { encodeOtlpLogs, encodeOtlpMetrics, encodeOtlpTraces } from "./otlp.ts";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildResourceAttributes, browserFamily, browserResourceFromClient, deploymentEnvironmentName } from "./resource.ts";
import { attachTraceGate, effectiveSampleRatio, headSampleDecision, TraceGate } from "./sampling.ts";
import { stripSqlValues } from "./sql-statement.ts";
import { flagsForSampled, formatTraceparent, parseTraceparent } from "./traceparent.ts";
import { TELEMETRY_REQUEST_HEADER, applyClientHttpStatus, isIngestServerFnPath, isTelemetryTransport, registerIngestServerFn, telemetryFunctionPath } from "./client-fetch.ts";
import { parseClientSignals } from "./client-signals.ts";
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

  it("honors DEPLOYMENT_ENV over NODE_ENV and falls back to the git revision for deployment id", () => {
    assert.equal(deploymentEnvironmentName({ NODE_ENV: "production", DEPLOYMENT_ENV: "preview" }), "preview");
    assert.equal(deploymentEnvironmentName({ NODE_ENV: "production" }), "production");
    assert.equal(deploymentEnvironmentName({ DEPLOYMENT_ENV: "development", RENDER: "true" }), "development");
    const resource = buildResourceAttributes({
      env: { GIT_COMMIT: SHA, DEPLOYMENT_ENV: "production" },
      version: "2.5.36",
    });
    assert.equal(resource["deployment.environment.name"], "production");
    assert.equal(resource["service.version"], "2.5.36");
    assert.equal(resource["vcs.ref.head.revision"], SHA);
    assert.equal(resource["deployment.id"], SHA);
    const explicit = buildResourceAttributes({
      env: { GIT_COMMIT: SHA, RENDER_DEPLOY_ID: "dep-9" },
      version: "2.5.36",
    });
    assert.equal(explicit["deployment.id"], "dep-9");
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

  it("keeps the trace id and applies the server ratio for an untrusted browser parent", async () => {
    const seen: TelemetrySignal[] = [];
    setTelemetrySink((signals) => {
      seen.push(...signals);
    });
    const traceId = "c".repeat(32);
    const parent = `00-${traceId}-${"d".repeat(16)}-00`;
    const unsampled = await runRequestTrace(
      {
        method: "GET",
        path: "/",
        skipFlags: true,
        env: { OTEL_TRACES_SAMPLER_ARG: "1" },
        headers: { get: (name) => (name === "traceparent" ? parent : null) },
      },
      async () => new Response("ok", { status: 200 }),
    );
    assert.ok(unsampled instanceof Response);
    assert.ok(unsampled.headers.get("traceparent")?.startsWith(`00-${traceId}-`));
    assert.equal(unsampled.headers.get("traceparent")?.endsWith("-01"), true);
    const keptError = await runRequestTrace(
      {
        method: "GET",
        path: "/",
        skipFlags: true,
        env: { OTEL_TRACES_SAMPLER_ARG: "0" },
        headers: { get: (name) => (name === "traceparent" ? parent : null) },
      },
      async () => new Response("nope", { status: 500 }),
    );
    assert.ok(keptError instanceof Response);
    assert.equal(keptError.headers.get("traceparent")?.endsWith("-01"), true);
    const dropped = await runRequestTrace(
      {
        method: "GET",
        path: "/houses",
        skipFlags: true,
        env: { RENDER: "true", OTEL_TRACES_SAMPLER_ARG: "0" },
        random: () => 0.99,
        headers: { get: () => null },
      },
      async () => new Response("ok", { status: 200 }),
    );
    assert.ok(dropped instanceof Response);
    assert.equal(dropped.headers.get("traceparent")?.endsWith("-00"), true);
    const forced = await runRequestTrace(
      {
        method: "GET",
        path: "/houses",
        skipFlags: true,
        env: { OTEL_TRACES_SAMPLER_ARG: "0" },
        headers: { get: (name) => (name === "traceparent" ? parent.replace(/-00$/, "-01") : null) },
      },
      async () => new Response("ok", { status: 200 }),
    );
    assert.ok(forced instanceof Response);
    assert.ok(forced.headers.get("traceparent")?.startsWith(`00-${traceId}-`));
    assert.equal(forced.headers.get("traceparent")?.endsWith("-00"), true);
    const trusted = await runRequestTrace(
      {
        method: "GET",
        path: "/houses",
        skipFlags: true,
        trustParent: true,
        env: { OTEL_TRACES_SAMPLER_ARG: "0" },
        headers: { get: (name) => (name === "traceparent" ? parent.replace(/-00$/, "-01") : null) },
      },
      async () => new Response("ok", { status: 200 }),
    );
    assert.ok(trusted instanceof Response);
    assert.equal(trusted.headers.get("traceparent")?.endsWith("-01"), true);
    await flushSignals();
    const roots = seen.filter((signal): signal is CompletedSpan => signal.kind === "span" && signal.traceRoot === true);
    assert.equal(roots[0]?.sampled, true);
    assert.equal(roots[1]?.sampled, true);
    assert.equal(roots[2]?.sampled, false);
    assert.equal(roots[3]?.sampled, false);
    assert.equal(roots[4]?.sampled, true);
    assert.equal(headSampleDecision({ incomingFlags: "00", ratio: 1 }), true);
    assert.equal(headSampleDecision({ incomingFlags: "01", ratio: 0 }), false);
    assert.equal(headSampleDecision({ incomingFlags: "01", ratio: 0, trustParent: true }), true);
    assert.equal(flagsForSampled(false), "00");
    assert.equal(flagsForSampled(true, "00"), "01");
    setTelemetrySink(null);
  });

  it("does not trace a telemetry upload, including the production server-fn URL", async () => {
    const seen: TelemetrySignal[] = [];
    setTelemetrySink((signals) => {
      seen.push(...signals);
    });
    const prodId = "ab".repeat(32);
    assert.equal(`/_serverFn/${prodId}`.includes("ingestClientSignals"), false);
    const telemetryPath = telemetryFunctionPath(`/_serverFn/${prodId}`, "https://looktag.example");
    assert.equal(
      isTelemetryTransport({
        pathname: `/_serverFn/${prodId}`,
        headers: new Headers(),
        telemetryPathname: telemetryPath,
        insideFlush: false,
      }),
      true,
    );
    assert.equal(
      isTelemetryTransport({
        pathname: `/_serverFn/${"cd".repeat(32)}`,
        headers: new Headers(),
        telemetryPathname: telemetryPath,
        insideFlush: false,
      }),
      false,
    );
    assert.equal(
      isTelemetryTransport({
        pathname: `/_serverFn/${"cd".repeat(32)}`,
        headers: new Headers({ [TELEMETRY_REQUEST_HEADER]: "1" }),
        telemetryPathname: null,
        insideFlush: false,
      }),
      true,
    );
    assert.equal(
      isTelemetryTransport({
        pathname: "/houses",
        headers: new Headers(),
        telemetryPathname: null,
        insideFlush: true,
      }),
      true,
    );
    const response = await runRequestTrace(
      {
        method: "POST",
        path: `/_serverFn/${prodId}`,
        skipFlags: true,
        headers: {
          get: (name) => (name === TELEMETRY_REQUEST_HEADER ? "1" : null),
        },
      },
      async () => new Response("ok", { status: 200 }),
    );
    await flushSignals();
    assert.ok(response instanceof Response);
    assert.ok(response.headers.get("traceparent"), "a copied telemetry header must not skip tracing");
    registerIngestServerFn(`/_serverFn/${prodId}`);
    const skipped = await runRequestTrace(
      {
        method: "POST",
        path: `/_serverFn/${prodId}`,
        skipFlags: true,
        headers: {
          get: (name) => (name === TELEMETRY_REQUEST_HEADER ? "1" : null),
        },
      },
      async () => new Response("ok", { status: 200 }),
    );
    await flushSignals();
    assert.ok(skipped instanceof Response);
    assert.equal(skipped.headers.get("traceparent"), null);
    assert.equal(isIngestServerFnPath(`/_serverFn/${prodId}`), true);
    assert.equal(isIngestServerFnPath("/houses"), false);
    const before = seen.length;
    const other = await runRequestTrace(
      {
        method: "POST",
        path: "/api/auth/get-session",
        skipFlags: true,
        headers: {
          get: (name) => (name === TELEMETRY_REQUEST_HEADER ? "1" : null),
        },
      },
      async () => new Response("ok", { status: 200 }),
    );
    await flushSignals();
    assert.ok(other instanceof Response);
    assert.ok(other.headers.get("traceparent"));
    assert.ok(seen.length > before);
    registerIngestServerFn(null);
    const clientSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "client.tsx"), "utf8");
    assert.equal(clientSource.includes('includes("ingestClientSignals")'), false);
    assert.equal(clientSource.includes("includes('ingestClientSignals')"), false);
    assert.match(clientSource, /isTelemetryTransport/);
    assert.match(clientSource, /TELEMETRY_REQUEST_HEADER/);
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

  it("drops held spans after the TTL and caps the number of traces", () => {
    let now = 0;
    const gate = new TraceGate(1, () => 0, { ttlMs: 60_000, maxSize: 2, now: () => now });
    const traceA = "a".repeat(32);
    const traceB = "b".repeat(32);
    const traceC = "c".repeat(32);
    assert.deepEqual(gate.push(childSpan(traceA, "OK")), []);
    assert.deepEqual(gate.push(childSpan(traceB, "OK")), []);
    assert.deepEqual(gate.push(childSpan(traceC, "OK")), []);
    assert.equal(gate.traceCount, 2);
    const forgotten = gate.push(rootSpan(traceA, "OK"));
    assert.equal(forgotten.length, 1);
    const first = forgotten[0];
    assert.equal(first && first.kind === "span" ? first.name : "", "HTTP GET");
    const kept = gate.push(rootSpan(traceC, "OK"));
    assert.equal(kept.length, 2);
    now = 60_001;
    const expired = new TraceGate(1, () => 0, { ttlMs: 60_000, maxSize: 10, now: () => now });
    now = 0;
    assert.deepEqual(expired.push(childSpan(traceA, "OK")), []);
    now = 60_001;
    const afterTtl = expired.push(rootSpan(traceA, "OK"));
    assert.equal(afterTtl.length, 1);
  });

  it("keeps a parent-sampled root when the ratio is zero", () => {
    const gate = new TraceGate(0, () => 0.99);
    const traceId = "e".repeat(32);
    assert.deepEqual(gate.push(rootSpan(traceId, "OK", undefined, false)), []);
    const kept = gate.push(rootSpan("f".repeat(32), "OK", undefined, true));
    assert.equal(kept.length, 1);
  });

  it("decides browser HTTP spans from the recorded trace instead of holding them", () => {
    const gate = new TraceGate(0, () => 0.99);
    const traceId = "a".repeat(32);
    const browser = httpClientSpan(traceId, "OK");
    assert.equal(gate.push(browser).length, 0);
    gate.record(traceId, true);
    const kept = gate.push(httpClientSpan(traceId, "OK", "b".repeat(16)));
    assert.equal(kept.length, 1);
    const server = rootSpan(traceId, "OK", 200, true);
    server.parentSpanId = "b".repeat(16);
    const released = gate.push(server);
    assert.equal(released.some((span) => span.kind === "span" && span.spanKind === "SERVER"), true);
    const ids = new Set(released.filter((span) => span.kind === "span").map((span) => (span.kind === "span" ? span.spanId : "")));
    for (const span of released) {
      if (span.kind === "span" && span.parentSpanId) assert.equal(ids.has(span.parentSpanId) || span.parentSpanId === "b".repeat(16), true);
    }
  });

  it("posts one ingest batch per flush and leaves the rest queued", async () => {
    const batches: number[] = [];
    setTelemetrySink((signals) => {
      batches.push(signals.length);
    });
    for (let i = 0; i < 25; i += 1) startSpan(`nav.${i}`, { root: true }).end();
    await flushSignals();
    assert.equal(batches.length, 1);
    assert.ok((batches[0] ?? 0) <= 40);
    assert.ok((batches[0] ?? 0) > 0);
    setTelemetrySink(() => undefined);
    await flushSignals();
    await flushSignals();
    setTelemetrySink(null);
  });
});

describe("browser to database trace", () => {
  it("posts one trace whose browser, server, and pg spans parent each other", async () => {
    const gate = new TraceGate(1, () => 0);
    attachTraceGate(gate);
    const kept: CompletedSpan[] = [];
    setTelemetrySink((signals) => {
      for (const signal of signals) {
        for (const next of gate.push(signal)) {
          if (next.kind === "span") kept.push(next);
        }
      }
    });
    const browser = startSpan("HTTP GET", {
      kind: "CLIENT",
      root: true,
      attributes: { "http.method": "GET", "http.route": "/looks/$lookId" },
    });
    const header = formatTraceparent({ traceId: browser.traceId, spanId: browser.spanId, flags: "01" });
    try {
      const response = await runRequestTrace(
        {
          method: "GET",
          path: "/looks/abc",
          skipFlags: true,
          env: { OTEL_TRACES_SAMPLER_ARG: "0" },
          headers: { get: (name) => (name === "traceparent" ? header : null) },
        },
        async () => {
          await traceDbQuery("select id from looks where id = $1", async () => [{ id: "abc" }]);
          return new Response("ok", { status: 200 });
        },
      );
      assert.ok(response instanceof Response);
      assert.ok(response.headers.get("traceparent")?.startsWith(`00-${browser.traceId}-`));
      assert.equal(response.headers.get("traceparent")?.endsWith("-00"), true);
      browser.end();
      await flushSignals();
      const exported = kept.filter((span) => span.traceId === browser.traceId);
      assert.equal(exported.length, 0);

      const keptAll = new TraceGate(1, () => 0);
      attachTraceGate(keptAll);
      const sampled: CompletedSpan[] = [];
      setTelemetrySink((signals) => {
        for (const signal of signals) {
          for (const next of keptAll.push(signal)) {
            if (next.kind === "span") sampled.push(next);
          }
        }
      });
      const again = startSpan("HTTP GET", {
        kind: "CLIENT",
        root: true,
        attributes: { "http.method": "GET", "http.route": "/looks/$lookId" },
      });
      const againHeader = formatTraceparent({ traceId: again.traceId, spanId: again.spanId, flags: "01" });
      const ok = await runRequestTrace(
        {
          method: "GET",
          path: "/looks/abc",
          skipFlags: true,
          env: { OTEL_TRACES_SAMPLER_ARG: "1" },
          headers: { get: (name) => (name === "traceparent" ? againHeader : null) },
        },
        async () => {
          await traceDbQuery("select id from looks where id = $1", async () => [{ id: "abc" }]);
          return new Response("ok", { status: 200 });
        },
      );
      assert.ok(ok instanceof Response);
      assert.equal(ok.headers.get("traceparent")?.endsWith("-01"), true);
      again.end();
      await flushSignals();
      const clientRaw = sampled.filter((span) => span.spanKind === "CLIENT" && span.name.startsWith("HTTP "));
      const bodySpans = sampled.filter((span) => !(span.spanKind === "CLIENT" && span.name.startsWith("HTTP ")));
      const reparsed = parseClientSignals(clientRaw);
      assert.ok(reparsed && reparsed.length >= 1);
      for (const signal of reparsed) {
        for (const next of keptAll.push(signal)) {
          if (next.kind === "span") bodySpans.push(next);
        }
      }
      const http = bodySpans.find((span) => span.spanKind === "SERVER");
      const query = bodySpans.find((span) => span.name === "pg.query");
      const web = bodySpans.find((span) => span.spanKind === "CLIENT" && span.name === "HTTP GET");
      assert.ok(http);
      assert.ok(query);
      assert.ok(web);
      assert.equal(http.traceId, again.traceId);
      assert.equal(query.traceId, again.traceId);
      assert.equal(web.traceId, again.traceId);
      assert.equal(http.parentSpanId, web.spanId);
      assert.equal(query.parentSpanId, http.spanId);
      const ids = new Set(bodySpans.map((span) => span.spanId));
      for (const span of bodySpans) {
        if (span.parentSpanId) assert.equal(ids.has(span.parentSpanId), true, span.name);
      }
      const received: Array<{ resourceSpans?: Array<{ scopeSpans?: Array<{ spans?: Array<{ traceId: string; spanId: string; parentSpanId?: string; name: string }> }> }> }> = [];
      const collector = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        req.on("end", () => {
          received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          res.writeHead(200, { "content-type": "application/json" });
          res.end("{}");
        });
      });
      await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", () => resolve()));
      const address = collector.address();
      assert.ok(address && typeof address === "object");
      try {
        const payload = encodeOtlpTraces(bodySpans, "looktag");
        const posted = await fetch(`http://127.0.0.1:${address.port}/v1/traces`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        assert.equal(posted.status, 200);
      } finally {
        await new Promise<void>((resolve) => collector.close(() => resolve()));
      }
      const remote = received[0]?.resourceSpans?.[0]?.scopeSpans?.[0]?.spans ?? [];
      const remoteServer = remote.find((span) => span.name === "HTTP GET" && span.parentSpanId);
      const remoteQuery = remote.find((span) => span.name === "pg.query");
      const remoteWeb = remote.find((span) => span.name === "HTTP GET" && !span.parentSpanId);
      assert.ok(remoteServer);
      assert.ok(remoteQuery);
      assert.ok(remoteWeb);
      assert.equal(remoteServer.traceId, remoteWeb.traceId);
      assert.equal(remoteServer.parentSpanId, remoteWeb.spanId);
      assert.equal(remoteQuery.parentSpanId, remoteServer.spanId);
    } finally {
      attachTraceGate(null);
      setTelemetrySink(null);
    }
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

  it("strips SQL string and numeric literals and leaves parameters out of the statement", () => {
    const sql = stripSqlValues("select * from users where email = 'secret@example.com' and age = 42 and id = $1");
    assert.equal(sql.includes("secret@example.com"), false);
    assert.equal(sql.includes("42"), false);
    assert.match(sql, /email = \?/);
    assert.match(sql, /age = \?/);
    assert.match(sql, /id = \$1/);
  });
});

describe("client fetch status", () => {
  it("marks 4xx and 5xx as errors with error.type set to the status", () => {
    for (const status of [401, 404, 500]) {
      const attrs: Record<string, string | number | boolean> = {};
      let spanStatus = "UNSET";
      applyClientHttpStatus(status, {
        setAttribute(key, value) {
          attrs[key] = value;
        },
        setStatus(next) {
          spanStatus = next;
        },
      });
      assert.equal(spanStatus, "ERROR");
      assert.equal(attrs["error.type"], String(status));
      assert.equal(attrs["http.status_code"], status);
    }
    const ok: Record<string, string | number | boolean> = {};
    let spanStatus = "UNSET";
    applyClientHttpStatus(200, {
      setAttribute(key, value) {
        ok[key] = value;
      },
      setStatus(next) {
        spanStatus = next;
      },
    });
    assert.equal(spanStatus, "UNSET");
    assert.equal(ok["error.type"], undefined);
    assert.equal(ok["http.status_code"], 200);
  });
});

function rootSpan(
  traceId: string,
  status: "OK" | "ERROR",
  httpStatus?: number,
  sampled?: boolean,
): CompletedSpan {
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
    sampled,
  };
}

function httpClientSpan(traceId: string, status: "OK" | "ERROR", spanId = "c".repeat(16)): CompletedSpan {
  return {
    kind: "span",
    id: spanId,
    traceId,
    spanId,
    name: "HTTP GET",
    spanKind: "CLIENT",
    status,
    startTimeUnixNano: "1",
    endTimeUnixNano: "2",
    durationMs: 1,
    attributes: { "http.status_code": status === "ERROR" ? 500 : 200 },
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
