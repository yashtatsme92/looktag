-- House applications need an owner and an approval state.
-- Seeded houses stay approved. New registrations start pending.

alter table fashion_labels
  add column if not exists status text not null default 'approved';

alter table fashion_labels
  add column if not exists owner_user_id text;

update fashion_labels
  set status = 'approved'
  where status is null or status = '';

create index if not exists fashion_labels_status_idx
  on fashion_labels (status);

create index if not exists fashion_labels_owner_idx
  on fashion_labels (owner_user_id);
