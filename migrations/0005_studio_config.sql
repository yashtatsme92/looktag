-- Extensible studio config (search, rank weights) stored as JSON next to
-- the existing sign-up / Houses flags. Add a key in settings/model.ts —
-- no new migration for each knob.

alter table looktag_settings
  add column if not exists extras_json text not null default '{}';
