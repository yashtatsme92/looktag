import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ObjectStorage, PutOptions, StoredObject } from "./types";

function safeKey(key: string): string {
  const parts = key.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Invalid storage key");
  }
  return parts.join("/");
}

/** Files under `.data/storage` (or `root`). Look photos are written here when `STORAGE_PROVIDER=local`. */
export function localStorage(root = process.env.STORAGE_LOCAL_ROOT || ".data/storage"): ObjectStorage {
  const base = resolve(root);
  const pathFor = (key: string) => join(base, safeKey(key));
  return {
    async put(key, body, contentType, options?: PutOptions) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
      if (contentType) await writeFile(`${path}.type`, contentType);
      else await unlink(`${path}.type`).catch(() => undefined);
      if (options?.cacheControl) await writeFile(`${path}.cache`, options.cacheControl);
      else await unlink(`${path}.cache`).catch(() => undefined);
    },
    async get(key): Promise<StoredObject | null> {
      try {
        const path = pathFor(key);
        const body = await readFile(path);
        let contentType: string | undefined;
        let cacheControl: string | undefined;
        try {
          contentType = (await readFile(`${path}.type`, "utf8")).trim() || undefined;
        } catch {
          contentType = undefined;
        }
        try {
          cacheControl = (await readFile(`${path}.cache`, "utf8")).trim() || undefined;
        } catch {
          cacheControl = undefined;
        }
        return { body, contentType, cacheControl };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const path = pathFor(key);
      await unlink(path).catch(() => undefined);
      await unlink(`${path}.type`).catch(() => undefined);
      await unlink(`${path}.cache`).catch(() => undefined);
    },
    publicUrl(key) {
      const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL || "/storage").replace(/\/$/, "");
      return `${publicBase}/${safeKey(key)}`;
    },
  };
}
