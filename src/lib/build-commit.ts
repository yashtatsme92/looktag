/**
 * Build identity. `package.json` "version" is the release (keep it on the
 * latest tag). Commit prefers the host's git SHA, then a local `git` lookup.
 * Nothing here is secret.
 */
export type BuildCommitEnv = {
  RENDER_GIT_COMMIT?: string;
  GIT_COMMIT?: string;
  COMMIT_REF?: string;
  GITHUB_SHA?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
};

const COMMIT_ENV_KEYS = [
  "RENDER_GIT_COMMIT",
  "GIT_COMMIT",
  "COMMIT_REF",
  "GITHUB_SHA",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** First non-empty host SHA, else git HEAD, else "unknown". */
export function resolveBuildCommit(env: BuildCommitEnv, gitHead?: string | null): string {
  for (const key of COMMIT_ENV_KEYS) {
    const value = nonEmpty(env[key]);
    if (value) return value;
  }
  const git = nonEmpty(gitHead ?? undefined);
  if (git) return git;
  return "unknown";
}

/** First 7 characters. "unknown" stays "unknown". */
export function shortCommit(commit: string): string {
  const value = commit.trim();
  if (!value) return "unknown";
  return value.slice(0, 7);
}

export function formatAppVersionHeader(version: string, commit: string): string {
  return `${version}+${commit}`;
}

export function readPackageVersion(packageJson: { version?: unknown }): string {
  const version = packageJson.version;
  if (typeof version !== "string" || !version.trim()) {
    throw new Error('package.json "version" is missing');
  }
  return version.trim();
}
