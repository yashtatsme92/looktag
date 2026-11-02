import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CREATE_DRAFT_KEY,
  draftSavedMessage,
  persistCreateDraft,
  rememberCreateResume,
  takeCreateResume,
} from "./create-draft.ts";

function memory(limit = Infinity) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

test("persists the full draft when it fits", () => {
  const store = memory();
  assert.equal(persistCreateDraft({ imageSrc: "data:x", title: "A" }, store), "full");
  assert.match(store.map.get(CREATE_DRAFT_KEY) ?? "", /data:x/);
  assert.equal(draftSavedMessage("full").ok, true);
});

test("reports a dropped photo instead of claiming saved", () => {
  const store = memory(40);
  assert.equal(persistCreateDraft({ imageSrc: "x".repeat(100), title: "A" }, store), "no-photo");
  assert.equal(draftSavedMessage("no-photo").ok, false);
});

test("reports failure when nothing can be stored", () => {
  assert.equal(persistCreateDraft({ imageSrc: "", title: "A" }, memory(0)), "failed");
  assert.equal(persistCreateDraft({ imageSrc: "" }, null), "failed");
  assert.doesNotMatch(draftSavedMessage("failed").text, /saved/i);
});

test("resume intent runs once", () => {
  const store = memory();
  rememberCreateResume("find", store);
  assert.equal(takeCreateResume(store), "find");
  assert.equal(takeCreateResume(store), null);
});
