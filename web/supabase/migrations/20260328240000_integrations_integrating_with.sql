-- Free-text vendor / external system name (replaces generic description on integrations).
alter table public.integrations rename column description to integrating_with;
