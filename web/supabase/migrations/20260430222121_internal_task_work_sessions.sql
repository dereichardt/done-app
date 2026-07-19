create table public.internal_task_work_sessions (
  id uuid primary key default gen_random_uuid(),
  internal_task_id uuid not null references public.internal_tasks (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_hours numeric not null check (duration_hours >= 0),
  work_accomplished text,
  created_at timestamptz not null default now()
);

create index internal_task_work_sessions_task_id_idx
  on public.internal_task_work_sessions (internal_task_id);

comment on table public.internal_task_work_sessions is 'Completed work-on-task sessions for internal tasks; mirrors integration_task_work_sessions.';

alter table public.internal_task_work_sessions enable row level security;

create policy "internal_task_work_sessions_via_task_track"
  on public.internal_task_work_sessions
  for all
  using (
    exists (
      select 1
      from public.internal_tasks it
      join public.internal_tracks t on t.id = it.internal_track_id
      where it.id = internal_task_work_sessions.internal_task_id
        and t.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.internal_tasks it
      join public.internal_initiatives i on i.id = it.internal_initiative_id
      where it.id = internal_task_work_sessions.internal_task_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_tasks it
      join public.internal_tracks t on t.id = it.internal_track_id
      where it.id = internal_task_work_sessions.internal_task_id
        and t.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.internal_tasks it
      join public.internal_initiatives i on i.id = it.internal_initiative_id
      where it.id = internal_task_work_sessions.internal_task_id
        and i.owner_id = auth.uid()
    )
  );