import assert from "node:assert/strict";
import { test } from "node:test";
import { createOptimisticSave, useOptimisticSave } from "./optimistic.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

test("useOptimisticSave succeeds and clears Saved after 1.65s", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const save = createOptimisticSave();
  let applied = 0;
  const done = save.run(
    async () => {
      await Promise.resolve();
      return 1;
    },
    () => {
      applied = -1;
    },
    () => {
      applied = 1;
    },
  );
  assert.equal(save.phase, "saving");
  await done;
  await flush();
  assert.equal(save.phase, "saved");
  assert.equal(applied, 1);
  t.mock.timers.tick(1649);
  assert.equal(save.phase, "saved");
  t.mock.timers.tick(1);
  assert.equal(save.phase, "idle");
  assert.equal(typeof useOptimisticSave, "function");
  t.mock.timers.reset();
});

test("useOptimisticSave reverts when the write fails", async () => {
  const save = createOptimisticSave();
  let on = true;
  await save.run(
    async () => {
      throw new Error("Could not update Scouted.");
    },
    () => {
      on = false;
    },
  );
  assert.equal(on, false);
  assert.equal(save.phase, "error");
  assert.equal(save.error, "Could not update Scouted.");
});

test("useOptimisticSave keeps the last write when toggled twice", async () => {
  const save = createOptimisticSave();
  const first = deferred<string>();
  const second = deferred<string>();
  const applied: string[] = [];
  const older = save.run(
    () => first.promise,
    () => applied.push("revert-old"),
    (value) => applied.push(value),
  );
  const newer = save.run(
    () => second.promise,
    () => applied.push("revert-new"),
    (value) => applied.push(value),
  );
  first.resolve("old");
  await flush();
  await older;
  assert.deepEqual(applied, []);
  assert.equal(save.phase, "saving");
  second.resolve("new");
  await newer;
  await flush();
  assert.deepEqual(applied, ["new"]);
  assert.equal(save.phase, "saved");
});
