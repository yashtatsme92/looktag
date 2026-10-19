do $$
declare
 settings_row record;
 extras jsonb;
begin
 for settings_row in
   select id, extras_json
     from looktag_settings
    where id = 'default'
      and updated_at = 0
 loop
   begin
     extras := coalesce(settings_row.extras_json, '{}')::jsonb;
     if jsonb_typeof(extras) <> 'object' then
       extras := '{}'::jsonb;
     end if;
   exception when others then
     extras := '{}'::jsonb;
   end;

   update looktag_settings
      set signup_email = true,
          signup_google = false,
          signup_x = false,
          extras_json = (extras || '{"signupApple":false}'::jsonb)::text
    where id = settings_row.id
      and updated_at = 0;
 end loop;
end $$;
