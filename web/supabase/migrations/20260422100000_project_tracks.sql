-- Project tracks: first-class task buckets for integration and project management work.

create table public.project_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null
    constraint project_tracks_kind_check
    check (kind in ('integration', 'project_management')),
  name text not null,
  sort_order int not null default 0,
  integration_id uuid references public.integrations (id) on delete set null,
  project_integration_id uuid references public.project_integrations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_tracks_kind_shape_check check (
    (kind = 'integration' and integration_id is not null and project_integration_id is not null)
    or (kind = 'project_management' and integration_id is null and project_integration_id is null)
  )
);

create index project_tracks_project_id_idx
  on public.project_tracks (project_id);

create index project_tracks_project_sort_order_idx
  on public.project_tracks (project_id, sort_order);

create index project_tracks_integration_id_idx
  on public.project_tracks (integration_id)
  where integration_id is not null;

create unique index project_tracks_project_management_unique
  on public.project_tracks (project_id)
  where kind = 'project_management';

create unique index project_tracks_project_integration_unique
  on public.project_tracks (project_integration_id)
  where project_integration_id is not null;

alter table public.project_tracks enable row level security;

create policy "project_tracks_via_project"
  on public.project_tracks
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_tracks.project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_tracks.project_id
        and p.owner_id = auth.uid()
    )
  );

-- Backfill one integration track for each project integration.
insert into public.project_tracks (
  project_id,
  kind,
  name,
  sort_order,
  integration_id,
  project_integration_id
)
select
  pi.project_id,
  'integration',
  coalesce(nullif(trim(i.name), ''), 'Integration'),
  row_number() over (partition by pi.project_id order by pi.created_at, pi.id),
  pi.integration_id,
  pi.id
from public.project_integrations pi
join public.integrations i on i.id = pi.integration_id
on conflict do nothing;

-- Backfill one project-management track per project.
insert into public.project_tracks (
  project_id,
  kind,
  name,
  sort_order,
  integration_id,
  project_integration_id
)
select
  p.id,
  'project_management',
  'Project Management',
  0,
  null,
  null
from public.projects p
where not exists (
  select 1
  from public.project_tracks pt
  where pt.project_id = p.id
    and pt.kind = 'project_management'
);

-- Migrate integration_tasks ownership from project_integrations to project_tracks.
alter table public.integration_tasks
  add column project_track_id uuid references public.project_tracks (id) on delete cascade;

update public.integration_tasks it
set project_track_id = pt.id
from public.project_tracks pt
where pt.project_integration_id = it.project_integration_id;

alter table public.integration_tasks
  alter column project_track_id set not null;

create index integration_tasks_project_track_id_idx
  on public.integration_tasks (project_track_id);

drop policy if exists "integration_tasks_via_project" on public.integration_tasks;

create policy "integration_tasks_via_project_track"
  on public.integration_tasks
  for all
  using (
    exists (
      select 1
      from public.project_tracks pt
      join public.projects p on p.id = pt.project_id
      where pt.id = integration_tasks.project_track_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_tracks pt
      join public.projects p on p.id = pt.project_id
      where pt.id = integration_tasks.project_track_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "integration_task_work_sessions_via_project" on public.integration_task_work_sessions;

create policy "integration_task_work_sessions_via_project_track"
  on public.integration_task_work_sessions
  for all
  using (
    exists (
      select 1
      from public.integration_tasks it
      join public.project_tracks pt on pt.id = it.project_track_id
      join public.projects p on p.id = pt.project_id
      where it.id = integration_task_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.integration_tasks it
      join public.project_tracks pt on pt.id = it.project_track_id
      join public.projects p on p.id = pt.project_id
      where it.id = integration_task_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "integration_task_active_work_sessions_via_project" on public.integration_task_active_work_sessions;

create policy "integration_task_active_work_sessions_via_project_track"
  on public.integration_task_active_work_sessions
  for all
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.integration_tasks it
      join public.project_tracks pt on pt.id = it.project_track_id
      join public.projects p on p.id = pt.project_id
      where it.id = integration_task_active_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.integration_tasks it
      join public.project_tracks pt on pt.id = it.project_track_id
      join public.projects p on p.id = pt.project_id
      where it.id = integration_task_active_work_sessions.integration_task_id
        and p.owner_id = auth.uid()
    )
  );

drop index if exists integration_tasks_project_integration_id_idx;

alter table public.integration_tasks
  drop column project_integration_id;
