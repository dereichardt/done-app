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