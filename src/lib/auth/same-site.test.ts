import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSameSiteAllowed } from "./same-site.ts";

const here = dirname(fileURLToPath(import.meta.url));
const B = "Bearer";

describe("isSameSiteAllowed", () => {
  it("allows non-browser, same-origin and direct loads", () => {
    assert.equal(isSameSiteAllowed(new Headers(), "POST"), true);
    assert.equal(isSameSiteAllowed(new Headers({ "sec-fetch-site": "same-origin" }), "POST"), true);
    assert.equal(isSameSiteAllowed(new Headers({ "sec-fetch-site": "none" }), "GET"), true);
  });

  it("rejects scripted same-site and cross-site cookie requests", () => {
    for (const site of ["same-site", "cross-site"]) {
      assert.equal(isSameSiteAllowed(new Headers({ "sec-fetch-site": site }), "POST"), false);
      assert.equal(isSameSiteAllowed(new Headers({ "sec-fetch-site": site }), "GET"), false);
    }
  });

  it("allows top-level GET navigations but not embeds or POSTs", () => {
    const nav = { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" };
    assert.equal(isSameSiteAllowed(new Headers(nav), "GET"), true);
    assert.equal(isSameSiteAllowed(new Headers(nav), "POST"), false);
    assert.equal(isSameSiteAllowed(new Headers({ ...nav, "sec-fetch-dest": "embed" }), "GET"), false);
  });

  it("exempts bearer requests", () => {
    const headers = new Headers({
      "sec-fetch-site": "cross-site",
      authorization: `${B} tok`,
    });
    assert.equal(isSameSiteAllowed(headers, "POST"), true);
  });

  it("does not exempt an empty bearer value", () => {
    const headers = new Headers({ "sec-fetch-site": "cross-site", authorization: "Bearer " });
    assert.equal(isSameSiteAllowed(headers, "POST"), false);
  });

  it("isolation.server delegates to it", () => {
    const source = readFileSync(join(here, "isolation.server.ts"), "utf8");
    assert.match(source, /isSameSiteAllowed\(/);
  });
});
