import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  BROWSE_COACH_KEY,
  BOOT_SKIP_KEY,
  resolveAdminCredentials,
  resolveOrigin,
  STYLE_GUIDE_KEY,
} from "./helpers.mjs";
import { installLoadingObserver, readLoadingLog, delayServerFunctions } from "./loading-helpers.mjs";

const origin = resolveOrigin();
const widths = [
  { width: 390, height: 844 },
  { width: 834, height: 1112 },
  { width: 1194, height: 834 },
  { width: 1440, height: 900 },
];
const failures = [];

function check(name, ok, detail = "") {
  if (!ok) {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error("FAIL", name, detail);
  } else {
    console.log("ok", name);
  }
}

async function ready(page) {
  await page.locator("html.boot-react").waitFor({ timeout: 10_000 });
}

function ms(value) {
  const text = String(value || "").trim();
  if (!text || text === "0s" || text === "0ms") return 0;
  if (text.endsWith("ms")) return Number.parseFloat(text);
  if (text.endsWith("s")) return Number.parseFloat(text) * 1000;
  return Number(text);
}

async function openContext(browser, viewport, { reduce = false, saved = false } = {}) {
  const context = await browser.newContext({
    viewport,
    locale: "en-GB",
    deviceScaleFactor: viewport.width < 500 ? 2 : 1,
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  await context.addInitScript(
    ({ guide, coach, boot, saved }) => {
      try {
        localStorage.setItem(guide, "done");
        localStorage.setItem(coach, "done");
        sessionStorage.setItem(boot, "done");
        if (saved) localStorage.setItem("looktag-saved-v1", JSON.stringify(["seed-sunday-coat"]));
      } catch {
        /* private mode */
      }
    },
    { guide: STYLE_GUIDE_KEY, coach: BROWSE_COACH_KEY, boot: BOOT_SKIP_KEY, saved },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await installLoadingObserver(page);
  return { context, page };
}

function skeletonEnter(log, since) {
  return log.find(
    (entry) => entry.type === "enter" && String(entry.classes).includes("skeleton") && entry.at >= since - 30,
  );
}

async function now(page) {
  return page.evaluate(() => performance.now());
}

async function armDelay(page, ms) {
  return delayServerFunctions(page, ["/_serverFn/"], ms);
}

async function shopSurface(page, width) {
  const desktop = width >= 1024;
  await page.goto(`${origin}/looks/seed-sofia-sun-bleached-linen`, { waitUntil: "domcontentloaded" });
  await ready(page);
  if (!desktop) {
    await page.locator(".look-plate-shop").waitFor({ timeout: 8_000 });
    await page.locator(".look-plate-shop").click();
    await page.locator(".look-sheet").waitFor({ timeout: 4_000 });
    const header = await page.locator(".look-sheet").innerText();
    check(`shop.header.${width}`, /Shop this look/.test(header), header.slice(0, 80));
    await page.waitForTimeout(450);
    check(`shop.sync-no-skeleton.${width}`, (await page.locator(".look-sheet .skeleton").count()) === 0);
    const duration = await page.locator(".look-sheet").evaluate((el) => getComputedStyle(el).animationDuration);
    check(`shop.sheet-250.${width}`, Math.abs(ms(duration) - 250) < 2, duration);
    return;
  }
  await page.locator(".wide-panel h2", { hasText: "Shop this look" }).waitFor({ timeout: 8_000 });
  const header = await page.locator(".wide-panel").innerText();
  check(`shop.header.${width}`, /Shop this look/.test(header), header.slice(0, 80));
  check(`shop.panel-not-sheet.${width}`, (await page.locator(".look-sheet").count()) === 0);
  await page.waitForTimeout(450);
  check(`shop.sync-no-skeleton.${width}`, (await page.locator(".wide-panel .skeleton").count()) === 0);
}

async function feedSurface(page, width) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("looktag-followed-creators-v1", JSON.stringify(["editorial"]));
    } catch {
      /* private mode */
    }
  });
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await ready(page);
  const following = page.getByRole("button", { name: "Following" }).first();
  await following.waitFor({ timeout: 10_000 });
  const at = await now(page);
  await following.click();
  await page.locator(".skeleton-grid").first().waitFor({ state: "attached", timeout: 8_000 });
  const log = await readLoadingLog(page);
  const entered = skeletonEnter(log, at);
  check(`feed.skeleton-delay.${width}`, Boolean(entered) && entered.at - at >= 250, JSON.stringify({ entered, at }));
  const grid = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll(".lt-wide .skeleton-grid, .lt-phone .skeleton-grid")];
    const el = nodes.find((node) => node.getBoundingClientRect().width > 200) ?? nodes[0];
    if (!el) return { columns: 0, gap: "", tile: "", radius: "", lead: "", width: 0 };
    const style = getComputedStyle(el);
    const first = el.firstElementChild ? getComputedStyle(el.firstElementChild).gridColumn : "";
    const box = el.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      gap: style.gap,
      tile: el.firstElementChild ? getComputedStyle(el.firstElementChild).aspectRatio : "",
      radius: el.firstElementChild ? getComputedStyle(el.firstElementChild).borderRadius : "",
      lead: first,
      width: box.width,
    };
  });
  const expected = width >= 1440 ? 4 : width >= 1024 ? 3 : 2;
  const expectedGap = width >= 1024 ? 24 : width >= 768 ? 16 : 12;
  check(
    `feed.columns.${width}`,
    grid.columns === expected && Math.abs(Number.parseFloat(grid.gap) - expectedGap) < 0.5 && grid.width > 200,
    JSON.stringify(grid),
  );
  if (width === 1194) {
    check("feed.tile-span.1194", !/span 2/.test(grid.lead || ""), grid.lead || "auto");
    check("feed.tile-radius.1194", ms(grid.radius) === 24 || String(grid.radius).startsWith("24"), grid.radius);
  }
  const indicator = page.locator(".tab-indicator").first();
  const motion = await indicator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      duration: style.transitionDuration,
      ease: style.transitionTimingFunction,
      width: el.getBoundingClientRect().width,
    };
  });
  check(`feed.indicator-200.${width}`, motion.duration.split(",").some((part) => Math.abs(ms(part) - 200) < 2) && motion.width > 8, JSON.stringify(motion));
  check(`feed.indicator-ease.${width}`, /0\.23/.test(motion.ease), motion.ease);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "stagger-probe";
    for (let index = 0; index < 10; index += 1) {
      const tile = document.createElement("div");
      tile.className = "echo-tile";
      host.append(tile);
    }
    document.body.append(host);
  });
  const delays = await page.locator("#stagger-probe .echo-tile").evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).transitionDelay),
  );
  const expectedDelays = [0, 30, 60, 90, 120, 150, 180, 210, 210, 210];
  check(
    `feed.stagger.${width}`,
    delays.length === 10 && delays.every((value, index) => Math.abs(ms(value) - expectedDelays[index]) < 2),
    delays.join(","),
  );
  await page.evaluate(() => document.getElementById("stagger-probe")?.remove());
}

async function housesSurface(page, width) {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator('a[href="/houses"]:visible').first().waitFor({ timeout: 8_000 });
  const at = await now(page);
  await page.locator('a[href="/houses"]:visible').first().click();
  await page.waitForURL(/\/houses$/, { timeout: 8_000 });
  await page.locator(".skeleton-grid").first().waitFor({ state: "attached", timeout: 8_000 });
  const log = await readLoadingLog(page);
  const entered = skeletonEnter(log, at);
  check(`houses.skeleton-delay.${width}`, Boolean(entered) && entered.at - at >= 250, JSON.stringify({ entered, at }));
  const columns = await page.locator(".skeleton-grid").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
  const expected = width >= 1280 ? 4 : width >= 1024 ? 3 : 2;
  check(`houses.columns.${width}`, columns === expected, String(columns));
  await page.locator('a[href="/houses/label-atelier-noir"]:visible').first().waitFor({ timeout: 15_000 });
  const profileAt = await now(page);
  await page.locator('a[href="/houses/label-atelier-noir"]:visible').first().click();
  await page.locator(".house-profile-lines .skeleton-grid").first().waitFor({ state: "attached", timeout: 8_000 });
  const during = await page.locator("body").innerText();
  check(`houses.not-found-hidden.${width}`, !/House not found/.test(during));
  const profileLog = await readLoadingLog(page);
  const profileEntered = profileLog.find(
    (entry) => entry.type === "enter" && String(entry.classes).includes("skeleton") && entry.at >= profileAt,
  );
  check(`houses.lines-skeleton.${width}`, Boolean(profileEntered) && profileEntered.at - profileAt >= 250, JSON.stringify({ profileEntered, profileAt }));
}

async function youSurface(page) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.waitForTimeout(500);
  check("you.saved-no-skeleton", (await page.locator(".skeleton-grid").count()) === 0);
  const body = await page.locator(".you-home").innerText();
  check("you.saved-painted", /Saved|Sunday|coat/i.test(body), body.slice(0, 120));
}

async function createSurface(page, width) {
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64",
  );
  const photo = "/tmp/looktag-loading-photo.jpg";
  const text = "/tmp/looktag-loading-note.txt";
  writeFileSync(photo, jpeg);
  writeFileSync(text, "not a photo");
  await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator("input[type=file]").first().waitFor({ state: "attached", timeout: 8_000 });
  await page.evaluate(() => {
    window.__progress = [];
    window.__bar = null;
    const note = () => {
      const bar = document.querySelector("[role=progressbar]");
      if (!bar) return;
      window.__bar = {
        now: Number(bar.getAttribute("aria-valuenow")),
        min: bar.getAttribute("aria-valuemin"),
        max: bar.getAttribute("aria-valuemax"),
        name: bar.getAttribute("aria-label"),
      };
      window.__progress.push(window.__bar.now);
    };
    new MutationObserver(note).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
  });
  const started = Date.now();
  await page.locator('input[type="file"][accept*="jpeg"]').first().setInputFiles(photo);
  await page.waitForFunction(() => (window.__progress || []).length > 0, null, { timeout: 2_000 });
  check(`create.bar-fast.${width}`, Date.now() - started < 300);
  const named = await page.evaluate(() => window.__bar);
  check(`create.bar-aria.${width}`, named?.min === "0" && named?.max === "100" && named?.name === "Uploading photo", JSON.stringify(named));
  await page.waitForTimeout(400);
  const values = await page.evaluate(() => window.__progress);
  check(`create.bar-increases.${width}`, values.some((value, index) => index > 0 && value > values[0]), values.join(","));
  check(`create.no-reading.${width}`, !/Reading…/.test(await page.locator("body").innerText()) && (await page.locator(".animate-spin").count()) === 0);
  if (width >= 1024) {
    const place = await page.locator("[role=progressbar]").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, width: window.innerWidth };
    }).catch(() => null);
    if (place) check("create.bar-left.1194", width !== 1194 || place.left < place.width / 2, JSON.stringify(place));
  }
  const usePhoto = page.getByRole("button", { name: "Use photo" });
  if (await usePhoto.count()) {
    const loaded = await page.locator("img.is-loaded").count();
    const disabled = await usePhoto.isDisabled();
    check(`create.use-photo.${width}`, loaded > 0 ? true : disabled, `loaded=${loaded} disabled=${disabled}`);
  }
  await page.goto(`${origin}/create`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"][accept*="jpeg"]').first().setInputFiles(text);
  await page.getByText(/Choose a photo|Choose another photo|not a photo/i).first().waitFor({ timeout: 4_000 }).catch(() => undefined);
  const body = await page.locator("body").innerText();
  check(`create.error-no-bar.${width}`, /photo/i.test(body) && (await page.locator("[role=progressbar]").count()) === 0, body.slice(0, 160));
}

async function reducedMotion(page) {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator('a[href="/houses"]:visible').first().click();
  await page.locator(".skeleton").first().waitFor({ state: "attached", timeout: 8_000 });
  const motion = await page.evaluate(() => ({
    skeleton: getComputedStyle(document.querySelector(".skeleton")).animationName,
  }));
  check("reduce.skeleton", motion.skeleton === "none", motion.skeleton);
  await page.goto(`${origin}/looks/seed-sofia-sun-bleached-linen`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator(".look-plate-shop").click();
  await page.locator(".look-sheet").waitFor();
  const sheet = await page.locator(".look-sheet").evaluate((el) => getComputedStyle(el).animationName);
  check("reduce.sheet", sheet === "none", sheet);
  const tile = await page.evaluate(() => getComputedStyle(document.body.appendChild(Object.assign(document.createElement("div"), { className: "echo-tile" }))).transitionDelay);
  check("reduce.tile-delay", ms(tile) === 0, tile);
}

async function fastHouses(page) {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator('a[href="/houses"]:visible').first().click();
  await page.getByRole("heading", { name: "Scouted" }).waitFor({ timeout: 8_000 });
  await page.waitForTimeout(400);
  check("houses.fast-no-skeleton", (await page.locator(".skeleton").count()) === 0);
}

async function holdHouses(page) {
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator('a[href="/houses"]:visible').first().click();
  const span = await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now();
    let first = 0;
    let last = 0;
    const tick = () => {
      const skel = Boolean(document.querySelector(".skeleton"));
      const now = performance.now();
      if (skel && !first) first = now;
      if (skel) last = now;
      if (first && !skel && now - last > 80) {
        resolve({ held: last - first });
        return;
      }
      if (now - start > 8000) resolve({ held: last ? last - first : 0, timeout: true });
      else requestAnimationFrame(tick);
    };
    tick();
  }));
  check("houses.hold-400", span.held >= 380, JSON.stringify(span));
}

async function backFromStyle(page) {
  await page.goto(`${origin}/houses/label-atelier-noir/kinkistyles`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.locator(".house-lines a").first().waitFor({ timeout: 8_000 });
  await page.locator(".house-lines a").first().click();
  await page.waitForURL(/\/houses\/label-atelier-noir\/kinkistyles\//, { timeout: 8_000 });
  await page.goBack();
  await page.locator(".house-lines a").first().waitFor({ timeout: 4_000 });
  await page.waitForTimeout(200);
  check("houses.back-no-skeleton", (await page.locator(".skeleton").count()) === 0);
}

async function backRestoresHouses(page, width) {
  await page.goto(`${origin}/houses`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("heading", { name: "Scouted" }).waitFor({ timeout: 12_000 });
  await page.evaluate(() => {
    const main = document.querySelector(".native-main");
    if (main instanceof HTMLElement && /(auto|scroll)/.test(getComputedStyle(main).overflowY)) main.scrollTop = 400;
    else window.scrollTo(0, 400);
  });
  await page.evaluate(() => {
    const link = document.querySelector('a[href="/houses/label-atelier-noir"]');
    if (link instanceof HTMLElement) link.click();
  });
  await page.getByRole("heading", { name: "Atelier Noir" }).waitFor({ timeout: 12_000 });
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/houses", { timeout: 8_000 });
  await page.waitForTimeout(450);
  const state = await page.evaluate(() => {
    const main = document.querySelector(".native-main");
    const scroller = main instanceof HTMLElement && /(auto|scroll)/.test(getComputedStyle(main).overflowY);
    return {
      scroll: scroller && main instanceof HTMLElement ? main.scrollTop : window.scrollY,
      skeletons: document.querySelectorAll(".skeleton").length,
      dim: document.querySelectorAll(".is-loading-old").length,
    };
  });
  check(`houses.back-cached.${width}`, state.skeletons === 0 && state.dim === 0, JSON.stringify(state));
  if (width === 390) check("houses.back-scroll.390", state.scroll >= 350, JSON.stringify(state));
}

async function signInAdmin(page) {
  const { email, password } = resolveAdminCredentials();
  await page.goto(`${origin}/login?next=${encodeURIComponent("/admin")}`, { waitUntil: "domcontentloaded" });
  await page.locator("form[data-hydrated='true']").waitFor({ timeout: 8_000 });
  await page.locator("#creator-email").fill(email.toLowerCase() === "admin@looktag.studio" ? "admin" : email);
  await page.locator("#creator-password").fill(password);
  await page.locator("form").getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin"), { timeout: 20_000 });
}

async function adminSurface(page, width) {
  await signInAdmin(page);
  const stop = await armDelay(page, 1600);
  const at = await now(page);
  await page.locator('a[href="/admin/houses"]:visible').first().click();
  await page.locator(".skeleton-admin-row").first().waitFor({ timeout: 8_000 });
  const log = await readLoadingLog(page);
  const entered = skeletonEnter(log, at);
  check(`admin.skeleton-delay.${width}`, Boolean(entered) && entered.at - at >= 250, JSON.stringify({ entered, at }));
  const height = await page.locator(".skeleton-admin-row").first().evaluate((el) => el.getBoundingClientRect().height);
  check(`admin.row.${width}`, height >= 60, String(height));
  await page.locator(".ops-table [role=switch]").first().waitFor({ timeout: 12_000 });
  await stop();
  const toggle = page.locator(".ops-table [role=switch]:not([disabled])").first();
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  const flipped = await toggle.getAttribute("aria-checked");
  check(`admin.flip.${width}`, flipped !== before, `${before} -> ${flipped}`);
  await page.getByText("Saving…", { exact: true }).first().waitFor({ timeout: 2_000 }).catch(() => undefined);
  await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 8_000 });
  await page.waitForTimeout(1900);
  check(`admin.saved-gone.${width}`, (await page.getByText("Saved", { exact: true }).count()) === 0);
  await page.route("**/*", async (route) => {
    const request = route.request();
    let decoded = request.url();
    try {
      const id = new URL(request.url()).pathname.split("/_serverFn/")[1];
      if (id) decoded += Buffer.from(decodeURIComponent(id), "base64").toString("utf8");
    } catch {
      /* not a server function */
    }
    if (request.method() === "POST" && decoded.includes("setLabelScouted")) {
      await route.fulfill({ status: 500, contentType: "text/plain", body: "Could not update Scouted." });
      return;
    }
    await route.continue();
  });
  const again = page.locator(".ops-table [role=switch]:not([disabled])").first();
  const current = await again.getAttribute("aria-checked");
  await again.click();
  await page.locator(".save-status.is-error").first().waitFor({ state: "attached", timeout: 8_000 });
  await page.waitForTimeout(200);
  const errorText = await page.locator(".save-status.is-error").first().innerText();
  check(`admin.revert.${width}`, (await again.getAttribute("aria-checked")) === current && errorText.length > 0, `${current} now ${await again.getAttribute("aria-checked")} ${errorText}`);
  check(`admin.no-spin.${width}`, (await page.locator(".animate-spin").count()) === 0);
  await page.unroute("**/*");
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of widths) {
    const slow = await openContext(browser, viewport, {});
    try {
      await armDelay(slow.page, 1600);
      await shopSurface(slow.page, viewport.width);
      await feedSurface(slow.page, viewport.width);
      await housesSurface(slow.page, viewport.width);
      await backRestoresHouses(slow.page, viewport.width);
      if (viewport.width === 390) {
        await youSurface(slow.page);
        const overflow = await slow.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        check("overflow.390", !overflow);
      }
    } catch (error) {
      mkdirSync("/workspace/screenshots", { recursive: true });
      await slow.page.screenshot({ path: `/workspace/screenshots/loading-${viewport.width}.png` }).catch(() => undefined);
      check(`surface.${viewport.width}`, false, error instanceof Error ? error.message : String(error));
    } finally {
      await slow.context.close();
    }

    const fast = await openContext(browser, viewport, {});
    try {
      await fastHouses(fast.page);
      await createSurface(fast.page, viewport.width);
    } catch (error) {
      check(`fast.${viewport.width}`, false, error instanceof Error ? error.message : String(error));
    } finally {
      await fast.context.close();
    }
  }

  const reduced = await openContext(browser, widths[0], { reduce: true });
  try {
    await armDelay(reduced.page, 1600);
    await reducedMotion(reduced.page);
  } catch (error) {
    check("reduce", false, error instanceof Error ? error.message : String(error));
  } finally {
    await reduced.context.close();
  }

  const back = await openContext(browser, widths[0], {});
  try {
    await backFromStyle(back.page);
  } catch (error) {
    check("houses.back", false, error instanceof Error ? error.message : String(error));
  } finally {
    await back.context.close();
  }

  const hold = await openContext(browser, widths[0], {});
  try {
    await armDelay(hold.page, 350);
    await holdHouses(hold.page);
  } catch (error) {
    check("houses.hold", false, error instanceof Error ? error.message : String(error));
  } finally {
    await hold.context.close();
  }

  try {
    resolveAdminCredentials();
    for (const viewport of widths) {
      const admin = await openContext(browser, viewport, {});
      try {
        await adminSurface(admin.page, viewport.width);
      } catch (error) {
        check(`admin.${viewport.width}`, false, error instanceof Error ? error.message : String(error));
      } finally {
        await admin.context.close();
      }
    }
    const adminReduce = await openContext(browser, widths[0], { reduce: true });
    try {
      await signInAdmin(adminReduce.page);
      await armDelay(adminReduce.page, 1600);
      await adminReduce.page.locator('a[href="/admin/houses"]:visible').first().click();
      await adminReduce.page.locator(".skeleton-admin-row").first().waitFor({ timeout: 8_000 });
      const name = await adminReduce.page.locator(".skeleton").first().evaluate((el) => getComputedStyle(el).animationName);
      check("admin.reduce.skeleton", name === "none", name);
    } catch (error) {
      check("admin.reduce", false, error instanceof Error ? error.message : String(error));
    } finally {
      await adminReduce.context.close();
    }
  } catch (error) {
    check("admin.credentials", false, error instanceof Error ? error.message : String(error));
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} loading surface failure(s)`);
  process.exit(1);
}
console.log("loading surfaces ok");
