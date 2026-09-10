import { hashPassword } from "better-auth/crypto";
import type { Sql } from "@/lib/db";
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_USER_ID } from "./access";

const globalRef = globalThis as typeof globalThis & {
  __looktagAdminEnsured__?: Promise<void>;
};

export async function ensureAdminUser(sql: Sql): Promise<void> {
  globalRef.__looktagAdminEnsured__ ??= (async () => {
    const existing = await sql<{ id: string }>`
      select id from "user" where email = ${ADMIN_EMAIL} limit 1
    `;
    if (existing[0]) return;
    const now = new Date();
    const password = await hashPassword(ADMIN_PASSWORD);
    await sql`
      insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      values (${ADMIN_USER_ID}, ${ADMIN_NAME}, ${ADMIN_EMAIL}, true, ${now}, ${now})
      on conflict ("email") do nothing
    `;
    const user = await sql<{ id: string }>`
      select id from "user" where email = ${ADMIN_EMAIL} limit 1
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
        ${`${userId}-credential`}, ${ADMIN_EMAIL}, 'credential', ${userId}, ${password}, ${now}, ${now}
      )
    `;
  })().catch((error) => {
    globalRef.__looktagAdminEnsured__ = undefined;
    throw error;
  });
  await globalRef.__looktagAdminEnsured__;
}
