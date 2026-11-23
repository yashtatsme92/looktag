import assert from "node:assert/strict";
import test from "node:test";
import { SAVED_KEY, useSavedLooks } from "./saved.ts";
import type { Look } from "./types.ts";

function memoryLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  };
}

test("a new save keeps looks already stored on the device", () => {
  const storage = memoryLocalStorage();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    storage.setItem(SAVED_KEY, JSON.stringify(["seed-sunday-coat", "house-noir-column"]));
    useSavedLooks.setState({ ids: [], hydrated: false });
    const saved = useSavedLooks.getState().toggle("user-look");
    assert.equal(saved, true);
    assert.deepEqual(useSavedLooks.getState().ids, ["user-look", "seed-sunday-coat", "house-noir-column"]);
    assert.deepEqual(JSON.parse(storage.getItem(SAVED_KEY) ?? "[]"), [
      "user-look",
      "seed-sunday-coat",
      "house-noir-column",
    ]);
  } finally {
    useSavedLooks.setState({ ids: [], hydrated: false });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
  }
});

function look(id: string, title = id): Look {
  return {
    id,
    userId: "user",
    title,
    caption: "",
    creator: "Creator",
    imageSrc: "/look.jpg",
    createdAt: 1,
    updatedAt: 1,
    tags: [],
  };
}

test("saved page lists published looks and house designs newest first, and skips the rest", async () => {
  const { savedLooksForPage } = await import("./saved.ts");
  const memory = [look("seed-sunday-coat", "Sunday Coat"), look("house-noir-column", "Noir Column")];
  const published = [
    look("user-look", "User Look"),
    look("house-noir-column", "Noir Column"),
    look("seed-sunday-coat", "Sunday Coat"),
  ];
  assert.deepEqual(
    savedLooksForPage({
      savedIds: ["user-look", "house-noir-column", "deleted-look", "user-look"],
      memoryLooks: memory,
      publishedLooks: published,
    }).map((item) => item.id),
    ["user-look", "house-noir-column"],
  );
  assert.deepEqual(
    savedLooksForPage({
      savedIds: ["user-look", "deleted-look"],
      memoryLooks: memory,
      publishedLooks: null,
    }).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    savedLooksForPage({
      savedIds: ["user-look"],
      memoryLooks: [look("user-look", "User Look"), ...memory],
      publishedLooks: null,
    }).map((item) => item.title),
    ["User Look"],
  );
});

test("a guest save is stored newest first and still asks them to sign in", async () => {
  const { applySaveTap, carryOverSave } = await import("./saved.ts");
  const saved = applySaveTap({ ids: ["house-noir-column"], lookId: "seed-sunday-coat", signedIn: false });
  assert.deepEqual(saved.ids, ["seed-sunday-coat", "house-noir-column"]);
  assert.equal(saved.saved, true);
  assert.equal(saved.promptSignIn, true);
  const removed = applySaveTap({ ids: saved.ids, lookId: "seed-sunday-coat", signedIn: false });
  assert.deepEqual(removed.ids, ["house-noir-column"]);
  assert.equal(removed.saved, false);
  assert.equal(removed.promptSignIn, false);
  const signedIn = applySaveTap({ ids: ["house-noir-column"], lookId: "seed-sunday-coat", signedIn: true });
  assert.equal(signedIn.promptSignIn, false);
  assert.deepEqual(carryOverSave(saved.ids, "seed-sunday-coat"), saved.ids);
  assert.deepEqual(carryOverSave(["house-noir-column"], "seed-sunday-coat"), [
    "seed-sunday-coat",
    "house-noir-column",
  ]);
});
