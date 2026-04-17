-- Integration type sort_order: Orchestrate, EIB, RaaS first; remaining names A–Z.
-- Keeps list queries consistent with the UI grouped dropdown.

update public.integration_types it
set sort_order = v.sort_order
from (
  values
    ('Orchestrate', 1),
    ('EIB', 2),
    ('RaaS', 3),
    ('API', 4),
    ('Configuration', 5),
    ('Connector (standalone)', 6),
    ('Connector + Document Transformation', 7),
    ('Connector + Orchestrate', 8),
    ('Connector + Studio', 9),
    ('Document Transformation', 10),
    ('EIB + Orchestrate', 11),
    ('EIB + Studio', 12),
    ('External', 13),
    ('Studio', 14)
) as v(name, sort_order)
where it.name = v.name;

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
    (new.id, 'RaaS', 3),
    (new.id, 'API', 4),
    (new.id, 'Configuration', 5),
    (new.id, 'Connector (standalone)', 6),
    (new.id, 'Connector + Document Transformation', 7),
    (new.id, 'Connector + Orchestrate', 8),
    (new.id, 'Connector + Studio', 9),
    (new.id, 'Document Transformation', 10),
    (new.id, 'EIB + Orchestrate', 11),
    (new.id, 'EIB + Studio', 12),
    (new.id, 'External', 13),
    (new.id, 'Studio', 14);

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
