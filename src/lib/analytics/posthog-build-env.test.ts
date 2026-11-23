import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function buildStage(dockerfile: string): string {
  const start = dockerfile.indexOf("AS build");
  const from = dockerfile.lastIndexOf("FROM ", start);
  const next = dockerfile.indexOf("\nFROM ", start);
  return dockerfile.slice(from, next === -1 ? undefined : next);
}

describe("PostHog Docker build env", () => {
  it("passes VITE_POSTHOG_KEY into the image build and does not commit a key", () => {
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    const stage = buildStage(dockerfile);
    const buildAt = stage.indexOf("RUN npm run build");
    const argAt = stage.indexOf("ARG VITE_POSTHOG_KEY");
    const envAt = stage.indexOf("ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY");
    assert.ok(buildAt > 0);
    assert.ok(argAt > 0 && argAt < buildAt);
    assert.ok(envAt > argAt && envAt < buildAt);
    assert.equal(dockerfile.includes("phc_"), false);
  });

  it("Vite build sees VITE_POSTHOG_KEY when set and still resolves when unset", async () => {
    const previous = process.env.VITE_POSTHOG_KEY;
    try {
      process.env.VITE_POSTHOG_KEY = "phc_fixture_not_real";
      const set = await resolveConfig({ configFile: join(root, "vite.config.ts"), root }, "build");
      assert.equal(set.env.VITE_POSTHOG_KEY, "phc_fixture_not_real");
      delete process.env.VITE_POSTHOG_KEY;
      const unset = await resolveConfig({ configFile: join(root, "vite.config.ts"), root }, "build");
      assert.equal(unset.env.VITE_POSTHOG_KEY, undefined);
      assert.equal(typeof unset.build, "object");
    } finally {
      if (previous === undefined) delete process.env.VITE_POSTHOG_KEY;
      else process.env.VITE_POSTHOG_KEY = previous;
    }
  });
});
