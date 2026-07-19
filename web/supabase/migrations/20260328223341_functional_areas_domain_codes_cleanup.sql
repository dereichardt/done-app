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