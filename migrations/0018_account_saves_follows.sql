-- Account saves and follows. One row per account and target.
-- Deleted users, looks, profiles, and houses drop their rows.

create table if not exists look_saves (
  user_id    text not null references "user"(id) on delete cascade,
  look_id    text not null references looks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, look_id)
);

create index if not exists look_saves_user_created_idx
  on look_saves (user_id, created_at desc);

create table if not exists creator_follows (
  user_id         text not null references "user"(id) on delete cascade,
  creator_user_id text not null references profiles(user_id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, creator_user_id)
);

create index if not exists creator_follows_user_created_idx
  on creator_follows (user_id, created_at desc);

create table if not exists house_follows (
  user_id    text not null references "user"(id) on delete cascade,
  label_id   text not null references fashion_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, label_id)
);

create index if not exists house_follows_user_created_idx
  on house_follows (user_id, created_at desc);
