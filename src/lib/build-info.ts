import { formatAppVersionHeader } from "./build-commit";

/** Release from package.json, baked at build time. */
export const appVersion: string = __APP_VERSION__;
/** Short commit (7 chars), baked at build time. */
export const appCommit: string = __APP_COMMIT__;
/** ISO timestamp captured when the Vite config loaded for this build. */
export const appBuiltAt: string = __APP_BUILT_AT__;

export function appVersionHeader(): string {
  return formatAppVersionHeader(appVersion, appCommit);
}
