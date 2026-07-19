-- Collapse project forecasts from integration / PM rows to one project-week value.

with ranked_hours as (
  select
    id,
    row_number() over (
      partition by project_id, week_start_date
      order by created_at, id
    ) as row_number,
    sum(hours) over (
      partition by project_id, week_start_date
    )::integer as total_hours
  from public.project_forecast_hours
),
updated_keepers as (
  update public.project_forecast_hours hours
  set
    hours = ranked.total_hours,
    updated_at = now()
  from ranked_hours ranked
  where hours.id = ranked.id
    and ranked.row_number = 1
  returning hours.id
)
delete from public.project_forecast_hours hours
using ranked_hours ranked
where hours.id = ranked.id
  and ranked.row_number > 1;

alter table public.project_forecast_hours
  drop constraint project_forecast_hours_unique,
  drop column row_key,
  add constraint project_forecast_hours_unique
    unique (project_id, week_start_date);

alter table public.project_forecasts
  drop column pm_percent;