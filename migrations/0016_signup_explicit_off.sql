-- Social sign-up methods: explicit admin choices (google-signin-default, PR #189).
--
-- Before this migration a social method was stored only as a boolean
-- (signup_google, signup_x, extras_json.signupApple). `false` was the default
-- seeded by 0015 and could not be told apart from an admin's choice.
--
-- From now on an admin switching a method off in Studio is recorded in
-- extras_json.signupOff (comma list, e.g. "google"). That list is the only
-- thing that keeps a configured provider off; mergeSettings maintains it.
--
-- Legacy false rows are treated as UNSET, ONE TIME ONLY, here. Reason: on
-- production Google was never configured, so those false values were never an
-- admin's decision, and the owner needs Google sign-in to become admin at all.
-- We therefore start signupOff empty and stamp signupOffTracked=true. Any
-- "off" set in Studio after this point is persisted in signupOff and is never
-- silently turned back on by later deploys or credential changes.
do $$
declare
 settings_row record;
 extras jsonb;
begin
 for settings_row in select id, extras_json from looktag_settings loop
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
   update looktag_settings
      set extras_json = (extras || jsonb_build_object(
            'signupOff', coalesce(extras->>'signupOff', ''),
            'signupOffTracked', true))::text
    where id = settings_row.id;
 end loop;
end $$;
