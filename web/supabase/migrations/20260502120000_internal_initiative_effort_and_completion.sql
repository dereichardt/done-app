-- Initiative estimated effort, completion, and manual effort entries (mirror integration pattern).

alter table public.internal_initiatives
  add column estimated_effort_hours numeric
    null
    constraint internal_initiatives_estimated_effort_hours_check
    check (estimated_effort_hours is null or estimated_effort_hours >= 0);

comment on column public.internal_initiatives.estimated_effort_hours is
  'User estimate for this initiative (hours); compare to task work sessions and manual effort entries.';

alter table public.internal_initiatives
  add column completed_at timestamptz null;

comment on column public.internal_initiatives.completed_at is
  'When the initiative was marked completed; null while active.';

create table public.internal_initiative_manual_effort_entries (
  id uuid primary key default gen_random_uuid(),
  internal_initiative_id uuid not null references public.internal_initiatives (id) on delete cascade,
  entry_type text not null check (entry_type in ('task', 'meeting')),
  title text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_hours numeric not null check (duration_hours >= 0),
  work_accomplished text,
  created_at timestamptz not null default now(),
  constraint internal_initiative_manual_effort_entries_finished_after_start check (finished_at > started_at),
  constraint internal_initiative_manual_effort_entries_quarter_hours check (
    abs(duration_hours - round(duration_hours * 4) / 4) < 1e-6
  )
);

create index internal_initiative_manual_effort_entries_ini_started_at_idx
  on public.internal_initiative_manual_effort_entries (internal_initiative_id, started_at);

comment on table public.internal_initiative_manual_effort_entries is
  'Manual effort entries on an internal initiative (Tasks/Work calendar). Does not impact internal_tasks.';

alter table public.internal_initiative_manual_effort_entries enable row level security;

create policy "internal_initiative_manual_effort_entries_via_initiative"
  on public.internal_initiative_manual_effort_entries
  for all
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = internal_initiative_manual_effort_entries.internal_initiative_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = internal_initiative_manual_effort_entries.internal_initiative_id
        and i.owner_id = auth.uid()
    )
  );
