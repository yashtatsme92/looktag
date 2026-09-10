-- Creator profile details collected at sign-up and edited on You.

alter table profiles
  add column if not exists city text not null default '';

alter table profiles
  add column if not exists bio text not null default '';
