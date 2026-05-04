-- Track when a home inbox row was read (master-detail unread state).

alter table public.home_inbox_items
  add column if not exists read_at timestamptz null;

comment on column public.home_inbox_items.read_at is
  'When the user opened this item in the inbox; null means unread.';
