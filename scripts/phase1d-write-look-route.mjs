#!/usr/bin/env node
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const b64 = readFileSync(join(dir, "phase1d-look-route.b64.gz.txt"), "utf8").replace(/\s+/g, "");
const out = join(dir, "../src/routes/looks.$lookId.tsx");
const buf = gunzipSync(Buffer.from(b64, "base64"));
writeFileSync(out, buf);
console.log("restored", out, buf.length);
