-- Remove Home Inbox feature: items table, sync RPC, and preference columns.

drop function if exists public.claim_home_inbox_sync(integer, boolean);

drop table if exists public.home_inbox_items;

alter table public.user_preferences
  drop column if exists home_inbox_last_synced_at,
  drop column if exists home_inbox_rules_version;
