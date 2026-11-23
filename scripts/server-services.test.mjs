import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFile(join(root, path), "utf8");

describe("server read service boundary", () => {
  it("keeps look feed and detail queries in the server service", async () => {
    const [service, handlers, listRoute, detailRoute] = await Promise.all([
      source("src/server/services/looks.ts"),
      source("src/lib/looks/looks-read.ts"),
      source("src/routes/api/v1/looks.ts"),
      source("src/routes/api/v1/looks.$id.ts"),
    ]);
    assert.match(service, /export async function listPublicLooks/);
    assert.match(service, /export async function getLookById/);
    assert.match(service, /where published = true\s+order by created_at desc/);
    assert.match(service, /where id = \$\{id\} and published = true/);
    assert.match(handlers, /import\("@\/server\/services\/looks"\)/);
    assert.match(listRoute, /from "@\/server\/services\/looks"/);
    assert.match(detailRoute, /from "@\/server\/services\/looks"/);
    assert.doesNotMatch(service, /createServerFn/);
  });

  it("keeps house list and detail queries in the server service", async () => {
    const [service, handlers] = await Promise.all([
      source("src/server/services/houses.ts"),
      source("src/lib/labels/labels-public.ts"),
    ]);
    assert.match(service, /export async function listFashionLabels/);
    assert.match(service, /export async function getFashionLabel/);
    assert.match(service, /where status = 'approved'\s+order by scouted desc, name asc/);
    assert.match(service, /where id = \$\{id\}/);
    assert.match(service, /where published = true/);
    assert.match(handlers, /import\("@\/server\/services\/houses"\)/);
    assert.doesNotMatch(service, /createServerFn/);
  });

  it("shares profile reads between handlers and SSR, and keeps API me response in the service path", async () => {
    const [service, handlers, account, creatorRoute, meRoute] = await Promise.all([
      source("src/server/services/profiles.ts"),
      source("src/lib/looks/looks-account.ts"),
      source("src/lib/looks/looks-read.ts"),
      source("src/routes/creators.$userId.tsx"),
      source("src/routes/api/v1/me.ts"),
    ]);
    assert.match(service, /export async function getMyAccount/);
    assert.match(service, /export async function getCreator/);
    assert.match(service, /if \(isLabelUserId\(userId\) && !settings\.labelsEnabled\) return null/);
    assert.match(account, /import\("@\/server\/services\/profiles"\)/);
    assert.match(handlers, /import\("@\/server\/services\/profiles"\)/);
    assert.match(creatorRoute, /import\("@\/server\/services\/profiles"\)/);
    assert.match(meRoute, /from "@\/server\/services\/profiles"/);
    assert.doesNotMatch(service, /createServerFn/);
  });

  it("uses direct services in SSR loaders rather than requesting public API routes", async () => {
    const [feed, look, houses, house, sitemap] = await Promise.all([
      source("src/routes/index.tsx"),
      source("src/routes/looks.$lookId.tsx"),
      source("src/routes/houses.tsx"),
      source("src/routes/houses_.$labelId.tsx"),
      source("src/routes/sitemap[.]xml.ts"),
    ]);
    for (const route of [feed, look, houses, house, sitemap]) {
      assert.match(route, /@\/server\/services\//);
      assert.doesNotMatch(route, /fetch\(["'`]\/api\/v1/);
    }
  });
});
