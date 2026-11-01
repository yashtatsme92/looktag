import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { socialProviders, socialProvidersForDeploy } from "../providers/auth/social.ts";
import {
  collectBakedPreviewEnv,
  netlifyPreviewBaseURL,
  parsePreviewTrustedHosts,
  previewAliasOrigin,
  previewDisablesSocial,
  resolveAuthSecret,
  resolveDeployedBaseURL,
  rewriteBakedPreviewEnvModule,
  shouldRegisterGrokBroker,
} from "./preview.ts";
import { installBakedPreviewEnv } from "../baked-preview-env.ts";
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
    assert.equal(resolveDeployedBaseURL(env), "https://deploy-preview-12--looktag.netlify.app");
    assert.equal(previewDisablesSocial(env), true);
    assert.equal(shouldRegisterGrokBroker(env), false);
    assert.deepEqual(socialProvidersForDeploy(env), {});
    assert.equal(previewHidesSocial(env), true);
    const previous = process.env.APP_ENV;
    process.env.APP_ENV = "preview";
    try {
      assert.equal(
        isSignInMethodEnabled(
          { ...DEFAULT_SETTINGS, signupGoogle: true, signupEmail: true },
          "google",
        ),
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
      {
        ...DEFAULT_SETTINGS,
        signupEmail: true,
        signupGoogle: true,
        signupApple: true,
        signupX: true,
      },
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
    assert.deepEqual(parsePreviewTrustedHosts(" *--looktag-previews.netlify.app, extra.example "), [
      "*--looktag-previews.netlify.app",
      "extra.example",
    ]);
    assert.deepEqual(parsePreviewTrustedHosts(""), []);
    assert.deepEqual(parsePreviewTrustedHosts(undefined), []);
  });

  it("never accepts a bare star", () => {
    assert.throws(() => parsePreviewTrustedHosts("*"), /bare "\*"/);
    assert.throws(() => parsePreviewTrustedHosts("ok.example, *"), /bare "\*"/);
  });
});

const PREVIEW_ORIGIN = "https://pr-9--looktag.netlify.app";

describe("runtime preview origin", () => {
  it("trusts pr-N--site.netlify.app from BETTER_AUTH_URL alone", () => {
    const env = {
      APP_ENV: "preview",
      APP_URL: PREVIEW_ORIGIN,
      BETTER_AUTH_URL: PREVIEW_ORIGIN,
      BETTER_AUTH_SECRET: "preview-secret",
      VITE_AUTH_ENABLED: "true",
    };
    assert.equal(resolveDeployedBaseURL(env), PREVIEW_ORIGIN);
    assert.equal(netlifyPreviewBaseURL(env), undefined);
    assert.equal(previewDisablesSocial(env), true);
    assert.equal(shouldRegisterGrokBroker(env), false);
    assert.deepEqual(socialProvidersForDeploy(env), {});
  });

  it("builds the alias origin the workflow deploys", () => {
    assert.equal(previewAliasOrigin(9, "looktag"), PREVIEW_ORIGIN);
    assert.equal(
      previewAliasOrigin("12", "looktag-previews"),
      "https://pr-12--looktag-previews.netlify.app",
    );
    assert.throws(() => previewAliasOrigin("0", "looktag"), /positive integer/);
    assert.throws(() => previewAliasOrigin("9;rm", "looktag"), /positive integer/);
    assert.throws(() => previewAliasOrigin(9, "looktag.app"), /subdomain/);
    assert.throws(() => previewAliasOrigin(9, ""), /subdomain/);
  });

  it("requires BETTER_AUTH_SECRET when APP_ENV=preview and keeps the sandbox fallback", () => {
    assert.throws(
      () => resolveAuthSecret({ APP_ENV: "preview" }, () => "random"),
      /BETTER_AUTH_SECRET is required when APP_ENV=preview/,
    );
    assert.equal(
      resolveAuthSecret(
        { APP_ENV: "preview", BETTER_AUTH_SECRET: "  secret-value  " },
        () => "random",
      ),
      "secret-value",
    );
    let called = false;
    assert.equal(
      resolveAuthSecret({ BETTER_AUTH_URL: "https://looktag.onrender.com" }, () => {
        called = true;
        return "random";
      }),
      "random",
    );
    assert.equal(called, true);
    assert.equal(
      resolveAuthSecret({ APP_ENV: "production" }, () => "random"),
      "random",
    );
  });

  it("bakes the alias for a preview server build and leaves Render and the client alone", () => {
    const source = readFileSync(new URL("../baked-preview-env.ts", import.meta.url), "utf8");
    const previewEnv = {
      APP_ENV: "preview",
      BETTER_AUTH_URL: PREVIEW_ORIGIN,
      APP_URL: PREVIEW_ORIGIN,
      BETTER_AUTH_SECRET: "server-only-secret",
      DATABASE_URL: "postgres://preview:secret@localhost/preview",
      VITE_AUTH_ENABLED: "true",
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL: "https://deploy-preview-9--looktag.netlify.app",
    };
    const nitro = rewriteBakedPreviewEnvModule(source, "nitro", previewEnv);
    const ssr = rewriteBakedPreviewEnvModule(source, "ssr", previewEnv);
    assert.ok(nitro?.includes(PREVIEW_ORIGIN));
    assert.ok(nitro?.includes("server-only-secret"));
    assert.equal(ssr, nitro);
    assert.equal(rewriteBakedPreviewEnvModule(source, "client", previewEnv), null);
    assert.equal(
      rewriteBakedPreviewEnvModule(source, "nitro", {
        BETTER_AUTH_URL: "https://looktag.onrender.com",
        DATABASE_URL: "postgres://render",
      }),
      null,
    );
    assert.equal(source.includes("= null"), true);

    const fromBuildVars = collectBakedPreviewEnv({
      APP_ENV: "preview",
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      DEPLOY_PRIME_URL: "https://deploy-preview-4--looktag.netlify.app/path",
      BETTER_AUTH_SECRET: "s",
    });
    assert.equal(fromBuildVars?.BETTER_AUTH_URL, "https://deploy-preview-4--looktag.netlify.app");
    assert.equal(fromBuildVars?.APP_URL, "https://deploy-preview-4--looktag.netlify.app");
    assert.equal(
      collectBakedPreviewEnv({
        NETLIFY: "true",
        CONTEXT: "deploy-preview",
        DEPLOY_PRIME_URL: "https://deploy-preview-4--looktag.netlify.app",
        BETTER_AUTH_URL: "https://looktag.onrender.com",
      }),
      null,
    );
  });

  it("installs a bake over a function-runtime env that has no deploy variables", () => {
    const runtime: NodeJS.ProcessEnv = {
      APP_ENV: "preview",
      URL: PREVIEW_ORIGIN,
      SITE_NAME: "looktag",
      SITE_ID: "site",
    };
    const baked = collectBakedPreviewEnv({
      APP_ENV: "preview",
      BETTER_AUTH_URL: PREVIEW_ORIGIN,
      APP_URL: PREVIEW_ORIGIN,
      BETTER_AUTH_SECRET: "n".repeat(32),
      DATABASE_URL: "postgres://user:pass@ep-preview/db",
      VITE_AUTH_ENABLED: "true",
    });
    installBakedPreviewEnv(runtime, baked);
    assert.equal(runtime.NETLIFY, undefined);
    assert.equal(runtime.CONTEXT, undefined);
    assert.equal(runtime.DEPLOY_PRIME_URL, undefined);
    assert.equal(resolveDeployedBaseURL(runtime), PREVIEW_ORIGIN);
    assert.equal(runtime.DATABASE_URL, "postgres://user:pass@ep-preview/db");
    assert.equal(runtime.BETTER_AUTH_SECRET, "n".repeat(32));

    const render: NodeJS.ProcessEnv = {
      BETTER_AUTH_URL: "https://looktag.onrender.com",
      DATABASE_URL: "postgres://render",
    };
    installBakedPreviewEnv(render, baked);
    assert.equal(render.BETTER_AUTH_URL, "https://looktag.onrender.com");
    assert.equal(render.DATABASE_URL, "postgres://render");
    assert.equal(render.APP_ENV, "preview");
    assert.equal(resolveDeployedBaseURL(render), "https://looktag.onrender.com");
  });
});
