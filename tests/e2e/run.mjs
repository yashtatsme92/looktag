#!/usr/bin/env node
/**
 * Bootstrap: load houses Scouted-first e2e assertions for #17.
 * Full suite body is applied from the sibling fixture so MCP push stays small.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "run.houses17.mjs.txt");
const body = readFileSync(fixture, "utf8");
const tmp = join(here, ".run.houses17.tmp.mjs");
writeFileSync(tmp, body);
const result = spawnSync(process.execPath, [tmp, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
unlinkSync(tmp);
process.exit(result.status ?? 1);
