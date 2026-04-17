-- In-progress work-on-task timers: one row per user while a session is active.

create table public.integration_task_active_work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  integration_task_id uuid not null references public.integration_tasks (id) on delete cascade,
  started_at timestamptz not null,
  paused_ms_accumulated bigint not null default 0,
  pause_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index integration_task_active_work_sessions_user_id_key
  on public.integration_task_active_work_sessions (user_id);

create index integration_task_active_work_sessions_task_id_idx
  on public.integration_task_active_work_sessions (integration_task_id);

comment on table public.integration_task_active_work_sessions is 'In-progress work-on-task timer state per user; at most one row per user while a timer is active.';

alter table public.integration_task_active_work_sessions enable row level security;

create policy "integration_task_active_work_sessions_via_project"
  on public.integration_task_active_work_sessions
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.integration_tasks it
      join public.project_integrations pi on pi.id = it.project_integration_id
      join public.projects p on p.id = pi.project_id
      where it.id = integration_task_active_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.integration_tasks it
      join public.project_integrations pi on pi.id = it.project_integration_id
      join public.projects p on p.id = pi.project_id
      where it.id = integration_task_active_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  );
