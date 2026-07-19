alter table public.user_preferences
  add column home_inbox_last_synced_at timestamptz,
  add column home_inbox_rules_version integer not null default 0;

create or replace function public.claim_home_inbox_sync(
  p_rules_version integer,
  p_force boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_count integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.user_preferences (
    user_id,
    home_inbox_last_synced_at,
    home_inbox_rules_version
  )
  values (
    auth.uid(),
    now(),
    greatest(0, p_rules_version)
  )
  on conflict (user_id) do update
  set
    home_inbox_last_synced_at = excluded.home_inbox_last_synced_at,
    home_inbox_rules_version = excluded.home_inbox_rules_version,
    updated_at = now()
  where
    p_force
    or public.user_preferences.home_inbox_last_synced_at is null
    or public.user_preferences.home_inbox_last_synced_at < now() - interval '10 minutes'
    or public.user_preferences.home_inbox_rules_version < excluded.home_inbox_rules_version;

  get diagnostics claimed_count = row_count;
  return claimed_count > 0;
end;
$$;

revoke all on function public.claim_home_inbox_sync(integer, boolean)
  from public, anon;
grant execute on function public.claim_home_inbox_sync(integer, boolean)
  to authenticated, service_role;
