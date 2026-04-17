-- Tasks scoped to a project integration; templates by integration type (iteration 4–5)

create table public.integration_tasks (
  id uuid primary key default gen_random_uuid(),
  project_integration_id uuid not null references public.project_integrations (id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open'
    constraint integration_tasks_status_check
    check (status in ('open', 'done', 'cancelled')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integration_tasks_project_integration_id_idx
  on public.integration_tasks (project_integration_id);

alter table public.integration_tasks enable row level security;

create policy "integration_tasks_via_project"
  on public.integration_tasks
  for all
  using (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = integration_tasks.project_integration_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = integration_tasks.project_integration_id
        and p.owner_id = auth.uid()
    )
  );

-- Future: seed tasks from type — optional rows per owner + integration type
create table public.integration_type_task_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  integration_type_id uuid not null references public.integration_types (id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, integration_type_id, title)
);

create index integration_type_task_templates_owner_idx
  on public.integration_type_task_templates (owner_id);

create index integration_type_task_templates_type_idx
  on public.integration_type_task_templates (integration_type_id);

alter table public.integration_type_task_templates enable row level security;

create policy "integration_type_task_templates_owner_all"
  on public.integration_type_task_templates
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
