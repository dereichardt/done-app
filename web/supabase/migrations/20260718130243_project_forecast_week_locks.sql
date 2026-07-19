-- Project-wide weekly forecast locks. A lock preserves every forecast row for
-- the project/week, including an intentionally empty (zero-hour) week.

create table public.project_forecast_week_locks (
  project_id uuid not null references public.projects (id) on delete cascade,
  week_start_date date not null
    constraint project_forecast_week_locks_sunday_chk
    check (extract(dow from week_start_date) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, week_start_date)
);

create index project_forecast_week_locks_project_week_idx
  on public.project_forecast_week_locks (project_id, week_start_date);

alter table public.project_forecast_week_locks enable row level security;

create policy "project_forecast_week_locks_via_project"
  on public.project_forecast_week_locks
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_forecast_week_locks.project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_forecast_week_locks.project_id
        and p.owner_id = auth.uid()
    )
  );