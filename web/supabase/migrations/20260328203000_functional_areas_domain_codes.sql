-- Workday-style domains (FIN, HCM, PAY, SCM) and expanded functional area catalog.
-- UI: domain-first drill-down; areas map 1:1 to domain for integrations.domain_id denorm.

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

update public.functional_areas
set name = 'Benefits'
where name = 'Benefits Administration';

update public.functional_areas fa
set
  domain_id = d.id,
  sort_order = m.sort_order
from public.integration_domains d
inner join (
  values
    ('Absence', 1, 'PAY'),
    ('Advanced Compensation', 2, 'HCM'),
    ('Banking & Settlement', 3, 'FIN'),
    ('Benefits', 4, 'HCM'),
    ('Budgets', 5, 'FIN'),
    ('Business Assets', 6, 'FIN'),
    ('Compensation', 7, 'HCM'),
    ('Core HCM', 8, 'HCM'),
    ('Customer Accounts', 9, 'FIN'),
    ('Customer Contracts', 10, 'FIN'),
    ('Expenses', 11, 'FIN'),
    ('FDM/Financial Accounting', 12, 'FIN'),
    ('Gifts', 13, 'FIN'),
    ('Grants', 14, 'FIN'),
    ('Inventory', 15, 'SCM'),
    ('Learning', 16, 'HCM'),
    ('Payroll', 17, 'PAY'),
    ('Peakon', 18, 'HCM'),
    ('Procurement', 19, 'SCM'),
    ('Projects', 20, 'FIN'),
    ('Recruiting', 21, 'HCM'),
    ('Strategic Sourcing', 22, 'SCM'),
    ('Supplier Accounts', 23, 'FIN'),
    ('Supplier Admin', 24, 'FIN'),
    ('Talent', 25, 'HCM'),
    ('Third Party Payroll', 26, 'HCM'),
    ('Time Tracking', 27, 'PAY'),
    ('Workday Help', 28, 'HCM'),
    ('Workday Journeys', 29, 'HCM')
) as m(area_name, sort_order, domain_code) on true
where fa.owner_id = d.owner_id
  and fa.name = m.area_name
  and d.name = m.domain_code;

insert into public.functional_areas (owner_id, name, sort_order, domain_id)
select u.id, v.name, v.sort_order, d.id
from auth.users u
cross join (
  values
    ('Absence', 1, 'PAY'),
    ('Advanced Compensation', 2, 'HCM'),
    ('Banking & Settlement', 3, 'FIN'),
    ('Benefits', 4, 'HCM'),
    ('Budgets', 5, 'FIN'),
    ('Business Assets', 6, 'FIN'),
    ('Compensation', 7, 'HCM'),
    ('Core HCM', 8, 'HCM'),
    ('Customer Accounts', 9, 'FIN'),
    ('Customer Contracts', 10, 'FIN'),
    ('Expenses', 11, 'FIN'),
    ('FDM/Financial Accounting', 12, 'FIN'),
    ('Gifts', 13, 'FIN'),
    ('Grants', 14, 'FIN'),
    ('Inventory', 15, 'SCM'),
    ('Learning', 16, 'HCM'),
    ('Payroll', 17, 'PAY'),
    ('Peakon', 18, 'HCM'),
    ('Procurement', 19, 'SCM'),
    ('Projects', 20, 'FIN'),
    ('Recruiting', 21, 'HCM'),
    ('Strategic Sourcing', 22, 'SCM'),
    ('Supplier Accounts', 23, 'FIN'),
    ('Supplier Admin', 24, 'FIN'),
    ('Talent', 25, 'HCM'),
    ('Third Party Payroll', 26, 'HCM'),
    ('Time Tracking', 27, 'PAY'),
    ('Workday Help', 28, 'HCM'),
    ('Workday Journeys', 29, 'HCM')
) as v(name, sort_order, domain_code)
join public.integration_domains d on d.owner_id = u.id and d.name = v.domain_code
where not exists (
  select 1
  from public.functional_areas fa
  where fa.owner_id = u.id and fa.name = v.name
);

update public.integrations i
set domain_id = fa.domain_id
from public.functional_areas fa
where i.functional_area_id = fa.id
  and i.owner_id = fa.owner_id;

update public.integration_domains
set is_active = false
where name in (
  'Human Capital Management',
  'Payroll Services',
  'Financial Management',
  'Talent'
);

update public.functional_areas
set is_active = false
where name = 'Integrations Platform';

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
    (new.id, 'FIN', 1),
    (new.id, 'HCM', 2),
    (new.id, 'PAY', 3),
    (new.id, 'SCM', 4);

  insert into public.functional_areas (owner_id, name, sort_order, domain_id) values
    (new.id, 'Absence', 1, (select id from public.integration_domains where owner_id = new.id and name = 'PAY' limit 1)),
    (new.id, 'Advanced Compensation', 2, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Banking & Settlement', 3, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Benefits', 4, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Budgets', 5, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Business Assets', 6, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Compensation', 7, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Core HCM', 8, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Customer Accounts', 9, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Customer Contracts', 10, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Expenses', 11, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'FDM/Financial Accounting', 12, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Gifts', 13, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Grants', 14, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Inventory', 15, (select id from public.integration_domains where owner_id = new.id and name = 'SCM' limit 1)),
    (new.id, 'Learning', 16, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Payroll', 17, (select id from public.integration_domains where owner_id = new.id and name = 'PAY' limit 1)),
    (new.id, 'Peakon', 18, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Procurement', 19, (select id from public.integration_domains where owner_id = new.id and name = 'SCM' limit 1)),
    (new.id, 'Projects', 20, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Recruiting', 21, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Strategic Sourcing', 22, (select id from public.integration_domains where owner_id = new.id and name = 'SCM' limit 1)),
    (new.id, 'Supplier Accounts', 23, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Supplier Admin', 24, (select id from public.integration_domains where owner_id = new.id and name = 'FIN' limit 1)),
    (new.id, 'Talent', 25, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Third Party Payroll', 26, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Time Tracking', 27, (select id from public.integration_domains where owner_id = new.id and name = 'PAY' limit 1)),
    (new.id, 'Workday Help', 28, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1)),
    (new.id, 'Workday Journeys', 29, (select id from public.integration_domains where owner_id = new.id and name = 'HCM' limit 1));

  return new;
end;
$$;
