#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const b64 = [0,1,2].map(i => readFileSync(join(dir, `phase1d-route-part${i}.b64`), "utf8").trim()).join("");
const out = join(dir, "../src/routes/looks.$lookId.tsx");
writeFileSync(out, Buffer.from(b64, "base64"));
console.log("assembled", out, Buffer.from(b64, "base64").length);
