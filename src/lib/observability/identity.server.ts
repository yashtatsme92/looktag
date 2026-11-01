import { hostname } from "node:os";
import { readFileSync } from "node:fs";
import { readPackageVersion, resolveBuildCommit } from "../build-commit.ts";
import { buildResourceAttributes, cloudProviderFromEnv, type ResourceEnv } from "./resource.ts";
import type { Attributes } from "./model.ts";

function baked(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function first(env: ResourceEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function packageVersion(): string {
  const fromBuild = baked(typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined);
  if (fromBuild) return fromBuild;
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    return readPackageVersion(pkg);
  } catch {
    return "unknown";
  }
}

function revision(env: ResourceEnv): string {
  const fromEnv = resolveBuildCommit(env, "");
  if (fromEnv !== "unknown") return fromEnv;
  return baked(typeof __APP_REVISION__ === "string" ? __APP_REVISION__ : undefined) || "unknown";
}

let cached: Attributes | null = null;

/** Process resource, computed once. Runtime host env wins over values baked at build. */
export function serverResourceAttributes(env: ResourceEnv = process.env): Attributes {
  if (cached && env === process.env) return cached;
  const bakedDeployment = baked(typeof __APP_DEPLOYMENT_ID__ === "string" ? __APP_DEPLOYMENT_ID__ : undefined);
  const attrs = buildResourceAttributes({
    env,
    version: packageVersion(),
    revision: revision(env),
    branch: first(env, "RENDER_GIT_BRANCH", "BRANCH", "HEAD") || baked(typeof __APP_BRANCH__ === "string" ? __APP_BRANCH__ : undefined),
    builtAt: baked(typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : undefined),
    hostname: hostname(),
    runtimeVersion: process.version,
    deploymentId:
      first(env, "RENDER_DEPLOY_ID", "DEPLOY_ID") ||
      (bakedDeployment && bakedDeployment !== "unknown" ? bakedDeployment : undefined),
    previewPr: first(env, "REVIEW_ID") || baked(typeof __APP_PREVIEW_PR__ === "string" ? __APP_PREVIEW_PR__ : undefined),
    cloudProvider:
      cloudProviderFromEnv(env) || baked(typeof __APP_CLOUD_PROVIDER__ === "string" ? __APP_CLOUD_PROVIDER__ : undefined),
    cloudRegion:
      first(env, "RENDER_REGION") || baked(typeof __APP_CLOUD_REGION__ === "string" ? __APP_CLOUD_REGION__ : undefined),
  });
  if (env === process.env) cached = attrs;
  return attrs;
}

export function deploymentIdentity(env: ResourceEnv = process.env): {
  serviceVersion: string;
  deploymentId: string;
  revision: string;
} {
  const attrs = serverResourceAttributes(env);
  return {
    serviceVersion: String(attrs["service.version"]),
    deploymentId: String(attrs["deployment.id"]),
    revision: String(attrs["vcs.ref.head.revision"]),
  };
}
