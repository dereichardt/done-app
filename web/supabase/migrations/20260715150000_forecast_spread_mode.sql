-- Persist even vs bell hour-spread mode on project forecasts.

alter table public.project_forecasts
  add column spread_mode text not null default 'even'
    constraint project_forecasts_spread_mode_chk
    check (spread_mode in ('even', 'bell'));
