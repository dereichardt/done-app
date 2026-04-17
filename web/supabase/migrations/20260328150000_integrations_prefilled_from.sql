-- Provenance: project integration rows may reference the catalog template they were seeded from

alter table public.integrations
  add column prefilled_from_integration_id uuid references public.integrations (id) on delete set null;

create index integrations_prefilled_from_integration_id_idx
  on public.integrations (prefilled_from_integration_id)
  where prefilled_from_integration_id is not null;
