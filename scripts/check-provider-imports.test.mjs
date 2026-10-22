import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findProviderImportViolations } from "./check-provider-imports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("provider import boundary", () => {
  it("keeps vendor SDKs and vendor hosts inside src/lib/providers", async () => {
    const violations = await findProviderImportViolations(root);
    assert.deepEqual(violations, []);
  });

  it("would flag a vendor host outside the providers folder", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(join(tmpdir(), "looktag-providers-"));
    try {
      await mkdir(join(dir, "src"), { recursive: true });
      const host = ["api", "x.ai"].join(".");
      await writeFile(join(dir, "src", "leak.ts"), `const url = "https://${host}/v1";\nimport { x } from "@/lib/providers/telemetry/otlp";\n`);
      const violations = await findProviderImportViolations(dir);
      assert.equal(violations.length, 2);
      assert.match(violations.join("\n"), /leak\.ts/);
      assert.match(violations.join("\n"), /telemetry adapter/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
