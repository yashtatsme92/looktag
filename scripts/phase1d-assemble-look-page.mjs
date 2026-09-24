#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const b64 = [...Array(8).keys()].map(i => readFileSync(join(dir, `phase1d-page-part${i}.b64`), "utf8").trim()).join("");
const out = join(dir, "../src/components/looks/look-detail-page.tsx");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(b64, "base64"));
console.log("assembled", out, Buffer.from(b64, "base64").length);
