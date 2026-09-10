#!/usr/bin/env node
/**
 * Nitro traces @electric-sql/pglite JS but not the wasm/data blobs. Copy them
 * next to the bundled module so any host (Node server, Docker, Vercel, preview)
 * can boot PGLite when DATABASE_URL is unset.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PGLITE_ASSET_FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];

const rootFromScript = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Known Nitro output folders that may need the wasm blobs beside the bundle. */
export function pgliteDestinations(root) {
  return [
    join(root, ".vercel/output/functions/__server.func/_libs"),
    join(root, ".output/functions/__server.func/_libs"),
    join(root, ".output/server/_libs"),
  ];
}

function findPgliteModuleDirs(dir, acc = [], depth = 0) {
  if (depth > 6 || !existsSync(dir)) return acc;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" && depth > 0) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      findPgliteModuleDirs(full, acc, depth + 1);
      continue;
    }
    if (/pglite/i.test(name) && /\.(mjs|js|cjs)$/.test(name)) acc.push(dir);
  }
  return acc;
}

export function resolvePgliteCopyTargets(root) {
  const dests = new Set(pgliteDestinations(root));
  for (const base of [join(root, ".output"), join(root, ".vercel")]) {
    for (const dir of findPgliteModuleDirs(base)) dests.add(dir);
  }
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
  return 0;
}

const launchedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  process.exit(copyPgliteAssets());
}
