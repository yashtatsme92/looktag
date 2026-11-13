#!/usr/bin/env node
/**
 * Production-image guard for packages the server loads at runtime.
 *
 * The Dockerfile's runtime stage copies only `.output/` (no node_modules), so a
 * package the bundler did not trace is missing in production even though the
 * build passed. That is how "Cannot find package '@aws-sdk/client-s3'" reached
 * users on Publish (2.5.46): the S3 SDK was loaded through a variable
 * `import(name)` the bundler could not see.
 *
 * Three checks:
 *  1. Source: no `import(/* @vite-ignore *\/ variable)` of a package outside
 *     ALLOWED_OPAQUE_IMPORTS (each must be optional and fail soft).
 *  2. Output: copy `.output` to an empty temp dir, like the image does, and
 *     make sure every bare import in the server bundle resolves there.
 *  3. Runtime: in that copy, run the bundled photo store with
 *     STORAGE_PROVIDER=s3 and save a real photo. By default the S3 endpoint is a
 *     local stub; with `--live` it uses the S3_* env as set (R2 in production)
 *     and deletes what it wrote.
 *
 *   node scripts/check-server-output.mjs [--output .output] [--live]
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Optional SDKs loaded by name on purpose. Each call site catches a failed load. */
export const ALLOWED_OPAQUE_IMPORTS = new Set(["src/lib/providers/errors/sentry.ts"]);

const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

/** Strip comments so documentation that quotes an import is not read as one. */
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/**
 * Module syntax as the bundler prints it: one `import … from "x"` /
 * `export … from "x"` per line, plus literal `import("x")`. CommonJS
 * `require()` inside vendored code is left out on purpose: those sit behind
 * runtime feature checks (`ws` in PGlite, SigV4a in the AWS SDK).
 */
const SPECIFIER_PATTERNS = [
  /^\s*(?:import|export)\b[^\n;"'`]*?\bfrom\s*["']([^"'\n]+)["']/gm,
  /^\s*import\s*["']([^"'\n]+)["']/gm,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

const PACKAGE_SPECIFIER = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w@.+[\]-]+)*$/i;

export function isBareSpecifier(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#")) return false;
  if (!PACKAGE_SPECIFIER.test(spec)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(spec) && !spec.startsWith("node:")) return false;
  return !BUILTINS.has(spec) && !spec.startsWith("node:");
}

/** Bare package specifiers imported by a bundle file. */
export function bareSpecifiers(code) {
  const found = new Set();
  const text = stripComments(code);
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (isBareSpecifier(match[1])) found.add(match[1]);
    }
  }
  return found;
}

export function packageName(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Node's lookup: `<dir>/node_modules/<pkg>` from the importing file up to `stopAt`. */
export function resolvesFrom(file, spec, stopAt) {
  const pkg = packageName(spec);
  let dir = dirname(file);
  const stop = resolve(stopAt);
  for (;;) {
    if (existsSync(join(dir, "node_modules", pkg, "package.json"))) return true;
    if (dir === stop) return false;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* walk(path);
    } else if (/\.(mjs|js|cjs)$/.test(entry.name)) {
      yield path;
    }
  }
}

/** Server bundle files whose bare imports would throw in the runtime image. */
export function findUnresolvedImports(serverDir, stopAt) {
  const missing = [];
  for (const file of walk(serverDir)) {
    for (const spec of bareSpecifiers(readFileSync(file, "utf8"))) {
      if (!resolvesFrom(file, spec, stopAt)) missing.push({ file: relative(stopAt, file), spec });
    }
  }
  return missing;
}

/** `import(/* @vite-ignore *\/ x)` or `import(x)` with a non-literal argument. */
const OPAQUE_IMPORT = /\bimport\s*\(\s*(\/\*\s*@vite-ignore\s*\*\/\s*)?(?!["'`])[A-Za-z_$][\w$.]*\s*\)/g;

export function findOpaqueImports(root = ROOT) {
  const hits = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        visit(path);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
      const rel = relative(root, path).split("\\").join("/");
      if (ALLOWED_OPAQUE_IMPORTS.has(rel)) continue;
      const text = stripComments(readFileSync(path, "utf8"));
      if (OPAQUE_IMPORT.test(text)) hits.push(rel);
      OPAQUE_IMPORT.lastIndex = 0;
    }
  };
  for (const top of ["src", "server"]) {
    if (existsSync(join(root, top))) visit(join(root, top));
  }
  return hits;
}

/** The bundled module that exports `persistDataUrlPhoto` (name is kept: it is dynamically imported). */
export function findPhotoStoreChunk(serverDir) {
  for (const file of walk(serverDir)) {
    const text = readFileSync(file, "utf8");
    if (/export\s*\{[^}]*\bpersistDataUrlPhoto\b/.test(text)) return file;
  }
  return null;
}

/** Minimal S3: accepts PUT/DELETE, records keys. Enough for the SDK's PutObject. */
function startS3Stub() {
  const keys = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.method === "PUT") keys.push(decodeURIComponent(req.url ?? ""));
      res.writeHead(req.method === "DELETE" ? 204 : 200, { etag: '"stub"' });
      res.end();
    });
  });
  return new Promise((done) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      done({ endpoint: `http://127.0.0.1:${port}`, keys, close: () => server.close() });
    });
  });
}

const PROBE = String.raw`
const [chunk, photo] = process.argv.slice(-2);
const { readFileSync } = await import("node:fs");
const mod = await import(chunk);
const bytes = readFileSync(photo);
const dataUrl = "data:image/jpeg;base64," + bytes.toString("base64");
const id = "server-output-probe-" + Date.now().toString(36);
const saved = await mod.persistDataUrlPhoto(id, dataUrl, null);
const stored = JSON.parse(saved.variantsJson);
if (!stored.files?.length) throw new Error("no files stored");
if (process.env.PROBE_CLEANUP === "1") await mod.deleteStoredLookImages(stored);
console.log(JSON.stringify({ files: stored.files.length, prefix: stored.prefix, sample: saved.imageSrc }));
`;

function run(cmd, args, options) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => done({ code, out, err }));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const outIndex = args.indexOf("--output");
  const output = resolve(ROOT, outIndex >= 0 ? args[outIndex + 1] : ".output");
  let failed = false;
  const fail = (message) => {
    failed = true;
    console.error(`FAIL  ${message}`);
  };

  const opaque = findOpaqueImports();
  if (opaque.length) fail(`non-literal dynamic import (bundler cannot trace it): ${opaque.join(", ")}`);
  else console.log("ok    no untraceable package imports in src/ or server/");

  if (!existsSync(join(output, "server", "index.mjs"))) {
    fail(`${relative(ROOT, output)}/server/index.mjs is missing — build first`);
    process.exit(1);
  }

  const isolated = mkdtempSync(join(tmpdir(), "looktag-output-"));
  try {
    cpSync(output, join(isolated, ".output"), { recursive: true });
    const serverDir = join(isolated, ".output", "server");
    const missing = findUnresolvedImports(serverDir, isolated);
    if (missing.length) {
      for (const { file, spec } of missing) fail(`${file} imports "${spec}", not shipped in .output`);
    } else {
      console.log("ok    every bare import in .output/server resolves without node_modules");
    }

    const chunk = findPhotoStoreChunk(serverDir);
    if (!chunk) {
      fail("photo store chunk (exports persistDataUrlPhoto) not found in .output/server");
    } else {
      const stub = live ? null : await startS3Stub();
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        STORAGE_PROVIDER: "s3",
        ...(live
          ? {
              S3_ENDPOINT: process.env.S3_ENDPOINT,
              S3_BUCKET: process.env.S3_BUCKET,
              S3_REGION: process.env.S3_REGION,
              S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
              S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
              STORAGE_PUBLIC_BASE_URL: process.env.STORAGE_PUBLIC_BASE_URL,
              PROBE_CLEANUP: "1",
            }
          : {
              S3_ENDPOINT: stub.endpoint,
              S3_BUCKET: "probe-bucket",
              S3_REGION: "auto",
              S3_ACCESS_KEY_ID: "probe",
              S3_SECRET_ACCESS_KEY: "probe",
              STORAGE_PUBLIC_BASE_URL: "https://img.example.test",
            }),
      };
      const photo = join(ROOT, "public", "looks", "sunday-coat.jpg");
      const result = await run(process.execPath, ["--input-type=module", "-e", PROBE, chunk, photo], {
        cwd: isolated,
        env,
      });
      stub?.close();
      if (result.code !== 0) {
        fail(`photo store with STORAGE_PROVIDER=s3 failed in the runtime layout:\n${result.err.trim()}`);
      } else if (stub && stub.keys.length === 0) {
        fail("photo store returned without uploading to the S3 endpoint");
      } else {
        const line = result.out.trim().split("\n").pop();
        console.log(`ok    STORAGE_PROVIDER=s3 photo upload from the runtime layout (${live ? "live" : "stub"}): ${line}`);
      }
    }
  } finally {
    rmSync(isolated, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

