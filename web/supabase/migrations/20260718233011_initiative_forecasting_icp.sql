alter table public.internal_initiatives
  add column include_in_forecast boolean not null default false,
  add column icp boolean not null default false;

create table public.initiative_forecasts (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.internal_initiatives (id) on delete cascade,
  start_date date not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint initiative_forecasts_initiative_id_unique unique (initiative_id)
);

alter table public.initiative_forecasts enable row level security;

create policy "initiative_forecasts_via_initiative"
  on public.initiative_forecasts
  for all
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecasts.initiative_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecasts.initiative_id
        and i.owner_id = auth.uid()
    )
  );

create table public.initiative_forecast_hours (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.internal_initiatives (id) on delete cascade,
  week_start_date date not null,
  hours integer not null
    constraint initiative_forecast_hours_hours_chk check (hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint initiative_forecast_hours_unique unique (initiative_id, week_start_date)
);

alter table public.initiative_forecast_hours enable row level security;

create policy "initiative_forecast_hours_via_initiative"
  on public.initiative_forecast_hours
  for all
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_hours.initiative_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_hours.initiative_id
        and i.owner_id = auth.uid()
    )
  );

create table public.initiative_forecast_week_locks (
  initiative_id uuid not null references public.internal_initiatives (id) on delete cascade,
  week_start_date date not null
    constraint initiative_forecast_week_locks_sunday_chk
    check (extract(dow from week_start_date) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (initiative_id, week_start_date)
);

create index initiative_forecast_week_locks_week_idx
  on public.initiative_forecast_week_locks (week_start_date);

alter table public.initiative_forecast_week_locks enable row level security;

create policy "initiative_forecast_week_locks_via_initiative"
  on public.initiative_forecast_week_locks
  for all
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_week_locks.initiative_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_week_locks.initiative_id
        and i.owner_id = auth.uid()
    )
  );