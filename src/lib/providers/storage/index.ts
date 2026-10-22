import { localStorage } from "./local.ts";
import { s3Storage } from "./s3.ts";
import type { ObjectStorage, StorageProviderName } from "./types.ts";
import { unknownProvider } from "../unknown.ts";

export type { ObjectStorage, StorageProviderName, StoredObject } from "./types.ts";

type Env = { STORAGE_PROVIDER?: string };

const STORAGE_PROVIDERS = ["local", "s3", "r2"] as const;

/** `STORAGE_PROVIDER=local|s3|r2`. Default local. `r2` uses the S3 adapter. */
export function resolveStorageProvider(env: Env = process.env): StorageProviderName {
  const named = env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (!named) return "local";
  if (named === "local" || named === "s3" || named === "r2") return named;
  unknownProvider("STORAGE_PROVIDER", named, STORAGE_PROVIDERS);
}

export function storage(env: Env = process.env): ObjectStorage {
  const name = resolveStorageProvider(env);
  if (name === "local") return localStorage();
  return s3Storage();
}
