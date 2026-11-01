import { hashPassword } from "../providers/auth/password.ts";
import type { Sql } from "@/lib/db";
import {
  ADMIN_NAME,
  ADMIN_USER_ID,
  adminConfigStatus,
  adminEmailAllowlist,
  resolveAdminEmail,
  resolveBootstrapPassword,
  shouldBootstrapAdmin,
} from "./access.ts";

const globalRef = globalThis as typeof globalThis & {
  __looktagAdminEnsured__?: Promise<void>;
};

/**
 * Optionally insert the admin credential user when bootstrap env is set.
 *
 * No-op unless {@link shouldBootstrapAdmin} is true (env-driven password;
 * production also needs `ADMIN_BOOTSTRAP`). Never seeds a hardcoded password.
 * If the admin email already exists, this is a no-op — unset bootstrap env
 * after the first successful provision and change the password.
 */
export async function ensureAdminUser(sql: Sql): Promise<void> {
  if (!shouldBootstrapAdmin()) return;

  const email = resolveAdminEmail();
  const bootstrapPassword = resolveBootstrapPassword();
  if (!bootstrapPassword) return;

  globalRef.__looktagAdminEnsured__ ??= (async () => {
    const existing = await sql<{ id: string }>`
      select id from "user" where email = ${email} limit 1
    `;
    if (existing[0]) return;

    const now = new Date();
    const password = await hashPassword(bootstrapPassword);
    await sql`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      values (${ADMIN_USER_ID}, ${ADMIN_NAME}, ${email}, true, ${now}, ${now})
      on conflict ("email") do nothing
    `;
    const user = await sql<{ id: string }>`
      select id from "user" where email = ${email} limit 1
    `;
    const userId = user[0]?.id ?? ADMIN_USER_ID;
    const accounts = await sql<{ id: string }>`
      select id from "account" where "userId" = ${userId} and "providerId" = 'credential' limit 1
    `;
    if (accounts[0]) return;
    await sql`
      insert into "account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      ) values (
        ${`${userId}-credential`}, ${email}, 'credential', ${userId}, ${password}, ${now}, ${now}
      )
    `;
    console.info(
      "[looktag] Admin user bootstrapped for",
      email,
      "— unset ADMIN_BOOTSTRAP / ADMIN_BOOTSTRAP_PASSWORD and change the password after first sign-in.",
    );
  })().catch((error) => {
    globalRef.__looktagAdminEnsured__ = undefined;
    throw error;
  });
  await globalRef.__looktagAdminEnsured__;
}

const NO_ADMIN_WARNING =
  "[looktag] No verified admin. Set ADMIN_EMAILS to a comma-separated list of Google accounts. Email/password sign-ups are never admin.";

/**
 * Startup hint when nobody has configured an admin and no verified allowlisted
 * user exists. Never throws. Never logs passwords or mailbox values.
 */
export async function warnIfNoAdminConfigured(
  sql: Sql,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
  log: (message: string) => void = console.warn,
): Promise<void> {
  try {
    const status = adminConfigStatus(env);
    if (status.explicit || status.bootstrap) return;
    const allowlist = new Set(adminEmailAllowlist(env));
    const rows = await sql<{ email: string | null; emailVerified: boolean | null }>`
      select email, "emailVerified" from "user"
    `;
    const verified = rows.some((row) => {
      const email = (row.email ?? "").trim().toLowerCase();
      return row.emailVerified === true && allowlist.has(email);
    });
    if (verified) return;
    log(NO_ADMIN_WARNING);
  } catch {
    try {
      log(NO_ADMIN_WARNING);
    } catch {
      /* a broken logger must not take down startup */
    }
  }
}
