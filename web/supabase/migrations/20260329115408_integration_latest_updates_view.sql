-- Latest integration_updates row per project_integration_id (efficient project list reads).
create or replace view public.integration_latest_updates
with (security_invoker = true) as
select distinct on (project_integration_id)
  project_integration_id,
  body,
  created_at
from public.integration_updates
order by project_integration_id, created_at desc;

comment on view public.integration_latest_updates is
  'Latest integration_updates row per project_integration_id (by created_at).';

grant select on public.integration_latest_updates to authenticated;
