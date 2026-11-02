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
  const appleEnv = { APPLE_CLIENT_ID: "dummy-apple-id", APPLE_CLIENT_SECRET: "dummy-apple-secret" };
  const forbidden = (error: unknown) => (error as { status?: unknown })?.status === "FORBIDDEN";

  /** A main-era row (every social method stored false) plus linked accounts. */
  async function legacyDb(linkedProviders: string[] = [], withAuth = true) {
    const db = await openMemoryPglite();
    if (withAuth) await db.exec(await readFile("migrations/0001_auth.sql", "utf8"));
    await db.exec(await readFile("migrations/0004_studio.sql", "utf8"));
    await db.exec(await readFile("migrations/0005_studio_config.sql", "utf8"));
    await db.exec(
      `update looktag_settings
       set signup_email = true, signup_google = false, signup_x = false,
           extras_json = '{"signupApple":false,"featureFlag":true}', updated_at = 123`,
    );
    if (linkedProviders.length) {
      await db.exec(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U', 'u@example.test', true)`);
      for (const [n, providerId] of linkedProviders.entries()) {
        await db.query(
          `insert into "account" (id, "accountId", "providerId", "userId", "updatedAt") values ($1, $2, $3, 'u1', now())`,
          [`a${n}`, `acct${n}`, providerId],
        );
      }
    }
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
      extras: JSON.parse(row.extras_json),
      settings: parseSettings({
        signupEmail: row.signup_email,
        signupGoogle: row.signup_google,
        signupX: row.signup_x,
        ...JSON.parse(row.extras_json),
      }),
    };
  }

  it("legacy false + no Google accounts + keys set: Google shows and is allowed", async () => {
    const db = await legacyDb();
    try {
      const { extras, settings } = await readRow(db);
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

  it("treats a deployment without the account table as never set up", async () => {
    const db = await legacyDb([], false);
    try {
      assert.equal((await readRow(db)).extras.signupOff, "");
    } finally {
      await db.close();
    }
  });

  for (const providerId of ["google", "grok-google"]) {
    it(`legacy false + a ${providerId} account: Google stays off and is 403 with keys`, async () => {
      const db = await legacyDb([providerId]);
      try {
        const { extras, settings } = await readRow(db);
        assert.equal(extras.signupOff, "google");
        assert.equal(publicSignInSettings(settings, googleEnv).signupGoogle, false);
        assert.throws(
          () => enforceSignInMethod("/sign-in/social", { provider: "google" }, settings, {}, serverProviderAvailability(googleEnv)),
          forbidden,
        );
      } finally {
        await db.close();
      }
    });
  }

  it("is per provider: a used Apple stays off while an unused Google is cleared", async () => {
    const db = await legacyDb(["grok-apple"]);
    try {
      const { extras, settings } = await readRow(db);
      assert.equal(extras.signupOff, "apple");
      const env = { ...googleEnv, ...appleEnv };
      const shown = publicSignInSettings(settings, env);
      assert.equal(shown.signupGoogle, true);
      assert.equal(shown.signupApple, false);
      assert.throws(
        () => enforceSignInMethod("/sign-in/social", { provider: "apple" }, settings, {}, serverProviderAvailability(env)),
        forbidden,
      );
    } finally {
      await db.close();
    }
  });

  it("an email/password account does not count as Google use", async () => {
    const db = await legacyDb(["credential"]);
    try {
      assert.equal((await readRow(db)).extras.signupOff, "");
    } finally {
      await db.close();
    }
  });

  it("after the migration an admin's Google off stays off (403 with keys), even if re-run", async () => {
    const db = await legacyDb();
    try {
      const { row, settings } = await readRow(db);
      const providers = serverProviderAvailability(googleEnv);
      const off = mergeSettings(settings, { signupGoogle: false }, providers);
      await db.query("update looktag_settings set signup_google = $1, extras_json = $2 where id = 'default'", [
        off.signupGoogle,
        mergeExtrasJson(row.extras_json, off),
      ]);
      await db.exec(await readFile("migrations/0016_signup_explicit_off.sql", "utf8"));
      const after = await readRow(db);
      assert.equal(after.settings.signupOff, "google");
      assert.equal(publicSignInSettings(after.settings, googleEnv).signupGoogle, false);
      assert.throws(
        () => enforceSignInMethod("/sign-in/social", { provider: "google" }, after.settings, {}, providers),
        forbidden,
      );
    } finally {
      await db.close();
    }
  });
});
