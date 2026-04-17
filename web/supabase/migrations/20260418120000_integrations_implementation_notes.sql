-- Catalog-only long-form notes; project_only rows must keep NULL (enforced by CHECK).

alter table public.integrations
  add column if not exists implementation_notes text;

comment on column public.integrations.implementation_notes is
  'Multi-line catalog guidance (patterns, considerations). Only used when catalog_visibility is catalog; must be NULL for project_only.';

alter table public.integrations
  add constraint integrations_implementation_notes_catalog_only_ck
  check (catalog_visibility = 'catalog' or implementation_notes is null);
