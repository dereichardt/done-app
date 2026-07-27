-- Add removed_from_scope to project_integrations.integration_state

alter table public.project_integrations
  drop constraint if exists project_integrations_integration_state_check;
alter table public.project_integrations
  add constraint project_integrations_integration_state_check
  check (integration_state in ('active', 'blocked', 'on_hold', 'completed', 'removed_from_scope'));
