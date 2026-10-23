create table if not exists contact_merges (
  id text primary key,
  keep_id text not null,
  drop_id text not null,
  drop_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create index if not exists contact_merges_keep_idx on contact_merges (keep_id, created_at desc);
