import { formatAppVersionHeader, resolveRuntimeCommit } from "./build-commit";

export const appVersion: string = __APP_VERSION__;
export const appCommit: string = __APP_COMMIT__;
export const appBuiltAt: string = __APP_BUILT_AT__;

export function currentAppCommit(): string {
  const commit = resolveRuntimeCommit(
    appCommit,
    typeof process === "undefined" ? {} : process.env,
  );
  if (commit !== "unknown" || typeof document === "undefined") return commit;
  const renderedCommit = document
    .querySelector('meta[name="app-commit"]')
    ?.getAttribute("content");
  return renderedCommit ? resolveRuntimeCommit(renderedCommit, {}) : commit;
}

export function appVersionHeader(): string {
  return formatAppVersionHeader(appVersion, currentAppCommit());
}
