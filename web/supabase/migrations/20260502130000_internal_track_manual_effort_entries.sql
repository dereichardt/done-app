-- Manual effort entries for internal Admin/Development tracks (Work calendar).

create table public.internal_track_manual_effort_entries (
  id uuid primary key default gen_random_uuid(),
  internal_track_id uuid not null references public.internal_tracks (id) on delete cascade,
  entry_type text not null check (entry_type in ('task', 'meeting')),
  title text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_hours numeric not null check (duration_hours >= 0),
  work_accomplished text,
  created_at timestamptz not null default now(),
  constraint internal_track_manual_effort_entries_finished_after_start check (finished_at > started_at),
  constraint internal_track_manual_effort_entries_quarter_hours check (
    abs(duration_hours - round(duration_hours * 4) / 4) < 1e-6
  )
);

create index internal_track_manual_effort_entries_track_started_at_idx
  on public.internal_track_manual_effort_entries (internal_track_id, started_at);

comment on table public.internal_track_manual_effort_entries is
  'Manual effort entries on internal Admin/Development tracks from the Work calendar.';

alter table public.internal_track_manual_effort_entries enable row level security;

create policy "internal_track_manual_effort_entries_via_track"
  on public.internal_track_manual_effort_entries
  for all
  using (
    exists (
      select 1
      from public.internal_tracks t
      where t.id = internal_track_manual_effort_entries.internal_track_id
        and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_tracks t
      where t.id = internal_track_manual_effort_entries.internal_track_id
        and t.owner_id = auth.uid()
    )
  );
