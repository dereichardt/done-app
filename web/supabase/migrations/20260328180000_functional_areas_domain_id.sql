-- Each functional area maps to an integration domain; integrations.domain_id is derived from the selected area

alter table public.functional_areas
  add column domain_id uuid references public.integration_domains (id) on delete set null;

create index functional_areas_domain_id_idx on public.functional_areas (domain_id);

-- Backfill seeded area names to domains (custom areas stay null until edited)
update public.functional_areas fa
set domain_id = d.id
from public.integration_domains d
where fa.owner_id = d.owner_id
  and (
    (fa.name = 'Core HCM' and d.name = 'Human Capital Management')
    or (fa.name = 'Payroll' and d.name = 'Payroll Services')
    or (fa.name = 'Time Tracking' and d.name = 'Human Capital Management')
    or (fa.name = 'Benefits Administration' and d.name = 'Human Capital Management')
    or (fa.name = 'Integrations Platform' and d.name = 'Human Capital Management')
  );

-- Seed: domains before functional areas; areas reference domain rows
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
    (new.id, 'Payroll', 1),
    (new.id, 'Benefits', 2),
    (new.id, 'HCM Core', 3),
    (new.id, 'Recruiting', 4),
    (new.id, 'Financials', 5),
    (new.id, 'Custom / Studio', 6);

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
