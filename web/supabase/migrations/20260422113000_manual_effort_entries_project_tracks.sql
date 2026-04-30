-- Support manual effort entries on both integration and project-management tracks.

alter table public.integration_manual_effort_entries
  add column if not exists project_track_id uuid references public.project_tracks (id) on delete cascade;

-- Backfill existing rows from integration ownership.
update public.integration_manual_effort_entries ime
set project_track_id = pt.id
from public.project_tracks pt
where ime.project_track_id is null
  and pt.kind = 'integration'
  and pt.project_integration_id = ime.project_integration_id;

alter table public.integration_manual_effort_entries
  alter column project_track_id set not null;

alter table public.integration_manual_effort_entries
  alter column project_integration_id drop not null;

create index if not exists integration_manual_effort_entries_project_track_started_at_idx
  on public.integration_manual_effort_entries (project_track_id, started_at);

drop policy if exists "integration_manual_effort_entries_via_project"
  on public.integration_manual_effort_entries;

create policy "integration_manual_effort_entries_via_project_track"
  on public.integration_manual_effort_entries
  for all
  using (
    exists (
      select 1
      from public.project_tracks pt
      join public.projects p on p.id = pt.project_id
      where pt.id = integration_manual_effort_entries.project_track_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.project_tracks pt
      join public.projects p on p.id = pt.project_id
      where pt.id = integration_manual_effort_entries.project_track_id
        and p.owner_id = auth.uid()
    )
  );

