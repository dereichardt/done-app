-- Done: project types, roles, projects, phases, integrations, RLS, seed on signup

-- Lookup: project delivery types (user-editable per owner; seeded on signup)
create table public.project_types (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.project_roles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  customer_name text not null,
  project_type_id uuid references public.project_types (id) on delete set null,
  primary_role_id uuid references public.project_roles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);

create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order int not null,
  start_date date,
  end_date date,
  phase_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_phases_project_id_idx on public.project_phases (project_id);

-- Integration catalog (minimal; extend later)
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index integrations_owner_id_idx on public.integrations (owner_id);

create table public.project_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, integration_id)
);

create index project_integrations_project_id_idx on public.project_integrations (project_id);

-- Row level security
alter table public.project_types enable row level security;
alter table public.project_roles enable row level security;
alter table public.projects enable row level security;
alter table public.project_phases enable row level security;
alter table public.integrations enable row level security;
alter table public.project_integrations enable row level security;

-- Policies: single-user — rows scoped to auth.uid()
create policy "project_types_owner_all"
  on public.project_types
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "project_roles_owner_all"
  on public.project_roles
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "projects_owner_all"
  on public.projects
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "project_phases_via_project"
  on public.project_phases
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_phases.project_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_phases.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "integrations_owner_all"
  on public.integrations
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "project_integrations_owner"
  on public.project_integrations
  for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_integrations.project_id
        and p.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.integrations i
      where i.id = project_integrations.integration_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_integrations.project_id
        and p.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.integrations i
      where i.id = project_integrations.integration_id
        and i.owner_id = auth.uid()
    )
  );

-- Seed default lookups when a new auth user is created
create or replace function public.seed_user_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_types (owner_id, name, sort_order) values
    (new.id, 'Launch Flex - Base', 1),
    (new.id, 'Launch Flex - Extended', 2),
    (new.id, 'Launch Flex - Tailored', 3),
    (new.id, 'Launch Express', 4);

  insert into public.project_roles (owner_id, name, sort_order) values
    (new.id, 'Lead', 1),
    (new.id, 'Architect', 2),
    (new.id, 'Builder', 3),
    (new.id, 'Advisor', 4);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.seed_user_defaults();
</think>
Fixing a typo in the migration file.

<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace