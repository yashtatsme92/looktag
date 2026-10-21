// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories on its own. `migrate.mjs` adds
 * `migrations/auth/0001_auth.sql` when sign-in is on (`VITE_AUTH_ENABLED` is
 * not `"false"`), then dedupes by basename so the top-level copy is not applied
 * twice. PGLite's glob already sees `migrations/0001_auth.sql` and does not
 * read the `auth/` directory.
 */

export const AUTH_MIGRATION = "0001_auth.sql";

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * Pass `{ authEnabled: false }` to skip the Better Auth schema. Two paths with
 * the same basename (the copied `0001_auth.sql` and `auth/0001_auth.sql`)
 * apply once; the lexicographically first path wins.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @param {{ authEnabled?: boolean }} [options]
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied, options = {}) {
  const done = new Set(applied);
  const authEnabled = options.authEnabled !== false;
  const items = [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .filter(({ name, path }) => {
      if (authEnabled) return true;
      if (name === AUTH_MIGRATION) return false;
      return !path.split("/").includes("auth");
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const seen = new Set();
  const pending = [];
  for (const item of items) {
    if (done.has(item.name) || seen.has(item.name)) continue;
    seen.add(item.name);
    pending.push(item);
  }
  return pending;
}

/**
 * Top-level `readdir` names, plus the auth schema when sign-in is on.
 * @param {Iterable<string>} entries
 * @param {{ authEnabled?: boolean, includeAuthFile?: boolean }} [options]
 */
export function candidateMigrationPaths(entries, options = {}) {
  const authEnabled = options.authEnabled !== false;
  const paths = [...entries];
  if (authEnabled && options.includeAuthFile) paths.push(`auth/${AUTH_MIGRATION}`);
  return paths;
}
