alter table public.project_forecasts
  add column if not exists spread_mode text not null default 'even'
    constraint project_forecasts_spread_mode_chk
    check (spread_mode in ('even', 'bell'));