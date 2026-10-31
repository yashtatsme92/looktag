/**
 * Better Auth at function-runtime env: BETTER_AUTH_URL / APP_URL / APP_ENV=preview
 * and BETTER_AUTH_SECRET only. No NETLIFY, CONTEXT, or DEPLOY_* variables.
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const script = join(root, "scripts/preview-auth-origin-check.mjs");
const ORIGIN = "https://pr-9--looktag.netlify.app";
const SECRET = "preview-runtime-secret-0123456789abcdef";

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME ?? "/root",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    NODE_ENV: "development",
    APP_ENV: "preview",
    VITE_AUTH_ENABLED: "true",
    ...extra,
  };
}

function run(mode: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [script, mode], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  return once(child, "exit").then(([code]) => ({ code, stdout, stderr }));
}

describe("preview auth at function runtime", () => {
  it(
    "signs up and in from pr-9--looktag.netlify.app without Netlify build variables",
    { timeout: 180_000 },
    async () => {
      const result = await run(
        "sign-in",
        childEnv({
          BETTER_AUTH_URL: ORIGIN,
          APP_URL: ORIGIN,
          BETTER_AUTH_SECRET: SECRET,
        }),
      );
      assert.equal(result.code, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      assert.match(result.stdout, /SIGN_UP 200/);
      assert.match(result.stdout, /SIGN_IN 200/);
      assert.doesNotMatch(result.stdout + result.stderr, /INVALID_ORIGIN/);
    },
  );

  it(
    "refuses to start a preview when BETTER_AUTH_SECRET is missing",
    { timeout: 180_000 },
    async () => {
      const result = await run("missing-secret", childEnv({}));
      assert.equal(result.code, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      assert.match(result.stdout, /PREVIEW_SECRET_REQUIRED/);
    },
  );
});
