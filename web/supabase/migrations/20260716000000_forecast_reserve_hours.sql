-- Persist unallocated reserve hours (past-phase under-estimate) and generate option.

alter table public.project_forecasts
  add column reserve_hours integer not null default 0
    constraint project_forecasts_reserve_hours_chk check (reserve_hours >= 0),
  add column include_past_phases_in_spread boolean not null default false;

-- Existing forecasts already placed past-phase hours on the grid.
update public.project_forecasts
set include_past_phases_in_spread = true
where true;
