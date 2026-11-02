-- Social sign-up methods: explicit admin choices (google-signin-default, PR #189).
--
-- Before this migration a social method was stored only as a boolean
-- (signup_google, signup_x, extras_json.signupApple). `false` was both the
-- 0015 seed default and what an admin's "off" in Studio wrote, so the two
-- cannot be told apart from the settings row alone.
--
-- From now on an admin switching a method off is recorded in
-- extras_json.signupOff (comma list, e.g. "google"); mergeSettings maintains
-- it, and it is what keeps a configured provider off.
--
-- One-time carry-over of legacy `false`, PER PROVIDER, using a durable and
-- auditable signal: linked rows in better-auth's "account" table, column
-- "providerId".
--   google: providerId in ('google', 'grok-google')
--   apple:  providerId in ('apple',  'grok-apple')
--   x:      providerId in ('twitter', 'grok-x')
--  * Legacy false AND at least one linked account for that provider
--    -> the provider was set up and used on this deployment, so the false is
--       treated as a deliberate admin off and preserved in signupOff.
--  * Legacy false AND zero linked accounts (or no "account" table)
--    -> the provider was never set up/used here, so the false was only the
--       seed default; it is left unset (on once credentials are configured).
--  * Legacy true -> untouched.
-- Reason: on thelooktag.com Google was never configured, so no Google accounts
-- exist and Google comes on once its keys are set (the owner needs Google to
-- become admin). Other deployments that used a provider and switched it off
-- keep it off. signupOffTracked=true makes this run once per row; offs set in
-- Studio afterwards are never silently turned back on.
do $$
declare
 settings_row record;
 extras jsonb;
 has_accounts boolean := to_regclass('public."account"') is not null;
 used_google boolean := false;
 used_apple boolean := false;
 used_x boolean := false;
 off text[];
 existing text;
begin
 if has_accounts then
   execute 'select exists (select 1 from "account" where "providerId" in (''google'', ''grok-google''))' into used_google;
   execute 'select exists (select 1 from "account" where "providerId" in (''apple'', ''grok-apple''))' into used_apple;
   execute 'select exists (select 1 from "account" where "providerId" in (''twitter'', ''grok-x''))' into used_x;
 end if;

 for settings_row in select id, signup_google, signup_x, extras_json from looktag_settings loop
   begin
     extras := coalesce(settings_row.extras_json, '{}')::jsonb;
     if jsonb_typeof(extras) <> 'object' then
       extras := '{}'::jsonb;
     end if;
   exception when others then
     extras := '{}'::jsonb;
   end;
   if coalesce(extras->>'signupOffTracked', '') = 'true' then
     continue;
   end if;

   existing := coalesce(extras->>'signupOff', '');
   off := array[]::text[];
   if ('google' = any(string_to_array(existing, ','))) or (used_google and not coalesce(settings_row.signup_google, false)) then
     off := array_append(off, 'google');
   end if;
   if ('apple' = any(string_to_array(existing, ','))) or (used_apple and coalesce(extras->>'signupApple', 'false') <> 'true') then
     off := array_append(off, 'apple');
   end if;
   if ('x' = any(string_to_array(existing, ','))) or (used_x and not coalesce(settings_row.signup_x, false)) then
     off := array_append(off, 'x');
   end if;

   update looktag_settings
      set extras_json = (extras || jsonb_build_object(
            'signupOff', array_to_string(off, ','),
            'signupOffTracked', true))::text
    where id = settings_row.id;
 end loop;
end $$;
