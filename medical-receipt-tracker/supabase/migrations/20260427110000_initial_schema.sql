create extension if not exists "pgcrypto";

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null,
  file_type text not null,
  uploaded_at timestamptz not null default now(),
  raw_ocr_text text,
  parser_version text not null default 'v1',
  extraction_confidence jsonb not null default '{}'::jsonb
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor text not null,
  service_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  category text not null default 'medical',
  status text not null default 'new' check (
    status in ('new', 'reviewed', 'ready_for_submission', 'submitted', 'reimbursed')
  ),
  notes text not null default '',
  is_reimbursable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  range_start date not null,
  range_end date not null,
  created_at timestamptz not null default now(),
  file_path text not null
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.log_activity()
returns trigger
language plpgsql
as $$
declare
  action_name text;
  object_id text;
begin
  action_name := lower(tg_op);
  object_id := coalesce(new.id, old.id)::text;

  insert into public.activity_logs (user_id, action, target_type, target_id)
  values (
    coalesce(new.user_id, old.user_id),
    action_name,
    tg_table_name,
    object_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
before update on public.expenses
for each row execute procedure public.touch_updated_at();

drop trigger if exists receipts_log_activity on public.receipts;
create trigger receipts_log_activity
after insert or update or delete on public.receipts
for each row execute procedure public.log_activity();

drop trigger if exists expenses_log_activity on public.expenses;
create trigger expenses_log_activity
after insert or update or delete on public.expenses
for each row execute procedure public.log_activity();

drop trigger if exists exports_log_activity on public.exports;
create trigger exports_log_activity
after insert or update or delete on public.exports
for each row execute procedure public.log_activity();

alter table public.receipts enable row level security;
alter table public.expenses enable row level security;
alter table public.exports enable row level security;
alter table public.activity_logs enable row level security;

create policy if not exists "receipts_own_rows"
on public.receipts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "expenses_own_rows"
on public.expenses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "exports_own_rows"
on public.exports
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "activity_logs_own_rows"
on public.activity_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy if not exists "storage_receipts_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy if not exists "storage_receipts_select_own_folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy if not exists "storage_receipts_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy if not exists "storage_receipts_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
