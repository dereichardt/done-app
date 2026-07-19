-- AI-generated activity summaries for a project over a user-specified time window.
-- Summaries auto-expire after 30 days; read queries filter on expires_at and a
-- pg_cron job hard-deletes expired rows nightly (cleanup is best-effort).

create table public.project_summaries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  range_start timestamptz not null,
  range_end   timestamptz not null,
  -- '7d' | '30d' | 'since_last_summary' | null (custom range)
  range_preset text,
  -- Qualified model identifier, e.g. 'openai:gpt-4o-mini'. Kept as free text so we
  -- can swap providers later without a migration.
  model text not null,
  event_count integer not null check (event_count >= 0),
  body text not null,
  generated_at timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '30 days'),
  constraint project_summaries_range_ck check (range_end > range_start)
);

comment on table public.project_summaries is
  'AI-generated activity summaries per project and time window. Rows auto-expire after 30 days (read-time filter + nightly pg_cron cleanup).';

create index project_summaries_project_generated_idx
  on public.project_summaries (project_id, generated_at desc);

create index project_summaries_expires_idx
  on public.project_summaries (expires_at);

alter table public.project_summaries enable row level security;

create policy "project_summaries_owner"
  on public.project_summaries
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Nightly cleanup of expired summaries. Guarded so the migration still applies
-- on environments where pg_cron is not available (e.g. a fresh local dev DB).
-- On Supabase hosted projects, pg_cron is preinstalled; enable it via the
-- dashboard (Database → Extensions → pg_cron) if not already on.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'project-summaries-expire-cleanup',
      '17 3 * * *',
      $cron$ delete from public.project_summaries where expires_at <= now() $cron$
    );
  end if;
end
$$;
