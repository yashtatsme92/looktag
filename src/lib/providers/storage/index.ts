import { localStorage } from "./local.ts";
import { s3Storage } from "./s3.ts";
import type { ObjectStorage, StorageProviderName, StoredObject } from "./types.ts";
import { unknownProvider } from "../unknown.ts";

export type { ObjectStorage, PutOptions, StorageProviderName, StoredObject } from "./types.ts";

type Env = { STORAGE_PROVIDER?: string; APP_ENV?: string };

const STORAGE_PROVIDERS = ["local", "s3", "r2"] as const;

/** `STORAGE_PROVIDER=local|s3|r2`. Default local. `r2` uses the S3 adapter. */
export function resolveStorageProvider(env: Env = process.env): StorageProviderName {
  const named = env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (!named) return "local";
  if (named === "local" || named === "s3" || named === "r2") return named;
  unknownProvider("STORAGE_PROVIDER", named, STORAGE_PROVIDERS);
}

const PREVIEW_DISK_ERROR =
  "Preview hosts have no durable disk. Set STORAGE_PROVIDER=s3 or STORAGE_PROVIDER=r2.";

/** Serverless previews cannot write a local directory. The throw is the failure, not a silent /tmp file. */
export function refusingDiskStorage(): ObjectStorage {
  const fail = (): never => {
    throw new Error(PREVIEW_DISK_ERROR);
  };
  return {
    async put() {
      fail();
    },
    async get(): Promise<StoredObject | null> {
      return fail();
    },
    async delete() {
      fail();
    },
    publicUrl(): string {
      return fail();
    },
  };
}

export function storage(env: Env = process.env): ObjectStorage {
  const name = resolveStorageProvider(env);
  if (name === "local" && (env.APP_ENV ?? "").trim() === "preview") return refusingDiskStorage();
  if (name === "local") return localStorage();
  return s3Storage();
}
