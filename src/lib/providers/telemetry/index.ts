import { appEnv, resolveTelemetryProvider } from "./otlp.ts";
import type { TelemetryProvider, TelemetryProviderName } from "./types.ts";

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
  appEnv,
  postOtlp,
  resolveTelemetryProvider,
} from "./otlp.ts";
export type { TelemetryProvider, TelemetryProviderName };

export function telemetry(env: {
  TELEMETRY_PROVIDER?: string;
  OTEL_SDK_DISABLED?: string;
  APP_ENV?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
} = process.env): TelemetryProvider {
  const name: TelemetryProviderName = resolveTelemetryProvider(env);
  return { name, environment: () => appEnv(env) };
}
