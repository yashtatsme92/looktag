import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aiAvailable, describeImage, resolveAiProvider, searchProducts } from "./index.ts";

describe("ai provider", () => {
  it("stays unavailable without a key and never calls the network from the stub", async () => {
    assert.equal(resolveAiProvider({}), "stub");
    assert.equal(resolveAiProvider({ XAI_API_KEY: "present" }), "xai");
    assert.equal(resolveAiProvider({ AI_PROVIDER: "stub", XAI_API_KEY: "present" }), "stub");
    assert.throws(
      () => resolveAiProvider({ AI_PROVIDER: "grok" }),
      /Unknown AI_PROVIDER "grok"\. Expected xai\|stub\./,
    );
    assert.equal(aiAvailable({}), false);
    assert.equal(aiAvailable({ XAI_API_KEY: "present" }), true);
    const previous = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = "stub";
    try {
      const vision = await describeImage("secret", { messages: [] });
      assert.deepEqual(vision, { ok: false, error: "AI is not available in this environment." });
      assert.equal(await searchProducts({ apiKey: "secret", model: "m", prompt: "p", domains: [] }), null);
    } finally {
      if (previous === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = previous;
    }
  });
});
