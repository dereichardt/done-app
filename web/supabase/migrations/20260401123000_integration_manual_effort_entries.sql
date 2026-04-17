-- Manual effort entries (Task/Meeting) logged directly on the effort calendar

create table if not exists public.integration_manual_effort_entries (
  id uuid primary key default gen_random_uuid(),
  project_integration_id uuid not null references public.project_integrations (id) on delete cascade,
  entry_type text not null check (entry_type in ('task','meeting')),
  title text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_hours numeric not null check (duration_hours >= 0),
  work_accomplished text,
  created_at timestamptz not null default now(),
  constraint integration_manual_effort_entries_finished_after_start check (finished_at > started_at),
  constraint integration_manual_effort_entries_quarter_hours check (abs(duration_hours - round(duration_hours * 4) / 4) < 1e-6)
);

create index if not exists integration_manual_effort_entries_pi_started_at_idx
  on public.integration_manual_effort_entries (project_integration_id, started_at);

comment on table public.integration_manual_effort_entries is 'Manual effort entries created from the Effort calendar (Task/Meeting). Does not impact integration_tasks.';
comment on column public.integration_manual_effort_entries.entry_type is 'Either task or meeting.';
comment on column public.integration_manual_effort_entries.duration_hours is 'Quarter-hour increments (15-minute bands).';

alter table public.integration_manual_effort_entries enable row level security;

create policy "integration_manual_effort_entries_via_project"
  on public.integration_manual_effort_entries
  for all
  using (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = integration_manual_effort_entries.project_integration_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = integration_manual_effort_entries.project_integration_id
        and p.owner_id = auth.uid()
    )
  );

