create table public.internal_task_active_work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  internal_task_id uuid not null references public.internal_tasks (id) on delete cascade,
  started_at timestamptz not null,
  paused_ms_accumulated bigint not null default 0,
  pause_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index internal_task_active_work_sessions_user_id_key
  on public.internal_task_active_work_sessions (user_id);

create index internal_task_active_work_sessions_task_id_idx
  on public.internal_task_active_work_sessions (internal_task_id);

comment on table public.internal_task_active_work_sessions is 'In-progress timer for internal tasks; at most one row per user (mutually exclusive with integration active session enforced in app).';

alter table public.internal_task_active_work_sessions enable row level security;

create policy "internal_task_active_work_sessions_owner"
  on public.internal_task_active_work_sessions
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.internal_tasks it
      join public.internal_tracks t on t.id = it.internal_track_id
      where it.id = internal_task_active_work_sessions.internal_task_id
        and t.owner_id = auth.uid()
    )
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.internal_tasks it
        join public.internal_initiatives i on i.id = it.internal_initiative_id
        where it.id = internal_task_active_work_sessions.internal_task_id
          and i.owner_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.internal_tasks it
      join public.internal_tracks t on t.id = it.internal_track_id
      where it.id = internal_task_active_work_sessions.internal_task_id
        and t.owner_id = auth.uid()
    )
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.internal_tasks it
        join public.internal_initiatives i on i.id = it.internal_initiative_id
        where it.id = internal_task_active_work_sessions.internal_task_id
          and i.owner_id = auth.uid()
      )
    )
  );