#!/usr/bin/env node
/**
 * Vendor calls stay inside src/lib/providers. This scan is the CI-side check
 * that does not depend on ESLint (host strings, not just import specifiers).
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".output",
  ".vercel",
  ".nitro",
  ".git",
  "coverage",
]);

const IMPORT_PATTERNS = [
  /from\s+["']pg["']/,
  /require\(\s*["']pg["']\s*\)/,
  /from\s+["']@electric-sql\/pglite["']/,
  /import\(\s*["']@electric-sql\/pglite["']\s*\)/,
  /require\(\s*["']@electric-sql\/pglite["']\s*\)/,
  /from\s+["']@aws-sdk\//,
  /import\(\s*["']@aws-sdk\//,
  /require\(\s*["']@aws-sdk\//,
  /from\s+["']@sentry\//,
  /import\(\s*["']@sentry\//,
  /require\(\s*["']@sentry\//,
  /from\s+["']@opentelemetry\//,
  /import\(\s*["']@opentelemetry\//,
  /require\(\s*["']@opentelemetry\//,
];

const HOSTS = ["api.x.ai", "api.search.brave.com", "googleapis.com/customsearch"];

const SELF = new Set([
  "scripts/check-provider-imports.mjs",
  "scripts/check-provider-imports.test.mjs",
]);

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function findProviderImportViolations(root) {
  /** @type {string[]} */
  const violations = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
      const rel = relative(root, path).split("\\").join("/");
      if (SELF.has(rel) || rel.startsWith("src/lib/providers/")) continue;
      const text = await readFile(path, "utf8");
      for (const pattern of IMPORT_PATTERNS) {
        if (pattern.test(text)) violations.push(`${rel} imports a vendor SDK (${pattern})`);
      }
      for (const host of HOSTS) {
        if (text.includes(host)) violations.push(`${rel} mentions ${host}`);
      }
    }
  }
  await walk(root);
  return violations;
}
