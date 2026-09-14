#!/usr/bin/env node
/**
 * E2E entry: load suite from main tip, apply houses Scouted-first patches (#17 rebase).
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
