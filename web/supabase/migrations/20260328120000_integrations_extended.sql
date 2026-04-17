-- Integration catalog fields, lookups, project overlay, catalog visibility (iteration 1–2)

-- Lookups (same pattern as project_types / project_roles)
create table public.integration_types (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index integration_types_owner_id_idx on public.integration_types (owner_id);

create table public.functional_areas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index functional_areas_owner_id_idx on public.functional_areas (owner_id);

create table public.integration_domains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index integration_domains_owner_id_idx on public.integration_domains (owner_id);

-- Catalog row extensions
alter table public.integrations
  add column integration_code text,
  add column direction text not null default 'bidirectional'
    constraint integrations_direction_check
    check (direction in ('inbound', 'outbound', 'bidirectional')),
  add column integration_type_id uuid references public.integration_types (id) on delete set null,
  add column functional_area_id uuid references public.functional_areas (id) on delete set null,
  add column domain_id uuid references public.integration_domains (id) on delete set null,
  add column catalog_visibility text not null default 'catalog'
    constraint integrations_catalog_visibility_check
    check (catalog_visibility in ('catalog', 'project_only'));

create unique index integrations_owner_integration_code_key
  on public.integrations (owner_id, integration_code)
  where integration_code is not null;

-- Project link overlay
alter table public.project_integrations
  add column status text not null default 'not_started'
    constraint project_integrations_status_check
    check (
      status in (
        'not_started',
        'in_progress',
        'blocked',
        'on_hold',
        'done'
      )
    ),
  add column progress smallint not null default 0
    constraint project_integrations_progress_check
    check (progress >= 0 and progress <= 100);

-- RLS: lookups
alter table public.integration_types enable row level security;
alter table public.functional_areas enable row level security;
alter table public.integration_domains enable row level security;

create policy "integration_types_owner_all"
  on public.integration_types
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "functional_areas_owner_all"
  on public.functional_areas
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "integration_domains_owner_all"
  on public.integration_domains
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Seed integration lookups for new users
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

  insert into public.integration_types (owner_id, name, sort_order) values
    (new.id, 'Payroll', 1),
    (new.id, 'Benefits', 2),
    (new.id, 'HCM Core', 3),
    (new.id, 'Recruiting', 4),
    (new.id, 'Financials', 5),
    (new.id, 'Custom / Studio', 6);

  insert into public.functional_areas (owner_id, name, sort_order) values
    (new.id, 'Core HCM', 1),
    (new.id, 'Payroll', 2),
    (new.id, 'Time Tracking', 3),
    (new.id, 'Benefits Administration', 4),
    (new.id, 'Integrations Platform', 5);

  insert into public.integration_domains (owner_id, name, sort_order) values
    (new.id, 'Human Capital Management', 1),
    (new.id, 'Payroll Services', 2),
    (new.id, 'Financial Management', 3),
    (new.id, 'Talent', 4);

  return new;
end;
$$;
