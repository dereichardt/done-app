alter table public.user_preferences
  add column deployment_effort_by_phase jsonb
  not null
  default '{"plan":10,"architect_configure":60,"test":20,"deploy":5,"hypercare":5}'::jsonb;
