import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { socialProviders, socialProvidersForDeploy } from "../providers/auth/social.ts";
import {
  netlifyPreviewBaseURL,
  parsePreviewTrustedHosts,
  previewDisablesSocial,
  resolveDeployedBaseURL,
  shouldRegisterGrokBroker,
} from "./preview.ts";
import { isSignInMethodEnabled, previewHidesSocial, settingsForSignIn } from "./method-gate.ts";
import { DEFAULT_SETTINGS } from "../settings/model.ts";

const renderEnv = {
  RENDER: "true",
  BETTER_AUTH_URL: "https://looktag.onrender.com",
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsec",
  GROK_AUTH_CLIENT_ID: "grok-client",
  GROK_AUTH_CLIENT_SECRET: "grok-secret",
};

describe("deployed auth origins", () => {
  it("keeps a Render URL and leaves social sign-in available", () => {
    assert.equal(resolveDeployedBaseURL(renderEnv), "https://looktag.onrender.com");
    assert.equal(
      resolveDeployedBaseURL({
        ...renderEnv,
        NETLIFY: "true",
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL: "https://deploy-preview-1--looktag.netlify.app",
      }),
      "https://looktag.onrender.com",
    );
    assert.equal(netlifyPreviewBaseURL(renderEnv), undefined);
    assert.equal(previewDisablesSocial(renderEnv), false);
    assert.equal(shouldRegisterGrokBroker(renderEnv), true);
    assert.deepEqual(Object.keys(socialProviders(renderEnv)), ["google"]);
    assert.deepEqual(Object.keys(socialProvidersForDeploy(renderEnv)), ["google"]);
  });

  it("trusts the Netlify preview origin and clears social providers", () => {
    const env = {
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL: "https://deploy-preview-12--looktag.netlify.app/ignored",
      APP_ENV: "preview",
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsec",
      APPLE_CLIENT_ID: "aid",
      APPLE_CLIENT_SECRET: "asec",
    };
    assert.equal(
      resolveDeployedBaseURL(env),
      "https://deploy-preview-12--looktag.netlify.app",
    );
    assert.equal(previewDisablesSocial(env), true);
    assert.equal(shouldRegisterGrokBroker(env), false);
    assert.deepEqual(socialProvidersForDeploy(env), {});
    assert.equal(previewHidesSocial(env), true);
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = "preview";
    try {
      assert.equal(
        isSignInMethodEnabled({ ...DEFAULT_SETTINGS, signupGoogle: true, signupEmail: true }, "google"),
        false,
      );
      assert.equal(
        isSignInMethodEnabled({ ...DEFAULT_SETTINGS, signupEmail: true }, "email"),
        true,
      );
    } finally {
      if (previous === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = previous;
    }
    const shown = settingsForSignIn(
      { ...DEFAULT_SETTINGS, signupEmail: true, signupGoogle: true, signupApple: true, signupX: true },
      env,
    );
    assert.equal(shown.signupEmail, true);
    assert.equal(shown.signupGoogle, false);
    assert.equal(shown.signupApple, false);
    assert.equal(shown.signupX, false);
  });

  it("falls back to DEPLOY_URL for a branch deploy", () => {
    assert.equal(
      netlifyPreviewBaseURL({
        NETLIFY: "true",
        CONTEXT: "branch-deploy",
        DEPLOY_URL: "https://branch--looktag.netlify.app",
      }),
      "https://branch--looktag.netlify.app",
    );
  });

  it("ignores Netlify production context when BETTER_AUTH_URL is unset", () => {
    assert.equal(
      netlifyPreviewBaseURL({
        NETLIFY: "true",
        CONTEXT: "production",
        DEPLOY_PRIME_URL: "https://looktag.netlify.app",
      }),
      undefined,
    );
  });
});

describe("PREVIEW_TRUSTED_HOSTS", () => {
  it("parses a comma-separated host list", () => {
    assert.deepEqual(
      parsePreviewTrustedHosts(" *--looktag-previews.netlify.app, extra.example "),
      ["*--looktag-previews.netlify.app", "extra.example"],
    );
    assert.deepEqual(parsePreviewTrustedHosts(""), []);
    assert.deepEqual(parsePreviewTrustedHosts(undefined), []);
  });

  it("never accepts a bare star", () => {
    assert.throws(() => parsePreviewTrustedHosts("*"), /bare "\*"/);
    assert.throws(() => parsePreviewTrustedHosts("ok.example, *"), /bare "\*"/);
  });
});
