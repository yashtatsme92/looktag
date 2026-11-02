export type BuildCommitEnv = {
  RENDER_GIT_COMMIT?: string;
  COMMIT_REF?: string;
  GITHUB_SHA?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
};

const COMMIT_ENV_KEYS = [
  "RENDER_GIT_COMMIT",
  "COMMIT_REF",
  "GITHUB_SHA",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

const SAFE_BUILD_VALUE = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/;

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return SAFE_BUILD_VALUE.test(trimmed) ? trimmed : undefined;
}

export function resolveBuildCommit(env: BuildCommitEnv, gitHead?: string | null): string {
  for (const key of COMMIT_ENV_KEYS) {
    const value = nonEmpty(env[key]);
    if (value) return value;
  }
  const git = nonEmpty(gitHead ?? undefined);
  return git ?? "unknown";
}

export function shortCommit(commit: string): string {
  const value = commit.trim();
  return SAFE_BUILD_VALUE.test(value) ? value.slice(0, 7) : "unknown";
}

export function formatAppVersionHeader(version: string, commit: string): string {
  return `${version}+${commit}`;
}

export function readPackageVersion(packageJson: { version?: unknown }): string {
  const version = packageJson.version;
  if (typeof version !== "string" || !SAFE_BUILD_VALUE.test(version.trim())) {
    throw new Error('package.json "version" is missing');
  }
  return version.trim();
}
