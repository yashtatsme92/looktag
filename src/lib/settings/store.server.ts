import { getSql } from "@/lib/db";
import {
  DEFAULT_SETTINGS,
  SETTINGS_ID,
  extrasFromSettings,
  mergeExtrasJson,
  mergeSettings,
  parseExtrasJson,
  parseSettings,
  type AppSettings,
} from "./model";

type SettingsRow = {
  id: string;
  signup_email: boolean;
  signup_google: boolean;
  signup_x: boolean;
  labels_enabled: boolean;
  extras_json: string | null;
  updated_at: number;
};

function rowToSettings(row: SettingsRow | undefined): AppSettings {
  if (!row) return DEFAULT_SETTINGS;
  const extras = parseExtrasJson(row.extras_json);
  return parseSettings({
    signupEmail: Boolean(row.signup_email),
    signupGoogle: Boolean(row.signup_google),
    signupX: Boolean(row.signup_x),
    labelsEnabled: Boolean(row.labels_enabled),
    ...extras,
  });
}

export async function readSettings(): Promise<AppSettings> {
  const sql = await getSql();
  const rows = await sql<SettingsRow>`
    select id, signup_email, signup_google, signup_x, labels_enabled, extras_json, updated_at
    from looktag_settings
    where id = ${SETTINGS_ID}
    limit 1
  `;
  if (!rows[0]) {
    await sql`
      insert into looktag_settings (
        id, signup_email, signup_google, signup_x, labels_enabled, extras_json, updated_at
      ) values (
        ${SETTINGS_ID}, true, true, true, true, ${JSON.stringify(extrasFromSettings(DEFAULT_SETTINGS))}, ${Date.now()}
      )
      on conflict (id) do nothing
    `;
    return DEFAULT_SETTINGS;
  }
  return rowToSettings(rows[0]);
}

export async function writeSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const sql = await getSql();
  const rows = await sql<SettingsRow>`
    select id, signup_email, signup_google, signup_x, labels_enabled, extras_json, updated_at
    from looktag_settings
    where id = ${SETTINGS_ID}
    limit 1
  `;
  const current = rowToSettings(rows[0]);
  const next = mergeSettings(current, patch);
  const extras = mergeExtrasJson(rows[0]?.extras_json, next);
  await sql`
    insert into looktag_settings (
      id, signup_email, signup_google, signup_x, labels_enabled, extras_json, updated_at
    ) values (
      ${SETTINGS_ID},
      ${next.signupEmail},
      ${next.signupGoogle},
      ${next.signupX},
      ${next.labelsEnabled},
      ${extras},
      ${Date.now()}
    )
    on conflict (id) do update set
      signup_email = excluded.signup_email,
      signup_google = excluded.signup_google,
      signup_x = excluded.signup_x,
      labels_enabled = excluded.labels_enabled,
      extras_json = excluded.extras_json,
      updated_at = excluded.updated_at
  `;
  return next;
}
