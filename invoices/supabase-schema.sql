-- Invoice Scraper: Supabase schema
-- Paste the whole file into Supabase Dashboard > SQL Editor > New query, then Run.
-- Safe to run more than once.
--
-- Shared kitchen library: all signed-in staff sync the same rows.
-- user_id on data tables is the kitchen library id from app_meta (not each person's auth uid).
-- The page asks for a username and password. Supabase still stores each person as
-- name@users.invoice.local, which is never emailed. The Admin account is created in Auth
-- (username Admin) and listed below. Anyone signed in can view and add invoices.
-- If that username is gone, the sign-in page can email a magic link. The block at the
-- end of this file (claim_kitchen_admin) lets that signed-in email become admin when
-- no admin row remains. The address is not written in this file.
-- Staff can correct an invoice they added themselves for 24 hours. Admins can also
-- change and delete records and manage usernames.
-- updated_at is set by the app from its local edit time, so devices merge newest-wins.
-- deleted = true is a tombstone: it tells other devices a row was removed.

-- app_meta: kitchen-wide settings (library id). Staff may read; only SQL writes.
create table if not exists public.app_meta (
  key   text primary key,
  value text not null
);
insert into public.app_meta (key, value)
values ('library_user_id', gen_random_uuid()::text)
on conflict (key) do nothing;

-- staff: who may sign in to the kitchen library. Written only by the staff-admin Edge Function.
create table if not exists public.staff (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  role       text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);
-- the first admin; change this email before running on another kitchen's project
insert into public.staff (email, role) values ('180karma@gmail.com', 'admin') on conflict (email) do nothing;
insert into public.staff (email, role) values ('admin@users.invoice.local', 'admin') on conflict (email) do nothing;

-- role helpers for the policies, in a schema the REST API does not expose
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create or replace function private.staff_role() returns text
language sql stable security definer set search_path = ''
as $$ select s.role from public.staff s where s.email = lower(coalesce((select auth.jwt()) ->> 'email', '')) $$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.staff_role() is not null $$;
-- Role admin may delete. The page reads ADMIN_EMAILS and hides delete from every
-- other signed-in account, including an admin whose email is not on that list.
-- Postgres only checks the staff role. It cannot read ADMIN_EMAILS.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.staff_role() = 'admin', false) $$;
create or replace function private.kitchen_library_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select value::uuid from public.app_meta where key = 'library_user_id' $$;
revoke execute on function private.staff_role(), private.is_staff(), private.is_admin(), private.kitchen_library_id() from public, anon;
grant execute on function private.staff_role(), private.is_staff(), private.is_admin(), private.kitchen_library_id() to authenticated;

alter table public.staff enable row level security;
drop policy if exists "staff read" on public.staff;
create policy "staff read" on public.staff for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')) or (select private.is_admin()));
revoke all on public.staff from anon, authenticated;
grant select on public.staff to authenticated;

alter table public.app_meta enable row level security;
drop policy if exists "app_meta read" on public.app_meta;
create policy "app_meta read" on public.app_meta for select to authenticated using ((select private.is_staff()));
revoke all on public.app_meta from anon;
grant select on public.app_meta to authenticated;

-- suppliers: one row per supplier (ABN, or the normalised name when there is no ABN), with contacts
create table if not exists public.suppliers (
  user_id           uuid not null,
  supplier_id       text not null,
  name              text not null default '',
  abn               text not null default '',
  phone             text not null default '',
  email             text not null default '',
  website           text not null default '',
  invoice_count     integer not null default 0,
  total_invoiced    numeric,
  last_invoice_date date,
  deleted           boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (user_id, supplier_id)
);

-- supplier layouts (templates): zones, header fingerprint and logo; data holds the whole layout
create table if not exists public.layouts (
  user_id     uuid not null,
  id          text not null,
  name        text not null default '',
  abn         text not null default '',
  supplier_id text not null default '',
  auto        boolean not null default false,
  data        jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- invoices: header fields, total, and the file name and folder it was saved under (not the file itself)
create table if not exists public.invoices (
  user_id      uuid not null,
  key          text not null,
  supplier_id  text not null default '',
  supplier     text not null default '',
  abn          text not null default '',
  invoice_no   text not null default '',
  invoice_date date,
  total        numeric,
  line_count   integer not null default 0,
  file_name    text not null default '',
  file_folder  text not null default '',
  src          text not null default 'text',
  phone        text not null default '',
  email        text not null default '',
  website      text not null default '',
  added_at     timestamptz,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.invoices add column if not exists created_by uuid default auth.uid();
alter table public.invoices add column if not exists created_at timestamptz not null default now();

-- line items: one row per invoice line. item_key + uom_key give one price series per item and unit
-- (uom_key folds spellings of one unit together: ea/each, kg/kgs; each vs carton stay apart)
create table if not exists public.line_items (
  user_id      uuid not null,
  invoice_key  text not null,
  line_no      integer not null,
  supplier_id  text not null default '',
  item_key     text not null default '',
  item_no      text,
  description  text,
  quantity     numeric,
  uom          text,
  uom_key      text not null default '',
  weight       numeric,
  unit_price   numeric,
  discount     numeric,
  gst          numeric,
  amount       numeric,
  invoice_date date,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, invoice_key, line_no),
  foreign key (user_id, invoice_key) references public.invoices (user_id, key) on delete cascade
);
create index if not exists line_items_series_idx on public.line_items (user_id, item_key, uom_key, invoice_date);

-- ignored items (skipped on new scans) and items hidden from the library
create table if not exists public.ignored_items (
  user_id    uuid not null,
  kind       text not null check (kind in ('ignore', 'hide')),
  item_key   text not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_key)
);

-- settings that are safe to share between devices. API keys are never stored here.
create table if not exists public.settings (
  user_id    uuid not null,
  name       text not null default 'app',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- Existing projects: drop auth.users FKs so deleting a staff account cannot wipe the kitchen library
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
    from pg_constraint c
    join pg_class own on own.oid = c.conrelid
    join pg_namespace n on n.oid = own.relnamespace and n.nspname = 'public'
    where c.contype = 'f'
      and own.relname in ('suppliers', 'layouts', 'invoices', 'line_items', 'ignored_items', 'settings')
      and c.confrelid = 'auth.users'::regclass
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

-- Drop column defaults that still point at auth.uid() (personal account)
alter table public.suppliers alter column user_id drop default;
alter table public.layouts alter column user_id drop default;
alter table public.invoices alter column user_id drop default;
alter table public.line_items alter column user_id drop default;
alter table public.ignored_items alter column user_id drop default;
alter table public.settings alter column user_id drop default;

-- Move any old personal rows into the shared kitchen library (no-op when empty / already shared)
do $$
declare lib uuid;
begin
  select value::uuid into lib from public.app_meta where key = 'library_user_id';
  if lib is null then return; end if;
  update public.suppliers set user_id = lib where user_id is distinct from lib;
  update public.layouts set user_id = lib where user_id is distinct from lib;
  update public.invoices set user_id = lib where user_id is distinct from lib;
  update public.line_items set user_id = lib where user_id is distinct from lib;
  update public.ignored_items set user_id = lib where user_id is distinct from lib;
  update public.settings set user_id = lib where user_id is distinct from lib;
exception
  when others then
    -- skip if a PK clash would occur (two users already have the same invoice key); resolve manually
    raise notice 'Could not auto-merge personal rows into the kitchen library: %', sqlerrm;
end $$;

-- price history view: every purchase of one item in one unit, oldest first
create or replace view public.price_history with (security_invoker = true) as
  select l.user_id, l.supplier_id, l.item_key, l.uom_key, l.item_no, l.description, l.uom,
         l.invoice_date, i.invoice_no, l.quantity, l.unit_price, l.amount
  from public.line_items l
  join public.invoices i on i.user_id = l.user_id and i.key = l.invoice_key and not i.deleted
  order by l.item_key, l.uom_key, l.invoice_date;

-- row-level security: staff on the list may use the kitchen library; shared settings are admin-only
do $$
declare t text; who text; w text;
begin
  foreach t in array array['suppliers', 'layouts', 'invoices', 'line_items', 'ignored_items', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);
    execute format('drop policy if exists "kitchen library select" on public.%I', t);
    execute format('drop policy if exists "kitchen library insert" on public.%I', t);
    execute format('drop policy if exists "kitchen library update" on public.%I', t);
    execute format('drop policy if exists "kitchen library delete" on public.%I', t);
    who := case when t = 'settings' then '(select private.is_admin())' else '(select private.is_staff())' end;
    w := format('user_id = (select private.kitchen_library_id()) and %s', who);
    execute format('create policy "kitchen library select" on public.%I for select to authenticated using (user_id = (select private.kitchen_library_id()) and (select private.is_staff()))', t);
    execute format('create policy "kitchen library insert" on public.%I for insert to authenticated with check (%s)', t, w);
    execute format('create policy "kitchen library update" on public.%I for update to authenticated using (%s) with check (%s)', t, w, w);
    execute format('create policy "kitchen library delete" on public.%I for delete to authenticated using (%s)', t, w);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Staff are add-only. A change they may not make is skipped (the trigger returns null) rather than
-- raising an error, so one refused row never blocks the rest of a sync. Their next sync reloads
-- the server's copy.
-- no signed-in user (SQL editor, service role) and admins pass every guard
create or replace function public.guard_invoices() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.deleted then return null; end if;
    new.created_by := auth.uid(); new.created_at := now();
    return new;
  end if;
  if tg_op = 'DELETE' then return null; end if;
  -- staff may correct (or withdraw) an invoice they added in the last 24 hours
  if old.created_by is distinct from auth.uid() or old.created_at < now() - interval '24 hours' then return null; end if;
  new.created_by := old.created_by; new.created_at := old.created_at;
  return new;
end $$;

create or replace function public.guard_line_items() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare u uuid; k text; by_ uuid; at_ timestamptz;
begin
  if tg_op = 'DELETE' then u := old.user_id; k := old.invoice_key; else u := new.user_id; k := new.invoice_key; end if;
  if not (auth.uid() is null or private.is_admin()) then
    select i.created_by, i.created_at into by_, at_ from public.invoices i where i.user_id = u and i.key = k;
    if by_ is distinct from auth.uid() or at_ < now() - interval '24 hours' then return null; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- layouts and suppliers: staff add and update, but cannot delete
create or replace function public.guard_tombstones() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return null; end if;
  if new.deleted then
    if tg_op = 'INSERT' then return null; end if;
    if not old.deleted then return null; end if;
  end if;
  return new;
end $$;

-- ignored items: staff may ignore and un-ignore on scans; hiding items from the library is admin-only
create or replace function public.guard_ignored() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or private.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return null; end if;
  if new.kind = 'hide' then return null; end if;
  return new;
end $$;

drop trigger if exists guard on public.invoices;
create trigger guard before insert or update or delete on public.invoices for each row execute function public.guard_invoices();
drop trigger if exists guard on public.line_items;
create trigger guard before insert or update or delete on public.line_items for each row execute function public.guard_line_items();
drop trigger if exists guard on public.layouts;
create trigger guard before insert or update or delete on public.layouts for each row execute function public.guard_tombstones();
drop trigger if exists guard on public.suppliers;
create trigger guard before insert or update or delete on public.suppliers for each row execute function public.guard_tombstones();
drop trigger if exists guard on public.ignored_items;
create trigger guard before insert or update or delete on public.ignored_items for each row execute function public.guard_ignored();
revoke execute on function public.guard_invoices(), public.guard_line_items(), public.guard_tombstones(), public.guard_ignored() from public, anon, authenticated;

-- sign-in is required: the anon key on its own cannot read or change the kitchen library
do $$
declare t text;
begin
  foreach t in array array['suppliers', 'layouts', 'invoices', 'line_items', 'ignored_items', 'settings'] loop
    execute format('drop policy if exists "kitchen library anon select" on public.%I', t);
    execute format('drop policy if exists "kitchen library anon insert" on public.%I', t);
    execute format('drop policy if exists "kitchen library anon update" on public.%I', t);
    execute format('drop policy if exists "kitchen library anon delete" on public.%I', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
drop policy if exists "app_meta anon read" on public.app_meta;
revoke all on public.app_meta from anon;
revoke all on public.price_history from anon;
grant select on public.price_history to authenticated;
revoke execute on function private.kitchen_library_id() from anon;

-- an earlier version of this file put the role helpers in public, where the REST API could call them
drop function if exists public.is_admin();
drop function if exists public.is_staff();
drop function if exists public.kitchen_library_id();
drop function if exists public.staff_role();

-- supplier logos: a private Storage bucket. The page never puts a key in the image address.
-- Object path is one file per supplier: {supplier id}.jpg
--   supplier id is the ABN (digits only) when the supplier has one,
--   otherwise the normalised name with spaces and slashes turned into hyphens
--   (for example 51824763910.jpg or joe-s-cafe.jpg).
-- The bucket stays private. Signed-in staff read a short-lived signed URL and can replace the file.
insert into storage.buckets (id, name, public)
values ('supplier-logos', 'supplier-logos', false)
on conflict (id) do update set public = false;

drop policy if exists "staff read supplier logos" on storage.objects;
drop policy if exists "staff write supplier logos" on storage.objects;
drop policy if exists "staff update supplier logos" on storage.objects;
create policy "staff read supplier logos" on storage.objects
  for select to authenticated
  using (bucket_id = 'supplier-logos' and (select private.is_staff()));
create policy "staff write supplier logos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'supplier-logos' and (select private.is_staff()));
create policy "staff update supplier logos" on storage.objects
  for update to authenticated
  using (bucket_id = 'supplier-logos' and (select private.is_staff()))
  with check (bucket_id = 'supplier-logos' and (select private.is_staff()));

-- Admins can delete logo files. remove() needs this DELETE policy (SELECT is already granted above).
-- Paste this block on its own if logos will not delete, or re-run the whole file.
drop policy if exists "admin delete supplier logos" on storage.objects;
create policy "admin delete supplier logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'supplier-logos' and (select private.is_admin()));

-- Locked out: paste this block into the SQL editor and run it again. Safe to re-run.
-- A real inbox becomes admin when no admin remains, or when the only admins are
-- @users.invoice.local usernames (those addresses cannot receive a magic link).
-- The email is taken from the sign-in. Nothing here names a mailbox or a password.
grant usage on schema private to authenticated;
create or replace function private.claim_kitchen_admin()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  em text := lower(btrim(coalesce((select auth.jwt()) ->> 'email', '')));
  current_role text;
  reachable int;
begin
  if em = '' or position('@' in em) < 2 then
    raise exception 'Sign in first.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(814213);
  select s.role into current_role from public.staff s where s.email = em;
  if current_role = 'admin' then
    return 'admin';
  end if;
  select count(*) into reachable from public.staff s
    where s.role = 'admin' and s.email not like '%@users.invoice.local';
  if reachable > 0 then
    raise exception 'An admin already exists. Sign in with that email. admin@users.invoice.local cannot receive mail.';
  end if;
  if current_role is not null then
    update public.staff set role = 'admin' where email = em;
  else
    insert into public.staff (email, role) values (em, 'admin');
  end if;
  return 'admin';
end;
$$;

revoke all on function private.claim_kitchen_admin() from public, anon;
grant execute on function private.claim_kitchen_admin() to authenticated;

create or replace function public.claim_kitchen_admin()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.claim_kitchen_admin();
end;
$$;

revoke all on function public.claim_kitchen_admin() from public, anon;
grant execute on function public.claim_kitchen_admin() to authenticated;
