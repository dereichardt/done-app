-- Internal work: fixed Admin/Development tracks, initiatives with date range, tasks + work sessions.

create table public.internal_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    constraint internal_tracks_kind_check
    check (kind in ('admin', 'development')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_tracks_owner_kind_unique unique (owner_id, kind)
);

create index internal_tracks_owner_id_idx on public.internal_tracks (owner_id);

alter table public.internal_tracks enable row level security;

create policy "internal_tracks_owner_all"
  on public.internal_tracks
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

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

create table public.internal_tasks (
  id uuid primary key default gen_random_uuid(),
  internal_track_id uuid references public.internal_tracks (id) on delete cascade,
  internal_initiative_id uuid references public.internal_initiatives (id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open'
    constraint internal_tasks_status_check
    check (status in ('open', 'done', 'cancelled')),
  priority text not null default 'medium'
    constraint internal_tasks_priority_check
    check (priority in ('low', 'medium', 'high')),
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_tasks_parent_xor_check check (
    (internal_track_id is not null)::int + (internal_initiative_id is not null)::int = 1
  )
);

create index internal_tasks_track_id_idx
  on public.internal_tasks (internal_track_id)
  where internal_track_id is not null;

create index internal_tasks_initiative_id_idx
  on public.internal_tasks (internal_initiative_id)
  where internal_initiative_id is not null;

alter table public.internal_tasks enable row level security;

create policy "internal_tasks_via_track"
  on public.internal_tasks
  for all
  using (
    exists (
      select 1
      from public.internal_tracks t
      where t.id = internal_tasks.internal_track_id
        and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_tracks t
      where t.id = internal_tasks.internal_track_id
        and t.owner_id = auth.uid()
    )
  );

create policy "internal_tasks_via_initiative"
  on public.internal_tasks
  for all
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = internal_tasks.internal_initiative_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = internal_tasks.internal_initiative_id
        and i.owner_id = auth.uid()
    )
  );

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
