alter table public.user_preferences
  add column effort_quarter_start_month smallint not null default 1,
  add constraint user_preferences_effort_quarter_start_month_chk check (
    effort_quarter_start_month in (0, 1, 2)
  );