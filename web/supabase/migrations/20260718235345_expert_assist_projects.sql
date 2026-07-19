alter table public.project_types
  add column if not exists system_key text;

create unique index if not exists project_types_owner_system_key_uidx
  on public.project_types (owner_id, system_key)
  where system_key is not null;

alter table public.projects
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists estimated_effort_hours numeric,
  add column if not exists integrations_enabled boolean not null default true;

alter table public.projects
  add constraint projects_date_range_check
  check (
    (starts_on is null and ends_on is null)
    or (starts_on is not null and ends_on is not null and starts_on <= ends_on)
  ),
  add constraint projects_estimated_effort_hours_check
  check (estimated_effort_hours is null or estimated_effort_hours >= 0);

update public.project_types
set system_key = 'expert_assist'
where name = 'Expert Assist'
  and system_key is null;

insert into public.project_types (owner_id, name, sort_order, system_key)
select
  users.id,
  'Expert Assist',
  coalesce((
    select max(project_types.sort_order) + 1
    from public.project_types
    where project_types.owner_id = users.id
  ), 1),
  'expert_assist'
from auth.users as users
where not exists (
  select 1
  from public.project_types
  where project_types.owner_id = users.id
    and project_types.system_key = 'expert_assist'
);

create or replace function public.seed_expert_assist_project_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_types (owner_id, name, sort_order, system_key)
  values (new.id, 'Expert Assist', 5, 'expert_assist')
  on conflict (owner_id, name) do update
    set system_key = excluded.system_key;

  return new;
end;
$$;

revoke execute on function public.seed_expert_assist_project_type() from public;
revoke execute on function public.seed_expert_assist_project_type() from anon;
revoke execute on function public.seed_expert_assist_project_type() from authenticated;

drop trigger if exists on_auth_user_created_expert_assist on auth.users;
create trigger on_auth_user_created_expert_assist
  after insert on auth.users
  for each row
  execute function public.seed_expert_assist_project_type();