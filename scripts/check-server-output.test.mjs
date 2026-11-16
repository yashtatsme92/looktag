import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  bareSpecifiers,
  findOpaqueImports,
  findUnresolvedImports,
  isBareSpecifier,
  packageName,
} from "./check-server-output.mjs";

// Built from parts so scripts/check-provider-imports.mjs does not read the
// fixtures below as this file importing a vendor SDK.
const S3 = ["@aws", "sdk/client-s3"].join("-");

describe("check-server-output", () => {
  it("reads module imports, not SQL or strings that contain from", () => {
    const code = [
      `import { a } from "${S3}";`,
      'import sharp from "sharp";',
      'import { x } from "../_libs/zod.mjs";',
      'import { createHash } from "node:crypto";',
      'export { b } from "zod";',
      'const q = "select * from \\"user\\"";',
      "// import(\"commented-out\")",
      'const m = await import("@scope/pkg/sub");',
      'if (node) d = require("ws");',
    ].join("\n");
    assert.deepEqual([...bareSpecifiers(code)].sort(), [S3, "@scope/pkg/sub", "sharp", "zod"]);
  });

  it("treats builtins and relative paths as not bare", () => {
    assert.equal(isBareSpecifier("node:fs"), false);
    assert.equal(isBareSpecifier("fs"), false);
    assert.equal(isBareSpecifier("./x.mjs"), false);
    assert.equal(isBareSpecifier("sharp"), true);
    assert.equal(packageName(`${S3}/dist`), S3);
    assert.equal(packageName("sharp/lib"), "sharp");
  });

  it("flags a bundle import that has no package next to the output", () => {
    const root = mkdtempSync(join(tmpdir(), "cso-"));
    try {
      const server = join(root, ".output", "server");
      mkdirSync(join(server, "_ssr"), { recursive: true });
      mkdirSync(join(server, "node_modules", "sharp"), { recursive: true });
      writeFileSync(join(server, "node_modules", "sharp", "package.json"), "{}");
      writeFileSync(join(server, "_ssr", "a.mjs"), `import sharp from "sharp";\nawait import("${S3}");\n`);
      const missing = findUnresolvedImports(server, root);
      assert.deepEqual(
        missing.map((m) => m.spec),
        [S3],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a variable dynamic import in source", () => {
    const root = mkdtempSync(join(tmpdir(), "cso-src-"));
    try {
      mkdirSync(join(root, "src", "lib"), { recursive: true });
      writeFileSync(
        join(root, "src", "lib", "bad.ts"),
        `const specifier = "${S3}";\nexport const load = () => import(/* @vite-ignore */ specifier);\n`,
      );
      writeFileSync(join(root, "src", "lib", "good.ts"), `export const load = () => import("${S3}");\n`);
      assert.deepEqual(findOpaqueImports(root), ["src/lib/bad.ts"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the repo has no untraceable package imports", () => {
    assert.deepEqual(findOpaqueImports(), []);
  });
});
