import { formatAppVersionHeader } from "./build-commit";

export const appVersion: string = __APP_VERSION__;
export const appCommit: string = __APP_COMMIT__;
export const appBuiltAt: string = __APP_BUILT_AT__;

export function appVersionHeader(): string {
  return formatAppVersionHeader(appVersion, appCommit);
}
