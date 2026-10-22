import { unknownProvider } from "../unknown.ts";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
  ATTR_HTTP_ROUTE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";

export {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
  ATTR_HTTP_ROUTE,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  ATTR_URL_PATH,
};

export type TelemetryProviderName = "otlp" | "none";

type Env = {
  TELEMETRY_PROVIDER?: string;
  OTEL_SDK_DISABLED?: string;
  APP_ENV?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

const TELEMETRY_PROVIDERS = ["otlp", "none"] as const;

/** `TELEMETRY_PROVIDER=otlp|none`. Default otlp. Existing `OTEL_SDK_DISABLED` still gates the product config. */
export function resolveTelemetryProvider(env: Env = process.env): TelemetryProviderName {
  const named = env.TELEMETRY_PROVIDER?.trim().toLowerCase();
  if (!named || named === "otlp") return "otlp";
  if (named === "none") return "none";
  unknownProvider("TELEMETRY_PROVIDER", named, TELEMETRY_PROVIDERS);
}

/** APP_ENV, then VERCEL_ENV, then NODE_ENV. */
export function appEnv(env: Env = typeof process === "undefined" ? {} : process.env): string {
  return env.APP_ENV || env.VERCEL_ENV || env.NODE_ENV || "development";
}

/** POST one OTLP payload. Callers own retries and status handling. */
export function postOtlp(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

