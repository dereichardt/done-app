-- Soft-dismiss: keep the row so (owner_id, dedupe_key) blocks sync from recreating
-- the same inbox item after delete + revalidatePath("/home").

alter table public.home_inbox_items
  drop constraint if exists home_inbox_items_status_check;

alter table public.home_inbox_items
  add constraint home_inbox_items_status_check
  check (status in ('open', 'done', 'dismissed'));

comment on column public.home_inbox_items.status is
  'open = visible inbox; done = completed; dismissed = deleted/soft-dismissed (still blocks dedupe recreate).';
