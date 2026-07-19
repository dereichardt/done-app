-- Persist project forecast changes in one database transaction so a failed
-- hours write cannot leave the header updated and the prior hours deleted.

create or replace function public.replace_project_forecast(
  p_project_id uuid,
  p_start_date date,
  p_spread_mode text,
  p_reserve_hours integer,
  p_include_past_phases_in_spread boolean,
  p_generated_at timestamptz,
  p_replace_weeks date[],
  p_cells jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.projects
  where id = p_project_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_cells, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid forecast cells';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
      as cell(week_start_date date, hours integer)
    where cell.week_start_date is null
      or cell.hours is null
      or cell.hours < 0
  ) then
    raise exception 'Invalid forecast cells';
  end if;

  if exists (
    select 1
    from public.project_forecast_week_locks lock
    where lock.project_id = p_project_id
      and (
        lock.week_start_date = any(coalesce(p_replace_weeks, '{}'::date[]))
        or exists (
          select 1
          from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
            as cell(week_start_date date, hours integer)
          where cell.week_start_date = lock.week_start_date
        )
      )
  ) then
    raise exception 'Locked forecast weeks cannot be replaced';
  end if;

  insert into public.project_forecasts (
    project_id,
    start_date,
    spread_mode,
    reserve_hours,
    include_past_phases_in_spread,
    generated_at,
    updated_at
  )
  values (
    p_project_id,
    p_start_date,
    p_spread_mode,
    p_reserve_hours,
    p_include_past_phases_in_spread,
    p_generated_at,
    p_generated_at
  )
  on conflict (project_id) do update
  set
    start_date = excluded.start_date,
    spread_mode = excluded.spread_mode,
    reserve_hours = excluded.reserve_hours,
    include_past_phases_in_spread = excluded.include_past_phases_in_spread,
    generated_at = excluded.generated_at,
    updated_at = excluded.updated_at;

  delete from public.project_forecast_hours
  where project_id = p_project_id
    and week_start_date = any(coalesce(p_replace_weeks, '{}'::date[]));

  insert into public.project_forecast_hours (
    project_id,
    week_start_date,
    hours,
    updated_at
  )
  select
    p_project_id,
    cell.week_start_date,
    cell.hours,
    p_generated_at
  from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
    as cell(week_start_date date, hours integer)
  on conflict (project_id, week_start_date) do update
  set
    hours = excluded.hours,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.save_project_forecast_draft(
  p_project_id uuid,
  p_cells jsonb,
  p_delete_weeks date[],
  p_reserve_hours integer,
  p_updated_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.projects
  where id = p_project_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found'
      using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_cells, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid forecast cells';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
      as cell(week_start_date date, hours integer)
    where cell.week_start_date is null
      or cell.hours is null
      or cell.hours <= 0
  ) then
    raise exception 'Invalid forecast cells';
  end if;

  if exists (
    select 1
    from public.project_forecast_week_locks lock
    where lock.project_id = p_project_id
      and (
        lock.week_start_date = any(coalesce(p_delete_weeks, '{}'::date[]))
        or exists (
          select 1
          from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
            as cell(week_start_date date, hours integer)
          where cell.week_start_date = lock.week_start_date
        )
      )
  ) then
    raise exception 'Locked forecast weeks cannot be edited';
  end if;

  insert into public.project_forecast_hours (
    project_id,
    week_start_date,
    hours,
    updated_at
  )
  select
    p_project_id,
    cell.week_start_date,
    cell.hours,
    p_updated_at
  from jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
    as cell(week_start_date date, hours integer)
  on conflict (project_id, week_start_date) do update
  set
    hours = excluded.hours,
    updated_at = excluded.updated_at;

  delete from public.project_forecast_hours
  where project_id = p_project_id
    and week_start_date = any(coalesce(p_delete_weeks, '{}'::date[]));

  update public.project_forecasts
  set
    reserve_hours = coalesce(p_reserve_hours, reserve_hours),
    updated_at = p_updated_at
  where project_id = p_project_id;

  if not found then
    raise exception 'Generate a forecast before editing';
  end if;
end;
$$;

revoke all on function public.replace_project_forecast(
  uuid, date, text, integer, boolean, timestamptz, date[], jsonb
) from public, anon;
grant execute on function public.replace_project_forecast(
  uuid, date, text, integer, boolean, timestamptz, date[], jsonb
) to authenticated, service_role;

revoke all on function public.save_project_forecast_draft(
  uuid, jsonb, date[], integer, timestamptz
) from public, anon;
grant execute on function public.save_project_forecast_draft(
  uuid, jsonb, date[], integer, timestamptz
) to authenticated, service_role;