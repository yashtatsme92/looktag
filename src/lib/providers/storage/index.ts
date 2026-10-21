import { localStorage } from "./local.ts";
import { s3Storage } from "./s3.ts";
import type { ObjectStorage, StorageProviderName } from "./types.ts";

export type { ObjectStorage, StorageProviderName, StoredObject } from "./types.ts";

type Env = { STORAGE_PROVIDER?: string };

/** `STORAGE_PROVIDER=local|s3|r2`. Default local. `r2` uses the S3 adapter. */
export function resolveStorageProvider(env: Env = process.env): StorageProviderName {
  const named = env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (named === "s3" || named === "r2") return named;
  return "local";
}

export function storage(env: Env = process.env): ObjectStorage {
  const name = resolveStorageProvider(env);
  if (name === "local") return localStorage();
  return s3Storage();
}
