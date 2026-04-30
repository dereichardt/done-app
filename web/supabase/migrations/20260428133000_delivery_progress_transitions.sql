-- Track delivery progress transitions so UI can show completion/skipped timestamps per step.

create table public.delivery_progress_transitions (
  id uuid primary key default gen_random_uuid(),
  project_integration_id uuid not null references public.project_integrations (id) on delete cascade,
  from_delivery_progress text not null,
  to_delivery_progress text not null,
  created_at timestamptz not null default now(),
  constraint delivery_progress_transitions_from_check check (
    from_delivery_progress in (
      'not_started',
      'gathering_requirements',
      'in_development',
      'in_unit_testing',
      'in_fit_and_format_testing',
      'ready_for_e2e_testing',
      'in_e2e_testing',
      'ready_for_production',
      'in_production_cutover',
      'in_hypercare',
      'delivered'
    )
  ),
  constraint delivery_progress_transitions_to_check check (
    to_delivery_progress in (
      'not_started',
      'gathering_requirements',
      'in_development',
      'in_unit_testing',
      'in_fit_and_format_testing',
      'ready_for_e2e_testing',
      'in_e2e_testing',
      'ready_for_production',
      'in_production_cutover',
      'in_hypercare',
      'delivered'
    )
  )
);

create index delivery_progress_transitions_project_integration_created_idx
  on public.delivery_progress_transitions (project_integration_id, created_at desc);

alter table public.delivery_progress_transitions enable row level security;

create policy "delivery_progress_transitions_via_project"
  on public.delivery_progress_transitions
  for all
  using (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = delivery_progress_transitions.project_integration_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_integrations pi
      join public.projects p on p.id = pi.project_id
      where pi.id = delivery_progress_transitions.project_integration_id
        and p.owner_id = auth.uid()
    )
  );
