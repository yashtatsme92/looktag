import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TrustedOriginsError, deployedTrustedOrigins, parseTrustedOrigins } from "./trusted-origins.ts";

describe("TRUSTED_ORIGINS", () => {
  it("is empty when unset", () => {
    assert.deepEqual(parseTrustedOrigins(undefined), []);
    assert.deepEqual(parseTrustedOrigins(" , "), []);
  });

  it("trims, normalises and dedupes", () => {
    assert.deepEqual(
      parseTrustedOrigins(" https://looktag.onrender.com/ ,https://looktag.onrender.com, https://Staging.Example.com:8443"),
      ["https://looktag.onrender.com", "https://staging.example.com:8443"],
    );
  });

  it("rejects invalid entries without printing values", () => {
    for (const bad of ["looktag.onrender.com", "ftp://x.com", "https://x.com/path", "https://user:secret@x.com"]) {
      assert.throws(
        () => parseTrustedOrigins(`https://ok.com,${bad}`),
        (error: unknown) => {
          assert.ok(error instanceof TrustedOriginsError);
          assert.match(error.message, /TRUSTED_ORIGINS has 1 invalid entry \(position 2\)/);
          assert.ok(!error.message.includes(bad));
          assert.ok(!error.message.includes("secret"));
          return true;
        },
      );
    }
  });

  it("merges BETTER_AUTH_URL, APP_URL, TRUSTED_ORIGINS and local dev", () => {
    const origins = deployedTrustedOrigins(
      { APP_URL: "https://thelooktag.com/", TRUSTED_ORIGINS: "https://looktag.onrender.com,https://thelooktag.com" },
      "https://thelooktag.com",
      ["http://localhost:8080"],
    );
    assert.deepEqual(origins, ["https://thelooktag.com", "https://looktag.onrender.com", "http://localhost:8080"]);
  });
});
