import assert from "node:assert/strict";
import test from "node:test";
import { clearPendingSave, hasPendingSave, PENDING_SAVE_KEY, rememberPendingSave, takePendingSave } from "./pending-save.ts";

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

test("pending save resumes exactly once", () => {
  const store = memoryStore();
  assert.equal(takePendingSave(store), null);
  rememberPendingSave("look-1", store);
  assert.equal(hasPendingSave(store), true);
  assert.equal(JSON.parse(store.getItem(PENDING_SAVE_KEY) ?? "{}").intent, "save");
  assert.equal(takePendingSave(store), "look-1");
  assert.equal(hasPendingSave(store), false);
  assert.equal(takePendingSave(store), null);
});

test("clearing a pending save prevents it from resuming", () => {
  const store = memoryStore();
  rememberPendingSave("look-1", store);
  clearPendingSave(store);
  assert.equal(takePendingSave(store), null);
});

test("a pending record without save intent is not resumed", () => {
  const store = memoryStore();
  store.setItem(PENDING_SAVE_KEY, JSON.stringify({ id: "look-1" }));
  assert.equal(hasPendingSave(store), false);
  assert.equal(takePendingSave(store), null);
  assert.equal(hasPendingSave(store), false);
});

test("a missing store is a no-op", () => {
  rememberPendingSave("look-1", null);
  assert.equal(takePendingSave(null), null);
});
