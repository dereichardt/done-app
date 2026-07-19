-- Lookup defaults belong to database lifecycle, not ordinary page rendering.
-- Backfill the only catalog families that were historically signup-only.

insert into public.project_types (owner_id, name, sort_order)
select users.id, defaults.name, defaults.sort_order
from auth.users as users
cross join (
  values
    ('Launch Flex - Base', 1),
    ('Launch Flex - Extended', 2),
    ('Launch Flex - Tailored', 3),
    ('Launch Express', 4)
) as defaults(name, sort_order)
on conflict (owner_id, name) do nothing;

insert into public.project_roles (owner_id, name, sort_order)
select users.id, defaults.name, defaults.sort_order
from auth.users as users
cross join (
  values
    ('Lead', 1),
    ('Architect', 2),
    ('Builder', 3),
    ('Advisor', 4)
) as defaults(name, sort_order)
on conflict (owner_id, name) do nothing;

-- The trigger body already uses fully qualified relation names.
alter function public.seed_user_defaults() set search_path = '';
