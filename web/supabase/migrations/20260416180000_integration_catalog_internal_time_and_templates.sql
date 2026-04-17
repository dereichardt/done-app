-- Integration catalog: internal time code (required for catalog rows), default effort on templates,
-- promote provenance.

alter table public.integrations
  add column internal_time_code text,
  add column default_estimated_effort_hours numeric,
  add column promoted_from_integration_id uuid references public.integrations (id) on delete set null;

alter table public.integrations
  add constraint integrations_default_estimated_effort_hours_check
  check (default_estimated_effort_hours is null or default_estimated_effort_hours >= 0);

comment on column public.integrations.internal_time_code is
  'Billing/time-tracking identifier; required when catalog_visibility is catalog; unique per owner among catalog rows.';
comment on column public.integrations.default_estimated_effort_hours is
  'Suggested estimated hours when instantiating a project integration from this catalog pattern.';
comment on column public.integrations.promoted_from_integration_id is
  'Project-scoped integration row this catalog entry was promoted from, if applicable.';

-- Existing catalog rows need a code before we can enforce NOT NULL via check.
update public.integrations
set internal_time_code = 'legacy-' || replace(id::text, '-', '')
where catalog_visibility = 'catalog'
  and (internal_time_code is null or btrim(internal_time_code) = '');

alter table public.integrations
  add constraint integrations_catalog_internal_time_code_required_ck
  check (
    catalog_visibility <> 'catalog'
    or (internal_time_code is not null and length(btrim(internal_time_code)) > 0)
  );

create unique index integrations_owner_catalog_internal_time_code_uidx
  on public.integrations (owner_id, internal_time_code)
  where catalog_visibility = 'catalog' and internal_time_code is not null;

create index integrations_promoted_from_integration_id_idx
  on public.integrations (promoted_from_integration_id)
  where promoted_from_integration_id is not null;
