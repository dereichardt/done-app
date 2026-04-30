-- Add milestone delivery states between test phases and production.

alter table public.project_integrations
  drop constraint if exists project_integrations_delivery_progress_check;

alter table public.project_integrations
  add constraint project_integrations_delivery_progress_check
  check (delivery_progress in (
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
  ));
