-- Checklist-style subtasks on project and internal tasks.

create table public.integration_task_subtasks (
  id uuid primary key default gen_random_uuid(),
  integration_task_id uuid not null references public.integration_tasks (id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index integration_task_subtasks_parent_sort_idx
  on public.integration_task_subtasks (integration_task_id, sort_order);

alter table public.integration_task_subtasks enable row level security;

create policy "integration_task_subtasks_via_parent"
  on public.integration_task_subtasks
  for all
  using (
    exists (
      select 1
      from public.integration_tasks it
      join public.project_tracks pt on pt.id = it.project_track_id
      join public.projects p on p.id = pt.project_id
      where it.id = integration_task_subtasks.integration_task_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.integration_tasks it
      join public.project_tracks pt on pt.id = it.project_track_id
      join public.projects p on p.id = pt.project_id
      where it.id = integration_task_subtasks.integration_task_id
        and p.owner_id = auth.uid()
    )
  );

create table public.internal_task_subtasks (
  id uuid primary key default gen_random_uuid(),
  internal_task_id uuid not null references public.internal_tasks (id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index internal_task_subtasks_parent_sort_idx
  on public.internal_task_subtasks (internal_task_id, sort_order);

alter table public.internal_task_subtasks enable row level security;

create policy "internal_task_subtasks_via_track"
  on public.internal_task_subtasks
  for all
  using (
    exists (
      select 1
      from public.internal_tasks t
      join public.internal_tracks tr on tr.id = t.internal_track_id
      where t.id = internal_task_subtasks.internal_task_id
        and tr.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_tasks t
      join public.internal_tracks tr on tr.id = t.internal_track_id
      where t.id = internal_task_subtasks.internal_task_id
        and tr.owner_id = auth.uid()
    )
  );

create policy "internal_task_subtasks_via_initiative"
  on public.internal_task_subtasks
  for all
  using (
    exists (
      select 1
      from public.internal_tasks t
      join public.internal_initiatives i on i.id = t.internal_initiative_id
      where t.id = internal_task_subtasks.internal_task_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_tasks t
      join public.internal_initiatives i on i.id = t.internal_initiative_id
      where t.id = internal_task_subtasks.internal_task_id
        and i.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.integration_task_subtasks to authenticated;
grant select, insert, update, delete on table public.internal_task_subtasks to authenticated;
