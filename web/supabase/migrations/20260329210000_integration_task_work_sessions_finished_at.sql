-- Wall-clock end time for each saved work session

alter table public.integration_task_work_sessions
  add column if not exists finished_at timestamptz;

update public.integration_task_work_sessions
  set finished_at = created_at
  where finished_at is null;

alter table public.integration_task_work_sessions
  alter column finished_at set not null;

comment on column public.integration_task_work_sessions.finished_at is 'When the user completed the session (Save); duration_hours excludes paused time.';
