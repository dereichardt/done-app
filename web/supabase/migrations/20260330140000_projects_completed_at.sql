-- Engagement completion (UI lists active vs completed); completion action to be wired later.
alter table public.projects
  add column if not exists completed_at timestamptz null;

comment on column public.projects.completed_at is 'When the engagement was marked complete; null while active.';
