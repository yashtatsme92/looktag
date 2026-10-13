create table if not exists seeded_items (
  kind      text not null,
  id        text not null,
  seeded_at timestamptz not null default now(),
  primary key (kind, id)
);

insert into seeded_items (kind, id)
select 'editorial_look', id
from looks
where user_id = 'editorial'
on conflict (kind, id) do nothing;

insert into seeded_items (kind, id)
select 'editorial_look', legacy.id
from (values
  ('seed-sunday-coat'),
  ('seed-gallery-hour'),
  ('seed-city-cut'),
  ('seed-studio-knit'),
  ('seed-quiet-tailor'),
  ('seed-coastal-linen')
) as legacy(id)
where exists (select 1 from looks where user_id = 'editorial')
on conflict (kind, id) do nothing;
