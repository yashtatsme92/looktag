#!/usr/bin/env node
/**
 * E2E entry: load suite from base SHA, apply houses Scouted-first (#17) +
 * Phase 1 slice A chrome (Looks·Create·You) assertion patches.
 */
import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_SHA = "9d3f5f772b1f909c0c79f078a9a52091f3c7f187";
const HOUSES_FLOW = "async function housesFlow(browser) {\n  await withPage(browser, origin, async (page) => {\n    await page.goto(`${origin}/houses`, { waitUntil: \"domcontentloaded\", timeout: 20_000 });\n    await page.getByText(/Atelier Noir|Press Line/i).first().waitFor({ timeout: 10_000 });\n    await page.getByText(/Scouted houses/i).first().waitFor({ timeout: 8_000 }).catch(() => {});\n    const text = await page.locator(\"body\").innerText();\n    record(\n      \"flow.houses.section\",\n      /Houses/.test(text) && /Atelier Noir/.test(text) && /Press Line/.test(text) && /Salt & Loom/.test(text),\n      snippet(text),\n    );\n    record(\"flow.houses.scouted\", /Scouted/i.test(text) && /picked by Looktag/i.test(text), snippet(text));\n    record(\"flow.houses.rank\", /House rank/.test(text) && /Atelier Noir/.test(text), snippet(text));\n    record(\n      \"flow.houses.suggested\",\n      !/Suggested looks/.test(text) && /Scouted houses/i.test(text),\n      snippet(text),\n    );\n    record(\"flow.houses.for_you\", (await page.getByRole(\"button\", { name: \"For you\" }).count()) > 0);\n    record(\"flow.houses.apply_link\", !/Register a house/i.test(text), snippet(text));\n    record(\"flow.houses.name_full\", /Atelier Noir/.test(text) && !/Atelier\u2026|Ate\\b/.test(text), snippet(text));\n    record(\n      \"flow.houses.suggested_titles\",\n      /Scouted houses/i.test(text) && /Atelier Noir|Press Line|Salt & Loom/.test(text),\n      snippet(text),\n    );\n    record(\"flow.houses.filter_houses\", /Filter houses/i.test(text), snippet(text));\n    await assertTitles(page, \"flow.houses.titles_wrap\");\n    await assertNoOverflow(page, \"flow.houses.no_overflow\");\n  }, \"houses\");\n\n  await withPage(browser, origin, async (page) => {\n    await page.goto(`${origin}/houses/label-atelier-noir`, { waitUntil: \"domcontentloaded\", timeout: 20_000 });\n    await page.getByRole(\"heading\", { name: /Atelier Noir/i }).waitFor({ timeout: 10_000 });\n    const text = await page.locator(\"body\").innerText();\n    record(\n      \"flow.houses.profile\",\n      /Atelier Noir/.test(text) && /Scouted/i.test(text) && /Paris/i.test(text),\n      snippet(text),\n    );\n    record(\"flow.houses.profile_collection\", /Collections/.test(text), snippet(text));\n    record(\n      \"flow.houses.profile_groups\",\n      /Kinkistyles/.test(text) && /After Hours/.test(text),\n      snippet(text),\n    );\n    record(\"flow.houses.profile_stats\", /Score/i.test(text) && /Compared/i.test(text), snippet(text));\n    record(\n      \"flow.houses.profile_header\",\n      /Atelier Noir/.test(text) && !/Atelier\u2026/.test(text),\n      snippet(text),\n    );\n    await assertTitles(page, \"flow.houses.profile_titles_wrap\");\n    await assertNoOverflow(page, \"flow.houses.profile_no_overflow\");\n  }, \"house-profile\");\n\n  await withPage(browser, origin, async (page) => {\n    await page.goto(`${origin}/houses/label-atelier-noir/kinkistyles`, {\n      waitUntil: \"domcontentloaded\",\n      timeout: 20_000,\n    });\n    await page.getByRole(\"heading\", { name: /Kinkistyles/i }).waitFor({ timeout: 10_000 });\n    const text = await page.locator(\"body\").innerText();\n    record(\n      \"flow.houses.collection_page\",\n      /Kinkistyles/.test(text) && /Atelier Noir/.test(text) && /Noir Column/.test(text),\n      snippet(text),\n    );\n    record(\"flow.houses.collection_shareable\", /Share collection|Open neck|Noir Column/i.test(text), snippet(text));\n    await assertTitles(page, \"flow.houses.collection_titles_wrap\");\n    await assertNoOverflow(page, \"flow.houses.collection_no_overflow\");\n  }, \"house-collection\");\n\n  await withPage(browser, origin, async (page) => {\n    await page.goto(`${origin}/houses/label-salt-loom/summer-blues`, {\n      waitUntil: \"domcontentloaded\",\n      timeout: 20_000,\n    });\n    await page.getByRole(\"heading\", { name: /Summer Blues/i }).waitFor({ timeout: 10_000 });\n    const text = await page.locator(\"body\").innerText();\n    record(\n      \"flow.houses.summer_blues\",\n      /Summer Blues/.test(text) && /Salt & Loom/.test(text) && /North Linen/.test(text),\n      snippet(text),\n    );\n  }, \"summer-blues\");\n}";
const OLD_WAIT = "await page.getByText(/Suggested looks/i).first().waitFor({ timeout: 8_000 }).catch(() => {});";
const NEW_WAIT = "await page.getByText(/Scouted houses/i).first().waitFor({ timeout: 8_000 }).catch(() => {});";
const OLD_GRID = "record(\"flow.desktop.houses_grid\", /Suggested looks/.test(text) && /Scouted/i.test(text), snippet(text));";
const NEW_GRID = "record(\n      \"flow.desktop.houses_grid\",\n      /Scouted houses/i.test(text) && /Scouted/i.test(text) && !/Suggested looks/.test(text),\n      snippet(text),\n    );";

const OLD_HOME_TABS = `    record(
      "flow.home.tabs",
      /Looks/.test(text) && /Create/.test(text) && /Houses/.test(text) && /Rank/.test(text) && /You/.test(text),
      snippet(text),
    );`;
const NEW_HOME_TABS = `    {
      const homeNav = await page.getByRole("navigation", { name: "App" }).innerText();
      record(
        "flow.home.tabs",
        /Looks/.test(homeNav) &&
          /Create/.test(homeNav) &&
          /You/.test(homeNav) &&
          !/Houses/.test(homeNav) &&
          !/Rank/.test(homeNav) &&
          !/How-to|How to/i.test(homeNav),
        snippet(homeNav),
      );
    }`;
const OLD_DESK_NAV = `    record(
      "flow.desktop.web_nav",
      /Looks/.test(navText) &&
        /Create/.test(navText) &&
        /Houses/.test(navText) &&
        /Rank/.test(navText) &&
        /You/.test(navText),
      snippet(navText),
    );`;
const NEW_DESK_NAV = `    record(
      "flow.desktop.web_nav",
      /Looks/.test(navText) &&
        /Create/.test(navText) &&
        /You/.test(navText) &&
        !/Houses/.test(navText) &&
        !/Rank/.test(navText) &&
        !/How-to|How to/i.test(navText),
      snippet(navText),
    );`;
const GUEST_TO_SHOP_FLOW = `async function guestToShopFlow(browser) {
  await withPage(browser, origin, async (page) => {
    const stamp = Date.now();
    const draft = {
      id: \`e2e-funnel-\${stamp}\`,
      userId: "",
      title: "E2E Funnel Look",
      caption: "",
      creator: "You",
      imageSrc: "/looks/sunday-coat.jpg",
      createdAt: stamp,
      updatedAt: stamp,
      tags: [
        {
          id: "pin-1",
          x: 50,
          y: 42,
          name: "camel wool coat",
          brand: "",
          price: "",
          currency: "EUR",
          url: "",
          retailerId: "",
          offers: [],
          wornUrl: "",
          wornRetailerId: "",
        },
      ],
    };
    await page.addInitScript((raw) => {
      try {
        sessionStorage.setItem("looktag-create-draft-v1", raw);
      } catch {
        /* private mode */
      }
    }, JSON.stringify(draft));
    await page.goto(\`\${origin}/create\`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
    const guestSearch = page.getByRole("button", { name: /Search item|Search again/i });
    await guestSearch.waitFor({ timeout: 10_000 });
    await guestSearch.click();
    await page.getByText(/Sign in to search shops/i).first().waitFor({ timeout: 6_000 }).catch(() => {});
    const guestText = await page.locator("body").innerText();
    record("flow.funnel.guest_search_gate", /Sign in to search shops/i.test(guestText), snippet(guestText));

    await fillSignup(page, origin, {
      name: "E2E Funnel",
      email: \`e2e-funnel-\${stamp}@looktag.test\`,
      password: "looktag-e2e-pass-1",
      handle: \`e2efunnel\${stamp.toString(36).slice(-6)}\`,
      city: "Berlin",
    });
    await page.waitForURL((url) => !/\\/login/.test(url.pathname), { timeout: 12_000 }).catch(() => {});
    await page.goto(\`\${origin}/create\`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.locator(".look-studio[data-hydrated='true']").waitFor({ timeout: 8_000 });
    const signedSearch = page.getByRole("button", { name: /Search item|Search again/i });
    await signedSearch.waitFor({ timeout: 10_000 });
    await signedSearch.click();
    const listing = page.locator(
      'a[href*="zalando."], a[href*="zara.com"], a[href*="cos.com"], a[href*="hm.com"], a[href*="uniqlo.com"]',
    );
    await listing.first().waitFor({ timeout: 24_000 }).catch(() => {});
    const clickedHref = (await listing.first().getAttribute("href")) || "";
    const hrefs = (await listing.evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter(Boolean))).filter(
      (href) => productUrl(href),
    );
    record(
      "flow.funnel.search_results",
      hrefs.length >= 1,
      hrefs.length ? \`\${hrefs.length} shop links\` : snippet(await page.locator("body").innerText()),
    );

    const editorPopupWait = page.context().waitForEvent("page", { timeout: 8_000 }).catch(() => null);
    await listing.first().click({ force: true }).catch(() => {});
    const editorPopup = await editorPopupWait;
    const editorHref = clickedHref || (await listing.first().getAttribute("href")) || "";
    if (editorPopup) {
      await editorPopup.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    }
    record(
      "flow.funnel.editor_outbound_click",
      productUrl(editorPopup?.url() || editorHref),
      editorPopup?.url() || editorHref || "missing",
    );
    await editorPopup?.close().catch(() => {});

    await page.getByRole("button", { name: /Publish look/i }).click();
    await page.waitForURL(/\\/looks\\//, { timeout: 12_000 });
    record("flow.funnel.look_created", /\\/looks\\//.test(page.url()), page.url());

    const shop = page.getByRole("link", { name: /^Shop/i }).first();
    await shop.waitFor({ timeout: 8_000 });
    const shopHref = await shop.getAttribute("href");
    record("flow.funnel.shop_link", productUrl(shopHref), shopHref ?? "missing");

    const popupWait = page.context().waitForEvent("page", { timeout: 8_000 }).catch(() => null);
    await shop.click({ force: true }).catch(() => {});
    const popup = await popupWait;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    }
    record(
      "flow.funnel.look_outbound_click",
      productUrl(popup?.url() || shopHref),
      popup?.url() || shopHref || "missing",
    );
    await popup?.close().catch(() => {});
  }, "guest-to-shop");
}`;

const url = `https://raw.githubusercontent.com/yashtatsme92/looktag/${BASE_SHA}/tests/e2e/run.mjs`;
const res = await fetch(url);
if (!res.ok) {
  console.error("Failed to fetch base e2e suite", res.status, url);
  process.exit(1);
}
let code = await res.text();

const start = code.indexOf("async function housesFlow");
if (start < 0) {
  console.error("housesFlow not found in base suite");
  process.exit(1);
}
let i = code.indexOf("{", start);
let depth = 0;
let end = -1;
for (let j = i; j < code.length; j++) {
  if (code[j] === "{") depth++;
  else if (code[j] === "}") {
    depth--;
    if (depth === 0) {
      end = j + 1;
      break;
    }
  }
}
if (end < 0) {
  console.error("failed to bound housesFlow");
  process.exit(1);
}
code = code.slice(0, start) + HOUSES_FLOW + code.slice(end);

if (!code.includes(OLD_WAIT)) {
  console.error("desktop Suggested looks wait not found");
  process.exit(1);
}
code = code.replace(OLD_WAIT, NEW_WAIT);

if (!code.includes(OLD_GRID)) {
  console.error("desktop houses_grid assert not found");
  process.exit(1);
}
code = code.replace(OLD_GRID, NEW_GRID);

if (!code.includes(OLD_HOME_TABS)) {
  console.error("flow.home.tabs assert not found");
  process.exit(1);
}
code = code.replace(OLD_HOME_TABS, NEW_HOME_TABS);

if (!code.includes(OLD_DESK_NAV)) {
  console.error("flow.desktop.web_nav assert not found");
  process.exit(1);
}
code = code.replace(OLD_DESK_NAV, NEW_DESK_NAV);

if (!code.includes("    await createFlow(browser);")) {
  console.error("createFlow call not found");
  process.exit(1);
}
code = code.replace("    await createFlow(browser);", "    await createFlow(browser);\n    await guestToShopFlow(browser);");

if (!code.includes("async function catalogFlow(browser) {")) {
  console.error("catalogFlow boundary not found");
  process.exit(1);
}
code = code.replace("async function catalogFlow(browser) {", `${GUEST_TO_SHOP_FLOW}\n\nasync function catalogFlow(browser) {`);

const dir = dirname(fileURLToPath(import.meta.url));
const tmp = join(dir, ".run.extracted.mjs");
writeFileSync(tmp, code);
const result = spawnSync(process.execPath, [tmp, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}
process.exit(result.status ?? 1);
