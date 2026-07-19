-- Record the active-project dashboard ordering change that exists in the
-- deployed schema but was originally applied outside migration history.
do $$
declare
  dashboard_order_column_existed boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'active_dashboard_order'
  )
  into dashboard_order_column_existed;

  alter table public.projects
    add column if not exists active_dashboard_order integer null;

  if not dashboard_order_column_existed then
    with ranked as (
      select
        id,
        row_number() over (
          partition by owner_id
          order by created_at desc
        ) - 1 as pos
      from public.projects
      where completed_at is null
    )
    update public.projects p
    set active_dashboard_order = ranked.pos
    from ranked
    where p.id = ranked.id;
  end if;
end
$$;

comment on column public.projects.active_dashboard_order is
  'Owner-defined list position for the active-engagements dashboard; null for completed projects.';