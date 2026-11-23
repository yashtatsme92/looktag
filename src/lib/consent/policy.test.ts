import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldLoadAnalytics } from "../analytics/consent.ts";
import { consentCookieLines, readCookieHeader, storedFromCookieHeader } from "./cookies.ts";
import { choiceStatus, consentView, decisionForAction, emptyConsent, needsReask } from "./policy.ts";
import { classifyCountry, countryFromHeaders, gpcFromHeaders } from "./region.ts";
import { noticeCountsAsSeen } from "./seen.ts";

describe("country to region", () => {
  it("maps known countries and falls back to opt-in", () => {
    assert.equal(classifyCountry("DE"), "eu");
    assert.equal(classifyCountry("gb"), "eu");
    assert.equal(classifyCountry("CH"), "eu");
    assert.equal(classifyCountry("NO"), "eu");
    assert.equal(classifyCountry("US"), "us");
    assert.equal(classifyCountry("IN"), "in");
    assert.equal(classifyCountry("AU"), "row");
    assert.equal(classifyCountry("PR"), "row");
    assert.equal(classifyCountry("XX"), "eu");
    assert.equal(classifyCountry("T1"), "eu");
    assert.equal(classifyCountry(""), "eu");
    assert.equal(classifyCountry(null), "eu");
    assert.equal(classifyCountry("nope"), "eu");
    assert.equal(classifyCountry("U"), "eu");
  });

  it("prefers CF-IPCountry and falls back to x-country-code", () => {
    const headers = new Headers({ "CF-IPCountry": "US", "x-country-code": "DE" });
    assert.equal(countryFromHeaders(headers), "US");
    assert.equal(countryFromHeaders(new Headers({ "x-country-code": "AU" })), "AU");
    assert.equal(countryFromHeaders(new Headers()), null);
    assert.equal(gpcFromHeaders(new Headers({ "Sec-GPC": "1" })), true);
    assert.equal(gpcFromHeaders(new Headers({ "sec-gpc": "0" })), false);
  });
});

describe("analytics gate", () => {
  it("still requires a key and lt_consent exactly granted", () => {
    assert.equal(shouldLoadAnalytics("phc_test", "granted"), true);
    assert.equal(shouldLoadAnalytics("", "granted"), false);
    assert.equal(shouldLoadAnalytics("phc_test", "denied"), false);
    assert.equal(shouldLoadAnalytics("phc_test", null), false);
    assert.equal(shouldLoadAnalytics("phc_test", "notice"), false);
    assert.equal(shouldLoadAnalytics("phc_test", ""), false);
  });
});

describe("consent view", () => {
  const noticeGrant = { value: "granted" as const, basis: "notice" as const, at: "2026-11-01T00:00:00.000Z", version: 1 };
  const explicitOn = { value: "granted" as const, basis: "explicit" as const, at: "2026-11-02T00:00:00.000Z", version: 1 };
  const explicitOff = { value: "denied" as const, basis: "explicit" as const, at: "2026-11-03T00:00:00.000Z", version: 1 };

  it("keeps analytics off until a real grant", () => {
    assert.equal(consentView({ region: "eu", stored: emptyConsent(), gpc: false }).load, false);
    assert.equal(consentView({ region: "us", stored: emptyConsent(), gpc: false }).load, false);
    assert.equal(consentView({ region: "us", stored: emptyConsent(), gpc: true }).banner, "gpc");
    assert.equal(consentView({ region: "in", stored: emptyConsent(), gpc: true }).banner, "india");
  });

  it("applies GPC only over a notice grant", () => {
    const flipped = consentView({ region: "us", stored: noticeGrant, gpc: true });
    assert.equal(flipped.load, false);
    assert.equal(flipped.effectiveValue, "denied");
    assert.equal(flipped.effectiveBasis, "gpc");
    assert.equal(flipped.banner, "gpc");

    const keptOn = consentView({ region: "us", stored: explicitOn, gpc: true });
    assert.equal(keptOn.load, true);
    assert.equal(keptOn.banner, null);
    assert.equal(keptOn.effectiveBasis, "explicit");

    const keptOff = consentView({ region: "row", stored: explicitOff, gpc: true });
    assert.equal(keptOff.load, false);
    assert.equal(keptOff.banner, null);
    assert.equal(keptOff.effectiveBasis, "explicit");
  });

  it("re-asks on an old policy version and when a notice grant enters EU or India", () => {
    const stale = { ...explicitOn, version: 0 };
    assert.equal(needsReask(stale, "us"), true);
    assert.equal(consentView({ region: "us", stored: stale, gpc: false }).load, false);
    assert.equal(consentView({ region: "us", stored: stale, gpc: false }).banner, "notice");

    assert.equal(needsReask(noticeGrant, "eu"), true);
    assert.equal(consentView({ region: "eu", stored: noticeGrant, gpc: false }).banner, "opt-in");
    assert.equal(consentView({ region: "eu", stored: noticeGrant, gpc: false }).load, false);
    assert.equal(consentView({ region: "in", stored: noticeGrant, gpc: false }).banner, "india");
    assert.equal(needsReask(noticeGrant, "us"), false);
  });

  it("maps each action onto the cookie pair", () => {
    assert.deepEqual(decisionForAction("accept"), { value: "granted", basis: "explicit" });
    assert.deepEqual(decisionForAction("decline"), { value: "denied", basis: "explicit" });
    assert.deepEqual(decisionForAction("opt-out"), { value: "denied", basis: "explicit" });
    assert.deepEqual(decisionForAction("ok"), { value: "granted", basis: "notice" });
    assert.deepEqual(decisionForAction("seen"), { value: "granted", basis: "notice" });
    assert.deepEqual(decisionForAction("gpc-ok"), { value: "denied", basis: "gpc" });
    assert.deepEqual(decisionForAction("save-on"), { value: "granted", basis: "explicit" });
    assert.deepEqual(decisionForAction("save-off"), { value: "denied", basis: "explicit" });
  });

  it("writes the four consent cookies for twelve months", () => {
    const lines = consentCookieLines({
      value: "granted",
      basis: "explicit",
      at: "2026-11-23T03:00:00.000Z",
      secure: true,
    });
    const header = lines.join("; ");
    assert.equal(readCookieHeader(lines[0], "lt_consent"), "granted");
    assert.match(lines[0], /SameSite=Lax/);
    assert.match(lines[0], /Max-Age=31536000/);
    assert.match(lines[0], /Secure/);
    assert.equal(storedFromCookieHeader(header).basis, "explicit");
    assert.equal(storedFromCookieHeader(header).version, 1);
    assert.equal(consentCookieLines({ value: "denied", basis: "gpc", at: "2026-11-23", secure: false })[0].includes("Secure"), false);
  });

  it("describes the privacy-choices status", () => {
    assert.equal(choiceStatus(consentView({ region: "eu", stored: emptyConsent(), gpc: false })).text, "Not set. Analytics is off.");
    assert.match(
      choiceStatus(consentView({ region: "us", stored: emptyConsent(), gpc: false })).text,
      /until you've seen the notice/,
    );
    assert.equal(
      choiceStatus(consentView({ region: "us", stored: noticeGrant, gpc: false })).text,
      "Your choice: On (default). Choose Off to opt out.",
    );
    assert.match(choiceStatus(consentView({ region: "us", stored: explicitOff, gpc: false })).text, /^Your choice: Off, set /);
    assert.match(
      choiceStatus(consentView({ region: "us", stored: noticeGrant, gpc: true })).text,
      /privacy signal/,
    );
  });
});

describe("seen rule", () => {
  it("requires half the banner for one second on a visible page", () => {
    assert.equal(noticeCountsAsSeen({ ratio: 0.5, elapsedMs: 1000, visibility: "visible", blocked: false }), true);
    assert.equal(noticeCountsAsSeen({ ratio: 0.49, elapsedMs: 1000, visibility: "visible", blocked: false }), false);
    assert.equal(noticeCountsAsSeen({ ratio: 1, elapsedMs: 999, visibility: "visible", blocked: false }), false);
    assert.equal(noticeCountsAsSeen({ ratio: 1, elapsedMs: 1000, visibility: "hidden", blocked: false }), false);
    assert.equal(noticeCountsAsSeen({ ratio: 1, elapsedMs: 5000, visibility: "visible", blocked: true }), false);
  });
});
