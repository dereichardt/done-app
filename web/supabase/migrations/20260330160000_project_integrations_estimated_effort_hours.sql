-- Estimated effort (hours) for a project integration; actuals come from integration_task_work_sessions.

alter table public.project_integrations
  add column estimated_effort_hours numeric
    null
    constraint project_integrations_estimated_effort_hours_check
    check (estimated_effort_hours is null or estimated_effort_hours >= 0);

comment on column public.project_integrations.estimated_effort_hours is
  'User estimate for this project integration (hours); compare to sum of task work session duration_hours.';
