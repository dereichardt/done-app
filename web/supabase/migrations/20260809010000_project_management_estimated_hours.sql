alter table public.projects
  add column if not exists project_management_estimated_hours numeric;

alter table public.projects
  drop constraint if exists projects_project_management_estimated_hours_check;

alter table public.projects
  add constraint projects_project_management_estimated_hours_check
  check (
    project_management_estimated_hours is null
    or project_management_estimated_hours >= 0
  );
