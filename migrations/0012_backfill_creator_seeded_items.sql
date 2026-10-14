insert into seeded_items (kind, id)
select 'editorial_look', seed.id
from (values
  ('seed-slow-knit'),
  ('seed-earth-layers'),
  ('seed-soft-cardigan'),
  ('seed-brown-study'),
  ('seed-nora-camel-grey'),
  ('seed-nora-quiet-office'),
  ('seed-nora-black-satin'),
  ('seed-nora-tofu-denim'),
  ('seed-ines-ruby-hour'),
  ('seed-ines-emerald-cocktail'),
  ('seed-ines-midnight-champagne'),
  ('seed-ines-velvet-soiree'),
  ('seed-tobias-park-walk'),
  ('seed-tobias-quiet-office-cord'),
  ('seed-tobias-raw-denim-sunday'),
  ('seed-tobias-wax-merino'),
  ('seed-amara-oatmeal-utility-knit'),
  ('seed-amara-charcoal-fleece-pleats'),
  ('seed-amara-oat-cardigan-wide-denim'),
  ('seed-amara-quilted-cord-commute'),
  ('seed-leo-black-tie-minimal'),
  ('seed-leo-midnight-navy'),
  ('seed-leo-bordeaux-supper-club'),
  ('seed-leo-black-on-black'),
  ('seed-sofia-breton-weekend'),
  ('seed-sofia-dune-path-midi'),
  ('seed-sofia-sardine-blue-set'),
  ('seed-sofia-sun-bleached-linen')
) as seed(id)
where exists (
  select 1
  from looks
  where looks.id = seed.id
    and looks.user_id = 'editorial'
)
on conflict (kind, id) do nothing;
