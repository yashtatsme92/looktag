#!/usr/bin/env node
/**
 * Nitro traces @electric-sql/pglite JS but not the wasm/data blobs. Copy them
 * next to every bundled module that loads them via import.meta.url, including
 * .output/server/_libs, so `node .output/server/index.mjs` can boot PGLite.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PGLITE_ASSET_FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

const WASM_REF = /pglite\.(?:wasm|data)|initdb\.wasm/;
const TEXT_EXT = /\.(mjs|js|cjs)$/;

const rootFromScript = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Known Nitro output folders that may need the wasm blobs beside the bundle. */
export function pgliteDestinations(root) {
  return [
    join(root, ".vercel/output/functions/__server.func/_libs"),
    join(root, ".output/functions/__server.func/_libs"),
    join(root, ".output/server/_libs"),
  ];
}

function walkOutput(dir, acc, depth = 0) {
  if (depth > 8 || !existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name.toLowerCase() === "pglite") {
        const dist = join(full, "dist");
        if (existsSync(dist)) acc.add(dist);
      }
      walkOutput(full, acc, depth + 1);
      continue;
    }
    if (!TEXT_EXT.test(name) || !st.isFile() || st.size > 20_000_000) continue;
    if (/pglite/i.test(name)) {
      acc.add(dir);
      continue;
    }
    let text = "";
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (WASM_REF.test(text)) acc.add(dir);
  }
}

/** Directories under the production output that must sit beside the wasm blobs. */
export function findPgliteAssetDirs(root) {
  const acc = new Set();
  for (const base of [
    join(root, ".output/server"),
    join(root, ".output/functions"),
    join(root, ".vercel"),
  ]) {
    walkOutput(base, acc);
  }
  return [...acc];
}

export function resolvePgliteCopyTargets(root) {
  const dests = new Set(pgliteDestinations(root));
  for (const dir of findPgliteAssetDirs(root)) dests.add(dir);
  return [...dests].filter((dir) => existsSync(dir) || existsSync(dirname(dir)));
}

export function copySsrCssAssets(root) {
  const ssrDir = join(root, "node_modules/.nitro/vite/services/ssr/assets");
  const publicDir = join(root, ".output/public/assets");
  if (!existsSync(ssrDir) || !existsSync(dirname(publicDir))) return 0;
  mkdirSync(publicDir, { recursive: true });
  let copied = 0;
  for (const name of readdirSync(ssrDir)) {
    if (!name.endsWith(".css")) continue;
    copyFileSync(join(ssrDir, name), join(publicDir, name));
    copied += 1;
    console.log("[ssr-css] copied", name);
  }
  return copied;
}

export function copyPgliteAssets(root = rootFromScript) {
  copySsrCssAssets(root);
  const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
  const targets = resolvePgliteCopyTargets(root);
  if (targets.length === 0) {
    console.log("[pglite] no server output — skip");
    return 0;
  }
  for (const file of PGLITE_ASSET_FILES) {
    const from = join(srcDir, file);
    if (!existsSync(from)) {
      console.error(`[pglite] missing ${from}`);
      return 1;
    }
  }
  for (const destDir of targets) {
    mkdirSync(destDir, { recursive: true });
    for (const file of PGLITE_ASSET_FILES) {
      copyFileSync(join(srcDir, file), join(destDir, file));
    }
    console.log("[pglite] copied assets →", destDir);
  }
  const serverDir = join(root, ".output/server");
  if (existsSync(serverDir)) {
    const libs = join(serverDir, "_libs");
    for (const file of PGLITE_ASSET_FILES) {
      if (!existsSync(join(libs, file))) {
        console.error(`[pglite] ${file} missing from ${libs}`);
        return 1;
      }
    }
  }
  return 0;
}

const launchedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  process.exit(copyPgliteAssets());
}
