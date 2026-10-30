-- MzansiVille schema. Paste into the Supabase SQL editor.
-- Guest play does not need this. Auth, chat, leaderboards, and admin do.
-- After this file, run supabase/seed.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles. One row per auth user. Game progress lives in state.
-- Leaderboard columns are copies written by the client on each day end.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Student',
  residence text,
  course text,
  avatar jsonb not null default '{}'::jsonb,
  handle text,
  district_id text,
  state jsonb,
  money integer not null default 0,
  grades integer not null default 0,
  balanced integer not null default 0,
  history jsonb not null default '[]'::jsonb,
  role text not null default 'player' check (role in ('player', 'admin')),
  suspended boolean not null default false,
  referral_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- District content. The game also bundles /data/<district>. These tables
-- let admin tools and a later server read the same files.
-- ---------------------------------------------------------------------------

create table if not exists public.district_places (
  district_id text not null,
  id text not null,
  name text not null,
  kind text not null,
  x integer not null,
  y integer not null,
  blurb text,
  primary key (district_id, id)
);

create table if not exists public.district_activities (
  district_id text not null,
  id text not null,
  phase text not null,
  place_id text not null,
  name text not null,
  money integer not null default 0,
  energy integer not null default 0,
  grades integer not null default 0,
  social integer not null default 0,
  hunger integer not null default 0,
  time_slots integer not null default 1,
  risk_or_twist text,
  primary key (district_id, id)
);

create table if not exists public.district_residences (
  district_id text not null,
  name text not null,
  type text,
  distance_km numeric,
  notes text,
  primary key (district_id, name)
);

create table if not exists public.district_events (
  district_id text not null,
  id text not null,
  title text not null,
  body text not null,
  choices jsonb not null,
  primary key (district_id, id)
);

-- Text-only overrides. Stat effects stay in the district file.
create table if not exists public.event_edits (
  district_id text not null,
  event_id text not null,
  title text,
  body text,
  choice_labels jsonb,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (district_id, event_id)
);

-- ---------------------------------------------------------------------------
-- Campus lobby. One public room. No direct messages.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_idx
  on public.chat_messages (created_at desc);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.chat_messages (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not suspended
  );
$$;

create or replace function public.touch_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and not public.is_admin() then
    new.role := old.role;
    new.suspended := old.suspended;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_profile();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mask a short list before the row is stored. The client masks the same way.
create or replace function public.clean_chat_body(raw text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text := raw;
  word text;
  words text[] := array[
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'slut', 'whore'
  ];
begin
  foreach word in array words loop
    cleaned := regexp_replace(cleaned, '\m' || word || '\M', repeat('*', char_length(word)), 'gi');
  end loop;
  return trim(cleaned);
end;
$$;

create or replace function public.filter_chat()
returns trigger
language plpgsql
as $$
begin
  new.body := public.clean_chat_body(new.body);
  if new.body is null or char_length(new.body) < 1 then
    raise exception 'Empty message';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_filter on public.chat_messages;
create trigger chat_filter
  before insert on public.chat_messages
  for each row execute function public.filter_chat();

create or replace function public.can_send_chat()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  if auth.uid() is null then
    return false;
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and suspended
  ) then
    return false;
  end if;
  select count(*) into recent from public.chat_messages
    where user_id = auth.uid()
      and created_at > now() - interval '3 seconds';
  if recent >= 1 then
    return false;
  end if;
  select count(*) into recent from public.chat_messages
    where user_id = auth.uid()
      and created_at > now() - interval '10 minutes';
  if recent >= 30 then
    return false;
  end if;
  return true;
end;
$$;

-- 7-day rolling averages. money / grades / balanced already stored per snapshot.
create or replace function public.leaderboard()
returns table (
  user_id uuid,
  display_name text,
  residence text,
  money integer,
  grades integer,
  balanced integer,
  rich_avg numeric,
  dean_avg numeric,
  balanced_avg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.residence,
    p.money,
    p.grades,
    p.balanced,
    coalesce((
      select avg((item->>'money')::numeric)
      from jsonb_array_elements(p.history) item
      where (item->>'at')::timestamptz > now() - interval '7 days'
    ), p.money::numeric),
    coalesce((
      select avg((item->>'grades')::numeric)
      from jsonb_array_elements(p.history) item
      where (item->>'at')::timestamptz > now() - interval '7 days'
    ), p.grades::numeric),
    coalesce((
      select avg((item->>'balanced')::numeric)
      from jsonb_array_elements(p.history) item
      where (item->>'at')::timestamptz > now() - interval '7 days'
    ), p.balanced::numeric)
  from public.profiles p
  where not p.suspended
    and p.display_name is not null
    and p.state is not null;
$$;

drop function if exists public.admin_reports();
create function public.admin_reports()
returns table (
  id uuid,
  reporter_id uuid,
  message_id uuid,
  reported_user_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.reporter_id, r.message_id, r.reported_user_id, r.reason, r.status, r.created_at, p.display_name
  from public.reports r
  left join public.profiles p on p.id = r.reported_user_id
  where public.is_admin()
    and r.status = 'open'
  order by r.created_at desc;
$$;

create or replace function public.admin_suspend(target uuid, flag boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot suspend yourself';
  end if;
  update public.profiles set suspended = flag where id = target;
end;
$$;

create or replace function public.admin_close_report(report uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  update public.reports set status = 'closed' where id = report;
end;
$$;

create or replace function public.admin_edit_event(
  district text,
  event text,
  next_title text,
  next_body text,
  next_labels jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  insert into public.event_edits (district_id, event_id, title, body, choice_labels, updated_by)
  values (district, event, next_title, next_body, next_labels, auth.uid())
  on conflict (district_id, event_id) do update
    set title = excluded.title,
        body = excluded.body,
        choice_labels = excluded.choice_labels,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.district_places enable row level security;
alter table public.district_activities enable row level security;
alter table public.district_residences enable row level security;
alter table public.district_events enable row level security;
alter table public.event_edits enable row level security;
alter table public.chat_messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.district_places, public.district_activities,
  public.district_residences, public.district_events, public.event_edits
  to anon, authenticated;
grant select on public.chat_messages to anon, authenticated;
grant insert on public.chat_messages to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant insert on public.reports to authenticated;

grant execute on function public.leaderboard() to anon, authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_suspend(uuid, boolean) to authenticated;
grant execute on function public.admin_close_report(uuid) to authenticated;
grant execute on function public.admin_edit_event(text, text, text, text, jsonb) to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "read places" on public.district_places;
create policy "read places" on public.district_places
  for select to anon, authenticated using (true);

drop policy if exists "read activities" on public.district_activities;
create policy "read activities" on public.district_activities
  for select to anon, authenticated using (true);

drop policy if exists "read residences" on public.district_residences;
create policy "read residences" on public.district_residences
  for select to anon, authenticated using (true);

drop policy if exists "read events" on public.district_events;
create policy "read events" on public.district_events
  for select to anon, authenticated using (true);

drop policy if exists "read event edits" on public.event_edits;
create policy "read event edits" on public.event_edits
  for select to anon, authenticated using (true);

drop policy if exists "read lobby" on public.chat_messages;
create policy "read lobby" on public.chat_messages
  for select to anon, authenticated using (true);

drop policy if exists "send lobby" on public.chat_messages;
create policy "send lobby" on public.chat_messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_send_chat());

drop policy if exists "read own blocks" on public.blocks;
create policy "read own blocks" on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "insert own blocks" on public.blocks;
create policy "insert own blocks" on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "delete own blocks" on public.blocks;
create policy "delete own blocks" on public.blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

create or replace view public.profile_public
with (security_invoker = false) as
  select id, display_name, residence, avatar, district_id
  from public.profiles
  where not suspended;

grant select on public.profile_public to anon, authenticated;

drop policy if exists "file report" on public.reports;
create policy "file report" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- Realtime for the lobby. Ignored when this is not a Supabase database.
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when others then
    raise notice 'realtime publication skipped: %', sqlerrm;
  end;
  begin
    alter table public.chat_messages replica identity full;
  exception when others then
    raise notice 'replica identity skipped: %', sqlerrm;
  end;
end $$;
