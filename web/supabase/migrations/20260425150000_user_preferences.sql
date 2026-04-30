create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text,
  activity_summary_day text not null default 'friday',
  forecast_review_day text not null default 'monday',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_activity_summary_day_chk check (
    activity_summary_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ),
  constraint user_preferences_forecast_review_day_chk check (
    forecast_review_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  )
);

alter table public.user_preferences enable row level security;

create policy "user_preferences_owner_select"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "user_preferences_owner_insert"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "user_preferences_owner_update"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
