-- Delivery progress + integration state (active / blocked / on hold) on project_integrations;
-- replace legacy status + progress. Integration updates as child rows.

-- 1) New columns (nullable for backfill)
alter table public.project_integrations
  add column delivery_progress text,
  add column integration_state text,
  add column integration_state_reason text;

-- 2) Backfill from legacy status
-- integration_state: blocked/on_hold preserved; everything else -> active
-- delivery_progress: map workflow; blocked/on_hold rows get not_started for delivery
update public.project_integrations
set
  integration_state = case status
    when 'blocked' then 'blocked'
    when 'on_hold' then 'on_hold'
    else 'active'
  end,
  delivery_progress = case status
    when 'not_started' then 'not_started'
    when 'in_progress' then 'in_development'
    when 'done' then 'in_hypercare'
    when 'blocked' then 'not_started'
    when 'on_hold' then 'not_started'
    else 'not_started'
  end;

alter table public.project_integrations
  alter column delivery_progress set not null,
  alter column delivery_progress set default 'not_started',
  alter column integration_state set not null,
  alter column integration_state set default 'active';

alter table public.project_integrations
  add constraint project_integrations_delivery_progress_check
  check (
    delivery_progress in (
      'not_started',
      'gathering_requirements',
      'in_development',
      'in_unit_testing',
      'in_fit_and_format_testing',
      'in_e2e_testing',
      'in_production_cutover',
      'in_hypercare'
    )
  ),
  add constraint project_integrations_integration_state_check
  check (integration_state in ('active', 'blocked', 'on_hold'));

-- 3) Drop legacy columns
alter table public.project_integrations drop constraint project_integrations_status_check;
alter table public.project_integrations drop constraint project_integrations_progress_check;
alter table public.project_integrations drop column status;
alter table public.project_integrations drop column progress;

-- 4) Integration updates (concise log entries per project integration)
create table public.integration_updates (
  id uuid primary key default gen_random_uuid(),
  project_integration_id uuid not null references public.project_integrations (id) on delete cascade,
  body text not null
    constraint integration_updates_body_len_check
    check (char_length(body) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integration_updates_project_integration_created_idx
  on public.integration_updates (project_integration_id, created_at desc);

alter table public.integration_updates enable row level security;

create policy "integration_updates_via_project"
  on public.integration_updates
  for all
  using (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = integration_updates.project_integration_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = integration_updates.project_integration_id
        and p.owner_id = auth.uid()
    )
  );
