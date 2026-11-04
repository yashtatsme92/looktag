import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NO_PROVIDERS,
  effectiveSettings,
  effectiveSocialEnabled,
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
  { providerId: "grok-apple", idp: "apple", label: "Apple" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
] as const;

describe("parseSettings", () => {
  it("defaults every method and Houses on", () => {
    assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
    assert.deepEqual(
      [DEFAULT_SETTINGS.signupEmail, DEFAULT_SETTINGS.signupGoogle, DEFAULT_SETTINGS.signupApple, DEFAULT_SETTINGS.signupX],
      [true, false, false, false],
    );
  });

  it("treats only explicit false as off", () => {
    const parsed = parseSettings({
      signupEmail: false,
      signupGoogle: true,
      signupApple: true,
      signupX: false,
      labelsEnabled: false,
    });
    assert.equal(parsed.signupEmail, false);
    assert.equal(parsed.signupGoogle, true);
    assert.equal(parsed.signupApple, true);
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
    const parsed = parseSettings({ splashId: "pieces" });
    assert.equal(parsed.splashId, "pieces");
    assert.equal(parseSettings({ splashId: "neon" }).splashId, "tag-draw");
    assert.equal(DEFAULT_SETTINGS.splashId, "tag-draw");
  });

  it("rejects unknown search engines and out-of-range scores", () => {
    const parsed = parseSettings({ searchEngine: "bing", scoreLook: 99, scorePin: -4 });
    assert.equal(parsed.searchEngine, "xai");
    assert.equal(parsed.scoreLook, 40);
    assert.equal(parsed.scorePin, 0);
  });
});

describe("shopWholeLookPhone", () => {
  it("defaults off and survives the extras round-trip", () => {
    assert.equal(parseSettings({}).shopWholeLookPhone, false);
    const extras = extrasFromSettings({ ...DEFAULT_SETTINGS, shopWholeLookPhone: true });
    assert.equal(parseSettings(parseExtrasJson(JSON.stringify(extras))).shopWholeLookPhone, true);
  });
});

describe("extras json", () => {
  it("round-trips configurable knobs", () => {
    const extras = extrasFromSettings({
      ...DEFAULT_SETTINGS,
      searchEngine: "duckduckgo",
      searchCountry: "NL",
      scoreLook: 10,
      signupApple: true,
    });
    const parsed = parseExtrasJson(JSON.stringify(extras));
    assert.equal(parsed.searchEngine, "duckduckgo");
    assert.equal(parsed.searchCountry, "NL");
    assert.equal(parsed.scoreLook, 10);
    assert.equal(parsed.signupApple, true);
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

  it("enables Google without Apple and records explicit switch-offs per method", () => {
    const google = mergeSettings(DEFAULT_SETTINGS, { signupGoogle: true });
    assert.equal(google.signupGoogle, true);
    assert.equal(google.signupApple, false);

    const appleOff = mergeSettings(google, { signupApple: false });
    assert.equal(appleOff.signupGoogle, true, "Apple off does not touch Google");
    assert.equal(appleOff.signupOff, "apple");

    const googleOff = mergeSettings(appleOff, { signupGoogle: false });
    assert.equal(googleOff.signupOff, "google,apple");
    const googleBack = mergeSettings(googleOff, { signupGoogle: true });
    assert.equal(googleBack.signupOff, "apple");
  });

  it("ignores a client-sent signupOff", () => {
    assert.equal("signupOff" in pickSettingsPatch({ signupOff: "google" }), false);
  });

  it("allows turning Houses off independently", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { labelsEnabled: false });
    assert.equal(next.labelsEnabled, false);
    assert.equal(next.signupEmail, true);
  });

  it("merges rank weights without touching sign-up", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { scoreLook: 7 });
    assert.equal(next.scoreLook, 7);
    assert.equal(next.signupGoogle, false);
  });

  it("merges splash without resetting other knobs", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { splashId: "soft-power" });
    assert.equal(next.splashId, "soft-power");
    assert.equal(next.themeId, DEFAULT_SETTINGS.themeId);
    const persisted = parseExtrasJson(mergeExtrasJson("", next));
    assert.equal(persisted.splashId, "soft-power");
  });
});

describe("pickSettingsPatch", () => {
  it("keeps splashId so studio can save it", () => {
    const patch = pickSettingsPatch({ splashId: "tag-draw" });
    assert.deepEqual(patch, { splashId: "tag-draw" });
  });

  it("rejects unknown splash ids on writes", () => {
    assert.throws(
      () => pickSettingsPatch({ splashId: "neon" as never }),
      /Invalid splash design/,
    );
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
    const visible = visibleOauthProviders(
      { signupGoogle: false, signupApple: true, signupX: true },
      providers,
    );
    assert.deepEqual(visible.map((provider) => provider.label), ["Apple", "X"]);
    assert.equal(
      visibleOauthProviders(
        { signupGoogle: false, signupApple: false, signupX: false },
        providers,
      ).length,
      0,
    );
  });
});

describe("signupMethodCount", () => {
  it("counts enabled methods", () => {
    assert.equal(signupMethodCount(DEFAULT_SETTINGS), 1);
    assert.equal(signupMethodCount({
      signupEmail: true,
      signupGoogle: true,
      signupApple: true,
      signupX: false,
    }), 3);
  });
});

describe("effectiveSocialEnabled", () => {
  const google = { credentials: true, broker: false };
  const none = { credentials: false, broker: false };
  const withGoogle = { google, apple: none, x: none };

  it("is on when configured and unset", () => {
    assert.equal(effectiveSocialEnabled(DEFAULT_SETTINGS, "google", withGoogle), true);
  });

  it("is off when configured but explicitly switched off", () => {
    const off = mergeSettings(DEFAULT_SETTINGS, { signupGoogle: false });
    assert.equal(effectiveSocialEnabled(off, "google", withGoogle), false);
  });

  it("is off when not configured, even if switched on", () => {
    const on = mergeSettings(DEFAULT_SETTINGS, { signupApple: true });
    assert.equal(effectiveSocialEnabled(on, "apple", withGoogle), false);
    assert.equal(effectiveSocialEnabled(on, "google", NO_PROVIDERS), false);
  });

  it("keeps Google independent of Apple", () => {
    const both = { google, apple: google, x: none };
    const appleOff = mergeSettings(DEFAULT_SETTINGS, { signupApple: false });
    assert.equal(effectiveSocialEnabled(appleOff, "google", both), true);
    assert.equal(effectiveSocialEnabled(appleOff, "apple", both), false);
    const googleOff = mergeSettings(DEFAULT_SETTINGS, { signupGoogle: false });
    assert.equal(effectiveSocialEnabled(googleOff, "apple", both), true);
  });

  it("needs an explicit switch-on for a broker-only provider", () => {
    const broker = { credentials: false, broker: true };
    const brokerOnly = { google: broker, apple: broker, x: broker };
    assert.equal(effectiveSocialEnabled(DEFAULT_SETTINGS, "x", brokerOnly), false);
    const on = mergeSettings(DEFAULT_SETTINGS, { signupX: true });
    assert.equal(effectiveSocialEnabled(on, "x", brokerOnly), true);
  });

  it("effectiveSettings rewrites the three social flags", () => {
    const next = effectiveSettings(DEFAULT_SETTINGS, withGoogle);
    assert.deepEqual([next.signupGoogle, next.signupApple, next.signupX], [true, false, false]);
  });
});

describe("at least one sign-up method (effective flags)", () => {
  const none = NO_PROVIDERS;
  const withGoogle = { ...NO_PROVIDERS, google: { credentials: true, broker: false } };

  it("does not count stored Apple/X as on when they are not configured", () => {
    const stored = { ...DEFAULT_SETTINGS, signupEmail: false, signupApple: true, signupX: true };
    assert.equal(hasSignupMethod(stored), true);
    assert.equal(hasSignupMethod(stored, none), false);
  });

  it("refuses to switch email off when only unconfigured providers are stored on", () => {
    const current = { ...DEFAULT_SETTINGS, signupEmail: true, signupApple: true };
    const next = mergeSettings(current, { signupEmail: false }, none);
    assert.equal(next.signupEmail, true);
  });

  it("allows switching email off when configured Google is effectively on", () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { signupEmail: false }, withGoogle);
    assert.equal(next.signupEmail, false);
    assert.equal(hasSignupMethod(next, withGoogle), true);
  });

  it("refuses to switch Google off when it is the last effective method", () => {
    const current = mergeSettings(DEFAULT_SETTINGS, { signupEmail: false }, withGoogle);
    const next = mergeSettings(current, { signupGoogle: false }, withGoogle);
    assert.equal(next.signupOff, "");
  });
});
