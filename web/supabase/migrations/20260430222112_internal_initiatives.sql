create table public.internal_initiatives (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_initiatives_dates_check check (starts_on <= ends_on)
);

create index internal_initiatives_owner_id_idx on public.internal_initiatives (owner_id);

alter table public.internal_initiatives enable row level security;

create policy "internal_initiatives_owner_all"
  on public.internal_initiatives
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);