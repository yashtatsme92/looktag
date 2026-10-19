import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

describe("email-only signup migration", () => {
  it("updates existing settings and preserves other extras", async () => {
    const db = new PGlite();
    try {
      await db.exec(await readFile("migrations/0004_studio.sql", "utf8"));
      await db.exec(await readFile("migrations/0005_studio_config.sql", "utf8"));
      await db.exec(
        `update looktag_settings
         set signup_email = false, signup_google = true, signup_x = true,
             extras_json = '{"featureFlag":true,"signupApple":true}'`,
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
});
