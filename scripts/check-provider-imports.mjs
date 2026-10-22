#!/usr/bin/env node
/**
 * Vendor calls stay inside src/lib/providers. This scan is the CI-side check
 * that does not depend on ESLint (host strings, not just import specifiers).
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  /from\s+["']kysely["']/,
  /import\(\s*["']kysely["']\s*\)/,
  /require\(\s*["']kysely["']\s*\)/,
  /from\s+["']better-auth/,
  /import\(\s*["']better-auth/,
  /require\(\s*["']better-auth/,
  /from\s+["']@better-auth\//,
  /import\(\s*["']@better-auth\//,
];

const HOSTS = ["api.x.ai", "api.search.brave.com", "googleapis.com/customsearch", "duckduckgo.com"];

/** Better Auth is the auth framework. Password hashing goes through providers/auth. */
const BETTER_AUTH_ALLOW = new Set([
  "src/lib/auth/server.ts",
  "src/lib/auth/gate-session.server.ts",
  "src/lib/auth/method-gate.ts",
  "src/lib/auth/client.ts",
]);

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
      const betterAuthAllowed = BETTER_AUTH_ALLOW.has(rel);
      for (const pattern of IMPORT_PATTERNS) {
        const isBetterAuth = pattern.source.includes("better-auth");
        if (isBetterAuth && betterAuthAllowed) continue;
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

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const violations = await findProviderImportViolations(dirname(fileURLToPath(import.meta.url)) + "/..");
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exit(1);
  }
}
