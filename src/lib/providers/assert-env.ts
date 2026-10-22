import { resolveAiProvider } from "./ai/index.ts";
import { resolveAuthProvider } from "./auth/index.ts";
import { resolveDbProvider } from "./db/index.ts";
import { resolveEmailProvider } from "./email/index.ts";
import { resolveErrorProvider } from "./errors/index.ts";
import { resolveShopSearchProvider } from "./shop-search/index.ts";
import { resolveStorageProvider } from "./storage/index.ts";
import { resolveSuggestProvider } from "./suggest/index.ts";
import { resolveTelemetryProvider } from "./telemetry/index.ts";

type ProviderEnv = {
  DB_PROVIDER?: string;
  DATABASE_URL?: string;
  AI_PROVIDER?: string;
  XAI_API_KEY?: string;
  ERROR_PROVIDER?: string;
  SHOP_SEARCH_PROVIDER?: string;
  STORAGE_PROVIDER?: string;
  TELEMETRY_PROVIDER?: string;
  EMAIL_PROVIDER?: string;
  AUTH_PROVIDER?: string;
  SUGGEST_PROVIDER?: string;
};

/** Throw if any provider variable is set to a value that is not allowed. Unset stays the default. */
export function assertProviderEnv(env: ProviderEnv = process.env): void {
  resolveDbProvider(env);
  resolveAiProvider(env);
  resolveErrorProvider(env);
  resolveShopSearchProvider(env);
  resolveStorageProvider(env);
  resolveTelemetryProvider(env);
  resolveEmailProvider(env);
  resolveAuthProvider(env);
  resolveSuggestProvider(env);
}
