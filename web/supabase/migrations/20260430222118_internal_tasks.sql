create table public.internal_tasks (
  id uuid primary key default gen_random_uuid(),
  internal_track_id uuid references public.internal_tracks (id) on delete cascade,
  internal_initiative_id uuid references public.internal_initiatives (id) on delete cascade,
  title text not null,
  due_date date,
  status text not null default 'open'
    constraint internal_tasks_status_check
    check (status in ('open', 'done', 'cancelled')),
  priority text not null default 'medium'
    constraint internal_tasks_priority_check
    check (priority in ('low', 'medium', 'high')),
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint internal_tasks_parent_xor_check check (
    (internal_track_id is not null)::int + (internal_initiative_id is not null)::int = 1
  )
);

create index internal_tasks_track_id_idx
  on public.internal_tasks (internal_track_id)
  where internal_track_id is not null;

create index internal_tasks_initiative_id_idx
  on public.internal_tasks (internal_initiative_id)
  where internal_initiative_id is not null;

alter table public.internal_tasks enable row level security;

create policy "internal_tasks_via_track"
  on public.internal_tasks
  for all
  using (
    exists (
      select 1
      from public.internal_tracks t
      where t.id = internal_tasks.internal_track_id
        and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_tracks t
      where t.id = internal_tasks.internal_track_id
        and t.owner_id = auth.uid()
    )
  );

create policy "internal_tasks_via_initiative"
  on public.internal_tasks
  for all
  using (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = internal_tasks.internal_initiative_id
        and i.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.internal_initiatives i
      where i.id = internal_tasks.internal_initiative_id
        and i.owner_id = auth.uid()
    )
  );