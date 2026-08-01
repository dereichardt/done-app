-- Quarterly utilization targets: one target hours value per fiscal quarter per user.

create table public.utilization_quarter_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  quarter_start_date date not null,
  fiscal_year integer not null,
  quarter integer not null,
  target_hours numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint utilization_quarter_targets_quarter_check
    check (quarter between 1 and 4),
  constraint utilization_quarter_targets_hours_check
    check (target_hours >= 0),
  constraint utilization_quarter_targets_owner_quarter_unique
    unique (owner_id, quarter_start_date)
);

comment on table public.utilization_quarter_targets is
  'User-entered target utilization hours for a fiscal quarter (keyed by quarter start date).';

create index utilization_quarter_targets_owner_fy_idx
  on public.utilization_quarter_targets (owner_id, fiscal_year desc, quarter desc);

alter table public.utilization_quarter_targets enable row level security;

create policy "utilization_quarter_targets_owner"
  on public.utilization_quarter_targets
  for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
