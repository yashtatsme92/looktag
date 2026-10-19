-- Studio settings (sign-up methods + Houses feature) and fashion labels.
-- Labels reuse looks.user_id = fashion_labels.id so collections stay ordinary looks.

create table if not exists looktag_settings (
  id             text primary key,
  signup_email   boolean not null default true,
  signup_google  boolean not null default true,
  signup_x       boolean not null default true,
  labels_enabled boolean not null default true,
  updated_at     bigint not null
);

insert into looktag_settings (
  id, signup_email, signup_google, signup_x, labels_enabled, updated_at
) values (
  'default', true, true, true, true, 0
) on conflict (id) do nothing;

create table if not exists fashion_labels (
  id         text primary key,
  name       text not null,
  handle     text not null unique,
  bio        text not null default '',
  city       text not null default '',
  moods_json text not null default '[]',
  scouted    boolean not null default false,
  created_at bigint not null
);

create index if not exists fashion_labels_scouted_idx
  on fashion_labels (scouted);
