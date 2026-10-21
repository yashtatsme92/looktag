import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { localStorage } from "./local.ts";
import { resolveStorageProvider } from "./index.ts";

describe("storage provider", () => {
  it("defaults to local and round-trips an object without a network", async () => {
    assert.equal(resolveStorageProvider({}), "local");
    assert.equal(resolveStorageProvider({ STORAGE_PROVIDER: "r2" }), "r2");
    assert.equal(resolveStorageProvider({ STORAGE_PROVIDER: "s3" }), "s3");
    const previous = process.env.STORAGE_PUBLIC_BASE_URL;
    delete process.env.STORAGE_PUBLIC_BASE_URL;
    const root = await mkdtemp(join(tmpdir(), "looktag-storage-"));
    try {
      const store = localStorage(root);
      const body = new TextEncoder().encode("photo");
      await store.put("looks/one.jpg", body, "image/jpeg");
      const stored = await store.get("looks/one.jpg");
      assert.equal(stored?.contentType, "image/jpeg");
      assert.equal(new TextDecoder().decode(stored?.body), "photo");
      assert.equal(store.publicUrl("looks/one.jpg"), "/storage/looks/one.jpg");
      await store.delete("looks/one.jpg");
      assert.equal(await store.get("looks/one.jpg"), null);
      assert.throws(() => store.publicUrl("../secret"), /Invalid storage key/);
    } finally {
      if (previous === undefined) delete process.env.STORAGE_PUBLIC_BASE_URL;
      else process.env.STORAGE_PUBLIC_BASE_URL = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
