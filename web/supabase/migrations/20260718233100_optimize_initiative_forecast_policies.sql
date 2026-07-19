alter policy "initiative_forecasts_via_initiative"
  on public.initiative_forecasts
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecasts.initiative_id
        and i.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecasts.initiative_id
        and i.owner_id = (select auth.uid())
    )
  );

alter policy "initiative_forecast_hours_via_initiative"
  on public.initiative_forecast_hours
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_hours.initiative_id
        and i.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_hours.initiative_id
        and i.owner_id = (select auth.uid())
    )
  );

alter policy "initiative_forecast_week_locks_via_initiative"
  on public.initiative_forecast_week_locks
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_week_locks.initiative_id
        and i.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = initiative_forecast_week_locks.initiative_id
        and i.owner_id = (select auth.uid())
    )
  );

drop index if exists public.initiative_forecast_week_locks_week_idx;