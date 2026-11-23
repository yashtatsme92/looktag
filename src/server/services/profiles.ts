import { getSql } from "@/lib/db";
import { isLabelUserId } from "@/lib/labels/model";
import { creatorPayload, loadAccount } from "@/lib/looks/looks-shared";
import { readSettings } from "@/lib/settings/store.server";
import { userFromRequest } from "@/lib/auth/request-user.server";
import { seedAndBackfillLooks } from "./looks";

export async function getMyAccount(userId: string) {
  const sql = await getSql();
  return loadAccount(sql, userId);
}

export async function getCreator(userId: string) {
  const sql = await getSql();
  await seedAndBackfillLooks(sql);
  const settings = await readSettings();
  if (isLabelUserId(userId) && !settings.labelsEnabled) return null;
  return creatorPayload(sql, userId, {
    look: settings.scoreLook,
    pin: settings.scorePin,
    compared: settings.scoreCompared,
  });
}

export async function getRequestUser(request: Request) {
  return userFromRequest(request);
}
