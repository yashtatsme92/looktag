update looktag_settings
set signup_email = true,
    signup_google = false,
    signup_x = false,
    extras_json = (coalesce(extras_json, '{}')::jsonb || '{"signupApple":false}'::jsonb)::text
where id = 'default';
