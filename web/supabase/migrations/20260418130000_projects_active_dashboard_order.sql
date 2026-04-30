-- Active-engagement sort position; null for completed rows.
-- Backfilled in created_at desc order (matching the previous implicit order).

alter table public.projects
  add column if not exists active_dashboard_order integer null;

comment on column public.projects.active_dashboard_order
  is 'Owner-defined list position for the active-engagements dashboard; null for completed projects.';

-- Backfill: assign 0..n-1 per owner, created_at desc, active projects only.
with ranked as (
  select
    id,
    row_number() over (
      partition by owner_id
      order by created_at desc
    ) - 1 as pos
  from public.projects
  where completed_at is null
)
update public.projects p
set active_dashboard_order = ranked.pos
from ranked
where p.id = ranked.id;
