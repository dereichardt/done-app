insert into public.integration_domains (owner_id, name, sort_order)
select u.id, v.name, v.sort_order
from auth.users u
cross join (
  values
    ('FIN', 1),
    ('HCM', 2),
    ('PAY', 3),
    ('SCM', 4)
) as v(name, sort_order)
on conflict (owner_id, name) do nothing;