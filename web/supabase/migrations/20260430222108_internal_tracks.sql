create table public.internal_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    constraint internal_tracks_kind_check
    check (kind in ('admin', 'development')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_tracks_owner_kind_unique unique (owner_id, kind)
);

create index internal_tracks_owner_id_idx on public.internal_tracks (owner_id);

alter table public.internal_tracks enable row level security;

create policy "internal_tracks_owner_all"
  on public.internal_tracks
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);