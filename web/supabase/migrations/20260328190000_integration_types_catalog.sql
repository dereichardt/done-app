-- Integration type dropdown: Workday-style catalog (replaces legacy HCM seed names for new signups + backfill)

create or replace function public.seed_user_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_types (owner_id, name, sort_order) values
    (new.id, 'Launch Flex - Base', 1),
    (new.id, 'Launch Flex - Extended', 2),
    (new.id, 'Launch Flex - Tailored', 3),
    (new.id, 'Launch Express', 4);

  insert into public.project_roles (owner_id, name, sort_order) values
    (new.id, 'Lead', 1),
    (new.id, 'Architect', 2),
    (new.id, 'Builder', 3),
    (new.id, 'Advisor', 4);

  insert into public.integration_types (owner_id, name, sort_order) values
    (new.id, 'Orchestrate', 1),
    (new.id, 'EIB', 2),
    (new.id, 'EIB + Orchestrate', 3),
    (new.id, 'EIB + Studio', 4),
    (new.id, 'Studio', 5),
    (new.id, 'Document Transformation', 6),
    (new.id, 'API', 7),
    (new.id, 'RaaS', 8),
    (new.id, 'Connector (standalone)', 9),
    (new.id, 'Connector + Orchestrate', 10),
    (new.id, 'Connector + Studio', 11),
    (new.id, 'Connector + Document Transformation', 12),
    (new.id, 'Configuration', 13),
    (new.id, 'External', 14);

  insert into public.integration_domains (owner_id, name, sort_order) values
    (new.id, 'Human Capital Management', 1),
    (new.id, 'Payroll Services', 2),
    (new.id, 'Financial Management', 3),
    (new.id, 'Talent', 4);

  insert into public.functional_areas (owner_id, name, sort_order, domain_id) values
    (new.id, 'Core HCM', 1, (select id from public.integration_domains where owner_id = new.id and name = 'Human Capital Management' limit 1)),
    (new.id, 'Payroll', 2, (select id from public.integration_domains where owner_id = new.id and name = 'Payroll Services' limit 1)),
    (new.id, 'Time Tracking', 3, (select id from public.integration_domains where owner_id = new.id and name = 'Human Capital Management' limit 1)),
    (new.id, 'Benefits Administration', 4, (select id from public.integration_domains where owner_id = new.id and name = 'Human Capital Management' limit 1)),
    (new.id, 'Integrations Platform', 5, (select id from public.integration_domains where owner_id = new.id and name = 'Human Capital Management' limit 1));

  return new;
end;
$$;

-- Existing users: add new type rows (idempotent)
insert into public.integration_types (owner_id, name, sort_order)
select u.id, v.name, v.sort_order
from auth.users u
cross join (
  values
    ('Orchestrate', 1),
    ('EIB', 2),
    ('EIB + Orchestrate', 3),
    ('EIB + Studio', 4),
    ('Studio', 5),
    ('Document Transformation', 6),
    ('API', 7),
    ('RaaS', 8),
    ('Connector (standalone)', 9),
    ('Connector + Orchestrate', 10),
    ('Connector + Studio', 11),
    ('Connector + Document Transformation', 12),
    ('Configuration', 13),
    ('External', 14)
) as v(name, sort_order)
on conflict (owner_id, name) do nothing;

-- Remove legacy seed integration types only when nothing references them
delete from public.integration_type_task_templates t
using public.integration_types it
where t.integration_type_id = it.id
  and it.name in (
    'Payroll',
    'Benefits',
    'HCM Core',
    'Recruiting',
    'Financials',
    'Custom / Studio'
  );

delete from public.integration_types it
where it.name in (
  'Payroll',
  'Benefits',
  'HCM Core',
  'Recruiting',
  'Financials',
  'Custom / Studio'
)
  and not exists (select 1 from public.integrations i where i.integration_type_id = it.id);
