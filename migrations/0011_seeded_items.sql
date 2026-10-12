create table if not exists seeded_items (
  kind      text not null,
  id        text not null,
  seeded_at timestamptz not null default now(),
  primary key (kind, id)
);
