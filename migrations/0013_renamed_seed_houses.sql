-- Rename the remaining seeded houses and their catalog keys without discarding edits.
with house_renames(old_id, new_id, new_name, new_handle, old_slug, new_slug) as (
  values
    ('label-kestrel-row', 'label-fernhollow', 'Fernhollow', 'fernhollow', 'kestrel-row', 'fernhollow'),
    ('label-rework-seven', 'label-thistlewick', 'Thistlewick', 'thistlewick', 'rework-seven', 'thistlewick')
)
insert into fashion_labels (
  id, name, handle, bio, city, moods_json, scouted, created_at, status,
  owner_user_id, website, cover_src
)
select
  rename.new_id, rename.new_name, rename.new_handle, label.bio, label.city, label.moods_json,
  label.scouted, label.created_at, label.status, label.owner_user_id, label.website, label.cover_src
from fashion_labels label
join house_renames rename on rename.old_id = label.id
on conflict (id) do update
set name = excluded.name, handle = excluded.handle;

with house_renames(old_id, new_id, old_slug, new_slug) as (
  values
    ('label-kestrel-row', 'label-fernhollow', 'kestrel-row', 'fernhollow'),
    ('label-rework-seven', 'label-thistlewick', 'rework-seven', 'thistlewick')
)
insert into fashion_collections (
  id, label_id, name, slug, caption, season, moods_json, sort_order, created_at
)
select
  replace(collection.id, rename.old_slug, rename.new_slug), rename.new_id,
  collection.name, collection.slug, collection.caption, collection.season, collection.moods_json,
  collection.sort_order, collection.created_at
from fashion_collections collection
join house_renames rename on rename.old_id = collection.label_id
on conflict (id) do update
set
  label_id = excluded.label_id,
  name = excluded.name,
  slug = excluded.slug,
  caption = excluded.caption,
  season = excluded.season,
  moods_json = excluded.moods_json,
  sort_order = excluded.sort_order,
  created_at = excluded.created_at;

with house_renames(old_id, new_id, old_slug, new_slug) as (
  values
    ('label-kestrel-row', 'label-fernhollow', 'kestrel-row', 'fernhollow'),
    ('label-rework-seven', 'label-thistlewick', 'rework-seven', 'thistlewick')
)
insert into fashion_styles (
  id, label_id, collection_id, name, description, image_src, images_json, sort_order, created_at
)
select
  replace(style.id, rename.old_slug, rename.new_slug), rename.new_id,
  replace(style.collection_id, rename.old_slug, rename.new_slug), style.name, style.description,
  replace(style.image_src, concat(rename.old_slug, '_'), concat(rename.new_slug, '_')),
  replace(style.images_json, concat(rename.old_slug, '_'), concat(rename.new_slug, '_')),
  style.sort_order, style.created_at
from fashion_styles style
join house_renames rename on rename.old_id = style.label_id
on conflict (id) do update
set
  label_id = excluded.label_id,
  collection_id = excluded.collection_id,
  name = excluded.name,
  description = excluded.description,
  image_src = excluded.image_src,
  images_json = excluded.images_json,
  sort_order = excluded.sort_order,
  created_at = excluded.created_at;

with house_renames(old_id, new_id, old_name, new_name, old_slug, new_slug) as (
  values
    ('label-kestrel-row', 'label-fernhollow', 'Kestrel Row', 'Fernhollow', 'kestrel-row', 'fernhollow'),
    ('label-rework-seven', 'label-thistlewick', 'Rework Seven', 'Thistlewick', 'rework-seven', 'thistlewick')
)
update looks
set
  user_id = rename.new_id,
  creator_name = case when looks.creator_name = rename.old_name then rename.new_name else looks.creator_name end,
  collection_id = replace(looks.collection_id, rename.old_slug, rename.new_slug),
  image_src = replace(looks.image_src, concat(rename.old_slug, '_'), concat(rename.new_slug, '_'))
from house_renames rename
where looks.user_id = rename.old_id;

with house_renames(old_id, new_id, new_name, new_handle) as (
  values
    ('label-kestrel-row', 'label-fernhollow', 'Fernhollow', 'fernhollow'),
    ('label-rework-seven', 'label-thistlewick', 'Thistlewick', 'thistlewick')
)
insert into profiles (user_id, display_name, handle)
select rename.new_id, rename.new_name, rename.new_handle
from profiles profile
join house_renames rename on rename.old_id = profile.user_id
on conflict (user_id) do update
set display_name = excluded.display_name, handle = excluded.handle;

with house_renames(old_id, new_id) as (
  values
    ('label-kestrel-row', 'label-fernhollow'),
    ('label-rework-seven', 'label-thistlewick')
)
update fashion_collections collection
set label_id = rename.new_id
from house_renames rename
where collection.label_id = rename.old_id
  and collection.id not like '%kestrel-row%'
  and collection.id not like '%rework-seven%';

delete from fashion_styles where label_id in ('label-kestrel-row', 'label-rework-seven');
delete from fashion_collections where label_id in ('label-kestrel-row', 'label-rework-seven');
delete from fashion_labels where id in ('label-kestrel-row', 'label-rework-seven');
delete from profiles where user_id in ('label-kestrel-row', 'label-rework-seven');
