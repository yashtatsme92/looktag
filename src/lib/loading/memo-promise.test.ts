import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoPromise, resetMemoPromise } from "./memo-promise.ts";

describe("memoPromise", () => {
  it("shares one in-flight call and then the settled value", async () => {
    resetMemoPromise();
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    const [a, b] = await Promise.all([memoPromise("k", load), memoPromise("k", load)]);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(calls, 1);
    assert.equal(await memoPromise("k", load), 1);
    assert.equal(calls, 1);
  });

  it("does not cache a rejection", async () => {
    resetMemoPromise();
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.reject(new Error("nope"));
    };
    await assert.rejects(() => memoPromise("bad", load));
    await assert.rejects(() => memoPromise("bad", load));
    assert.equal(calls, 2);
  });
});
