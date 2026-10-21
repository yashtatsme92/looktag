import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emailSender, resolveEmailProvider } from "./index.ts";

describe("email provider", () => {
  it("logs through the console adapter and is not wired to a flow", async () => {
    assert.equal(resolveEmailProvider({}), "console");
    assert.throws(() => resolveEmailProvider({ EMAIL_PROVIDER: "smtp" }), /console/);
    const lines: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args);
    };
    try {
      await emailSender({ EMAIL_PROVIDER: "console" }).send({
        to: "reader@example.com",
        subject: "Hello",
        text: "Hi",
      });
    } finally {
      console.info = original;
    }
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.[0], "[email]");
  });
});
