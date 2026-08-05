-- Weekly capacity preference + per-day time off for pace / availability.

alter table public.user_preferences
  add column if not exists weekly_capacity_hours numeric(5, 2) not null default 32;

alter table public.user_preferences
  drop constraint if exists user_preferences_weekly_capacity_hours_check;

alter table public.user_preferences
  add constraint user_preferences_weekly_capacity_hours_check
  check (weekly_capacity_hours >= 1 and weekly_capacity_hours <= 80);

comment on column public.user_preferences.weekly_capacity_hours is
  'Preferred full Mon–Fri week capacity hours (default 32). Time-off days deduct capacity/5.';

create table public.time_off_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  day_date date not null,
  off_type text not null,
  other_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_off_days_type_check
    check (off_type in ('pto', 'company_holiday', 'other')),
  constraint time_off_days_other_label_check
    check (
      (off_type = 'other' and other_label is not null and length(trim(other_label)) > 0)
      or (off_type <> 'other' and other_label is null)
    ),
  constraint time_off_days_owner_day_unique
    unique (owner_id, day_date)
);

comment on table public.time_off_days is
  'User-marked full weekdays of time off (PTO, company holiday, or other). Hours derived from weekly_capacity_hours / 5.';

create index time_off_days_owner_date_idx
  on public.time_off_days (owner_id, day_date);

alter table public.time_off_days enable row level security;

create policy "time_off_days_owner"
  on public.time_off_days
  for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
