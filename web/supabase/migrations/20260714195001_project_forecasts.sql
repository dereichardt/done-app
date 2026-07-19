-- Per-project forecast header + weekly hours by integration / PM row.

create table public.project_forecasts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  start_date date not null,
  pm_percent smallint not null default 5
    constraint project_forecasts_pm_percent_chk
    check (pm_percent >= 0 and pm_percent <= 100 and pm_percent % 5 = 0),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_forecasts_project_id_unique unique (project_id)
);

create index project_forecasts_project_id_idx
  on public.project_forecasts (project_id);

alter table public.project_forecasts enable row level security;

create policy "project_forecasts_via_project"
  on public.project_forecasts
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_forecasts.project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_forecasts.project_id
        and p.owner_id = auth.uid()
    )
  );

create table public.project_forecast_hours (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  row_key text not null,
  week_start_date date not null,
  hours integer not null
    constraint project_forecast_hours_hours_chk check (hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_forecast_hours_unique unique (project_id, row_key, week_start_date)
);

create index project_forecast_hours_project_id_idx
  on public.project_forecast_hours (project_id);

create index project_forecast_hours_project_week_idx
  on public.project_forecast_hours (project_id, week_start_date);

alter table public.project_forecast_hours enable row level security;

create policy "project_forecast_hours_via_project"
  on public.project_forecast_hours
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_forecast_hours.project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_forecast_hours.project_id
        and p.owner_id = auth.uid()
    )
  );
