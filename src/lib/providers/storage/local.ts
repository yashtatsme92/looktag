import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ObjectStorage, StoredObject } from "./types";

function safeKey(key: string): string {
  const parts = key.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Invalid storage key");
  }
  return parts.join("/");
}

/** Files under `.data/storage` (or `root`). Not wired to photo upload. */
export function localStorage(root = process.env.STORAGE_LOCAL_ROOT || ".data/storage"): ObjectStorage {
  const base = resolve(root);
  const pathFor = (key: string) => join(base, safeKey(key));
  return {
    async put(key, body, contentType) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
      if (contentType) await writeFile(`${path}.type`, contentType);
      else await unlink(`${path}.type`).catch(() => undefined);
    },
    async get(key): Promise<StoredObject | null> {
      try {
        const path = pathFor(key);
        const body = await readFile(path);
        let contentType: string | undefined;
        try {
          contentType = (await readFile(`${path}.type`, "utf8")).trim() || undefined;
        } catch {
          contentType = undefined;
        }
        return { body, contentType };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const path = pathFor(key);
      await unlink(path).catch(() => undefined);
      await unlink(`${path}.type`).catch(() => undefined);
    },
    publicUrl(key) {
      const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL || "/storage").replace(/\/$/, "");
      return `${publicBase}/${safeKey(key)}`;
    },
  };
}
