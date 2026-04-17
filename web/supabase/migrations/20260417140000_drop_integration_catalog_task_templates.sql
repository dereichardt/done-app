-- Remove per-catalog pattern task templates; will be reintroduced with a shared predefined-task model.

drop table if exists public.integration_catalog_task_templates;
