import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoadCache } from "./cache.ts";
import { createDelayedLoad } from "./delayed-load.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

test("resolving before the delay never shows a skeleton", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const result = deferred<string>();
  const controller = createDelayedLoad(() => result.promise);
  const phases: string[] = [];
  controller.subscribe(() => phases.push(controller.getSnapshot().phase));
  controller.start();
  t.mock.timers.tick(100);
  result.resolve("ready");
  await flushPromises();
  assert.equal(controller.getSnapshot().phase, "ready");
  assert.equal(phases.includes("skeleton"), false);
  controller.dispose();
  t.mock.timers.reset();
});

test("a delayed result holds the skeleton for at least 400ms", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const result = deferred<string>();
  const controller = createDelayedLoad(() => result.promise);
  const phases: string[] = [];
  controller.subscribe(() => phases.push(controller.getSnapshot().phase));
  controller.start();
  t.mock.timers.tick(300);
  assert.equal(controller.getSnapshot().phase, "skeleton");
  t.mock.timers.tick(50);
  result.resolve("ready");
  await flushPromises();
  assert.equal(controller.getSnapshot().phase, "skeleton");
  t.mock.timers.tick(349);
  assert.equal(controller.getSnapshot().phase, "skeleton");
  t.mock.timers.tick(1);
  assert.equal(controller.getSnapshot().phase, "ready");
  assert.deepEqual(phases, ["skeleton", "ready"]);
  controller.dispose();
  t.mock.timers.reset();
});

test("a slow result replaces the skeleton as soon as it arrives", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const result = deferred<string>();
  const controller = createDelayedLoad(() => result.promise);
  controller.start();
  t.mock.timers.tick(300);
  assert.equal(controller.getSnapshot().phase, "skeleton");
  t.mock.timers.tick(1300);
  result.resolve("ready");
  await flushPromises();
  assert.equal(controller.getSnapshot().phase, "ready");
  controller.dispose();
  t.mock.timers.reset();
});

test("a rejected load enters the error phase", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const result = deferred<string>();
  const controller = createDelayedLoad(() => result.promise);
  controller.start();
  result.reject(new Error("failed"));
  await flushPromises();
  assert.equal(controller.getSnapshot().phase, "error");
  controller.dispose();
  t.mock.timers.reset();
});

test("a load times out after ten seconds", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const controller = createDelayedLoad(() => new Promise(() => {}));
  controller.start();
  t.mock.timers.tick(10_000);
  assert.equal(controller.getSnapshot().phase, "error");
  controller.dispose();
  t.mock.timers.reset();
});

test("a cache hit is ready immediately and does not call the loader", () => {
  const cache = createLoadCache();
  cache.set("feed", ["cached"], 42);
  let called = false;
  const controller = createDelayedLoad(
    async () => {
      called = true;
      return [];
    },
    { cache, cacheKey: "feed" },
  );
  controller.start();
  assert.deepEqual(controller.getSnapshot(), {
    phase: "ready",
    data: ["cached"],
    scrollY: 42,
  });
  assert.equal(called, false);
  controller.dispose();
});

test("disposing and restarting cancels stale work and starts a fresh request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const first = deferred<string>();
  const second = deferred<string>();
  let calls = 0;
  const controller = createDelayedLoad(() => (calls++ === 0 ? first.promise : second.promise));
  controller.start();
  controller.dispose();
  controller.start();
  await flushPromises();
  assert.equal(calls, 2);
  second.resolve("current");
  first.resolve("stale");
  await flushPromises();
  assert.deepEqual(controller.getSnapshot(), { phase: "ready", data: "current" });
  controller.dispose();
  t.mock.timers.reset();
});
