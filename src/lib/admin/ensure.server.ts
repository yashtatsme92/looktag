import { hashPassword } from "better-auth/crypto";
import type { Sql } from "@/lib/db";
import {
  ADMIN_NAME,
  ADMIN_USER_ID,
  resolveAdminEmail,
  resolveBootstrapPassword,
  shouldBootstrapAdmin,
} from "./access";

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
