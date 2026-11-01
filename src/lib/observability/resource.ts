import type { Attributes } from "./model.ts";

/** Host env used to name a deploy. Nothing here is a secret. */
export type ResourceEnv = Record<string, string | undefined>;

const REPO = "https://github.com/yashtatsme92/looktag";

export type ResourceFields = {
  env?: ResourceEnv;
  /** Overrides service.name. Browser calls pass looktag-web. */
  serviceName?: string;
  version?: string;
  revision?: string;
  branch?: string;
  builtAt?: string;
  hostname?: string;
  runtimeVersion?: string;
  instanceId?: string;
  deploymentId?: string;
  previewPr?: string;
  cloudProvider?: string;
  cloudRegion?: string;
  /** Set on the browser resource only. */
  browser?: { platform?: string; userAgent?: string };
};

function trimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return next ? next : undefined;
}

function first(env: ResourceEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = trimmed(env[key]);
    if (value) return value;
  }
  return undefined;
}

/** production | preview | development. APP_ENV wins when it is one of those three. */
export function deploymentEnvironmentName(env: ResourceEnv = {}): "production" | "preview" | "development" {
  const app = trimmed(env.APP_ENV)?.toLowerCase();
  if (app === "production" || app === "preview" || app === "development") return app;
  const context = trimmed(env.CONTEXT)?.toLowerCase();
  if (context === "deploy-preview" || context === "branch-deploy" || context === "preview") return "preview";
  if (trimmed(env.REVIEW_ID) || env.IS_PULL_REQUEST === "true") return "preview";
  if (env.RENDER === "true" || context === "production" || env.NODE_ENV === "production") return "production";
  return "development";
}

/** render or netlify, and only when the host says so. */
export function cloudProviderFromEnv(env: ResourceEnv = {}): "render" | "netlify" | undefined {
  if (env.RENDER === "true") return "render";
  if (env.NETLIFY === "true" || trimmed(env.CONTEXT)) return "netlify";
  return undefined;
}

/** Family and major version only. The raw user agent is not a resource attribute. */
export function browserFamily(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const edge = /Edg\/(\d+)/.exec(ua);
  if (edge) return `Edge/${edge[1]}`;
  const firefox = /Firefox\/(\d+)/.exec(ua);
  if (firefox) return `Firefox/${firefox[1]}`;
  const chrome = /Chrome\/(\d+)/.exec(ua);
  if (chrome) return `Chrome/${chrome[1]}`;
  const safari = /Version\/(\d+).{0,40}Safari\//.exec(ua);
  if (safari) return `Safari/${safari[1]}`;
  return "Other";
}

function revisionOf(env: ResourceEnv, explicit?: string): string {
  return (
    trimmed(explicit) ||
    first(env, "RENDER_GIT_COMMIT", "COMMIT_REF", "GITHUB_SHA", "VERCEL_GIT_COMMIT_SHA") ||
    "unknown"
  );
}

function branchOf(env: ResourceEnv, explicit?: string): string {
  return trimmed(explicit) || first(env, "RENDER_GIT_BRANCH", "BRANCH", "HEAD") || "HEAD";
}

/**
 * Resource attributes shared by traces, metrics, and logs.
 * Explicit fields override env so tests and the browser bundle stay deterministic.
 * Browser resources omit node process/host attributes.
 */
export function buildResourceAttributes(input: ResourceFields = {}): Attributes {
  const env = input.env ?? {};
  const browser = Boolean(input.browser);
  const environment = deploymentEnvironmentName(env);
  const version = trimmed(input.version) || "unknown";
  const serviceName = trimmed(input.serviceName) || trimmed(env.OTEL_SERVICE_NAME) || (browser ? "looktag-web" : "looktag");
  const provider = trimmed(input.cloudProvider) || cloudProviderFromEnv(env);
  const region = trimmed(input.cloudRegion) || (provider === "render" ? trimmed(env.RENDER_REGION) : undefined);
  const previewPr = trimmed(input.previewPr) || trimmed(env.REVIEW_ID);
  const deploymentId = trimmed(input.deploymentId) || first(env, "RENDER_DEPLOY_ID", "DEPLOY_ID") || "unknown";
  const instance =
    trimmed(input.instanceId) || first(env, "RENDER_INSTANCE_ID") || trimmed(input.hostname) || "unknown";
  const attrs: Attributes = {
    "service.name": serviceName,
    "service.namespace": "looktag",
    "service.version": version,
    "deployment.environment.name": environment,
    "deployment.id": deploymentId,
    "vcs.ref.head.revision": revisionOf(env, input.revision),
    "vcs.ref.head.name": branchOf(env, input.branch),
    "vcs.repository.url.full": REPO,
    "telemetry.sdk.name": "looktag",
    "telemetry.sdk.language": browser ? "webjs" : "nodejs",
    "telemetry.sdk.version": version,
    "app.build.time": trimmed(input.builtAt) || "unknown",
  };
  if (!browser) {
    attrs["service.instance.id"] = instance;
    attrs["host.name"] = trimmed(input.hostname) || instance;
    attrs["process.runtime.name"] = "nodejs";
    attrs["process.runtime.version"] = trimmed(input.runtimeVersion) || "unknown";
  }
  if (provider) attrs["cloud.provider"] = provider;
  if (region) attrs["cloud.region"] = region;
  if (environment === "preview" && previewPr) attrs["app.preview.pr"] = previewPr;
  if (browser) {
    const platform = trimmed(input.browser?.platform) || "unknown";
    attrs["browser.platform"] = platform.slice(0, 40);
    attrs["user_agent.original"] = browserFamily(input.browser?.userAgent);
  }
  return attrs;
}

const BROWSER_RESOURCE_KEYS = new Set([
  "service.name",
  "service.namespace",
  "service.version",
  "deployment.environment.name",
  "deployment.id",
  "vcs.ref.head.revision",
  "vcs.ref.head.name",
  "vcs.repository.url.full",
  "telemetry.sdk.name",
  "telemetry.sdk.language",
  "telemetry.sdk.version",
  "app.build.time",
  "app.preview.pr",
  "cloud.provider",
  "cloud.region",
  "browser.platform",
  "user_agent.original",
]);

/** Client-supplied resource. Only looktag-web and the allowlisted keys survive. */
export function browserResourceFromClient(input: unknown): Attributes | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (BROWSER_RESOURCE_KEYS.has(key)) raw[key] = value;
  }
  const clean: Attributes = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      clean[key] = value;
      continue;
    }
    if (typeof value === "string" && value.trim() && !value.startsWith("data:")) {
      clean[key] = value.slice(0, 280);
    }
  }
  if (clean["service.name"] !== "looktag-web") return undefined;
  clean["user_agent.original"] = String(clean["user_agent.original"] ?? "Other").slice(0, 40);
  return clean;
}

