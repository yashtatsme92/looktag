import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openMemoryPglite } from "../providers/db/pglite.ts";
import { mergeExtrasJson, mergeSettings, parseSettings } from "./model.ts";
import { enforceSignInMethod, publicSignInSettings, serverProviderAvailability } from "../auth/method-gate.ts";

describe("email-only signup migration", () => {
  it("updates untouched settings and preserves other extras", async () => {
    const db = await openMemoryPglite();
    try {
      await db.exec(await readFile("migrations/0004_studio.sql", "utf8"));
      await db.exec(await readFile("migrations/0005_studio_config.sql", "utf8"));
      await db.exec(
        `update looktag_settings
         set extras_json = '{"featureFlag":true,"signupApple":true}'`,
      );
      await db.exec(await readFile("migrations/0015_email_only_signup.sql", "utf8"));
      const result = await db.query<{
        signup_email: boolean;
        signup_google: boolean;
        signup_x: boolean;
        extras_json: string;
      }>(
        "select signup_email, signup_google, signup_x, extras_json from looktag_settings where id = 'default'",
      );
      const row = result.rows[0];
      assert.equal(row.signup_email, true);
      assert.equal(row.signup_google, false);
      assert.equal(row.signup_x, false);
      assert.deepEqual(JSON.parse(row.extras_json), {
        featureFlag: true,
        signupApple: false,
      });
    } finally {
      await db.close();
    }
  });

  it("preserves saved sign-in choices", async () => {
    const db = await openMemoryPglite();
    try {
      await db.exec(await readFile("migrations/0004_studio.sql", "utf8"));
      await db.exec(await readFile("migrations/0005_studio_config.sql", "utf8"));
      await db.exec(
        `update looktag_settings
         set signup_email = false, signup_google = true, signup_x = true,
             extras_json = '{"signupApple":true,"featureFlag":true}', updated_at = 123`,
      );
      await db.exec(await readFile("migrations/0015_email_only_signup.sql", "utf8"));
      const result = await db.query<{
        signup_email: boolean;
        signup_google: boolean;
        signup_x: boolean;
        extras_json: string;
      }>(
        "select signup_email, signup_google, signup_x, extras_json from looktag_settings where id = 'default'",
      );
      const row = result.rows[0];
      assert.equal(row.signup_email, false);
      assert.equal(row.signup_google, true);
      assert.equal(row.signup_x, true);
      assert.deepEqual(JSON.parse(row.extras_json), {
        signupApple: true,
        featureFlag: true,
      });
    } finally {
      await db.close();
    }
  });

  it("does not fail when untouched settings contain malformed extras", async () => {
    const db = await openMemoryPglite();
    try {
      await db.exec(await readFile("migrations/0004_studio.sql", "utf8"));
      await db.exec(await readFile("migrations/0005_studio_config.sql", "utf8"));
      await db.exec(`update looktag_settings set extras_json = ''`);
      await db.exec(await readFile("migrations/0015_email_only_signup.sql", "utf8"));
      const result = await db.query<{ extras_json: string }>(
        "select extras_json from looktag_settings where id = 'default'",
      );
      assert.deepEqual(JSON.parse(result.rows[0].extras_json), { signupApple: false });
    } finally {
      await db.close();
    }
  });
});

describe("explicit social sign-up off migration (0016)", () => {
  const googleEnv = { GOOGLE_CLIENT_ID: "dummy-google-id", GOOGLE_CLIENT_SECRET: "dummy-google-secret" };

  async function legacyDb() {
    const db = await openMemoryPglite();
    await db.exec(await readFile("migrations/0004_studio.sql", "utf8"));
    await db.exec(await readFile("migrations/0005_studio_config.sql", "utf8"));
    // A main-era row: Google stored false with no record of who set it.
    await db.exec(
      `update looktag_settings
       set signup_email = true, signup_google = false, signup_x = false,
           extras_json = '{"signupApple":false,"featureFlag":true}', updated_at = 123`,
    );
    await db.exec(await readFile("migrations/0016_signup_explicit_off.sql", "utf8"));
    return db;
  }

  async function readRow(db: Awaited<ReturnType<typeof openMemoryPglite>>) {
    const { rows } = await db.query<{
      signup_email: boolean;
      signup_google: boolean;
      signup_x: boolean;
      extras_json: string;
    }>("select signup_email, signup_google, signup_x, extras_json from looktag_settings where id = 'default'");
    const row = rows[0];
    return {
      row,
      settings: parseSettings({
        signupEmail: row.signup_email,
        signupGoogle: row.signup_google,
        signupX: row.signup_x,
        ...JSON.parse(row.extras_json),
      }),
    };
  }

  it("(a) treats a pre-seeded legacy false row as unset, so configured Google shows", async () => {
    const db = await legacyDb();
    try {
      const { row, settings } = await readRow(db);
      const extras = JSON.parse(row.extras_json);
      assert.equal(extras.signupOffTracked, true);
      assert.equal(extras.signupOff, "");
      assert.equal(extras.featureFlag, true);
      assert.equal(publicSignInSettings(settings, googleEnv).signupGoogle, true);
      assert.doesNotThrow(() =>
        enforceSignInMethod("/sign-in/social", { provider: "google" }, settings, {}, serverProviderAvailability(googleEnv)),
      );
    } finally {
      await db.close();
    }
  });

  it("(b) an admin's later Google off stays off with keys set, and sign-in is 403", async () => {
    const db = await legacyDb();
    try {
      const { row, settings } = await readRow(db);
      const providers = serverProviderAvailability(googleEnv);
      const off = mergeSettings(settings, { signupGoogle: false }, providers);
      await db.query("update looktag_settings set signup_google = $1, extras_json = $2 where id = 'default'", [
        off.signupGoogle,
        mergeExtrasJson(row.extras_json, off),
      ]);
      // Re-running the migration is a no-op once tracked: the explicit off survives.
      await db.exec(await readFile("migrations/0016_signup_explicit_off.sql", "utf8"));
      const after = await readRow(db);
      assert.equal(after.settings.signupOff, "google");
      assert.equal(publicSignInSettings(after.settings, googleEnv).signupGoogle, false);
      assert.throws(
        () => enforceSignInMethod("/sign-in/social", { provider: "google" }, after.settings, {}, providers),
        (error: unknown) => (error as { status?: unknown })?.status === "FORBIDDEN",
      );
    } finally {
      await db.close();
    }
  });
});
