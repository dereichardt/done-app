-- Priority for integration-scoped tasks
-- Default to "medium" for existing rows.

alter table public.integration_tasks
  add column priority text not null default 'medium';

alter table public.integration_tasks
  add constraint integration_tasks_priority_check
  check (priority in ('low', 'medium', 'high'));

