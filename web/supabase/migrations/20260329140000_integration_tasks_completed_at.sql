-- Track when an integration task was marked done (for "Completed on" in the UI).

alter table public.integration_tasks
  add column completed_at timestamptz null;

comment on column public.integration_tasks.completed_at is 'Set when status becomes done; cleared when reopened.';

-- Reasonable display date for tasks already marked done before this column existed.
update public.integration_tasks
set completed_at = updated_at
where status = 'done'
  and completed_at is null;
