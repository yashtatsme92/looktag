import { createServerFn } from "@tanstack/react-start";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { ADMIN_USER_ID, isAdminEmail } from "@/lib/admin/access";
import { getSql } from "@/lib/db";
import { withSpan } from "@/lib/observability/instrument";
import { parseProfileFields } from "./profile";
import {
  upsertProfile,
  loadAccount,
  creatorPayload,
} from "./looks-shared";

export const ensureMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { displayName?: string; handle?: string; city?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await upsertProfile(sql, context.userId, data.displayName || "Creator", {
      handle: data.handle,
      city: data.city,
    });
    return creatorPayload(sql, context.userId);
  });

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return loadAccount(sql, context.userId);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      name: string;
      email: string;
      handle: string;
      city?: string;
      bio?: string;
      currentPassword?: string;
      newPassword?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    return withSpan("looktag.profile.update", async (span) => {
      const parsed = parseProfileFields({
        name: data.name,
        email: data.email,
        handle: data.handle,
        city: data.city,
        bio: data.bio,
        newPassword: data.newPassword,
      });
      if (!parsed.ok) throw new Error(parsed.error);
      const sql = await getSql();
      const current = await loadAccount(sql, context.userId);
      if (!current) throw new Error("Could not load your account.");

      let email = parsed.value.email;
      if (current.emailLocked) email = current.email;
      if (email !== current.email) {
        if (isAdminEmail(email) && context.userId !== ADMIN_USER_ID) {
          throw new Error("That email is reserved.");
        }
        const taken = await sql<{ id: string }>`
          select id from "user" where email = ${email} and id <> ${context.userId} limit 1
        `;
        if (taken[0]) throw new Error("That email is already in use.");
      }

      if (parsed.value.newPassword) {
        if (!current.hasPassword) throw new Error("This account signs in without a password.");
        const currentPassword = (data.currentPassword ?? "").trim();
        if (!currentPassword) throw new Error("Enter your current password to change it.");
        const accounts = await sql<{ password: string | null }>`
          select password from "account"
          where "userId" = ${context.userId} and "providerId" = 'credential'
          limit 1
        `;
        const hash = accounts[0]?.password;
        if (!hash) throw new Error("This account signs in without a password.");
        const ok = await verifyPassword({ hash, password: currentPassword });
        if (!ok) throw new Error("Current password is not right.");
        const nextHash = await hashPassword(parsed.value.newPassword);
        const now = new Date();
        await sql`
          update "account"
          set password = ${nextHash}, "updatedAt" = ${now}
          where "userId" = ${context.userId} and "providerId" = 'credential'
        `;
        span.setAttribute("looktag.profile.password", true);
      }

      const now = new Date();
      await sql`
        update "user"
        set name = ${parsed.value.name}, email = ${email}, "updatedAt" = ${now}
        where id = ${context.userId}
      `;
      if (email !== current.email) {
        await sql`
          update "account"
          set "accountId" = ${email}, "updatedAt" = ${now}
          where "userId" = ${context.userId} and "providerId" = 'credential'
        `;
      }
      await upsertProfile(sql, context.userId, parsed.value.name, {
        handle: parsed.value.handle,
        city: parsed.value.city,
        bio: parsed.value.bio,
      });
      await sql`
        update looks set creator_name = ${parsed.value.name} where user_id = ${context.userId}
      `;
      span.setAttribute("looktag.profile.email_changed", email !== current.email);
      span.setAttribute("looktag.profile.handle", parsed.value.handle);
      return loadAccount(sql, context.userId);
    });
  });
