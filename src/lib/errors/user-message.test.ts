import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { COPY, copyHasDash, couldNot } from "./copy.ts";
import { FRIENDLY_ERRORS } from "./public-error.ts";
import { authErrorMessage, looksTechnical, presentFindError, userMessage } from "./user-message.ts";

const FALLBACK = "Could not save the look.";
const SHOWN_FALLBACK = "We couldn't save the look. Please try again.";

describe("userMessage", () => {
  it("hides the production S3 error from the toast", () => {
    const raw = new Error(
      "Cannot find package '@aws-sdk/client-s3' imported from /app/.output/server/_ssr/photo-store.server-Bp10sQQL.mjs",
    );
    assert.equal(userMessage(raw, FALLBACK), SHOWN_FALLBACK);
  });

  for (const raw of [
    "connect ECONNREFUSED 127.0.0.1:5432",
    'relation "looks" does not exist',
    "Cannot read properties of undefined (reading 'id')",
    "TypeError: x is not a function",
    "Unexpected token < in JSON at position 0",
    "Invalid storage key",
    'Unknown STORAGE_PROVIDER "gcs". Expected local|s3|r2.',
    "Forbidden: cross-site request blocked",
    "AccessDenied: Access Denied",
    "Internal server error",
    '[{"code":"invalid_type","path":["title"]}]',
    "SELECT id FROM looks WHERE id = $1",
    "aborted",
    "x".repeat(260),
  ]) {
    it(`masks: ${raw.slice(0, 48)}`, () => {
      assert.equal(looksTechnical(raw) || raw.length > 200, true);
      assert.equal(userMessage(new Error(raw), FALLBACK), SHOWN_FALLBACK);
    });
  }

  for (const kept of [
    "Give the look a name.",
    "That handle is already taken.",
    "Use a JPEG, PNG, or WebP photo.",
    "That file is too large. Try one under 12 MB.",
    "That current password isn't right. Try again.",
    "Your House isn't live yet.",
    "Select a photo from your library.",
    FRIENDLY_ERRORS.photoUpload,
    FRIENDLY_ERRORS.generic,
    COPY.findQuota,
    "Could not tell what is under that pin. Try a name, then search again.",
    "No item pages in those shops. Try a more specific name, or paste the page you wore.",
    "Choose a photo (JPG, PNG, or WebP).",
    "That photo is too large. Compress it and try again.",
  ]) {
    it(`keeps: ${kept}`, () => {
      assert.equal(userMessage(new Error(kept), FALLBACK), kept);
    });
  }

  it("network failures read as connection problems", () => {
    for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
      assert.equal(userMessage(new TypeError(raw), FALLBACK), FRIENDLY_ERRORS.offline);
    }
    assert.equal(FRIENDLY_ERRORS.offline, "We couldn't reach Looktag. Check your connection and try again.");
  });

  it("Unauthorized becomes a sign-in sentence", () => {
    assert.equal(userMessage(new Error("Unauthorized"), FALLBACK), FRIENDLY_ERRORS.signIn);
  });

  it("empty and non-Error values use the softened fallback", () => {
    assert.equal(userMessage(undefined, FALLBACK), SHOWN_FALLBACK);
    assert.equal(userMessage(new Error(""), FALLBACK), SHOWN_FALLBACK);
    assert.equal(userMessage({ message: 42 }, FALLBACK), SHOWN_FALLBACK);
    assert.equal(userMessage("Give the look a name.", FALLBACK), "Give the look a name.");
  });

  it("rewrites the Could not family without swallowing the pin sentence", () => {
    assert.equal(userMessage(FALLBACK), SHOWN_FALLBACK);
    assert.equal(userMessage("Could not save."), couldNot("save"));
    assert.equal(userMessage("Probe failed"), couldNot("run that check"));
    assert.equal(
      userMessage("Could not tell what is under that pin. Try a name, then search again."),
      COPY.pinUnknown,
    );
  });
});

describe("auth and search copy", () => {
  const rawAuth = [
    "Invalid email or password",
    "Invalid password",
    "Invalid email",
    "User already exists.",
    "User already exists. Use another email.",
    "Password too short",
    "Password too long",
    "Failed to create user",
    "Failed to create session",
    "Failed to get session",
    "Invalid origin",
    "Invalid callbackURL",
    "callbackURL is required",
    "Missing or null Origin",
    "CSRF check failed. Login blocked.",
    "Session expired. Re-authenticate to perform this action.",
    "Email not verified",
    "User not found",
    "Credential account not found",
    "Social account already linked",
    "credentialAccountNotFound",
    "FAILED_TO_CREATE_SESSION",
    "Pop-up blocked — allow pop-ups for sign-in",
    "Sign-in was cancelled or failed",
    "Sign-in failed",
    "Sign-out failed",
    "Could not create the account.",
    "Could not sign in.",
  ];

  for (const raw of rawAuth) {
    it(`hides auth text: ${raw}`, () => {
      const shown = authErrorMessage(Object.assign(new Error(raw), { code: raw }));
      assert.equal(shown.includes(raw), false);
      assert.equal(copyHasDash(shown), false);
      assert.doesNotMatch(shown, /csrf|callbackURL|origin|LookTag/i);
    });
  }

  it("password too short becomes the 8 character sentence", () => {
    assert.equal(userMessage("Password too short"), COPY.passwordShort);
    assert.equal(authErrorMessage({ message: "nope", code: "PASSWORD_TOO_SHORT" }), COPY.passwordShort);
  });

  it("429 is the rate limit sentence", () => {
    assert.equal(userMessage({ message: "Too many requests", status: 429 }), COPY.rateLimit);
  });

  it("find and search copy never names a vendor or a status code", () => {
    const raw = [
      "Could not reach Grok.",
      "xAI API error 503",
      "AI is not available in this environment.",
      "Add a Brave Search API key in Catalog.",
      "Add a Google API key and search engine ID in Catalog.",
      "Turn on at least one shop in Catalog before searching.",
      "AI find isn’t available right now.",
      "AI find limit reached — try again later.",
      "The photo did not yield any wearable pieces. Try a clearer full-body shot.",
      "That photo is too large to send.",
      "Name the piece — colour and garment — then search.",
      "Search did not complete.",
    ];
    for (const item of raw) {
      const shown = presentFindError(item);
      assert.doesNotMatch(shown, /grok|xai|catalog|api key|environment|csrf/i);
      assert.doesNotMatch(shown, /\b\d{3}\b/);
      assert.equal(copyHasDash(shown), false);
      assert.notEqual(shown, item);
    }
  });

  it("shared sentences have no em dash or en dash", () => {
    for (const value of Object.values(COPY)) assert.equal(copyHasDash(value), false, value);
    assert.equal(copyHasDash(couldNot("save the look")), false);
    assert.equal(copyHasDash(SHOWN_FALLBACK), false);
  });
});

describe("error surfaces", () => {
  const root = new URL("../../../", import.meta.url);

  function source(path: string): string {
    return readFileSync(new URL(path, root), "utf8");
  }

  it("the 404 screen names the page and a way back", () => {
    const file = source("src/components/errors/not-found-screen.tsx");
    assert.match(file, /COPY\.notFoundTitle/);
    assert.match(file, /COPY\.notFoundBody/);
    assert.match(file, /COPY\.backToLooks/);
    assert.match(file, /AppShell/);
    assert.equal(COPY.notFoundTitle, "This page isn't here.");
    assert.equal(COPY.backToLooks, "Back to looks");
  });

  it("the app error screen uses the shared generic and a reload or back control", () => {
    const file = source("src/lib/error-component.tsx");
    assert.match(file, /userMessage\(error\)/);
    assert.match(file, /COPY\.reload/);
    assert.match(file, /COPY\.backToLooks/);
    assert.match(file, /role="alert"/);
    assert.doesNotMatch(file, /An unexpected error occurred/);
    assert.equal(userMessage(new Error("boom")), COPY.generic);
  });

  it("field errors expose aria-invalid and aria-describedby", () => {
    const field = source("src/components/ds/field.tsx");
    assert.match(field, /aria-invalid/);
    assert.match(field, /aria-describedby/);
    assert.match(field, /role="alert"/);
    assert.match(field, /aria-live/);
    const login = source("src/routes/login.tsx");
    assert.match(login, /error=\{fieldErrors\.password\}/);
    assert.match(login, /live="assertive"/);
    const profile = source("src/components/looks/profile-form.tsx");
    assert.match(profile, /error=\{fieldErrors\.email\}/);
    assert.match(profile, /COPY\.loadProfile/);
  });

  it("sign-out and profile load failures use the new copy", () => {
    assert.match(source("src/lib/auth/gates.tsx"), /COPY\.signOutFailed/);
    assert.match(source("src/routes/creators.$userId.tsx"), /COPY\.signOutFailed/);
    assert.equal(COPY.signOutFailed, "We couldn't sign you out. Please try again.");
    assert.equal(COPY.loadProfile, "We couldn't load your profile. Try again.");
  });

  it("find messages cannot render the raw provider string", () => {
    const editor = source("src/components/looks/look-editor.tsx");
    assert.match(editor, /presentFindError\(result\.error\)/);
    assert.doesNotMatch(editor, /setFindMessage\(result\.error\)/);
    assert.match(editor, /userMessage\(result\.error, COPY\.searchFailed\)/);
  });

  it("upload sentences still mention 12 MB and a photo format", () => {
    assert.match(userMessage("That file is too large. Try one under 12 MB."), /12 MB/);
    assert.match(userMessage("Use a JPEG, PNG, or WebP photo."), /JPEG, PNG, or WebP/);
    assert.match(userMessage("Choose a photo (JPG, PNG, or WebP)."), /JPG, PNG, or WebP/);
  });
});
