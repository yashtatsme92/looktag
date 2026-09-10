-- Published looks and creator profiles. Editorial house looks use user_id = 'editorial'
-- and are never ranked. Real accounts own every other row.

create table if not exists profiles (
  user_id      text primary key,
  display_name text not null,
  handle       text not null unique,
  created_at   timestamptz not null default now()
);

create table if not exists looks (
  id              text primary key,
  user_id         text not null,
  title           text not null,
  caption         text not null default '',
  creator_name    text not null,
  image_src       text not null,
  moods_json      text not null default '[]',
  tags_json       text not null default '[]',
  pin_count       integer not null default 0,
  compared_count  integer not null default 0,
  retailer_count  integer not null default 0,
  published       boolean not null default true,
  created_at      bigint not null,
  updated_at      bigint not null
);

create index if not exists looks_user_id_idx on looks (user_id);
create index if not exists looks_published_created_idx on looks (published, created_at desc);
