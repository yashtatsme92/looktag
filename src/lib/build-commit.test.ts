import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAppVersionHeader,
  readPackageVersion,
  resolveBuildCommit,
  shortCommit,
} from "./build-commit.ts";

const FULL = "0123456789abcdef0123456789abcdef01234567";

describe("resolveBuildCommit", () => {
  it("prefers Render, then Netlify, then GitHub, then Vercel", () => {
    const env = {
      RENDER_GIT_COMMIT: "render-sha",
      COMMIT_REF: "netlify-sha",
      GITHUB_SHA: "github-sha",
      VERCEL_GIT_COMMIT_SHA: "vercel-sha",
    };
    assert.equal(resolveBuildCommit(env, "git-sha"), "render-sha");
    assert.equal(resolveBuildCommit({ ...env, RENDER_GIT_COMMIT: "  " }, "git-sha"), "netlify-sha");
    assert.equal(resolveBuildCommit({ GIT_COMMIT: "docker-sha", COMMIT_REF: "netlify-sha" }, "git-sha"), "docker-sha");
    assert.equal(
      resolveBuildCommit({ ...env, RENDER_GIT_COMMIT: "", COMMIT_REF: "" }, "git-sha"),
      "github-sha",
    );
    assert.equal(
      resolveBuildCommit(
        { ...env, RENDER_GIT_COMMIT: "", COMMIT_REF: "", GITHUB_SHA: " \n" },
        "git-sha",
      ),
      "vercel-sha",
    );
  });

  it("falls back to git HEAD, then unknown", () => {
    assert.equal(resolveBuildCommit({}, "  abcdef1  "), "abcdef1");
    assert.equal(resolveBuildCommit({}, ""), "unknown");
    assert.equal(resolveBuildCommit({}, "   "), "unknown");
    assert.equal(resolveBuildCommit({}, null), "unknown");
    assert.equal(resolveBuildCommit({}), "unknown");
  });

  it("shortens to 7 characters and formats the response header", () => {
    assert.equal(shortCommit(FULL), "0123456");
    assert.equal(shortCommit("abcdef1"), "abcdef1");
    assert.equal(shortCommit("unknown"), "unknown");
    assert.equal(shortCommit("  "), "unknown");
    assert.equal(formatAppVersionHeader("2.5.36", "0123456"), "2.5.36+0123456");
  });

  it("reads the package.json version that deploys report", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      version: string;
    };
    assert.equal(readPackageVersion(pkg), pkg.version);
    assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
    assert.throws(() => readPackageVersion({}), /version/);
  });

  it("declares Docker build args so a Render image without .git still has a commit", () => {
    const docker = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
    const buildAt = docker.indexOf("RUN npm run build");
    assert.ok(buildAt > 0);
    for (const name of ["GIT_COMMIT", "RENDER_GIT_COMMIT"]) {
      const at = docker.indexOf(`ARG ${name}`);
      assert.ok(at > 0 && at < buildAt, name);
    }
    assert.match(docker, /ENV GIT_COMMIT=/);
    assert.match(docker, /ENV RENDER_GIT_COMMIT=/);
  });
});
