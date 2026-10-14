-- Rename the seeded house and its stable catalog keys without discarding edits.
insert into fashion_labels (
  id, name, handle, bio, city, moods_json, scouted, created_at, status,
  owner_user_id, website, cover_src
)
select
  'label-maison-calve', 'Maison Calvé', 'maisoncalve', bio, city, moods_json,
  scouted, created_at, status, owner_user_id, website, cover_src
from fashion_labels
where id = 'label-maison-veyra'
on conflict (id) do update
set name = excluded.name, handle = excluded.handle;

insert into fashion_collections (
  id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
)
select
  replace(id, 'maison-veyra', 'maison-calve'), 'label-maison-calve',
  name, slug, caption, season, moods_json, sort_order, created_at
from fashion_collections
where label_id = 'label-maison-veyra'
  and id like '%maison-veyra%'
on conflict (id) do nothing;

update fashion_styles
set
  id = replace(id, 'maison-veyra', 'maison-calve'),
  label_id = 'label-maison-calve',
  collection_id = replace(collection_id, 'maison-veyra', 'maison-calve'),
  image_src = replace(image_src, 'maison-veyra_', 'maison-calve_'),
  images_json = replace(images_json, 'maison-veyra_', 'maison-calve_')
where label_id = 'label-maison-veyra';

update looks
set
  user_id = 'label-maison-calve',
  creator_name = case when creator_name = 'Maison Veyra' then 'Maison Calvé' else creator_name end,
  collection_id = replace(collection_id, 'maison-veyra', 'maison-calve'),
  image_src = replace(image_src, 'maison-veyra_', 'maison-calve_')
where user_id = 'label-maison-veyra';

update profiles
set user_id = 'label-maison-calve', display_name = 'Maison Calvé', handle = 'maisoncalve'
where user_id = 'label-maison-veyra';

update fashion_collections
set label_id = 'label-maison-calve'
where label_id = 'label-maison-veyra'
  and id not like '%maison-veyra%';

delete from fashion_collections where label_id = 'label-maison-veyra';
delete from fashion_labels where id = 'label-maison-veyra';
