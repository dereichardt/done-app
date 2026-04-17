-- Direction is optional (unset) like other integration lookups

alter table public.integrations drop constraint if exists integrations_direction_check;

alter table public.integrations alter column direction drop default;

alter table public.integrations alter column direction drop not null;

alter table public.integrations
  add constraint integrations_direction_check
  check (
    direction is null
    or direction in ('inbound', 'outbound', 'bidirectional')
  );
