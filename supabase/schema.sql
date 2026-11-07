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
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

-- Size limits. NOT VALID so existing oversized rows do not block this script;
-- new inserts and updates are still checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_state_size'
                 and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_state_size
      check (state is null or pg_column_size(state) <= 200000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_history_size'
                 and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_history_size
      check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) <= 30) not valid;
  end if;
end $$;

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

-- Players (the anon and authenticated roles, i.e. the game) can't give
-- themselves a role or lift a suspension; an admin in the game can. The SQL
-- Editor and other database roles (postgres, service_role) aren't players, so
-- they can set roles directly.
create or replace function public.touch_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.role := 'player';
      new.suspended := false;
    else
      new.role := old.role;
      new.suspended := old.suspended;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before insert or update on public.profiles
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

-- Mask a short list before the row is stored. The client masks too (src/engine/filter.js).
-- Each letter also matches common leetspeak swaps, a '*' (except the first letter),
-- and at most one separator (space . _ - *) between letters, so f*ck, sh1t, f u c k match.
-- Word edges use alnum lookarounds so "dickens" or "shitake" style substrings are not hit.
create or replace function public.chat_word_pattern(word text)
returns text
language plpgsql
immutable
as $$
declare
  pattern text := '';
  ch text;
  cls text;
  i int;
begin
  for i in 1 .. char_length(word) loop
    ch := substr(word, i, 1);
    cls := case ch
      when 'a' then 'a@4'
      when 'e' then 'e3'
      when 'i' then 'i1!|l'
      when 'o' then 'o0'
      when 's' then 's$5'
      when 't' then 't7+'
      when 'u' then 'uv'
      when 'c' then 'c('
      else ch
    end;
    if i > 1 then
      cls := cls || '*';
      pattern := pattern || '[\s._*-]?';
    end if;
    pattern := pattern || '[' || cls || ']';
  end loop;
  return '(?<![[:alnum:]])' || pattern || '(?![[:alnum:]])';
end;
$$;

create or replace function public.clean_chat_body(raw text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text := raw;
  word text;
  words text[] := array[
    'fucking', 'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'cunt', 'slut', 'whore'
  ];
begin
  if cleaned is null then
    return null;
  end if;
  foreach word in array words loop
    cleaned := regexp_replace(cleaned, public.chat_word_pattern(word), repeat('*', char_length(word)), 'gi');
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

-- Reports: max 10 per reporter per hour, and one report per message per reporter.
create unique index if not exists reports_one_per_message
  on public.reports (reporter_id, message_id)
  where message_id is not null;

create or replace function public.limit_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  select count(*) into recent from public.reports
    where reporter_id = new.reporter_id
      and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'Too many reports. Try again later.';
  end if;
  if new.message_id is not null and exists (
    select 1 from public.reports
    where reporter_id = new.reporter_id and message_id = new.message_id
  ) then
    raise exception 'You already reported this message.';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_limit on public.reports;
create trigger reports_limit
  before insert on public.reports
  for each row execute function public.limit_reports();

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
  with scored as (
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
      ), p.money::numeric) as rich_avg,
      coalesce((
        select avg((item->>'grades')::numeric)
        from jsonb_array_elements(p.history) item
        where (item->>'at')::timestamptz > now() - interval '7 days'
      ), p.grades::numeric) as dean_avg,
      coalesce((
        select avg((item->>'balanced')::numeric)
        from jsonb_array_elements(p.history) item
        where (item->>'at')::timestamptz > now() - interval '7 days'
      ), p.balanced::numeric) as balanced_avg
    from public.profiles p
    where not p.suspended
      and p.display_name is not null
      and p.state is not null
  ),
  ranked as (
    select s.*,
      rank() over (order by s.rich_avg desc) as rich_rank,
      rank() over (order by s.dean_avg desc) as dean_rank,
      rank() over (order by s.balanced_avg desc) as balanced_rank
    from scored s
  )
  -- Keep anyone in the top 500 of any board so no board loses a row.
  select r.id, r.display_name, r.residence, r.money, r.grades, r.balanced,
         r.rich_avg, r.dean_avg, r.balanced_avg
  from ranked r
  where r.rich_rank <= 500 or r.dean_rank <= 500 or r.balanced_rank <= 500
  order by r.balanced_rank;
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

create or replace function public.admin_delete_message(message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  delete from public.chat_messages where id = message;
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
revoke execute on function public.admin_delete_message(uuid) from public, anon;
grant execute on function public.admin_delete_message(uuid) to authenticated;
grant execute on function public.admin_edit_event(text, text, text, text, jsonb) to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'player' and not suspended);

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


-- ---------------------------------------------------------------------------
-- Pass 3: shared word list, slur rejection, report snapshots.
-- Review before running. Never run this file against a live project without
-- a backup; it is written to be re-runnable (if not exists / or replace).
-- ---------------------------------------------------------------------------

-- Same lists as src/engine/filter.js. kind = mask (swearing) or block (slurs).
-- A trailing * matches as a prefix.
create table if not exists public.chat_words (
  word text primary key,
  kind text not null check (kind in ('mask', 'block'))
);
alter table public.chat_words enable row level security;
drop policy if exists "read words" on public.chat_words;
create policy "read words" on public.chat_words for select using (true);

insert into public.chat_words (word, kind)
select w, 'mask' from (values
  ('fuck*'),
  ('fck'),
  ('fuk*'),
  ('phuck*'),
  ('fcuk*'),
  ('motherfuck*'),
  ('shit*'),
  ('bullshit'),
  ('bitch*'),
  ('asshole*'),
  ('arsehole*'),
  ('bastard*'),
  ('dick'),
  ('dickhead'),
  ('cunt*'),
  ('slut*'),
  ('whore*'),
  ('wanker*'),
  ('twat*'),
  ('prick'),
  ('pussy'),
  ('cock'),
  ('bollocks'),
  ('poes*'),
  ('poephol*'),
  ('doos'),
  ('fok'),
  ('fokken'),
  ('fokkof'),
  ('fokol'),
  ('naai'),
  ('naaier'),
  ('kak'),
  ('kakhuis'),
  ('moer'),
  ('jou ma se'),
  ('voetsek'),
  ('drol'),
  ('teef'),
  ('msunu*'),
  ('umsunu*'),
  ('nyoko*'),
  ('unyoko'),
  ('sfebe'),
  ('isifebe'),
  ('umthondo'),
  ('mnqundu'),
  ('ngquza'),
  ('masende'),
  ('isidomu'),
  ('sdomu')
) as t(w)
on conflict (word) do nothing;

insert into public.chat_words (word, kind)
select w, 'block' from (values
  ('kaffir*'),
  ('kaffer*'),
  ('k4ffir'),
  ('nigger*'),
  ('nigga*'),
  ('coolie*'),
  ('koelie*'),
  ('boesman*'),
  ('hotnot*'),
  ('kwerekwere'),
  ('makwerekwere'),
  ('grigamba'),
  ('faggot*'),
  ('moffie*'),
  ('retard*')
) as t(w)
on conflict (word) do update set kind = 'block';

-- Same matcher as chat_word_pattern above (leetspeak, '*', spaced letters).
-- A trailing * is a prefix. Phrases stay space-separated. Block words reject.
create or replace function public.clean_chat_body(raw text)
returns text
language plpgsql
stable
as $$
declare
  cleaned text := raw;
  entry record;
  pattern text;
  stem text;
begin
  if cleaned is null then
    return null;
  end if;
  for entry in select word, kind from public.chat_words loop
    if right(entry.word, 1) = '*' then
      stem := left(entry.word, -1);
      pattern := regexp_replace(
        public.chat_word_pattern(stem),
        '\(\?!\[\[:alnum:\]\]\)$',
        '[[:alnum:]]*'
      );
    elsif position(' ' in entry.word) > 0 then
      pattern := '(?<![[:alnum:]])' || replace(entry.word, ' ', '\s+') || 's?(?![[:alnum:]])';
    else
      pattern := public.chat_word_pattern(entry.word);
    end if;
    if entry.kind = 'block' and cleaned ~* pattern then
      raise exception 'Message not allowed';
    end if;
    cleaned := regexp_replace(cleaned, pattern, '***', 'gi');
  end loop;
  return trim(cleaned);
end;
$$;

-- Keep a copy of the reported text so moderators can read it even after a
-- message is deleted, and allow a reviewing state.
alter table public.reports add column if not exists message_body text;
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status in ('open', 'reviewing', 'closed'));

-- One report per reporter per message.
create unique index if not exists reports_once_idx
  on public.reports (reporter_id, message_id) where message_id is not null;

-- ---------------------------------------------------------------------------
-- Error log (src/errors.js): errors the game hits on players' phones, with the
-- screen, step, device and build. Anyone playing can add a row; only admins read.
-- ---------------------------------------------------------------------------

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text,
  message text,
  stack text,
  screen text,
  step text,
  device text,
  build text,
  detail text
);

alter table public.client_errors enable row level security;
grant insert on public.client_errors to anon, authenticated;

drop policy if exists "anyone can report an error" on public.client_errors;
create policy "anyone can report an error" on public.client_errors
  for insert to anon, authenticated with check (true);

drop policy if exists "admins read errors" on public.client_errors;
create policy "admins read errors" on public.client_errors
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Piece 1a: player cards. Run this block once in the Supabase SQL editor.
-- A card is keyed by the player's presence id (until accounts arrive in Piece 1).
-- Anyone can read cards; only the phone holding the card's secret can write it
-- (save_player_card: the first save claims the id). Bios are filtered in the game on
-- save and again on display; here they are only cut to length.
-- ---------------------------------------------------------------------------
create table if not exists public.player_cards (
  id text primary key,
  name text,
  handle text,
  num text,
  house text,
  bio text,
  tags jsonb not null default '{}'::jsonb,
  year int not null default 1,
  days int not null default 1,
  badges jsonb not null default '[]'::jsonb,
  look jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.player_cards enable row level security;
grant select on public.player_cards to anon, authenticated;
drop policy if exists "anyone can read cards" on public.player_cards;
create policy "anyone can read cards" on public.player_cards for select using (true);

-- The secrets live apart, readable by nobody (no policies): only the function uses them.
create table if not exists public.player_card_keys (
  id text primary key,
  secret_hash text not null
);
alter table public.player_card_keys enable row level security;

create or replace function public.save_player_card(p_id text, p_secret text, p_card jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or length(p_id) not between 8 and 64 or p_secret is null or length(p_secret) < 16 then
    raise exception 'bad card';
  end if;
  if length(p_card::text) > 6000 then raise exception 'card too big'; end if;
  insert into player_card_keys (id, secret_hash) values (p_id, md5(p_secret)) on conflict (id) do nothing;
  if (select secret_hash from player_card_keys where id = p_id) <> md5(p_secret) then
    raise exception 'not your card';
  end if;
  insert into player_cards (id, name, handle, num, house, bio, tags, year, days, badges, look, updated_at)
  values (
    p_id, left(p_card->>'name', 24), left(p_card->>'handle', 30), left(p_card->>'num', 12), left(p_card->>'house', 40),
    left(p_card->>'bio', 80), coalesce(p_card->'tags', '{}'::jsonb), least(greatest(coalesce((p_card->>'year')::int, 1), 1), 8),
    greatest(coalesce((p_card->>'days')::int, 1), 1), coalesce(p_card->'badges', '[]'::jsonb), coalesce(p_card->'look', '{}'::jsonb), now()
  )
  on conflict (id) do update set
    name = excluded.name, handle = excluded.handle, num = excluded.num, house = excluded.house, bio = excluded.bio,
    tags = excluded.tags, year = excluded.year, days = excluded.days, badges = excluded.badges, look = excluded.look,
    updated_at = now();
end $$;
grant execute on function public.save_player_card(text, text, jsonb) to anon, authenticated;

-- Reports on players (the Report button on a card). Anyone can file one; admins read.
create table if not exists public.player_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reporter_id text,
  reported_id text,
  reason text,
  card jsonb
);
alter table public.player_reports enable row level security;
drop policy if exists "admins read player reports" on public.player_reports;
create policy "admins read player reports" on public.player_reports for select using (public.is_admin());

create or replace function public.report_player(p_reporter text, p_reported text, p_reason text, p_card jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_card::text, '')) > 6000 then raise exception 'too big'; end if;
  insert into player_reports (reporter_id, reported_id, reason, card)
  values (left(p_reporter, 64), left(p_reported, 64), left(p_reason, 80), p_card);
end $$;
grant execute on function public.report_player(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Piece 3: talking. Run this block once in the Supabase SQL editor (after the Piece 1a
-- block, or on its own: it makes the reports table if it isn't there). A report can
-- carry what the player said (the chat line reported, or their last few lines).
-- Until it is run, the game files reports in client_errors (kind 'player_report').
create table if not exists public.player_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reporter_id text,
  reported_id text,
  reason text,
  card jsonb
);
alter table public.player_reports add column if not exists message text;
alter table public.player_reports enable row level security;
drop policy if exists "admins read player reports" on public.player_reports;
create policy "admins read player reports" on public.player_reports for select using (public.is_admin());

create or replace function public.report_player(p_reporter text, p_reported text, p_reason text, p_card jsonb, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_card::text, '')) > 6000 then raise exception 'too big'; end if;
  insert into player_reports (reporter_id, reported_id, reason, card, message)
  values (left(p_reporter, 64), left(p_reported, 64), left(p_reason, 80), p_card, left(p_message, 600));
end $$;
grant execute on function public.report_player(text, text, text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Handles (owner, 6 Nov). Run this block once in the Supabase SQL editor. Every
-- @handle is unique: claimed by one player (their presence id + its secret, the same
-- phone's identity as the card), changeable once every 30 days. The game checks the
-- rules (3-20 lowercase letters, numbers, underscores; no slurs or official-looking
-- names) before it asks; here the format is enforced again.
create table if not exists public.player_handles (
  handle text primary key check (handle ~ '^[a-z0-9_]{3,20}$'),
  owner_id text not null unique,
  owner_secret text not null,
  changed_at timestamptz not null default now()
);
alter table public.player_handles enable row level security;
-- (no read policy: only through the two functions below, which never show secrets)

create or replace function public.handles_taken(p_handles text[], p_id text)
returns text[] language sql security definer set search_path = public as $$
  select coalesce(array_agg(handle), '{}') from player_handles where handle = any(p_handles) and owner_id <> p_id;
$$;
grant execute on function public.handles_taken(text[], text) to anon, authenticated;

create or replace function public.claim_handle(p_id text, p_secret text, p_handle text)
returns text language plpgsql security definer set search_path = public as $$
declare mine player_handles;
begin
  if p_handle !~ '^[a-z0-9_]{3,20}$' then return 'invalid'; end if;
  select * into mine from player_handles where owner_id = p_id;
  if found then
    if mine.owner_secret <> p_secret then return 'not-yours'; end if;
    if mine.handle = p_handle then return 'ok'; end if;
    if mine.changed_at > now() - interval '30 days' then return 'cooldown'; end if;
  end if;
  if exists (select 1 from player_handles where handle = p_handle and owner_id <> p_id) then return 'taken'; end if;
  delete from player_handles where owner_id = p_id;
  insert into player_handles (handle, owner_id, owner_secret) values (p_handle, p_id, p_secret);
  return 'ok';
exception when unique_violation then return 'taken';
end $$;
grant execute on function public.claim_handle(text, text, text) to anon, authenticated;

-- The leaderboard shows handles too (signed-in players' profiles.handle): the same
-- function as above, with the handle column added (a new return type: drop first).
drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (
  user_id uuid,
  display_name text,
  handle text,
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
    p.handle,
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
grant execute on function public.leaderboard() to anon, authenticated;
