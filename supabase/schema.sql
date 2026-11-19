-- =====================================================================
--  WTM · Work Task Manager — Supabase schema
--  Run once in Supabase → SQL Editor → New query → Run.
--  Safe to re-run: tables use IF NOT EXISTS, functions use CREATE OR REPLACE.
--
--  Design
--  • Roles, highest first: it › admin › supervisor › staff.
--    IT manages every login. Admin manages supervisors and staff.
--  • Every write goes through a SECURITY DEFINER function that checks
--    permissions and writes the log book in the same transaction, so the
--    log is complete and the browser cannot edit or delete entries.
--  • Tables have row-level security with read-only policies; the browser
--    never writes to tables directly.
--  • The first account created in Authentication becomes IT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Types and tables
-- ---------------------------------------------------------------------
do $$ begin
  create type public.wtm_role as enum ('staff', 'supervisor', 'admin', 'it');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null default '',
  full_name            text not null default '',
  short_name           text not null default '',   -- what people call them; used for auto-tagging
  title                text not null default '',
  role                 public.wtm_role not null default 'staff',
  active               boolean not null default true,
  must_change_password boolean not null default false,
  removed_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- The login can be deleted while the profile row stays, so names remain on tasks and the log.
alter table public.profiles add column if not exists removed_at timestamptz;
alter table public.profiles drop constraint if exists profiles_id_fkey;

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  code       text not null default '' check (char_length(code) <= 12),
  color      text not null default 'c1',
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.department_members (
  department_id uuid not null references public.departments(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  head          boolean not null default false,  -- department head; does not change their app role
  primary key (department_id, profile_id)
);
alter table public.department_members add column if not exists head boolean not null default false;
create index if not exists department_members_profile_idx on public.department_members(profile_id);

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  color      text not null default 'c2',
  owner_id   uuid references public.profiles(id) on delete set null,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, profile_id)
);
create index if not exists group_members_profile_idx on public.group_members(profile_id);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  color      text not null default 'c3',
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  aliases    text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.tag_rules (
  id         uuid primary key default gen_random_uuid(),
  phrase     text not null check (char_length(phrase) between 1 and 60),
  tag        text not null check (char_length(tag) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists tag_rules_phrase_lower_uq on public.tag_rules (lower(phrase));

-- a keyword or trade tag can also tag one department (plumbing → Maintenance)
create table if not exists public.tag_departments (
  tag           text primary key check (tag ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  department_id uuid not null references public.departments(id) on delete cascade
);

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.maps (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  image_path  text not null check (image_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$'),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists maps_location_idx on public.maps(location_id);

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 300),
  notes      text not null default '' check (char_length(notes) <= 5000),
  project_id uuid references public.projects(id) on delete set null,
  priority   smallint not null default 3 check (priority between 1 and 4),
  status     text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  due        date,
  tags       text[] not null default '{}',   -- plain words, or typed: person:<uuid>, dept:<uuid>, room:<label>
  spent_ms   bigint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at    timestamptz,
  deleted_at timestamptz
);
create index if not exists tasks_updated_idx on public.tasks(updated_at);
create index if not exists tasks_created_by_idx on public.tasks(created_by);

create table if not exists public.task_assignees (
  task_id   uuid not null references public.tasks(id) on delete cascade,
  kind      text not null check (kind in ('user', 'dept', 'group')),
  target_id uuid not null,
  primary key (task_id, kind, target_id)
);
create index if not exists task_assignees_target_idx on public.task_assignees(kind, target_id);

-- one running timer per person
create table if not exists public.timers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz not null default now()
);
create index if not exists timers_task_idx on public.timers(task_id);

-- the log book: append-only, numbered by id
create table if not exists public.log_entries (
  id           bigint generated always as identity primary key,
  ts           timestamptz not null default clock_timestamp(),
  action       text not null,
  task_id      uuid references public.tasks(id) on delete set null,
  task_title   text not null default '',
  project_id   uuid,
  project_name text not null default '',
  detail       text not null default '',
  duration_ms  bigint,
  actor        uuid references public.profiles(id) on delete set null,
  subject      uuid   -- the person an admin entry is about
);
create index if not exists log_entries_task_idx on public.log_entries(task_id);
create index if not exists log_entries_actor_idx on public.log_entries(actor);

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sender     uuid references public.profiles(id) on delete set null,
  to_kind    text not null check (to_kind in ('all', 'user', 'dept', 'group')),
  to_id      uuid not null,
  body       text not null default '' check (char_length(body) <= 4000),
  task_id    uuid references public.tasks(id) on delete set null,
  pin        jsonb,
  photo      text,
  constraint messages_content_ck check (char_length(btrim(body)) > 0 or photo is not null or pin is not null)
);
create index if not exists messages_to_idx on public.messages(to_kind, to_id, id);
create index if not exists messages_sender_idx on public.messages(sender, id);

create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 160),
  body        text not null default '' check (char_length(body) <= 4000),
  pinned      boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists notices_live_idx on public.notices(pinned desc, created_at desc) where archived_at is null;

create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  item       text not null check (char_length(btrim(item)) between 1 and 200),
  qty        text not null default '1' check (char_length(qty) <= 40),
  note       text not null default '' check (char_length(note) <= 500),
  trade      text not null default '' check (char_length(trade) <= 40),
  status     text not null default 'needed' check (status in ('needed', 'ordered', 'received')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders(status, created_at desc);

-- a standing task that opens once a day for one department
create table if not exists public.daily_tasks (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  title         text not null check (char_length(btrim(title)) between 1 and 300),
  notes         text not null default '' check (char_length(notes) <= 5000),
  priority      smallint not null default 3 check (priority between 1 and 4),
  tags          text[] not null default '{}',
  active        boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index if not exists daily_tasks_dept_idx on public.daily_tasks(department_id) where archived_at is null;

alter table public.tasks add column if not exists daily_id uuid references public.daily_tasks(id) on delete set null;
alter table public.tasks add column if not exists daily_on date;
alter table public.tasks drop constraint if exists tasks_daily_pair_ck;
alter table public.tasks add constraint tasks_daily_pair_ck check ((daily_id is null) = (daily_on is null));
create unique index if not exists tasks_daily_day_idx on public.tasks(daily_id, daily_on);

alter table public.tasks add column if not exists blocked_note text not null default '';
alter table public.tasks drop constraint if exists tasks_blocked_note_ck;
alter table public.tasks add constraint tasks_blocked_note_ck check (char_length(blocked_note) <= 200);
alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists checks jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists pin jsonb;
alter table public.tasks add column if not exists photo text;

alter table public.messages add column if not exists pin jsonb;
alter table public.messages add column if not exists photo text;
do $$
declare c name;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'messages' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%body%'
  loop
    execute format('alter table public.messages drop constraint %I', c);
  end loop;
end $$;
alter table public.messages add constraint messages_body_len_ck check (char_length(body) <= 4000);
alter table public.messages add constraint messages_content_ck check (
  char_length(btrim(body)) > 0 or photo is not null or pin is not null);

alter table public.orders add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists orders_task_idx on public.orders(task_id);
alter table public.orders add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.orders add column if not exists tagged uuid[] not null default '{}';

alter table public.notices add column if not exists show_until date;

alter table public.daily_tasks add column if not exists weekdays smallint[] not null default '{0,1,2,3,4,5,6}';
alter table public.daily_tasks add column if not exists due_time time;
alter table public.daily_tasks add column if not exists checklist text[] not null default '{}';

create table if not exists public.calendar_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('event', 'booking', 'holiday')),
  title       text not null check (char_length(btrim(title)) between 1 and 160),
  day         date not null,
  end_day     date,
  starts      time,
  notes       text not null default '' check (char_length(notes) <= 2000),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (end_day is null or end_day >= day)
);
create index if not exists calendar_entries_day_idx on public.calendar_entries(day) where deleted_at is null;

alter table public.projects add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create table if not exists public.message_reads (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  conv         text not null,        -- 'dept:<id>' · 'group:<id>' · 'user:<other person id>'
  last_read_id bigint not null default 0,
  primary key (profile_id, conv)
);

-- ---------------------------------------------------------------------
-- 2. Identity and visibility helpers
-- ---------------------------------------------------------------------
create or replace function public.wtm_rank(r public.wtm_role) returns int
language sql immutable as $$
  select case r when 'staff' then 1 when 'supervisor' then 2 when 'admin' then 3 when 'it' then 4 else 0 end
$$;

-- rank of an active person; 0 when missing or turned off
create or replace function public.wtm_rank_of(p uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select public.wtm_rank(role) from public.profiles where id = p and active), 0)
$$;

create or replace function public.wtm_my_rank() returns int
language sql stable security definer set search_path = public as $$
  select public.wtm_rank_of(auth.uid())
$$;

create or replace function public.wtm_my_depts() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(department_id), '{}') from public.department_members where profile_id = auth.uid()
$$;

create or replace function public.wtm_my_groups() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(group_id), '{}') from public.group_members where profile_id = auth.uid()
$$;

-- Who sees a task:
--   admin, IT: everything
--   everyone:  tasks they created, or assigned to them, their departments or their groups
--   supervisor: also tasks created by, or assigned to, people in their departments
create or replace function public.wtm_visible_task_ids() returns table (id uuid)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid, public.wtm_my_rank() as r, public.wtm_my_depts() as d, public.wtm_my_groups() as g)
  select t.id from public.tasks t, me where me.r >= 3
  union
  select t.id from public.tasks t, me where me.r between 1 and 2 and t.created_by = me.uid
  union
  select a.task_id from public.task_assignees a, me
   where me.r between 1 and 2
     and ((a.kind = 'user' and a.target_id = me.uid)
       or (a.kind = 'dept' and a.target_id = any(me.d))
       or (a.kind = 'group' and a.target_id = any(me.g)))
  union
  select a.task_id from public.task_assignees a
    join public.department_members dm on dm.profile_id = a.target_id, me
   where me.r = 2 and a.kind = 'user' and dm.department_id = any(me.d)
  union
  select a.task_id from public.task_assignees a
    join public.group_members gm on gm.group_id = a.target_id
    join public.department_members dm on dm.profile_id = gm.profile_id, me
   where me.r = 2 and a.kind = 'group' and dm.department_id = any(me.d)
  union
  select t.id from public.tasks t
    join public.department_members dm on dm.profile_id = t.created_by, me
   where me.r = 2 and dm.department_id = any(me.d)
$$;

create or replace function public.wtm_can_see_task(p_task uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r  int  := public.wtm_my_rank();
  d  uuid[];
  g  uuid[];
begin
  if me is null or r = 0 or p_task is null then return false; end if;
  if r >= 3 then return exists (select 1 from tasks where id = p_task); end if;
  if exists (select 1 from tasks where id = p_task and created_by = me) then return true; end if;
  d := public.wtm_my_depts();
  g := public.wtm_my_groups();
  if exists (select 1 from task_assignees a where a.task_id = p_task and (
        (a.kind = 'user' and a.target_id = me)
     or (a.kind = 'dept' and a.target_id = any(d))
     or (a.kind = 'group' and a.target_id = any(g)))) then
    return true;
  end if;
  if r = 2 then
    if exists (select 1 from task_assignees a join department_members dm on dm.profile_id = a.target_id
                where a.task_id = p_task and a.kind = 'user' and dm.department_id = any(d)) then return true; end if;
    if exists (select 1 from task_assignees a join group_members gm on gm.group_id = a.target_id
                join department_members dm on dm.profile_id = gm.profile_id
                where a.task_id = p_task and a.kind = 'group' and dm.department_id = any(d)) then return true; end if;
    if exists (select 1 from tasks t join department_members dm on dm.profile_id = t.created_by
                where t.id = p_task and dm.department_id = any(d)) then return true; end if;
  end if;
  return false;
end $$;

-- Log entries: your own, entries on tasks you can see, everything for admin/IT,
-- and supervisors see entries written by people in their departments.
create or replace function public.wtm_can_see_log(p_task uuid, p_actor uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r int := public.wtm_my_rank();
begin
  if r = 0 then return false; end if;
  if r >= 3 or p_actor = auth.uid() then return true; end if;
  if p_task is not null and public.wtm_can_see_task(p_task) then return true; end if;
  if r = 2 and p_actor is not null and exists (
       select 1 from department_members dm where dm.profile_id = p_actor and dm.department_id = any(public.wtm_my_depts())) then
    return true;
  end if;
  return false;
end $$;

-- Messages: everyone/department threads are readable by all active staff; direct messages by sender/recipient; group threads by members.
create or replace function public.wtm_can_see_message(p_sender uuid, p_kind text, p_to uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.wtm_my_rank() > 0 and (
       p_sender = auth.uid()
    or p_kind = 'all'
    or p_kind = 'dept'
    or (p_kind = 'user'  and p_to = auth.uid())
    or (p_kind = 'group' and p_to = any(public.wtm_my_groups())))
$$;

-- Can p_caller manage logins for p_target / hand out p_role?
--   IT: anyone.  Admin: supervisors and staff only.  Nobody else.
create or replace function public.wtm__can_manage(p_caller uuid, p_target uuid, p_role public.wtm_role) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cr int := public.wtm_rank_of(p_caller); tr int;
begin
  if cr < 3 then return false; end if;
  if p_target is not null then
    select public.wtm_rank(role) into tr from profiles where id = p_target;
    if tr is null then return false; end if;
    if cr = 3 and tr >= 3 and p_target <> p_caller then return false; end if;
  end if;
  if p_role is not null and cr = 3 and public.wtm_rank(p_role) >= 3 then return false; end if;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 3. Formatting and internal helpers
-- ---------------------------------------------------------------------
create or replace function public.wtm__dur(ms bigint) returns text
language sql immutable as $$
  select case
    when ms is null then ''
    when ms < 60000 then '<1m'
    when ms < 3600000 then (ms / 60000)::text || 'm'
    else (ms / 3600000)::text || 'h ' || lpad(((ms / 60000) % 60)::text, 2, '0') || 'm' end
$$;

create or replace function public.wtm__day(d date) returns text
language sql immutable as $$
  select case when d is null then '—' else to_char(d, 'Dy FMDD Mon') end
$$;

create or replace function public.wtm__status(s text) returns text
language sql immutable as $$
  select case s when 'todo' then 'To do' when 'doing' then 'In progress' when 'blocked' then 'Blocked' when 'done' then 'Done' else s end
$$;

create or replace function public.wtm__role_label(r public.wtm_role) returns text
language sql immutable as $$
  select case r when 'it' then 'IT' when 'admin' then 'Admin' when 'supervisor' then 'Supervisor' else 'Staff' end
$$;

create or replace function public.wtm__name(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(full_name, ''), email) from profiles where id = p), 'someone')
$$;

create or replace function public.wtm__tag_label(t text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when t like 'person:%' then '@' || coalesce((select coalesce(nullif(short_name, ''), nullif(full_name, ''), email) from profiles where id::text = substr(t, 8)), 'someone')
    when t like 'dept:%'   then coalesce((select name from departments where id::text = substr(t, 6)), 'department')
    when t like 'room:%'   then substr(t, 6)
    when t like 'trade:%'  then initcap(replace(substr(t, 7), '-', ' '))
    else '#' || t end
$$;

create or replace function public.wtm__assignee_label(p_kind text, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'all'   then 'Everyone'
    when 'user'  then public.wtm__name(p_id)
    when 'dept'  then coalesce((select name from departments where id = p_id), 'department')
    when 'group' then coalesce((select name from groups where id = p_id), 'group') || ' (group)'
    else '?' end
$$;

create or replace function public.wtm__log(
  p_action text, p_task public.tasks, p_detail text,
  p_dur bigint default null, p_actor uuid default null, p_subject uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into log_entries (action, task_id, task_title, project_id, project_name, detail, duration_ms, actor, subject)
  values (p_action, (p_task).id, coalesce((p_task).title, ''), (p_task).project_id,
          coalesce((select name from projects where id = (p_task).project_id), ''),
          left(coalesce(p_detail, ''), 2000), p_dur, coalesce(p_actor, auth.uid()), p_subject);
end $$;

create or replace function public.wtm__task_json(p_task uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) || jsonb_build_object(
    'assignees', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'id', a.target_id) order by a.kind, a.target_id)
                           from task_assignees a where a.task_id = t.id), '[]'::jsonb),
    'timers',    coalesce((select jsonb_agg(jsonb_build_object('profile_id', tm.profile_id, 'started_at', tm.started_at))
                           from timers tm where tm.task_id = t.id), '[]'::jsonb))
  from tasks t where t.id = p_task
$$;

create or replace function public.wtm__clean_tags(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct x order by x), '{}')
  from (select left(btrim(value), 80) as x from jsonb_array_elements_text(coalesce(p, '[]'::jsonb))) s
  where x <> ''
$$;

create or replace function public.wtm__clean_checks(p jsonb) returns jsonb
language plpgsql immutable as $$
declare r jsonb := '[]'::jsonb; e jsonb; n int := 0; label text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'::jsonb; end if;
  for e in select value from jsonb_array_elements(p) loop
    label := left(btrim(coalesce(e->>'t', '')), 80);
    if label = '' then continue; end if;
    n := n + 1;
    exit when n > 12;
    r := r || jsonb_build_array(jsonb_build_object('t', label, 'done', coalesce((e->>'done')::boolean, false)));
  end loop;
  return r;
end $$;

create or replace function public.wtm__merge_checks(p_old jsonb, p_labels text[]) returns jsonb
language plpgsql immutable as $$
declare r jsonb := '[]'::jsonb; label text; was boolean;
begin
  if p_labels is null then return '[]'::jsonb; end if;
  foreach label in array p_labels loop
    label := left(btrim(coalesce(label, '')), 80);
    if label = '' then continue; end if;
    was := false;
    select coalesce((e->>'done')::boolean, false) into was
      from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) e
     where e->>'t' = label
     limit 1;
    if not found then was := false; end if;
    r := r || jsonb_build_array(jsonb_build_object('t', label, 'done', coalesce(was, false)));
  end loop;
  return r;
end $$;

create or replace function public.wtm__clean_weekdays(p jsonb) returns smallint[]
language plpgsql immutable as $$
declare r smallint[] := '{}'; d int;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return array[0,1,2,3,4,5,6]::smallint[]; end if;
  for d in
    select distinct (value #>> '{}')::int
    from jsonb_array_elements(p)
    where (value #>> '{}') ~ '^[0-6]$'
    order by 1
  loop
    r := r || d::smallint;
  end loop;
  if cardinality(r) = 0 then return array[0,1,2,3,4,5,6]::smallint[]; end if;
  return r;
end $$;

create or replace function public.wtm__clean_checklist(p jsonb) returns text[]
language sql immutable as $$
  select coalesce((
    select array_agg(x order by n)
    from (
      select left(btrim(value), 80) as x, n
      from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) with ordinality as s(value, n)
      where btrim(value) <> ''
      order by n
      limit 12
    ) q
  ), '{}'::text[])
$$;

create or replace function public.wtm__set_assignees(p_task uuid, p_list jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from task_assignees where task_id = p_task;
  insert into task_assignees (task_id, kind, target_id)
  select distinct p_task, e.kind, e.id
  from (select value->>'kind' as kind, (value->>'id')::uuid as id
          from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) limit 40) e
  where (e.kind = 'user'  and exists (select 1 from profiles where id = e.id and active))
     or (e.kind = 'dept'  and exists (select 1 from departments where id = e.id and not archived))
     or (e.kind = 'group' and exists (select 1 from groups where id = e.id and not archived));
end $$;

create or replace function public.wtm__describe(t public.tasks) returns text
language sql stable security definer set search_path = public as $$
  select array_to_string(array_remove(array[
    'P' || t.priority,
    case when t.status <> 'todo' then public.wtm__status(t.status) end,
    case when t.due is not null then 'Due ' || public.wtm__day(t.due) end,
    case when cardinality(t.tags) > 0 then (select string_agg(public.wtm__tag_label(x), ' ') from unnest(t.tags) x) end,
    (select '→ ' || string_agg(public.wtm__assignee_label(a.kind, a.target_id), ', ')
       from task_assignees a where a.task_id = t.id having count(*) > 0)
  ], null), ' · ')
$$;

-- stop one person's running timer, bank the time and log it
create or replace function public.wtm__stop_timer(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tm timers; t tasks; dur bigint; extra text := '';
begin
  select * into tm from timers where profile_id = p_profile for update;
  if not found then return; end if;
  dur := greatest(0, floor(extract(epoch from (now() - tm.started_at)) * 1000)::bigint);
  delete from timers where profile_id = p_profile;
  update tasks set spent_ms = spent_ms + dur, updated_at = now() where id = tm.task_id returning * into t;
  if auth.uid() is not null and auth.uid() <> p_profile then extra := ' · stopped by ' || public.wtm__name(auth.uid()); end if;
  perform public.wtm__log('stop', t, 'Total ' || public.wtm__dur(t.spent_ms) || extra, dur, p_profile);
end $$;

create or replace function public.wtm__stop_timers_on(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  for pid in select profile_id from timers where task_id = p_task loop
    perform public.wtm__stop_timer(pid);
  end loop;
end $$;

create or replace function public.wtm__require(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception '%', p_msg using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Reading: bootstrap and incremental sync
-- ---------------------------------------------------------------------
create or replace function public.wtm__directory() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'email', p.email, 'full_name', p.full_name, 'short_name', p.short_name, 'title', p.title,
        'role', p.role, 'active', p.active, 'removed_at', p.removed_at, 'created_at', p.created_at) order by p.full_name) from profiles p), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(to_jsonb(d) order by d.name) from departments d), '[]'::jsonb),
    'department_members', coalesce((select jsonb_agg(jsonb_build_object('d', department_id, 'p', profile_id, 'h', head)) from department_members), '[]'::jsonb),
    'tag_departments', coalesce((select jsonb_agg(jsonb_build_object('tag', tag, 'd', department_id) order by tag) from tag_departments), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(to_jsonb(g) order by g.name) from groups g), '[]'::jsonb),
    'group_members', coalesce((select jsonb_agg(jsonb_build_object('g', group_id, 'p', profile_id)) from group_members), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from projects x), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from rooms x), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from locations x), '[]'::jsonb),
    'maps', coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from maps x), '[]'::jsonb),
    'tag_rules', coalesce((select jsonb_agg(to_jsonb(x) order by x.phrase) from tag_rules x), '[]'::jsonb))
$$;

create or replace function public.wtm_bootstrap(p_log_limit int default 2000, p_msg_limit int default 1500) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r int := public.wtm_my_rank();
begin
  if me is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  if not exists (select 1 from profiles where id = me) then
    raise exception 'This login has no WTM profile. Ask IT to add you.' using errcode = '42501';
  end if;
  if r = 0 then
    return jsonb_build_object('inactive', true, 'me', (select to_jsonb(p) from profiles p where id = me));
  end if;
  return public.wtm__directory() || jsonb_build_object(
    'me', (select to_jsonb(p) from profiles p where id = me),
    'tasks', coalesce((select jsonb_agg(public.wtm__task_json(t.id))
                         from public.wtm_visible_task_ids() v join tasks t on t.id = v.id
                        where t.deleted_at is null or t.deleted_at > now() - interval '14 days'), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc)
                       from (select * from log_entries e where public.wtm_can_see_log(e.task_id, e.actor)
                              order by e.id desc limit greatest(1, least(p_log_limit, 10000))) l), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.id desc)
                            from (select * from messages x where public.wtm_can_see_message(x.sender, x.to_kind, x.to_id)
                                   order by x.id desc limit greatest(1, least(p_msg_limit, 5000))) m), '[]'::jsonb),
    'reads', coalesce((select jsonb_object_agg(conv, last_read_id) from message_reads where profile_id = me), '{}'::jsonb),
    'notices', coalesce((select jsonb_agg(to_jsonb(n) order by n.pinned desc, n.created_at desc) from notices n where n.archived_at is null), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from orders o), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from daily_tasks d where d.archived_at is null), '[]'::jsonb),
    'calendar', coalesce((select jsonb_agg(to_jsonb(c) order by c.day, c.title) from calendar_entries c
                           where c.deleted_at is null and coalesce(c.end_day, c.day) >= current_date - 60 and c.day <= current_date + 800), '[]'::jsonb),
    'server_time', now());
end $$;

-- changes since the last sync; the browser calls this when realtime pokes it
create or replace function public.wtm_sync(p_since timestamptz, p_log_after bigint, p_msg_after bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r int := public.wtm_my_rank();
begin
  if me is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  if r = 0 then
    return jsonb_build_object('inactive', true, 'me', (select to_jsonb(p) from profiles p where id = me));
  end if;
  return public.wtm__directory() || jsonb_build_object(
    'me', (select to_jsonb(p) from profiles p where id = me),
    'visible_ids', coalesce((select jsonb_agg(v.id) from public.wtm_visible_task_ids() v), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(public.wtm__task_json(t.id))
                         from public.wtm_visible_task_ids() v join tasks t on t.id = v.id
                        where t.updated_at >= coalesce(p_since, '-infinity'::timestamptz) - interval '5 seconds'), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(to_jsonb(l) order by l.id)
                       from (select * from log_entries e
                              where e.id > coalesce(p_log_after, 0) and public.wtm_can_see_log(e.task_id, e.actor)
                              order by e.id limit 2000) l), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.id)
                            from (select * from messages x
                                   where x.id > coalesce(p_msg_after, 0) and public.wtm_can_see_message(x.sender, x.to_kind, x.to_id)
                                   order by x.id limit 2000) m), '[]'::jsonb),
    'reads', coalesce((select jsonb_object_agg(conv, last_read_id) from message_reads where profile_id = me), '{}'::jsonb),
    'notices', coalesce((select jsonb_agg(to_jsonb(n) order by n.pinned desc, n.created_at desc) from notices n where n.archived_at is null), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from orders o), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from daily_tasks d where d.archived_at is null), '[]'::jsonb),
    'calendar', coalesce((select jsonb_agg(to_jsonb(c) order by c.day, c.title) from calendar_entries c
                           where c.deleted_at is null and coalesce(c.end_day, c.day) >= current_date - 60 and c.day <= current_date + 800), '[]'::jsonb),
    'server_time', now());
end $$;

-- older log entries, for "Load older" in the log book
create or replace function public.wtm_log_before(p_before bigint, p_limit int default 2000) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc)
                     from (select * from log_entries e
                            where e.id < p_before and public.wtm_can_see_log(e.task_id, e.actor)
                            order by e.id desc limit greatest(1, least(p_limit, 10000))) l), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. Tasks
-- ---------------------------------------------------------------------
create or replace function public.wtm__clean_pin(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mid uuid; x numeric; y numeric; loc uuid;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'object' or nullif(p->>'map_id', '') is null then
    raise exception 'Drop the pin on the map.' using errcode = '22023';
  end if;
  begin
    mid := (p->>'map_id')::uuid;
    x := round((p->>'x')::numeric, 2);
    y := round((p->>'y')::numeric, 2);
  exception when others then
    raise exception 'Drop the pin on the map.' using errcode = '22023';
  end;
  if x < 0 or x > 100 or y < 0 or y > 100 then
    raise exception 'Drop the pin on the map.' using errcode = '22023';
  end if;
  select m.location_id into loc from maps m
    join locations l on l.id = m.location_id
   where m.id = mid and not m.archived and not l.archived;
  if loc is null then
    raise exception 'That map isn''t available.' using errcode = '22023';
  end if;
  return jsonb_build_object('map_id', mid, 'location_id', loc, 'x', x, 'y', y);
end $$;

create or replace function public.wtm__own_photo(p text, p_old text) returns text
language plpgsql stable security definer set search_path = public as $$
declare path text := nullif(btrim(coalesce(p, '')), '');
begin
  if path is null then return null; end if;
  if p_old is not null and path = p_old then return path; end if;
  if path !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' then
    raise exception 'That photo couldn''t be saved.' using errcode = '22023';
  end if;
  if lower(split_part(path, '/', 1)) <> lower(auth.uid()::text) then
    raise exception 'You can only attach a photo you uploaded.' using errcode = '42501';
  end if;
  return path;
end $$;

create or replace function public.wtm__pin_label(p jsonb) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select l.name || ' · ' || m.name from maps m join locations l on l.id = m.location_id
                    where m.id = nullif(p->>'map_id', '')::uuid), 'map');
$$;

create or replace function public.wtm_save_task(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  v_id  uuid := nullif(p->>'id', '')::uuid;
  old   tasks;
  t     tasks;
  ch    text[] := '{}';
  a_old text[];
  a_new text[];
  plus  text[];
  minus text[];
  ck_el jsonb;
  ck_prev boolean;
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');

  -- create
  if v_id is null or not exists (select 1 from tasks where id = v_id) then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'title', ''))) > 0, 'Give the task a title.');
    if coalesce(p->>'status', 'todo') = 'blocked' then
      perform public.wtm__require(char_length(btrim(coalesce(p->>'blocked_note', ''))) > 0, 'Say why this task is blocked.');
    end if;
    insert into tasks (id, title, notes, project_id, priority, status, due, tags, created_by, done_at, blocked_note, due_time, checks, pin, photo)
    values (coalesce(v_id, gen_random_uuid()),
            left(btrim(p->>'title'), 300),
            left(coalesce(p->>'notes', ''), 5000),
            (select id from projects where id = nullif(p->>'project_id', '')::uuid and not archived),
            least(4, greatest(1, coalesce((p->>'priority')::int, 3))),
            case when p->>'status' in ('todo', 'doing', 'blocked', 'done') then p->>'status' else 'todo' end,
            nullif(p->>'due', '')::date,
            public.wtm__clean_tags(p->'tags'),
            me,
            case when p->>'status' = 'done' then now() end,
            case when p->>'status' = 'blocked' then left(btrim(coalesce(p->>'blocked_note', '')), 200) else '' end,
            nullif(btrim(coalesce(p->>'due_time', '')), '')::time,
            public.wtm__clean_checks(p->'checks'),
            public.wtm__clean_pin(p->'pin'),
            public.wtm__own_photo(p->>'photo', null))
    returning * into t;
    if p ? 'assignees' then perform public.wtm__set_assignees(t.id, p->'assignees'); end if;
    perform public.wtm__log('created', t, public.wtm__describe(t));
    return public.wtm__task_json(t.id);
  end if;

  -- update
  perform public.wtm__require(public.wtm_can_see_task(v_id), 'You can''t change that task.');
  select * into old from tasks where id = v_id for update;
  perform public.wtm__require(old.deleted_at is null, 'That task was deleted.');
  t := old;
  if p ? 'title' then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'title', ''))) > 0, 'Give the task a title.');
    t.title := left(btrim(p->>'title'), 300);
  end if;
  if p ? 'notes'      then t.notes := left(coalesce(p->>'notes', ''), 5000); end if;
  if p ? 'project_id' then t.project_id := (select id from projects where id = nullif(p->>'project_id', '')::uuid); end if;
  if p ? 'priority'   then t.priority := least(4, greatest(1, coalesce((p->>'priority')::int, 3))); end if;
  if p ? 'due'        then t.due := nullif(p->>'due', '')::date; end if;
  if p ? 'due_time'   then t.due_time := nullif(btrim(coalesce(p->>'due_time', '')), '')::time; end if;
  if p ? 'tags'       then t.tags := public.wtm__clean_tags(p->'tags'); end if;
  if p ? 'blocked_note' then t.blocked_note := left(btrim(coalesce(p->>'blocked_note', '')), 200); end if;
  if p ? 'checks'     then t.checks := public.wtm__clean_checks(p->'checks'); end if;
  if p ? 'pin'        then t.pin := public.wtm__clean_pin(p->'pin'); end if;
  if p ? 'photo'      then t.photo := public.wtm__own_photo(p->>'photo', old.photo); end if;
  if p ? 'status' and p->>'status' in ('todo', 'doing', 'blocked', 'done') then t.status := p->>'status'; end if;
  if p ? 'checks' and not (p ? 'status') and jsonb_typeof(coalesce(t.checks, '[]'::jsonb)) = 'array' and jsonb_array_length(coalesce(t.checks, '[]'::jsonb)) > 0 then
    if not exists (select 1 from jsonb_array_elements(t.checks) e where coalesce((e->>'done')::boolean, false) = false) then
      t.status := 'done';
    elsif t.status = 'done' then
      t.status := 'todo';
    end if;
  end if;
  if t.status = 'blocked' then
    perform public.wtm__require(char_length(btrim(t.blocked_note)) > 0, 'Say why this task is blocked.');
  else
    t.blocked_note := '';
  end if;

  if t.title is distinct from old.title then
    ch := ch || format('Title “%s” → “%s”', left(old.title, 40), left(t.title, 40));
  end if;
  if t.project_id is distinct from old.project_id then
    ch := ch || format('Project %s → %s',
      coalesce((select name from projects where id = old.project_id), 'none'),
      coalesce((select name from projects where id = t.project_id), 'none'));
  end if;
  if t.priority <> old.priority then ch := ch || format('Priority P%s → P%s', old.priority, t.priority); end if;
  if t.due is distinct from old.due then ch := ch || format('Due %s → %s', public.wtm__day(old.due), public.wtm__day(t.due)); end if;
  if t.due_time is distinct from old.due_time then
    ch := ch || format('Due time %s → %s', coalesce(to_char(old.due_time, 'HH24:MI'), 'none'), coalesce(to_char(t.due_time, 'HH24:MI'), 'none'));
  end if;
  if t.status = 'blocked' and old.status = 'blocked' and t.blocked_note is distinct from old.blocked_note then
    ch := ch || ('Blocked · ' || t.blocked_note);
  end if;
  plus  := array(select x from unnest(t.tags) x except select y from unnest(old.tags) y);
  minus := array(select y from unnest(old.tags) y except select x from unnest(t.tags) x);
  if cardinality(plus) + cardinality(minus) > 0 then
    ch := ch || ('Tags ' || array_to_string(
      array(select '+' || public.wtm__tag_label(x) from unnest(plus) x) ||
      array(select '−' || public.wtm__tag_label(x) from unnest(minus) x), ' '));
  end if;
  if t.notes is distinct from old.notes then ch := ch || 'Notes updated'::text; end if;
  if t.pin is distinct from old.pin then
    ch := ch || (case when t.pin is null then 'Pin removed' else 'Pin on ' || public.wtm__pin_label(t.pin) end);
  end if;
  if t.photo is distinct from old.photo then
    ch := ch || (case when t.photo is null then 'Photo removed' else 'Photo added' end);
  end if;

  if p ? 'assignees' then
    a_old := array(select kind || ':' || target_id from task_assignees where task_id = v_id);
    perform public.wtm__set_assignees(v_id, p->'assignees');
    a_new := array(select kind || ':' || target_id from task_assignees where task_id = v_id);
    plus  := array(select x from unnest(a_new) x except select y from unnest(a_old) y);
    minus := array(select y from unnest(a_old) y except select x from unnest(a_new) x);
    if cardinality(plus) + cardinality(minus) > 0 then
      ch := ch || ('Assigned ' || array_to_string(
        array(select '+' || public.wtm__assignee_label(split_part(x, ':', 1), split_part(x, ':', 2)::uuid) from unnest(plus) x) ||
        array(select '−' || public.wtm__assignee_label(split_part(x, ':', 1), split_part(x, ':', 2)::uuid) from unnest(minus) x), ' '));
    end if;
  end if;

  if t.status <> old.status then
    t.done_at := case when t.status = 'done' then now() else null end;
  end if;
  if cardinality(ch) = 0 and t.status = old.status
     and t.blocked_note is not distinct from old.blocked_note
     and t.due_time is not distinct from old.due_time
     and t.checks is not distinct from old.checks
     and t.pin is not distinct from old.pin
     and t.photo is not distinct from old.photo then
    return public.wtm__task_json(v_id);
  end if;

  update tasks set title = t.title, notes = t.notes, project_id = t.project_id, priority = t.priority,
                   status = t.status, due = t.due, due_time = t.due_time, tags = t.tags,
                   blocked_note = t.blocked_note, checks = t.checks, pin = t.pin, photo = t.photo,
                   done_at = t.done_at, updated_at = now()
   where id = v_id returning * into t;
  if cardinality(ch) > 0 then perform public.wtm__log('edited', t, array_to_string(ch, ' · ')); end if;

  if t.status <> old.status then
    if t.status = 'done' then
      perform public.wtm__stop_timers_on(v_id);
      select * into t from tasks where id = v_id;
      perform public.wtm__log('done', t, case when t.spent_ms > 0 then 'Total time ' || public.wtm__dur(t.spent_ms) else '' end);
    elsif old.status = 'done' then
      perform public.wtm__log('reopened', t, 'Back to ' || public.wtm__status(t.status));
    else
      perform public.wtm__log('status', t, public.wtm__status(old.status) || ' → ' || public.wtm__status(t.status)
        || case when t.status = 'blocked' and btrim(t.blocked_note) <> '' then ' · ' || t.blocked_note else '' end);
    end if;
  end if;
  if t.checks is distinct from coalesce(old.checks, '[]'::jsonb) then
    for ck_el in select value from jsonb_array_elements(coalesce(t.checks, '[]'::jsonb)) loop
      ck_prev := false;
      select coalesce((o->>'done')::boolean, false) into ck_prev
        from jsonb_array_elements(coalesce(old.checks, '[]'::jsonb)) o
       where o->>'t' = ck_el->>'t'
       limit 1;
      if coalesce((ck_el->>'done')::boolean, false) is distinct from coalesce(ck_prev, false)
         and coalesce(ck_el->>'t', '') <> '' then
        perform public.wtm__log('check', t, (case when (ck_el->>'done')::boolean then 'Checked ' else 'Unchecked ' end) || (ck_el->>'t'));
      end if;
    end loop;
  end if;
  return public.wtm__task_json(v_id);
end $$;

create or replace function public.wtm_timer(p_task uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Timers are turned off.' using errcode = '22023';
end $$;

create or replace function public.wtm_add_time(p_task uuid, p_minutes int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Timers are turned off.' using errcode = '22023';
end $$;

create or replace function public.wtm_delete_task(p_task uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  select * into t from tasks where id = p_task;
  perform public.wtm__require(public.wtm_can_see_task(p_task)
    and (t.created_by = auth.uid() or public.wtm_my_rank() >= 2), 'Only the person who created a task, or a supervisor, can delete it.');
  perform public.wtm__require(t.deleted_at is null, 'That task is already deleted.');
  perform public.wtm__stop_timers_on(p_task);
  update tasks set deleted_at = now(), updated_at = now() where id = p_task returning * into t;
  perform public.wtm__log('deleted', t, 'Was ' || public.wtm__status(t.status));
  return public.wtm__task_json(p_task);
end $$;

create or replace function public.wtm_restore_task(p_task uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  select * into t from tasks where id = p_task;
  perform public.wtm__require(public.wtm_can_see_task(p_task)
    and (t.created_by = auth.uid() or public.wtm_my_rank() >= 2), 'Only the person who created a task, or a supervisor, can restore it.');
  update tasks set deleted_at = null, updated_at = now() where id = p_task returning * into t;
  perform public.wtm__log('restored', t, '');
  return public.wtm__task_json(p_task);
end $$;

create or replace function public.wtm_note(p_text text, p_task uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  perform public.wtm__require(char_length(btrim(coalesce(p_text, ''))) > 0, 'Write something first.');
  if p_task is not null then
    perform public.wtm__require(public.wtm_can_see_task(p_task), 'You can''t add notes to that task.');
    select * into t from tasks where id = p_task;
  end if;
  perform public.wtm__log('note', t, left(btrim(p_text), 2000));
end $$;

-- ---------------------------------------------------------------------
-- 6. Messages
-- ---------------------------------------------------------------------
drop function if exists public.wtm_send_message(text, uuid, text, uuid);
create or replace function public.wtm_send_message(p_kind text, p_to uuid, p_body text, p_task uuid default null, p_pin jsonb default null, p_photo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r int := public.wtm_my_rank(); m messages; t tasks;
        k text := coalesce(nullif(btrim(p_kind), ''), 'all');
        target uuid := coalesce(p_to, '00000000-0000-0000-0000-000000000000'::uuid);
        b text := left(btrim(coalesce(p_body, '')), 4000);
        v_pin jsonb := public.wtm__clean_pin(p_pin);
        v_photo text := public.wtm__own_photo(p_photo, null);
begin
  perform public.wtm__require(r > 0, 'Your account is turned off.');
  perform public.wtm__require(char_length(b) > 0 or v_pin is not null or v_photo is not null, 'Write a message, add a photo, or drop a pin.');
  if k = 'all' then
    target := '00000000-0000-0000-0000-000000000000'::uuid;
  elsif k = 'user' then
    perform public.wtm__require(target <> me and exists (select 1 from profiles where id = target and active), 'That person can''t receive messages.');
  elsif k = 'dept' then
    perform public.wtm__require(exists (select 1 from departments where id = target and not archived), 'That department isn''t available.');
  elsif k = 'group' then
    perform public.wtm__require(exists (select 1 from groups where id = target and not archived)
      and target = any(public.wtm_my_groups()), 'You can only message groups you belong to.');
  else
    raise exception 'Choose who to send it to.' using errcode = '22023';
  end if;
  if p_task is not null then
    perform public.wtm__require(public.wtm_can_see_task(p_task), 'You can''t link that task.');
    select * into t from tasks where id = p_task;
  end if;
  insert into messages (sender, to_kind, to_id, body, task_id, pin, photo)
  values (me, k, target, b, p_task, v_pin, v_photo) returning * into m;
  insert into message_reads (profile_id, conv, last_read_id)
  values (me, k || ':' || target, m.id)
  on conflict (profile_id, conv) do update set last_read_id = greatest(message_reads.last_read_id, excluded.last_read_id);
  perform public.wtm__log('message', t, 'To ' || public.wtm__assignee_label(k, target)
    || case when v_photo is not null then ' · photo' else '' end
    || case when v_pin is not null then ' · pin' else '' end);
  return to_jsonb(m);
end $$;

create or replace function public.wtm_mark_read(p_conv text, p_last bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  insert into message_reads (profile_id, conv, last_read_id) values (auth.uid(), left(p_conv, 80), p_last)
  on conflict (profile_id, conv) do update set last_read_id = greatest(message_reads.last_read_id, excluded.last_read_id);
end $$;

-- ---------------------------------------------------------------------
-- 6b. Notice board and order list
-- ---------------------------------------------------------------------
create or replace function public.wtm_save_notice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r int := public.wtm_my_rank();
        v_id uuid := nullif(p->>'id', '')::uuid;
        old notices; n notices;
begin
  perform public.wtm__require(r > 0, 'Your account is turned off.');
  if v_id is null then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'title', ''))) > 0, 'Give the notice a title.');
    insert into notices (title, body, pinned, created_by, show_until)
    values (left(btrim(p->>'title'), 160), left(coalesce(p->>'body', ''), 4000), coalesce((p->>'pinned')::boolean, false), me,
            nullif(p->>'show_until', '')::date)
    returning * into n;
    perform public.wtm__log('notice', null::tasks, 'Posted “' || n.title || '”');
    return to_jsonb(n);
  end if;
  select * into old from notices where id = v_id for update;
  perform public.wtm__require(old.id is not null, 'That notice is gone.');
  perform public.wtm__require(old.created_by = me or r >= 2, 'Only the author, a supervisor, admin or IT can change this notice.');
  update notices set
    title = case when p ? 'title' and btrim(p->>'title') <> '' then left(btrim(p->>'title'), 160) else title end,
    body = case when p ? 'body' then left(coalesce(p->>'body', ''), 4000) else body end,
    pinned = case when p ? 'pinned' then (p->>'pinned')::boolean else pinned end,
    show_until = case when p ? 'show_until' then nullif(p->>'show_until', '')::date else show_until end,
    archived_at = case when p ? 'archived' then case when (p->>'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end,
    updated_at = now()
  where id = v_id returning * into n;
  if n.archived_at is not null and old.archived_at is null then
    perform public.wtm__log('notice', null::tasks, 'Removed notice “' || n.title || '”');
  elsif old.archived_at is not null and n.archived_at is null then
    perform public.wtm__log('notice', null::tasks, 'Restored notice “' || n.title || '”');
  elsif n.pinned is distinct from old.pinned then
    perform public.wtm__log('notice', null::tasks, (case when n.pinned then 'Pinned' else 'Unpinned' end) || ' “' || n.title || '”');
  elsif n.title is distinct from old.title or n.body is distinct from old.body then
    perform public.wtm__log('notice', null::tasks, 'Updated notice “' || n.title || '”');
  elsif n.show_until is distinct from old.show_until then
    perform public.wtm__log('notice', null::tasks, 'Notice “' || n.title || '” shows until ' || coalesce(public.wtm__day(n.show_until), 'further notice'));
  end if;
  return to_jsonb(n);
end $$;

create or replace function public.wtm_save_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r int := public.wtm_my_rank();
        v_id uuid := nullif(p->>'id', '')::uuid;
        v_task uuid := nullif(p->>'task_id', '')::uuid;
        v_trade text; v_dept uuid; heads uuid[]; who text; dname text;
        old orders; o orders; t tasks; st text;
begin
  perform public.wtm__require(r > 0, 'Your account is turned off.');
  if p ? 'task_id' and v_task is not null then
    perform public.wtm__require(public.wtm_can_see_task(v_task), 'You can''t link that task.');
  end if;
  if v_id is null then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'item', ''))) > 0, 'Say what needs ordering.');
    v_trade := left(lower(btrim(coalesce(p->>'trade', ''))), 40);
    v_dept := nullif(p->>'department_id', '')::uuid;
    if v_dept is null and v_trade <> '' then
      select department_id into v_dept from tag_departments where tag = v_trade;
    end if;
    if v_dept is not null and not exists (select 1 from departments where id = v_dept and not archived) then v_dept := null; end if;
    heads := coalesce((select array_agg(m.profile_id) from department_members m
                        join profiles pr on pr.id = m.profile_id
                       where m.department_id = v_dept and m.head and pr.active and pr.removed_at is null), '{}');
    insert into orders (item, qty, note, trade, created_by, task_id, department_id, tagged)
    values (left(btrim(p->>'item'), 200), left(coalesce(nullif(btrim(p->>'qty'), ''), '1'), 40),
            left(coalesce(p->>'note', ''), 500), v_trade, me, v_task, v_dept, heads)
    returning * into o;
    if o.task_id is not null then
      select * into t from tasks where id = o.task_id;
      perform public.wtm__set_assignees(o.task_id, (
        select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'id', a.id)), '[]'::jsonb)
          from (
            select kind, target_id as id from task_assignees where task_id = o.task_id
            union select 'dept', v_dept where v_dept is not null
            union select 'user', h from unnest(heads) h
          ) a));
      update tasks set tags = (
        select coalesce(array_agg(distinct x), '{}')
          from unnest(coalesce(tags, '{}') || coalesce((select array_agg('person:' || h::text) from unnest(heads) h), '{}')) x
      ), updated_at = now() where id = o.task_id returning * into t;
    end if;
    dname := (select name from departments where id = v_dept);
    select string_agg(public.wtm__name(h), ', ') into who from unnest(heads) h;
    perform public.wtm__log('order', t, 'Added “' || o.item || '”'
      || case when o.trade <> '' then ' · ' || o.trade else '' end
      || case when dname is not null then ' · from ' || dname else '' end
      || case when who is not null then ' · tagged ' || who else '' end);
    return to_jsonb(o);
  end if;
  select * into old from orders where id = v_id for update;
  perform public.wtm__require(old.id is not null, 'That order is gone.');
  if old.task_id is not null then select * into t from tasks where id = old.task_id; end if;
  if coalesce((p->>'deleted')::boolean, false) then
    perform public.wtm__require(old.created_by = me or r >= 2, 'Only the person who added it, a supervisor, admin or IT can remove it.');
    delete from orders where id = v_id;
    perform public.wtm__log('order', t, 'Removed “' || old.item || '” from the order list');
    return jsonb_build_object('id', v_id, 'deleted', true);
  end if;
  st := case when p->>'status' in ('needed', 'ordered', 'received') then p->>'status' else old.status end;
  update orders set
    item = case when p ? 'item' and btrim(p->>'item') <> '' then left(btrim(p->>'item'), 200) else item end,
    qty = case when p ? 'qty' then left(coalesce(nullif(btrim(p->>'qty'), ''), '1'), 40) else qty end,
    note = case when p ? 'note' then left(coalesce(p->>'note', ''), 500) else note end,
    trade = case when p ? 'trade' then left(lower(btrim(p->>'trade')), 40) else trade end,
    task_id = case when p ? 'task_id' then v_task else task_id end,
    status = st,
    updated_at = now()
  where id = v_id returning * into o;
  if o.task_id is not null then select * into t from tasks where id = o.task_id; end if;
  if st is distinct from old.status then
    perform public.wtm__log('order', t, '“' || o.item || '” ' || old.status || ' → ' || st);
  end if;
  if st = 'received' and st is distinct from old.status and o.task_id is not null then
    select * into t from tasks where id = o.task_id and deleted_at is null;
    if found and t.status = 'blocked' then
      update tasks set status = 'todo', blocked_note = '', done_at = null, updated_at = now()
       where id = t.id returning * into t;
      perform public.wtm__log('status', t, 'Part received — back to To do');
    end if;
  end if;
  return to_jsonb(o);
end $$;

-- ---------------------------------------------------------------------
-- 6c. Daily tasks: a standing list that opens once each day
-- ---------------------------------------------------------------------
create or replace function public.wtm_save_daily(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r int := public.wtm_my_rank();
  v_id uuid := nullif(p->>'id', '')::uuid;
  old daily_tasks;
  d daily_tasks;
  dep uuid;
  day date := nullif(p->>'day', '')::date;
  t tasks;
  touch boolean;
begin
  perform public.wtm__require(r > 0, 'Your account is turned off.');
  if day is null or day < current_date - 1 or day > current_date + 1 then day := current_date; end if;

  if v_id is null then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'title', ''))) > 0, 'Give the daily task a title.');
    dep := nullif(p->>'department_id', '')::uuid;
    perform public.wtm__require(exists (select 1 from departments where id = dep and not archived), 'Pick a department.');
    insert into daily_tasks (department_id, title, notes, priority, tags, created_by, weekdays, due_time, checklist)
    values (dep, left(btrim(p->>'title'), 300), left(coalesce(p->>'notes', ''), 5000),
            least(4, greatest(1, coalesce((p->>'priority')::int, 3))),
            public.wtm__clean_tags(p->'tags'), me,
            public.wtm__clean_weekdays(p->'weekdays'),
            nullif(btrim(coalesce(p->>'due_time', '')), '')::time,
            public.wtm__clean_checklist(p->'checklist'))
    returning * into d;
    perform public.wtm__log('daily', null::tasks, 'Set up daily for ' || (select name from departments where id = dep) || ': ' || d.title);
    return to_jsonb(d);
  end if;

  select * into old from daily_tasks where id = v_id for update;
  perform public.wtm__require(old.id is not null, 'That daily task is gone.');
  perform public.wtm__require(old.created_by = me or r >= 2, 'Only the person who set it up, a supervisor, admin or IT can change it.');

  if p ? 'archived' then
    update daily_tasks set archived_at = case when (p->>'archived')::boolean then now() else null end, updated_at = now()
     where id = v_id returning * into d;
    perform public.wtm__log('daily', null::tasks,
      case when d.archived_at is null then 'Restored daily: ' else 'Removed daily: ' end || d.title);
    return to_jsonb(d);
  end if;

  perform public.wtm__require(old.archived_at is null, 'That daily task was removed.');
  dep := case when p ? 'department_id' then nullif(p->>'department_id', '')::uuid else old.department_id end;
  perform public.wtm__require(exists (select 1 from departments where id = dep and not archived), 'Pick a department.');
  touch := p ? 'title' or p ? 'notes' or p ? 'priority' or p ? 'tags' or p ? 'department_id'
        or p ? 'weekdays' or p ? 'due_time' or p ? 'checklist';

  update daily_tasks set
    title = case when p ? 'title' and btrim(p->>'title') <> '' then left(btrim(p->>'title'), 300) else title end,
    notes = case when p ? 'notes' then left(coalesce(p->>'notes', ''), 5000) else notes end,
    priority = case when p ? 'priority' then least(4, greatest(1, coalesce((p->>'priority')::int, 3))) else priority end,
    tags = case when p ? 'tags' then public.wtm__clean_tags(p->'tags') else tags end,
    weekdays = case when p ? 'weekdays' then public.wtm__clean_weekdays(p->'weekdays') else weekdays end,
    due_time = case when p ? 'due_time' then nullif(btrim(coalesce(p->>'due_time', '')), '')::time else due_time end,
    checklist = case when p ? 'checklist' then public.wtm__clean_checklist(p->'checklist') else checklist end,
    department_id = dep,
    active = case when p ? 'active' then coalesce((p->>'active')::boolean, active) else active end,
    updated_at = now()
  where id = v_id returning * into d;

  if touch then
    for t in select * from tasks where daily_id = d.id and daily_on = day and deleted_at is null and status <> 'done' loop
      update tasks set title = d.title, notes = d.notes, priority = d.priority, tags = d.tags,
                       due_time = d.due_time, checks = public.wtm__merge_checks(checks, d.checklist), updated_at = now()
       where id = t.id returning * into t;
      perform public.wtm__set_assignees(t.id,
        jsonb_build_array(jsonb_build_object('kind', 'dept', 'id', d.department_id))
        || coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'id', a.target_id))
                       from task_assignees a where a.task_id = t.id and a.kind <> 'dept'), '[]'::jsonb));
      perform public.wtm__log('edited', t, 'Brought in line with the daily list');
    end loop;
  end if;
  return to_jsonb(d);
end $$;

-- Open today's copy of every running daily task, expire notices, and note slipped work.
-- Returns how many tasks were opened plus notices expired plus slip lines written.
drop function if exists public.wtm_open_daily(date);
create or replace function public.wtm_open_daily(p_day date, p_now time default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  d daily_tasks;
  t tasks;
  ntc notices;
  n int := 0;
  depname text;
  detail text;
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  perform public.wtm__require(p_day is not null and p_day between current_date - 1 and current_date + 1, 'Daily tasks open for today.');
  for d in
    select * from daily_tasks dt
     where dt.archived_at is null and dt.active
       and exists (select 1 from departments dep where dep.id = dt.department_id and not dep.archived)
       and (dt.weekdays is null or cardinality(dt.weekdays) = 0 or extract(dow from p_day)::int = any(dt.weekdays))
       and not exists (select 1 from tasks tk where tk.daily_id = dt.id and tk.daily_on = p_day)
  loop
    depname := coalesce((select name from departments where id = d.department_id), 'a department');
    insert into tasks (title, notes, priority, status, due, due_time, tags, checks, created_by, daily_id, daily_on)
    values (d.title, d.notes, d.priority, 'todo', p_day, d.due_time, d.tags,
            public.wtm__merge_checks('[]'::jsonb, d.checklist),
            coalesce(d.created_by, auth.uid()), d.id, p_day)
    on conflict (daily_id, daily_on) do nothing
    returning * into t;
    if not found then continue; end if;
    perform public.wtm__set_assignees(t.id, jsonb_build_array(jsonb_build_object('kind', 'dept', 'id', d.department_id)));
    perform public.wtm__log('created', t, 'Daily for ' || depname, null, coalesce(d.created_by, auth.uid()));
    n := n + 1;
  end loop;

  for ntc in
    select * from notices
     where archived_at is null and show_until is not null and show_until < p_day
  loop
    update notices set archived_at = now(), updated_at = now() where id = ntc.id and archived_at is null;
    if found then
      perform public.wtm__log('notice', null::tasks, 'Notice expired “' || ntc.title || '”');
      n := n + 1;
    end if;
  end loop;

  if p_now is not null then
    for t in
      select * from tasks tk
       where tk.deleted_at is null and tk.status <> 'done'
         and public.wtm_can_see_task(tk.id)
         and (
           (tk.priority = 1 and tk.due is not null and tk.due < p_day)
           or (
             tk.status = 'todo' and tk.due = p_day and tk.due_time is not null and tk.due_time < p_now
             and exists (select 1 from task_assignees a where a.task_id = tk.id and a.kind = 'dept')
             and not exists (select 1 from task_assignees a where a.task_id = tk.id and a.kind = 'user')
           )
         )
         and not exists (
           select 1 from log_entries e
            where e.task_id = tk.id and e.action = 'slip' and e.detail like p_day::text || ' %'
         )
    loop
      if t.priority = 1 and t.due is not null and t.due < p_day then
        detail := p_day::text || ' P1 still overdue';
      else
        detail := p_day::text || ' Unclaimed past ' || to_char(t.due_time, 'HH24:MI');
      end if;
      perform public.wtm__log('slip', t, detail);
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 6d. Calendar: events, bookings and public holidays. Jobs are tasks.
-- ---------------------------------------------------------------------
create or replace function public.wtm_save_calendar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); r int := public.wtm_my_rank();
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_kind text := lower(btrim(coalesce(p->>'kind', '')));
  v_title text := left(btrim(coalesce(p->>'title', '')), 160);
  v_day date := nullif(p->>'day', '')::date;
  v_end date := nullif(p->>'end_day', '')::date;
  v_time time := nullif(p->>'starts', '')::time;
  v_notes text := left(coalesce(p->>'notes', ''), 2000);
  old public.calendar_entries; ent public.calendar_entries;
begin
  perform public.wtm__require(r > 0, 'Your account is turned off.');
  if coalesce((p->>'deleted')::boolean, false) then
    select * into old from calendar_entries where id = v_id for update;
    perform public.wtm__require(old.id is not null and old.deleted_at is null, 'That entry is gone.');
    perform public.wtm__require(old.created_by = me or r >= 2, 'Only the person who added it, a supervisor, admin or IT can remove it.');
    if old.kind = 'holiday' then perform public.wtm__require(r >= 2, 'A supervisor, admin or IT removes public holidays.'); end if;
    update calendar_entries set deleted_at = now(), updated_at = now() where id = v_id returning * into ent;
    perform public.wtm__log('calendar', null::tasks, 'Removed ' || old.kind || ' “' || old.title || '”');
    return to_jsonb(ent);
  end if;
  perform public.wtm__require(v_kind in ('event', 'booking', 'holiday'), 'Choose an event, a booking or a public holiday.');
  perform public.wtm__require(char_length(v_title) > 0, 'Give it a name.');
  perform public.wtm__require(v_day is not null, 'Pick a date.');
  perform public.wtm__require(v_end is null or v_end >= v_day, 'The end date has to be on or after the start.');
  if v_kind = 'holiday' then
    perform public.wtm__require(r >= 2, 'A supervisor, admin or IT adds public holidays.');
    v_end := null;
  end if;
  if v_id is null then
    insert into calendar_entries (kind, title, day, end_day, starts, notes, created_by)
    values (v_kind, v_title, v_day, v_end, v_time, v_notes, me) returning * into ent;
    perform public.wtm__log('calendar', null::tasks, 'Added ' || v_kind || ' “' || v_title || '”');
    return to_jsonb(ent);
  end if;
  select * into old from calendar_entries where id = v_id for update;
  perform public.wtm__require(old.id is not null and old.deleted_at is null, 'That entry is gone.');
  perform public.wtm__require(old.created_by = me or r >= 2, 'Only the person who added it, a supervisor, admin or IT can change it.');
  if old.kind = 'holiday' or v_kind = 'holiday' then
    perform public.wtm__require(r >= 2, 'A supervisor, admin or IT changes public holidays.');
  end if;
  update calendar_entries set kind = v_kind, title = v_title, day = v_day, end_day = v_end, starts = v_time, notes = v_notes, updated_at = now()
   where id = v_id returning * into ent;
  perform public.wtm__log('calendar', null::tasks, 'Updated ' || v_kind || ' “' || v_title || '”');
  return to_jsonb(ent);
end $$;

create or replace function public.wtm_import_holidays(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); r int := public.wtm_my_rank();
  rec record; n int := 0; skipped int := 0; seen int := 0;
begin
  perform public.wtm__require(r >= 2, 'A supervisor, admin or IT adds public holidays.');
  for rec in
    select left(btrim(x.title), 160) as title, nullif(x.day, '')::date as day
      from jsonb_to_recordset(coalesce(p->'rows', '[]'::jsonb)) as x(title text, day text)
  loop
    seen := seen + 1;
    exit when seen > 80;
    if rec.title is null or rec.title = '' or rec.day is null then continue; end if;
    if exists (select 1 from calendar_entries c where c.kind = 'holiday' and c.day = rec.day and lower(c.title) = lower(rec.title) and c.deleted_at is null) then
      skipped := skipped + 1; continue;
    end if;
    insert into calendar_entries (kind, title, day, notes, created_by) values ('holiday', rec.title, rec.day, '', me);
    n := n + 1;
  end loop;
  if n > 0 then perform public.wtm__log('calendar', null::tasks, 'Added ' || n || ' public holidays'); end if;
  return jsonb_build_object('saved', n, 'skipped', skipped);
end $$;

-- A private token so Google Calendar, Outlook and Apple Calendar can subscribe.
-- The browser only ever sees its own token. The feed itself is read by the
-- wtm-calendar Edge Function, which calls wtm_feed_data with the service role.
create table if not exists public.calendar_feeds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  token      text not null unique,
  dept       text not null default 'mine'
);
alter table public.calendar_feeds enable row level security;

create or replace function public.wtm_calendar_feed(p_dept text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d text := left(btrim(coalesce(p_dept, 'mine')), 40); tok text;
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  if d <> 'all' and d <> 'mine' and d !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then d := 'mine'; end if;
  insert into calendar_feeds (profile_id, token, dept)
  values (me, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), d)
  on conflict (profile_id) do update set dept = excluded.dept
  returning token into tok;
  return tok;
end $$;

create or replace function public.wtm_feed_data(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; d text; ids uuid[]; jobs jsonb; daily jsonb; entries jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select profile_id, dept into uid, d from calendar_feeds where token = p_token;
  if uid is null then return null; end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from uid or public.wtm_my_rank() < 1 then return null; end if;
  if d = 'all' then ids := null;
  elsif d = 'mine' then ids := public.wtm_my_depts(); if ids is null or cardinality(ids) = 0 then ids := null; end if;
  else ids := array[d::uuid];
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'due', t.due, 'due_time', to_char(t.due_time, 'HH24:MI'),
           'status', t.status, 'notes', left(t.notes, 500))), '[]'::jsonb) into jobs
    from tasks t
   where t.deleted_at is null and t.due is not null
     and t.due between current_date - 30 and current_date + 180
     and t.id in (select v.id from public.wtm_visible_task_ids() v)
     and (ids is null or exists (
           select 1 from task_assignees a where a.task_id = t.id and (
             (a.kind = 'dept' and a.target_id = any(ids))
             or (a.kind = 'user' and exists (
                  select 1 from department_members dm where dm.profile_id = a.target_id and dm.department_id = any(ids))))));
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', dt.id, 'title', dt.title, 'due_time', to_char(dt.due_time, 'HH24:MI'),
           'weekdays', to_jsonb(dt.weekdays), 'notes', left(dt.notes, 500),
           'department', (select name from departments where id = dt.department_id))), '[]'::jsonb) into daily
    from daily_tasks dt
   where dt.archived_at is null and dt.active and (ids is null or dt.department_id = any(ids));
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'kind', c.kind, 'title', c.title, 'day', c.day, 'end_day', c.end_day,
           'starts', to_char(c.starts, 'HH24:MI'), 'notes', left(c.notes, 500))), '[]'::jsonb) into entries
    from calendar_entries c
   where c.deleted_at is null and coalesce(c.end_day, c.day) >= current_date - 30 and c.day <= current_date + 180;
  return jsonb_build_object('jobs', jobs, 'daily', daily, 'entries', entries);
end $$;

-- ---------------------------------------------------------------------
-- 7. People, departments, groups, projects, rooms, keyword rules
-- ---------------------------------------------------------------------
create or replace function public.wtm__set_departments(p_user uuid, p_depts jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare d_old uuid[]; d_new uuid[]; plus text; minus text;
begin
  d_old := array(select department_id from department_members where profile_id = p_user);
  d_new := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p_depts, '[]'::jsonb)) x
                  where exists (select 1 from departments where id = x::uuid and not archived));
  delete from department_members where profile_id = p_user and department_id <> all(d_new);
  insert into department_members (department_id, profile_id)
  select x, p_user from unnest(d_new) x on conflict do nothing;
  select string_agg('+' || name, ' ') into plus from departments where id = any(d_new) and id <> all(d_old);
  select string_agg('−' || name, ' ') into minus from departments where id = any(d_old) and id <> all(d_new);
  return nullif(concat_ws(' ', plus, minus), '');
end $$;

create or replace function public.wtm_admin_update_user(p_user uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); old profiles; nr public.wtm_role; ch text[] := '{}'; dch text;
        name_only boolean;
begin
  select * into old from profiles where id = p_user;
  perform public.wtm__require(old.id is not null, 'That person doesn''t exist.');
  perform public.wtm__require(old.removed_at is null, 'That login has been removed.');
  nr := case when p ? 'role' then (p->>'role')::public.wtm_role else old.role end;
  name_only := p_user = me and not (p ? 'role' or p ? 'active' or p ? 'departments' or p ? 'heads');
  if name_only then
    perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  else
    perform public.wtm__require(public.wtm__can_manage(me, p_user, nr), 'You can''t change that person''s login.');
  end if;
  if p_user = me then
    perform public.wtm__require(nr = old.role, 'You can''t change your own role.');
    perform public.wtm__require(coalesce((p->>'active')::boolean, true), 'You can''t turn off your own login.');
  end if;
  update profiles set
    full_name  = case when p ? 'full_name'  then left(btrim(p->>'full_name'), 80)  else full_name end,
    short_name = case when p ? 'short_name' then left(btrim(p->>'short_name'), 40) else short_name end,
    title      = case when p ? 'title'      then left(btrim(p->>'title'), 80)      else title end,
    role       = nr,
    active     = case when p ? 'active' then (p->>'active')::boolean else active end,
    updated_at = now()
  where id = p_user;
  if p ? 'full_name' and left(btrim(p->>'full_name'), 80) <> old.full_name then ch := ch || ('Name → ' || left(btrim(p->>'full_name'), 80)); end if;
  if p ? 'short_name' and left(btrim(p->>'short_name'), 40) <> old.short_name then ch := ch || ('Known as → ' || coalesce(nullif(left(btrim(p->>'short_name'), 40), ''), '—')); end if;
  if p ? 'title' and left(btrim(p->>'title'), 80) <> old.title then ch := ch || ('Title → ' || coalesce(nullif(left(btrim(p->>'title'), 80), ''), '—')); end if;
  if nr <> old.role then ch := ch || ('Role ' || public.wtm__role_label(old.role) || ' → ' || public.wtm__role_label(nr)); end if;
  if p ? 'active' and (p->>'active')::boolean <> old.active then
    ch := ch || (case when (p->>'active')::boolean then 'Login turned on' else 'Login turned off' end);
    if not (p->>'active')::boolean then delete from timers where profile_id = p_user; end if;
  end if;
  if p ? 'departments' then
    dch := public.wtm__set_departments(p_user, p->'departments');
    if dch is not null then ch := ch || ('Departments ' || dch); end if;
  end if;
  if p ? 'heads' then
    perform public.wtm__require(public.wtm__can_manage(me, p_user, nr), 'You can''t choose a department head.');
    insert into department_members (department_id, profile_id, head)
    select distinct x::uuid, p_user, true
      from jsonb_array_elements_text(coalesce(p->'heads', '[]'::jsonb)) x
     where exists (select 1 from departments d where d.id = x::uuid and not d.archived)
    on conflict (department_id, profile_id) do update set head = true;
    update department_members set head = false
     where profile_id = p_user
       and department_id not in (
         select x::uuid from jsonb_array_elements_text(coalesce(p->'heads', '[]'::jsonb)) x
          where exists (select 1 from departments d where d.id = x::uuid and not d.archived));
    select string_agg(name, ', ' order by name) into dch
      from departments where id in (select department_id from department_members where profile_id = p_user and head);
    ch := ch || ('Department head of ' || coalesce(dch, 'none'));
  end if;
  if cardinality(ch) > 0 then
    perform public.wtm__log('user', null::tasks, public.wtm__name(p_user) || ': ' || array_to_string(ch, ' · '), null, me, p_user);
  end if;
end $$;

create or replace function public.wtm_password_changed() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set must_change_password = false, updated_at = now() where id = auth.uid();
  perform public.wtm__log('user', null::tasks, public.wtm__name(auth.uid()) || ': Changed own password', null, auth.uid(), auth.uid());
end $$;

create or replace function public.wtm_save_department(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid := nullif(p->>'id', '')::uuid; old departments; d departments;
        ch text[] := '{}'; m_old uuid[]; m_new uuid[]; plus text; minus text;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 3, 'Only admin and IT can manage departments.');
  if v_id is null or not exists (select 1 from departments where id = v_id) then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'name', ''))) > 0, 'Give the department a name.');
    perform public.wtm__require(not exists (select 1 from departments where lower(name) = lower(btrim(p->>'name')) and not archived), 'A department with that name already exists.');
    insert into departments (id, name, code, color)
    values (coalesce(v_id, gen_random_uuid()), left(btrim(p->>'name'), 80), left(btrim(coalesce(p->>'code', '')), 12), coalesce(nullif(p->>'color', ''), 'c1'))
    returning * into d;
    ch := ch || ('Created department “' || d.name || '”');
  else
    select * into old from departments where id = v_id;
    update departments set
      name     = case when p ? 'name' and btrim(p->>'name') <> '' then left(btrim(p->>'name'), 80) else name end,
      code     = case when p ? 'code' then left(btrim(p->>'code'), 12) else code end,
      color    = case when p ? 'color' then p->>'color' else color end,
      archived = case when p ? 'archived' then (p->>'archived')::boolean else archived end
    where id = v_id returning * into d;
    if d.name <> old.name then ch := ch || ('Renamed department “' || old.name || '” → “' || d.name || '”'); end if;
    if d.code <> old.code then ch := ch || ('Code → ' || coalesce(nullif(d.code, ''), '—')); end if;
    if d.archived <> old.archived then ch := ch || (case when d.archived then 'Archived department “' else 'Restored department “' end || d.name || '”'); end if;
    if d.color <> old.color and cardinality(ch) = 0 then ch := ch || ('Recoloured department “' || d.name || '”'); end if;
  end if;
  if p ? 'members' then
    m_old := array(select profile_id from department_members where department_id = d.id);
    m_new := array(select distinct x::uuid from jsonb_array_elements_text(p->'members') x where exists (select 1 from profiles where id = x::uuid));
    delete from department_members where department_id = d.id and profile_id <> all(m_new);
    insert into department_members (department_id, profile_id) select d.id, x from unnest(m_new) x on conflict do nothing;
    select string_agg('+' || public.wtm__name(x), ' ') into plus from unnest(m_new) x where x <> all(m_old);
    select string_agg('−' || public.wtm__name(x), ' ') into minus from unnest(m_old) x where x <> all(m_new);
    if plus is not null or minus is not null then ch := ch || (d.name || ' members ' || concat_ws(' ', plus, minus)); end if;
  end if;
  if p ? 'heads' then
    insert into department_members (department_id, profile_id, head)
    select d.id, x::uuid, true
      from jsonb_array_elements_text(coalesce(p->'heads', '[]'::jsonb)) x
     where exists (select 1 from profiles where id = x::uuid)
    on conflict (department_id, profile_id) do update set head = true;
    update department_members set head = false
     where department_id = d.id
       and profile_id not in (
         select x::uuid from jsonb_array_elements_text(coalesce(p->'heads', '[]'::jsonb)) x
          where exists (select 1 from profiles where id = x::uuid));
    select string_agg(public.wtm__name(profile_id), ', ' order by public.wtm__name(profile_id)) into plus
      from department_members where department_id = d.id and head;
    ch := ch || (d.name || ' head: ' || coalesce(plus, 'none'));
  end if;
  if cardinality(ch) > 0 then perform public.wtm__log('admin', null::tasks, array_to_string(ch, ' · '), null, me); end if;
  return d.id;
end $$;

create or replace function public.wtm_save_group(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid := nullif(p->>'id', '')::uuid; old groups; g groups;
        ch text[] := '{}'; m_old uuid[]; m_new uuid[]; plus text; minus text;
begin
  perform public.wtm__require(public.wtm_my_rank() > 0, 'Your account is turned off.');
  if v_id is null or not exists (select 1 from groups where id = v_id) then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'name', ''))) > 0, 'Give the group a name.');
    insert into groups (id, name, color, owner_id)
    values (coalesce(v_id, gen_random_uuid()), left(btrim(p->>'name'), 80), coalesce(nullif(p->>'color', ''), 'c2'), me)
    returning * into g;
    insert into group_members (group_id, profile_id) values (g.id, me) on conflict do nothing;
    ch := ch || ('Created group “' || g.name || '”');
  else
    select * into old from groups where id = v_id;
    perform public.wtm__require(old.owner_id = me or public.wtm_my_rank() >= 3, 'Only the group''s owner, admin or IT can change it.');
    update groups set
      name     = case when p ? 'name' and btrim(p->>'name') <> '' then left(btrim(p->>'name'), 80) else name end,
      color    = case when p ? 'color' then p->>'color' else color end,
      archived = case when p ? 'archived' then (p->>'archived')::boolean else archived end
    where id = v_id returning * into g;
    if g.name <> old.name then ch := ch || ('Renamed group “' || old.name || '” → “' || g.name || '”'); end if;
    if g.archived <> old.archived then ch := ch || (case when g.archived then 'Archived group “' else 'Restored group “' end || g.name || '”'); end if;
  end if;
  if p ? 'members' then
    m_old := array(select profile_id from group_members where group_id = g.id);
    m_new := array(select distinct x::uuid from jsonb_array_elements_text(p->'members') x where exists (select 1 from profiles where id = x::uuid));
    if g.owner_id is not null and not (g.owner_id = any(m_new)) then m_new := m_new || g.owner_id; end if;
    delete from group_members where group_id = g.id and profile_id <> all(m_new);
    insert into group_members (group_id, profile_id) select g.id, x from unnest(m_new) x on conflict do nothing;
    select string_agg('+' || public.wtm__name(x), ' ') into plus from unnest(m_new) x where x <> all(m_old);
    select string_agg('−' || public.wtm__name(x), ' ') into minus from unnest(m_old) x where x <> all(m_new);
    if plus is not null or minus is not null then ch := ch || (g.name || ' members ' || concat_ws(' ', plus, minus)); end if;
  end if;
  if cardinality(ch) > 0 then perform public.wtm__log('group', null::tasks, array_to_string(ch, ' · '), null, me); end if;
  return g.id;
end $$;

create or replace function public.wtm_save_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid := nullif(p->>'id', '')::uuid; old projects; x projects; d text;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage projects.');
  if v_id is null or not exists (select 1 from projects where id = v_id) then
    perform public.wtm__require(char_length(btrim(coalesce(p->>'name', ''))) > 0, 'Give the project a name.');
    insert into projects (id, name, color, owner_id)
    values (coalesce(v_id, gen_random_uuid()), left(btrim(p->>'name'), 60), coalesce(nullif(p->>'color', ''), 'c3'),
            (select id from profiles where id = nullif(p->>'owner_id', '')::uuid))
    returning * into x;
    d := 'Created project “' || x.name || '”';
  else
    select * into old from projects where id = v_id;
    update projects set
      name     = case when p ? 'name' and btrim(p->>'name') <> '' then left(btrim(p->>'name'), 60) else name end,
      color    = case when p ? 'color' then p->>'color' else color end,
      archived = case when p ? 'archived' then (p->>'archived')::boolean else archived end,
      owner_id = case when p ? 'owner_id' then (select id from profiles where id = nullif(p->>'owner_id', '')::uuid) else owner_id end
    where id = v_id returning * into x;
    d := case
      when x.archived and not old.archived then 'Archived project “' || x.name || '”'
      when old.archived and not x.archived then 'Restored project “' || x.name || '”'
      when x.name <> old.name then 'Renamed project “' || old.name || '” → “' || x.name || '”'
      when x.color <> old.color then 'Recoloured project “' || x.name || '”'
      when x.owner_id is distinct from old.owner_id then 'Project “' || x.name || '” owner → ' || coalesce((select coalesce(nullif(full_name, ''), email) from profiles where id = x.owner_id), 'no one') end;
  end if;
  if d is not null then
    insert into log_entries (action, project_id, project_name, detail, actor) values ('project', x.id, x.name, d, me);
  end if;
  return x.id;
end $$;

create or replace function public.wtm_save_room(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; x rooms; al text[];
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage rooms.');
  perform public.wtm__require(char_length(btrim(coalesce(p->>'name', ''))) > 0, 'Give the room a name.');
  al := array(select distinct left(btrim(a), 60) from jsonb_array_elements_text(coalesce(p->'aliases', '[]'::jsonb)) a where btrim(a) <> '');
  if v_id is null or not exists (select 1 from rooms where id = v_id) then
    insert into rooms (id, name, aliases) values (coalesce(v_id, gen_random_uuid()), left(btrim(p->>'name'), 60), al) returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Added room “' || x.name || '”');
  else
    update rooms set name = left(btrim(p->>'name'), 60), aliases = al where id = v_id returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Updated room “' || x.name || '”');
  end if;
  return x.id;
end $$;

create or replace function public.wtm_delete_room(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage rooms.');
  delete from rooms where id = p_id returning name into n;
  if n is not null then perform public.wtm__log('setting', null::tasks, 'Removed room “' || n || '”'); end if;
end $$;

create or replace function public.wtm_save_location(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; x locations; n text := left(btrim(coalesce(p->>'name', '')), 80);
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage locations.');
  perform public.wtm__require(char_length(n) > 0, 'Give the location a name.');
  if exists (select 1 from locations where lower(name) = lower(n) and id is distinct from v_id) then
    raise exception 'There is already a location with that name.' using errcode = '23505';
  end if;
  if v_id is null or not exists (select 1 from locations where id = v_id) then
    insert into locations (id, name) values (coalesce(v_id, gen_random_uuid()), n) returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Added location “' || x.name || '”');
  else
    update locations set name = n where id = v_id returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Updated location “' || x.name || '”');
  end if;
  return x.id;
end $$;

create or replace function public.wtm_delete_location(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare n text; paths text[];
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage locations.');
  paths := coalesce(array(select image_path from maps where location_id = p_id), '{}');
  delete from locations where id = p_id returning name into n;
  if n is not null then perform public.wtm__log('setting', null::tasks, 'Removed location “' || n || '”'); end if;
  return paths;
end $$;

create or replace function public.wtm_save_map(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; loc uuid := nullif(p->>'location_id', '')::uuid;
        n text := left(btrim(coalesce(p->>'name', '')), 80); path text := btrim(coalesce(p->>'image_path', '')); x maps;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage maps.');
  perform public.wtm__require(char_length(n) > 0, 'Give the map a name.');
  perform public.wtm__require(exists (select 1 from locations where id = loc and not archived), 'That location isn''t available.');
  perform public.wtm__require(path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$', 'Choose an image for the map.');
  perform public.wtm__require(lower(split_part(path, '/', 1)) = lower(loc::text), 'That map image doesn''t belong to this location.');
  if v_id is null or not exists (select 1 from maps where id = v_id) then
    insert into maps (id, location_id, name, image_path) values (coalesce(v_id, gen_random_uuid()), loc, n, path) returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Added map “' || x.name || '”');
  else
    update maps set name = n, location_id = loc, image_path = path where id = v_id returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Updated map “' || x.name || '”');
  end if;
  return x.id;
end $$;

create or replace function public.wtm_delete_map(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare n text; path text;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage maps.');
  delete from maps where id = p_id returning name, image_path into n, path;
  if n is not null then perform public.wtm__log('setting', null::tasks, 'Removed map “' || n || '”'); end if;
  return path;
end $$;

create or replace function public.wtm__clean_tag(p text) returns text
language sql immutable as $$
  select left(regexp_replace(regexp_replace(lower(regexp_replace(btrim(coalesce(p, '')), '^#', '')), '\s+', '-', 'g'), '[^a-z0-9_-]', '', 'g'), 40);
$$;

create or replace function public.wtm_save_rule(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; x tag_rules; old tag_rules; tg text; v_phrase text;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage keyword rules.');
  v_phrase := left(btrim(coalesce(p->>'phrase', '')), 60);
  tg := public.wtm__clean_tag(p->>'tag');
  perform public.wtm__require(char_length(v_phrase) > 0 and char_length(tg) > 0, 'Fill in both the words and the tag.');
  if exists (select 1 from tag_rules r where lower(r.phrase) = lower(v_phrase) and r.id is distinct from v_id) then
    raise exception '% is already in the keyword library.', v_phrase using errcode = '23505';
  end if;
  if v_id is not null and exists (select 1 from tag_rules where id = v_id) then
    select * into old from tag_rules where id = v_id;
    if lower(old.phrase) = lower(v_phrase) and old.tag = tg then return old.id; end if;
    update tag_rules set phrase = v_phrase, tag = tg where id = v_id returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Keyword “' || x.phrase || '” → #' || x.tag);
  else
    insert into tag_rules (id, phrase, tag) values (coalesce(v_id, gen_random_uuid()), v_phrase, tg) returning * into x;
    perform public.wtm__log('setting', null::tasks, 'Keyword “' || x.phrase || '” → #' || x.tag);
  end if;
  return x.id;
end $$;

create or replace function public.wtm_delete_rule(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare x tag_rules;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage keyword rules.');
  delete from tag_rules where id = p_id returning * into x;
  if x.id is not null then perform public.wtm__log('setting', null::tasks, 'Removed keyword “' || x.phrase || '” → #' || x.tag); end if;
end $$;

-- Many words, one tag. One log line for the whole batch.
create or replace function public.wtm_save_rules(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  el jsonb; v_phrase text; tg text; n_save int := 0; n_skip int := 0; n_del int := 0; idel uuid; existed boolean;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'Supervisors, admin and IT manage keyword rules.');
  if jsonb_typeof(p->'delete') = 'array' then
    for idel in select value::uuid from jsonb_array_elements_text(p->'delete') as t(value) loop
      delete from tag_rules where id = idel;
      if found then n_del := n_del + 1; end if;
    end loop;
  end if;
  if jsonb_typeof(p->'rows') = 'array' then
    for el in select value from jsonb_array_elements(p->'rows') loop
      v_phrase := left(btrim(coalesce(el->>'phrase', '')), 60);
      tg := public.wtm__clean_tag(el->>'tag');
      if char_length(v_phrase) = 0 or char_length(tg) = 0 then n_skip := n_skip + 1; continue; end if;
      select exists (select 1 from tag_rules r where lower(r.phrase) = lower(v_phrase) and r.tag = tg) into existed;
      if existed then n_skip := n_skip + 1; continue; end if;
      insert into tag_rules (phrase, tag) values (v_phrase, tg)
      on conflict ((lower(phrase))) do update set tag = excluded.tag;
      n_save := n_save + 1;
    end loop;
  end if;
  if n_save + n_del > 0 then
    perform public.wtm__log('setting', null::tasks, 'Keyword library · ' || n_save || ' saved, ' || n_del || ' removed');
  end if;
  return jsonb_build_object('saved', n_save, 'skipped', n_skip, 'removed', n_del);
end $$;

create or replace function public.wtm_save_tag_department(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  tg text := public.wtm__clean_tag(p->>'tag');
  dep uuid := nullif(p->>'department_id', '')::uuid;
  dname text;
begin
  perform public.wtm__require(public.wtm_my_rank() >= 2, 'A supervisor, admin or IT chooses which department a tag belongs to.');
  perform public.wtm__require(char_length(tg) > 0, 'Name the tag.');
  if dep is null then
    delete from tag_departments where tag = tg;
    perform public.wtm__log('setting', null::tasks, '#' || tg || ' no longer tags a department');
    return;
  end if;
  perform public.wtm__require(exists (select 1 from departments where id = dep and not archived), 'Pick a department.');
  insert into tag_departments (tag, department_id) values (tg, dep)
  on conflict (tag) do update set department_id = excluded.department_id;
  select name into dname from departments where id = dep;
  perform public.wtm__log('setting', null::tasks, '#' || tg || ' also tags ' || dname);
end $$;

-- ---------------------------------------------------------------------
-- 8. Service functions for the wtm-admin Edge Function (service role only)
-- ---------------------------------------------------------------------
create or replace function public.wtm_svc_check(p_caller uuid, p_target uuid, p_role public.wtm_role) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.wtm__can_manage(p_caller, p_target, p_role) then
    raise exception 'You can''t manage that login.' using errcode = '42501';
  end if;
end $$;

create or replace function public.wtm_svc_after_create(p_caller uuid, p_user uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare nr public.wtm_role := coalesce(nullif(p->>'role', ''), 'staff')::public.wtm_role; dch text;
begin
  perform public.wtm_svc_check(p_caller, null, nr);
  update profiles set
    full_name = coalesce(nullif(left(btrim(p->>'full_name'), 80), ''), full_name),
    short_name = left(btrim(coalesce(p->>'short_name', '')), 40),
    title = left(btrim(coalesce(p->>'title', '')), 80),
    role = nr, active = true, must_change_password = true, updated_at = now()
  where id = p_user;
  dch := public.wtm__set_departments(p_user, p->'departments');
  perform public.wtm__log('user', null::tasks,
    'Created login for ' || public.wtm__name(p_user) || ' (' || public.wtm__role_label(nr) || ')' ||
    coalesce(' · Departments ' || dch, ''), null, p_caller, p_user);
end $$;

create or replace function public.wtm_svc_after_reset(p_caller uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.wtm_svc_check(p_caller, p_user, null);
  update profiles set must_change_password = true, updated_at = now() where id = p_user;
  perform public.wtm__log('user', null::tasks, public.wtm__name(p_user) || ': Password reset', null, p_caller, p_user);
end $$;

-- Checks only. The edge function deletes the auth login, then calls wtm_svc_after_delete.
create or replace function public.wtm_svc_before_delete(p_caller uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare old profiles;
begin
  select * into old from profiles where id = p_user;
  if old.id is null or old.removed_at is not null then
    raise exception 'That login is already gone.' using errcode = '42501';
  end if;
  perform public.wtm_svc_check(p_caller, p_user, null);
  if p_user = p_caller then
    raise exception 'You can''t delete your own login.' using errcode = '42501';
  end if;
  if old.role = 'it' and (select count(*) from profiles where role = 'it' and removed_at is null) <= 1 then
    raise exception 'Keep at least one IT login.' using errcode = '42501';
  end if;
end $$;

-- Drops the person from assignments and keeps their name for history.
create or replace function public.wtm_svc_after_delete(p_caller uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare old profiles; nm text; em text;
begin
  select * into old from profiles where id = p_user;
  if old.id is null or old.removed_at is not null then return; end if;
  perform public.wtm_svc_before_delete(p_caller, p_user);
  nm := public.wtm__name(p_user);
  em := nullif(old.email, '');
  delete from timers where profile_id = p_user;
  delete from department_members where profile_id = p_user;
  delete from group_members where profile_id = p_user;
  delete from message_reads where profile_id = p_user;
  delete from task_assignees where kind = 'user' and target_id = p_user;
  update tasks set tags = array_remove(tags, 'person:' || p_user::text), updated_at = now()
   where 'person:' || p_user::text = any(tags);
  with moved as (
    update groups set owner_id = p_caller where owner_id = p_user returning id
  )
  insert into group_members (group_id, profile_id)
  select id, p_caller from moved on conflict do nothing;
  update projects set owner_id = null where owner_id = p_user;
  update profiles set
    active = false, removed_at = now(), short_name = '', email = '',
    must_change_password = false, updated_at = now()
  where id = p_user;
  perform public.wtm__log('user', null::tasks,
    'Removed login for ' || nm || coalesce(' (' || em || ')', '') || ' · ' || public.wtm__role_label(old.role),
    null, p_caller, p_user);
end $$;

-- ---------------------------------------------------------------------
-- 9. New logins get a profile; the very first one becomes IT
-- ---------------------------------------------------------------------
create or replace function public.wtm__on_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, coalesce(new.email, ''),
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)),
          case when not exists (select 1 from public.profiles) then 'it'::public.wtm_role else 'staff'::public.wtm_role end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists wtm_on_auth_user on auth.users;
create trigger wtm_on_auth_user after insert on auth.users
  for each row execute function public.wtm__on_auth_user();

create or replace function public.wtm__on_auth_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

drop trigger if exists wtm_on_auth_email on auth.users;
create trigger wtm_on_auth_email after update of email on auth.users
  for each row execute function public.wtm__on_auth_email();

-- logins that existed before this script ran
insert into public.profiles (id, email, full_name)
select u.id, coalesce(u.email, ''), split_part(coalesce(u.email, ''), '@', 1) from auth.users u
on conflict (id) do nothing;
update public.profiles set role = 'it'
 where id = (select u.id from auth.users u join public.profiles p on p.id = u.id order by u.created_at limit 1)
   and not exists (select 1 from public.profiles where role = 'it');

-- ---------------------------------------------------------------------
-- 10. Row-level security: read-only, mirroring the rules above.
--     The browser reads through wtm_bootstrap / wtm_sync; these policies
--     let Realtime tell each person when something they can see changes.
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.departments        enable row level security;
alter table public.department_members enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.projects           enable row level security;
alter table public.rooms              enable row level security;
alter table public.tag_rules          enable row level security;
alter table public.tag_departments    enable row level security;
alter table public.tasks              enable row level security;
alter table public.task_assignees     enable row level security;
alter table public.timers             enable row level security;
alter table public.log_entries        enable row level security;
alter table public.messages           enable row level security;
alter table public.message_reads      enable row level security;
alter table public.notices            enable row level security;
alter table public.orders             enable row level security;
alter table public.calendar_entries   enable row level security;

drop policy if exists wtm_read on public.profiles;
create policy wtm_read on public.profiles for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.departments;
create policy wtm_read on public.departments for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.department_members;
create policy wtm_read on public.department_members for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.groups;
create policy wtm_read on public.groups for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.group_members;
create policy wtm_read on public.group_members for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.projects;
create policy wtm_read on public.projects for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.rooms;
create policy wtm_read on public.rooms for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.tag_rules;
create policy wtm_read on public.tag_rules for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.tag_departments;
create policy wtm_read on public.tag_departments for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.tasks;
create policy wtm_read on public.tasks for select to authenticated using (public.wtm_can_see_task(id));
drop policy if exists wtm_read on public.task_assignees;
create policy wtm_read on public.task_assignees for select to authenticated using (public.wtm_can_see_task(task_id));
drop policy if exists wtm_read on public.timers;
create policy wtm_read on public.timers for select to authenticated using (profile_id = auth.uid() or public.wtm_can_see_task(task_id));
drop policy if exists wtm_read on public.log_entries;
create policy wtm_read on public.log_entries for select to authenticated using (public.wtm_can_see_log(task_id, actor));
drop policy if exists wtm_read on public.messages;
create policy wtm_read on public.messages for select to authenticated using (public.wtm_can_see_message(sender, to_kind, to_id));
drop policy if exists wtm_read on public.message_reads;
create policy wtm_read on public.message_reads for select to authenticated using (profile_id = auth.uid());
drop policy if exists wtm_read on public.notices;
create policy wtm_read on public.notices for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.calendar_entries;
create policy wtm_read on public.calendar_entries for select to authenticated using (public.wtm_my_rank() > 0);
drop policy if exists wtm_read on public.orders;
create policy wtm_read on public.orders for select to authenticated using (public.wtm_my_rank() > 0);
alter table public.daily_tasks enable row level security;
drop policy if exists wtm_read on public.daily_tasks;
create policy wtm_read on public.daily_tasks for select to authenticated using (public.wtm_my_rank() > 0);
alter table public.locations enable row level security;
drop policy if exists wtm_read on public.locations;
create policy wtm_read on public.locations for select to authenticated using (public.wtm_my_rank() > 0);
alter table public.maps enable row level security;
drop policy if exists wtm_read on public.maps;
create policy wtm_read on public.maps for select to authenticated using (public.wtm_my_rank() > 0);

-- no direct writes from the browser, for anyone
do $$
declare t text;
begin
  foreach t in array array['profiles', 'departments', 'department_members', 'groups', 'group_members', 'projects', 'rooms',
                           'locations', 'maps', 'tag_rules', 'tag_departments', 'tasks', 'task_assignees', 'timers', 'log_entries', 'messages', 'message_reads', 'notices', 'orders', 'daily_tasks', 'calendar_entries'] loop
    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. Function permissions
-- ---------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'wtm%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function
  public.wtm_rank(public.wtm_role), public.wtm_rank_of(uuid), public.wtm_my_rank(), public.wtm_my_depts(), public.wtm_my_groups(),
  public.wtm_visible_task_ids(), public.wtm_can_see_task(uuid), public.wtm_can_see_log(uuid, uuid),
  public.wtm_can_see_message(uuid, text, uuid),
  public.wtm_bootstrap(int, int), public.wtm_sync(timestamptz, bigint, bigint), public.wtm_log_before(bigint, int),
  public.wtm_save_task(jsonb), public.wtm_timer(uuid, text), public.wtm_add_time(uuid, int),
  public.wtm_delete_task(uuid), public.wtm_restore_task(uuid), public.wtm_note(text, uuid),
  public.wtm_send_message(text, uuid, text, uuid, jsonb, text), public.wtm_mark_read(text, bigint),
  public.wtm_admin_update_user(uuid, jsonb), public.wtm_password_changed(),
  public.wtm_save_department(jsonb), public.wtm_save_group(jsonb), public.wtm_save_project(jsonb),
  public.wtm_save_room(jsonb), public.wtm_delete_room(uuid),
  public.wtm_save_location(jsonb), public.wtm_delete_location(uuid), public.wtm_save_map(jsonb), public.wtm_delete_map(uuid),
  public.wtm_save_rule(jsonb), public.wtm_delete_rule(uuid), public.wtm_save_rules(jsonb), public.wtm_save_tag_department(jsonb),
  public.wtm_save_notice(jsonb), public.wtm_save_order(jsonb),
  public.wtm_save_daily(jsonb), public.wtm_open_daily(date, time),
  public.wtm_save_calendar(jsonb), public.wtm_import_holidays(jsonb), public.wtm_calendar_feed(text)
to authenticated;
grant execute on function public.wtm_svc_check(uuid, uuid, public.wtm_role), public.wtm_svc_after_create(uuid, uuid, jsonb),
  public.wtm_svc_after_reset(uuid, uuid), public.wtm_svc_before_delete(uuid, uuid), public.wtm_svc_after_delete(uuid, uuid),
  public.wtm_feed_data(text) to service_role;

-- ---------------------------------------------------------------------
-- 12. Realtime: tell browsers when something changes
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['tasks', 'task_assignees', 'timers', 'log_entries', 'messages', 'notices', 'orders', 'daily_tasks', 'tag_rules', 'tag_departments', 'profiles', 'department_members', 'locations', 'maps', 'calendar_entries'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 13. Private image buckets. The browser uploads, then an RPC records the path.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('wtm-maps', 'wtm-maps', false, 8388608, array['image/jpeg','image/png','image/webp','image/gif']),
  ('wtm-photos', 'wtm-photos', false, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wtm_maps_read on storage.objects;
create policy wtm_maps_read on storage.objects for select to authenticated
  using (bucket_id = 'wtm-maps' and public.wtm_my_rank() > 0);
drop policy if exists wtm_maps_insert on storage.objects;
create policy wtm_maps_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wtm-maps' and public.wtm_my_rank() >= 2);
drop policy if exists wtm_maps_delete on storage.objects;
create policy wtm_maps_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wtm-maps' and public.wtm_my_rank() >= 2);

drop policy if exists wtm_photos_read on storage.objects;
create policy wtm_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'wtm-photos' and public.wtm_my_rank() > 0);
drop policy if exists wtm_photos_insert on storage.objects;
create policy wtm_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wtm-photos'
    and public.wtm_my_rank() > 0
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
drop policy if exists wtm_photos_delete on storage.objects;
create policy wtm_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'wtm-photos'
    and public.wtm_my_rank() > 0
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
