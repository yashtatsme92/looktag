import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ATTR_SERVICE_NAME } from "./otlp.ts";
import { appEnv, resolveTelemetryProvider, telemetry } from "./index.ts";

describe("telemetry provider", () => {
  it("prefers APP_ENV and can be switched off", () => {
    assert.equal(appEnv({ APP_ENV: "staging", VERCEL_ENV: "production", NODE_ENV: "test" }), "staging");
    assert.equal(appEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" }), "preview");
    assert.equal(appEnv({ NODE_ENV: "test" }), "test");
    assert.equal(appEnv({}), "development");
    assert.equal(resolveTelemetryProvider({}), "otlp");
    assert.equal(resolveTelemetryProvider({ TELEMETRY_PROVIDER: "none" }), "none");
    assert.equal(resolveTelemetryProvider({ TELEMETRY_PROVIDER: "otlp" }), "otlp");
    assert.throws(
      () => resolveTelemetryProvider({ TELEMETRY_PROVIDER: "jaeger" }),
      /Unknown TELEMETRY_PROVIDER "jaeger"\. Expected otlp\|none\./,
    );
    assert.equal(telemetry({ TELEMETRY_PROVIDER: "none" }).name, "none");
    assert.equal(ATTR_SERVICE_NAME, "service.name");
  });
});
