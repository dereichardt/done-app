-- Normalize empty integration codes; allow duplicate names per owner; tighten code uniqueness

-- Empty string is NOT NULL — it violated partial unique index when users left code blank twice
update public.integrations
set integration_code = null
where integration_code is not null and length(trim(integration_code)) = 0;

drop index if exists integrations_owner_integration_code_key;

create unique index integrations_owner_integration_code_key
  on public.integrations (owner_id, integration_code)
  where integration_code is not null and length(trim(integration_code)) > 0;

-- Multiple catalog rows may share the same display name (uniqueness is by id / optional code)
alter table public.integrations drop constraint if exists integrations_owner_id_name_key;
