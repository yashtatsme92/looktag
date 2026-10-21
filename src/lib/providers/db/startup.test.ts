import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("production database startup", () => {
  it("exits non-zero when production has no database and no opt-in", () => {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "src/lib/providers/db/refuse-ephemeral.ts"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          DATABASE_URL: "",
          DB_PROVIDER: "",
          LOOKTAG_ALLOW_EPHEMERAL_DB: "",
          ALLOW_EPHEMERAL_DB: "",
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /DATABASE_URL is not set/);
  });
});
