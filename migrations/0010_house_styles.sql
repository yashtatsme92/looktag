-- House covers, websites, and Styles (photos) under Lines.
-- A Line is a fashion_collections row. Styles never carry a price.

alter table fashion_labels add column if not exists website text not null default '';
alter table fashion_labels add column if not exists cover_src text not null default '';

create table if not exists fashion_styles (
  id            text primary key,
  label_id      text not null references fashion_labels(id) on delete cascade,
  collection_id text not null references fashion_collections(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  image_src     text not null default '',
  images_json   text not null default '[]',
  sort_order    integer not null default 0,
  created_at    bigint not null
);

create index if not exists fashion_styles_collection_idx
  on fashion_styles (collection_id, sort_order);

create index if not exists fashion_styles_label_idx
  on fashion_styles (label_id);
