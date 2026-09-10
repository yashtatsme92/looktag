-- Named collections under fashion houses. Looks may belong to one collection.
-- Houses remain the parent; collections are the lookbook grouping (Summer Blues, Kinkistyles).

create table if not exists fashion_collections (
  id          text primary key,
  label_id    text not null references fashion_labels(id) on delete cascade,
  name        text not null,
  slug        text not null,
  caption     text not null default '',
  season      text not null default '',
  moods_json  text not null default '[]',
  sort_order  integer not null default 0,
  created_at  bigint not null
);

create unique index if not exists fashion_collections_label_slug_idx
  on fashion_collections (label_id, slug);

create index if not exists fashion_collections_label_sort_idx
  on fashion_collections (label_id, sort_order);

alter table looks add column if not exists collection_id text;

create index if not exists looks_collection_id_idx on looks (collection_id);
