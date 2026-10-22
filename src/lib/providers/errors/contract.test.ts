import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureException, captureMessage, resolveErrorProvider, setUser } from "./index.ts";

describe("error provider", () => {
  it("defaults to console and can be silenced", () => {
    assert.equal(resolveErrorProvider({}), "console");
    assert.equal(resolveErrorProvider({ ERROR_PROVIDER: "sentry" }), "sentry");
    assert.equal(resolveErrorProvider({ ERROR_PROVIDER: "none" }), "none");
    assert.throws(
      () => resolveErrorProvider({ ERROR_PROVIDER: "sentyr" }),
      /Unknown ERROR_PROVIDER "sentyr"\. Expected console\|sentry\|none\./,
    );
    const previous = process.env.ERROR_PROVIDER;
    const lines: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args);
    };
    try {
      process.env.ERROR_PROVIDER = "none";
      captureException(new Error("hidden"));
      captureMessage("hidden");
      setUser({ id: "u1" });
      assert.equal(lines.length, 0);
      process.env.ERROR_PROVIDER = "console";
      captureException(new Error("shown"), { where: "[test]" });
      assert.equal(lines.length, 1);
      assert.equal(lines[0]?.[0], "[test]");
    process.env.ERROR_PROVIDER = "sentyr";
    assert.doesNotThrow(() => captureException(new Error("original-kept")));
    assert.ok(lines.some((line) => String(line[1] ?? line[0]).includes("original-kept") || String(line.join(" ")).includes("original-kept")));
    process.env.ERROR_PROVIDER = "console";
    console.error = () => {
      throw new Error("console down");
    };
    assert.doesNotThrow(() => captureException(new Error("still-kept")));
    } finally {
      console.error = original;
      if (previous === undefined) delete process.env.ERROR_PROVIDER;
      else process.env.ERROR_PROVIDER = previous;
    }
  });
});
