import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Sql } from "../db.ts";
import {
  ADMIN_USER_ID,
  DEFAULT_ADMIN_EMAIL,
  LEGACY_ADMIN_EMAIL,
  adminConfigStatus,
  adminEmailAllowlist,
  isAdminEmail,
  isAdminPasswordSignInEmail,
  isAdminUser,
  normalizeLoginEmail,
  parseAdminEmails,
  resolveYouSessionState,
  resolveAdminEmail,
  resolveBootstrapPassword,
  shouldBootstrapAdmin,
  youSessionSignedIn,
} from "./access.ts";
import { warnIfNoAdminConfigured } from "./ensure.server.ts";

describe("normalizeLoginEmail", () => {
  it("maps the admin alias to the resolved address", () => {
    assert.equal(normalizeLoginEmail("admin", {}), DEFAULT_ADMIN_EMAIL);
    assert.equal(normalizeLoginEmail("Admin", {}), DEFAULT_ADMIN_EMAIL);
    assert.equal(normalizeLoginEmail("  ADMIN  ", {}), DEFAULT_ADMIN_EMAIL);
    assert.equal(
      normalizeLoginEmail("admin", { ADMIN_EMAIL: "ops@example.com" }),
      "ops@example.com",
    );
  });

  it("leaves other emails untouched besides trim", () => {
    assert.equal(normalizeLoginEmail("  you@email.com ", {}), "you@email.com");
  });
});

describe("parseAdminEmails", () => {
  it("splits, trims, lowercases, and dedupes", () => {
    assert.deepEqual(parseAdminEmails(undefined), []);
    assert.deepEqual(parseAdminEmails("  "), []);
    assert.deepEqual(
      parseAdminEmails(" A@X.com, a@x.com,, B@y.com "),
      ["a@x.com", "b@y.com"],
    );
  });
});

describe("isAdminEmail", () => {
  it("matches the allowlist case-insensitively and ignores the legacy alias", () => {
    assert.equal(isAdminEmail("admin", {}), false);
    assert.equal(isAdminEmail(LEGACY_ADMIN_EMAIL, {}), false);
    assert.equal(isAdminEmail("Admin@Looktag.Studio", {}), false);
    assert.equal(isAdminEmail(DEFAULT_ADMIN_EMAIL, {}), true);
    assert.equal(isAdminEmail("Hello@TheLookTag.com", {}), true);
    assert.equal(isAdminEmail("you@email.com", {}), false);
    assert.equal(isAdminEmail(null, {}), false);
    assert.equal(
      isAdminEmail("Ops@Example.com", { ADMIN_EMAILS: "ops@example.com, other@example.com" }),
      true,
    );
  });
});

describe("admin allowlist", () => {
  it("adds the resolved mailbox to ADMIN_EMAILS without duplicating it", () => {
    assert.deepEqual(adminEmailAllowlist({}), [DEFAULT_ADMIN_EMAIL]);
    assert.deepEqual(adminEmailAllowlist({ ADMIN_EMAIL: "  Ops@Example.com " }), [
      "ops@example.com",
    ]);
    assert.deepEqual(
      adminEmailAllowlist({
        ADMIN_EMAILS: "a@x.com, ops@example.com",
        ADMIN_EMAIL: "Ops@Example.com",
      }),
      ["a@x.com", "ops@example.com"],
    );
  });

  it("reports whether admin env was set explicitly", () => {
    assert.equal(adminConfigStatus({}).explicit, false);
    assert.equal(adminConfigStatus({}).defaultEmail, DEFAULT_ADMIN_EMAIL);
    assert.equal(adminConfigStatus({ ADMIN_EMAILS: "a@x.com" }).explicit, true);
    assert.equal(adminConfigStatus({ ADMIN_EMAIL: "a@x.com" }).explicit, true);
    assert.equal(resolveAdminEmail({}), DEFAULT_ADMIN_EMAIL);
    assert.equal(resolveAdminEmail({ ADMIN_EMAIL: " ops@example.com " }), "ops@example.com");
  });
});

describe("isAdminUser", () => {
  it("requires a verified allowlisted email", () => {
    assert.equal(isAdminUser(null, {}), false);
    assert.equal(isAdminUser({ email: DEFAULT_ADMIN_EMAIL, emailVerified: false }, {}), false);
    assert.equal(isAdminUser({ email: DEFAULT_ADMIN_EMAIL }, {}), false);
    assert.equal(isAdminUser({ email: "you@email.com", emailVerified: true }, {}), false);
    assert.equal(isAdminUser({ email: LEGACY_ADMIN_EMAIL, emailVerified: true }, {}), false);
    assert.equal(
      isAdminUser({ email: "Hello@TheLookTag.com", emailVerified: true, hasPassword: false }, {}),
      true,
    );
  });

  it("never trusts a password account linked to a verified provider (takeover path)", () => {
    // Attacker signs up with a password for an allowlisted mailbox; the real
    // owner's Google sign-in links onto that row and flips emailVerified=true.
    const env = { ADMIN_EMAILS: " Boss@Example.test , ops@example.test ,," };
    const linked = { id: "u-attacker", email: "boss@example.test", emailVerified: true, hasPassword: true };
    assert.equal(isAdminUser(linked, env), false);
    // Unknown credential state fails closed.
    assert.equal(isAdminUser({ id: "u1", email: "boss@example.test", emailVerified: true }, env), false);
    // OAuth-only verified user on the allowlist is admin.
    assert.equal(
      isAdminUser({ id: "u2", email: "Ops@example.test", emailVerified: true, hasPassword: false }, env),
      true,
    );
  });

  it("keeps the env-gated bootstrap password account as admin", () => {
    assert.equal(
      isAdminUser({ id: ADMIN_USER_ID, email: DEFAULT_ADMIN_EMAIL, emailVerified: true, hasPassword: true }, {}),
      true,
    );
    assert.equal(
      isAdminUser({ id: ADMIN_USER_ID, email: DEFAULT_ADMIN_EMAIL, emailVerified: false, hasPassword: true }, {}),
      false,
    );
  });
});

describe("isAdminPasswordSignInEmail", () => {
  it("only matches the bootstrap mailbox, not ADMIN_EMAILS", () => {
    const env = { ADMIN_EMAILS: "ops@example.test" };
    assert.equal(isAdminPasswordSignInEmail(" Hello@TheLookTag.com ", env), true);
    assert.equal(isAdminPasswordSignInEmail("ops@example.test", env), false);
    assert.equal(isAdminPasswordSignInEmail("ops@example.test", { ADMIN_EMAIL: "ops@example.test" }), true);
    assert.equal(isAdminPasswordSignInEmail("", env), false);
  });
});

describe("resolveYouSessionState", () => {
  it("stays pending while the session is still resolving", () => {
    assert.equal(resolveYouSessionState({ isPending: true, user: null }), "pending");
    assert.equal(
      resolveYouSessionState({
        isPending: true,
        user: { primaryEmail: DEFAULT_ADMIN_EMAIL },
      }),
      "pending",
    );
  });

  it("treats a resolved null session as guest", () => {
    assert.equal(resolveYouSessionState({ isPending: false, user: null }), "guest");
  });

  it("treats regular accounts as members", () => {
    assert.equal(
      resolveYouSessionState(
        {
          isPending: false,
          user: { primaryEmail: "creator@example.com" },
        },
        {},
      ),
      "member",
    );
    assert.equal(
      resolveYouSessionState(
        {
          isPending: false,
          user: { primaryEmail: LEGACY_ADMIN_EMAIL },
        },
        {},
      ),
      "member",
    );
  });

  it("marks the default allowlisted account as admin", () => {
    assert.equal(
      resolveYouSessionState(
        {
          isPending: false,
          user: { primaryEmail: DEFAULT_ADMIN_EMAIL },
        },
        {},
      ),
      "admin",
    );
  });
});

describe("youSessionSignedIn", () => {
  it("only returns true for settled signed-in states", () => {
    assert.equal(youSessionSignedIn("pending"), false);
    assert.equal(youSessionSignedIn("guest"), false);
    assert.equal(youSessionSignedIn("member"), true);
    assert.equal(youSessionSignedIn("admin"), true);
  });
});

describe("admin bootstrap env", () => {
  it("resolves admin email from env or the default", () => {
    assert.equal(resolveAdminEmail({}), DEFAULT_ADMIN_EMAIL);
    assert.equal(
      resolveAdminEmail({ ADMIN_EMAIL: " ops@example.com " }),
      "ops@example.com",
    );
  });

  it("never bootstraps without ADMIN_BOOTSTRAP_PASSWORD", () => {
    assert.equal(shouldBootstrapAdmin({}), false);
    assert.equal(shouldBootstrapAdmin({ ADMIN_BOOTSTRAP: "1" }), false);
    assert.equal(
      shouldBootstrapAdmin({ NODE_ENV: "production", ADMIN_BOOTSTRAP: "true" }),
      false,
    );
  });

  it("allows non-production bootstrap when a password is set", () => {
    assert.equal(
      shouldBootstrapAdmin({ ADMIN_BOOTSTRAP_PASSWORD: "s3cret" }),
      true,
    );
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "development",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      true,
    );
  });

  it("requires an explicit flag in production", () => {
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "production",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      false,
    );
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "production",
        ADMIN_BOOTSTRAP: "1",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      true,
    );
    assert.equal(
      shouldBootstrapAdmin({
        NODE_ENV: "production",
        ADMIN_BOOTSTRAP: "yes",
        ADMIN_BOOTSTRAP_PASSWORD: "s3cret",
      }),
      true,
    );
  });

  it("reads the bootstrap password from env only", () => {
    assert.equal(resolveBootstrapPassword({}), undefined);
    assert.equal(
      resolveBootstrapPassword({ ADMIN_BOOTSTRAP_PASSWORD: "  s3cret  " }),
      "s3cret",
    );
  });
});

describe("warnIfNoAdminConfigured", () => {
  const secret = "bootstrap-secret-do-not-log";

  function sqlReturning(
    rows: { email: string | null; emailVerified: boolean | null }[] | Error,
  ): Sql {
    const query = async () => {
      if (rows instanceof Error) throw rows;
      return rows;
    };
    return query as unknown as Sql;
  }

  async function warnings(
    rows: { email: string | null; emailVerified: boolean | null }[] | Error,
    env: Record<string, string | undefined>,
  ): Promise<string[]> {
    const messages: string[] = [];
    await warnIfNoAdminConfigured(sqlReturning(rows), env, (message) => {
      messages.push(message);
    });
    return messages;
  }

  it("warns when nothing explicit is set and no verified allowlisted user exists", async () => {
    const cases: { email: string | null; emailVerified: boolean | null }[][] = [
      [],
      [{ email: DEFAULT_ADMIN_EMAIL, emailVerified: false }],
      [{ email: LEGACY_ADMIN_EMAIL, emailVerified: true }],
      [{ email: "admin", emailVerified: true }],
    ];
    for (const rows of cases) {
      const messages = await warnings(rows, {});
      assert.equal(messages.length, 1);
      assert.match(messages[0]!, /ADMIN_EMAILS/);
      assert.equal(messages[0]!.includes(secret), false);
      assert.equal(messages[0]!.includes(DEFAULT_ADMIN_EMAIL), false);
      assert.equal(messages[0]!.includes(LEGACY_ADMIN_EMAIL), false);
    }
  });

  it("stays quiet when admin is explicit, bootstrapped, or already verified", async () => {
    const verified = [{ email: "Hello@TheLookTag.com", emailVerified: true }];
    assert.deepEqual(await warnings(verified, {}), []);
    assert.deepEqual(await warnings([], { ADMIN_EMAILS: "a@x.com" }), []);
    assert.deepEqual(await warnings([], { ADMIN_EMAIL: "ops@example.com" }), []);
    const bootstrapped = await warnings([], { ADMIN_BOOTSTRAP_PASSWORD: secret });
    assert.deepEqual(bootstrapped, []);
  });

  it("does not throw when the user query fails, and does not log the error", async () => {
    const messages = await warnings(new Error(`db down ${secret}`), {});
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /ADMIN_EMAILS/);
    assert.equal(messages[0]!.includes(secret), false);
    assert.equal(messages[0]!.includes("db down"), false);
  });
});
