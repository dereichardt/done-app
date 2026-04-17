-- Logged work sessions for integration tasks (Work on task → Finish)

create table public.integration_task_work_sessions (
  id uuid primary key default gen_random_uuid(),
  integration_task_id uuid not null references public.integration_tasks (id) on delete cascade,
  started_at timestamptz not null,
  duration_hours numeric not null check (duration_hours >= 0),
  work_accomplished text,
  created_at timestamptz not null default now()
);

create index integration_task_work_sessions_task_id_idx
  on public.integration_task_work_sessions (integration_task_id);

comment on table public.integration_task_work_sessions is 'Completed work-on-task sessions; duration_hours uses 15-minute band rounding.';

alter table public.integration_task_work_sessions enable row level security;

create policy "integration_task_work_sessions_via_project"
  on public.integration_task_work_sessions
  for all
  using (
    exists (
      select 1
      from public.integration_tasks it
      join public.project_integrations pi on pi.id = it.project_integration_id
      join public.projects p on p.id = pi.project_id
      where it.id = integration_task_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.integration_tasks it
      join public.project_integrations pi on pi.id = it.project_integration_id
      join public.projects p on p.id = pi.project_id
      where it.id = integration_task_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  );
