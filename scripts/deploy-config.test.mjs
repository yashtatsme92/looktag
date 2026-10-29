import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("render blueprint is free, frankfurt, and image-backed", () => {
  const text = read("render.yaml");
  assert.match(text, /runtime: image/);
  assert.match(text, /plan: free/);
  assert.match(text, /region: frankfurt/);
  assert.match(text, /healthCheckPath: \/healthz/);
  assert.match(text, /ghcr.io\/yashtatsme92\/looktag:latest/);
  assert.match(text, /fromRegistryCreds/);
  assert.doesNotMatch(text, /postgres:\/\//);
});

test("compose stays within the free memory budget and does not publish the app", () => {
  const text = read("docker-compose.yml");
  assert.match(text, /mem_limit: 512m/);
  assert.match(text, /caddy:2/);
  assert.match(text, /postgres:16/);
  assert.match(text, /profiles: \["db"\]/);
  assert.doesNotMatch(text, /"8080:8080"/);
});

test("src has no host-specific deploy code", () => {
  const banned = ["onrender.com", "hetzner.com", "koyeb.app"];
  const hits = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(name)) continue;
      const text = readFileSync(path, "utf8");
      for (const word of banned) {
        if (text.includes(word)) hits.push(`${path} ${word}`);
      }
    }
  }
  walk(join(root, "src"));
  assert.deepEqual(hits, []);
});

test("deploy workflow references secrets by name and does not echo them", () => {
  const text = read(".github/workflows/deploy.yml");
  for (const name of [
    "RENDER_DEPLOY_HOOK_URL",
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
    "RENDER_PUBLIC_URL",
    "DEPLOY_TARGET",
    "DEPLOY_HOST",
    "DEPLOY_USER",
    "DEPLOY_SSH_KEY",
    "DEPLOY_KNOWN_HOSTS",
    "DEPLOY_PATH",
  ]) {
    assert.match(text, new RegExp(name));
  }
  assert.doesNotMatch(text, /echo \$.*HOOK/);
  assert.doesNotMatch(text, /echo \$.*SECRET/);
  assert.match(text, /linux\/amd64,linux\/arm64/);
  assert.match(text, /workflow_dispatch/);
});
