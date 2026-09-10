import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  extrasFromSettings,
  hasSignupMethod,
  mergeExtrasJson,
  mergeSettings,
  parseExtrasJson,
  parseSettings,
  pickSettingsPatch,
  rankWeights,
  signupMethodCount,
  visibleOauthProviders,
} from "./model.ts";

const providers = [
  { providerId: "grok-google", idp: "google", label: "Google" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
] as const;

describe("parseSettings", () => {
  it("defaults every method and Houses on", () => {
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
  });

  it("treats only explicit false as off", () => {
    const parsed = parseSettings({
      signupEmail: false,
      signupGoogle: true,
      signupX: false,
      labelsEnabled: false,
    });
    assert.equal(parsed.signupEmail, false);
    assert.equal(parsed.signupGoogle, true);
    assert.equal(parsed.signupX, false);
    assert.equal(parsed.labelsEnabled, false);
  });

  it("reads search and rank knobs from extras", () => {
    const parsed = parseSettings({
      searchEngine: "brave",
      searchCountry: "fr",
      scoreLook: 20,
      scorePin: 1,
      scoreCompared: 8,
    });
    assert.equal(parsed.searchEngine, "brave");
    assert.equal(parsed.searchCountry, "FR");
    assert.equal(parsed.scoreLook, 20);
    assert.deepEqual(rankWeights(parsed), { look: 20, pin: 1, compared: 8 });
  });

  it("reads theme from extras", () => {
    const parsed = parseSettings({ themeId: "night" });
    assert.equal(parsed.themeId, "night");
    assert.equal(parseSettings({ themeId: "beige" }).themeId, "ink");
    assert.equal(DEFAULT_SETTINGS.themeId, "ink");
  });

  it("reads splash from extras", () => {
    const parsed = parseSettings({ splashId: "minimal" });
    assert.equal(parsed.splashId, "minimal");
    assert.equal(parseSettings({ splashId: "neon" }).splashId, "classy");
    assert.equal(DEFAULT_SETTINGS.splashId, "classy");
  });

  it("rejects unknown search engines and out-of-range scores", () => {
    const parsed = parseSettings({ searchEngine: "bing", scoreLook: 99, scorePin: -4 });
    assert.equal(parsed.searchEngine, "xai");
    assert.equal(parsed.scoreLook, 40);
    assert.equal(parsed.scorePin, 0);
  });
});

describe("extras json", () => {
  it("round-trips configurable knobs", () => {
    const extras = extrasFromSettings({
      ...DEFAULT_SETTINGS,
      searchEngine: "duckduckgo",
      searchCountry: "NL",
      scoreLook: 10,
    });
    const parsed = parseExtrasJson(JSON.stringify(extras));
    assert.equal(parsed.searchEngine, "duckduckgo");
    assert.equal(parsed.searchCountry, "NL");
    assert.equal(parsed.scoreLook, 10);
  });

  it("returns empty on bad json", () => {
    assert.deepEqual(parseExtrasJson("{"), {});
    assert.deepEqual(parseExtrasJson(null), {});
  });

  it("does not leak unknown extras into AppSettings", () => {
    const parsed = parseExtrasJson(JSON.stringify({ featureFlag: true, signupEmail: false }));
    assert.equal("signupEmail" in parsed, false);
    assert.equal("featureFlag" in parsed, false);
    assert.equal(parsed.searchEngine, "xai");
  });

  it("keeps unknown extras keys when writing", () => {
    const json = mergeExtrasJson(
      JSON.stringify({ featureFlag: true, searchEngine: "brave" }),
      DEFAULT_SETTINGS,
    );
    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.equal(parsed.featureFlag, true);
    assert.equal(parsed.searchEngine, "xai");
  });
});

describe("mergeSettings", () => {
  it("keeps the last remaining sign-up method", () => {
    const current = { ...DEFAULT_SETTINGS, signupGoogle: false, signupX: false };
    const blocked = mergeSettings(current, { signupEmail: false });
    assert.equal(blocked.signupEmail, true);
    assert.equal(hasSignupMethod(blocked), true);
  });

  it("allows turning Houses off independently", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { labelsEnabled: false });
    assert.equal(next.labelsEnabled, false);
    assert.equal(next.signupEmail, true);
  });

  it("merges rank weights without touching sign-up", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { scoreLook: 7 });
    assert.equal(next.scoreLook, 7);
    assert.equal(next.signupGoogle, true);
  });

  it("merges splash without resetting other knobs", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { splashId: "atelier" });
    assert.equal(next.splashId, "atelier");
    assert.equal(next.themeId, DEFAULT_SETTINGS.themeId);
  });
});

describe("pickSettingsPatch", () => {
  it("keeps splashId so studio can save it", () => {
    const patch = pickSettingsPatch({ splashId: "minimal" });
    assert.deepEqual(patch, { splashId: "minimal" });
  });

  it("keeps theme and rank extras", () => {
    const patch = pickSettingsPatch({ themeId: "night", scoreLook: 15 });
    assert.equal(patch.themeId, "night");
    assert.equal(patch.scoreLook, 15);
    assert.equal("signupEmail" in patch, false);
  });
});

describe("visibleOauthProviders", () => {
  it("hides Google and X independently", () => {
    assert.equal(visibleOauthProviders({ signupGoogle: false, signupX: true }, providers).length, 1);
    assert.equal(visibleOauthProviders({ signupGoogle: false, signupX: true }, providers)[0].label, "X");
    assert.equal(visibleOauthProviders({ signupGoogle: false, signupX: false }, providers).length, 0);
  });
});

describe("signupMethodCount", () => {
  it("counts enabled methods", () => {
    assert.equal(signupMethodCount(DEFAULT_SETTINGS), 3);
    assert.equal(signupMethodCount({ signupEmail: true, signupGoogle: false, signupX: false }), 1);
  });
});
