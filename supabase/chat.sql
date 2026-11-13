-- CHAT SPRINT (owner, 11 Nov): threads (DMs and groups), The Quad, limits and safety.
-- Run the whole file once in the Supabase SQL editor (re-runnable). It needs the base schema (clean_chat_body, is_admin).
-- Until it is run the game plays on and the chat sheet says "Chat opens soon".
--
-- How it is kept safe: every table has row level security ON and NO policy for players, so nobody can read or
-- write a table directly. Everything goes through the functions below, which check who you are (the phone's
-- secret, as record_activity does) and that you are a member of the thread. Only members read or write.
-- Realtime carries no message text: after a send, the sender's phone broadcasts a small "something new" nudge
-- and each member's phone fetches the new lines through chat_fetch (src/threads.js).

create table if not exists public.chat_players (
  id text primary key,
  secret_hash text not null,
  name text not null default 'Student',
  handle text not null default '',
  house text not null default '',
  look jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
alter table public.chat_players enable row level security;

-- id: 'quad', 'dm:<a>:<b>' (the two player ids in order) or 'g:<uuid>'.
create table if not exists public.chat_threads (
  id text primary key,
  kind text not null check (kind in ('dm', 'group')),
  name text not null default '',
  topic text not null default '',
  creator text,
  open boolean not null default false, -- an open group: every player is a member (joined on their next chat_sync)
  created_at timestamptz not null default now(),
  last_id bigint not null default 0,
  last_at timestamptz
);
alter table public.chat_threads enable row level security;

create table if not exists public.chat_members (
  thread text not null references public.chat_threads (id) on delete cascade,
  player text not null,
  joined_at timestamptz not null default now(),
  last_read bigint not null default 0,
  primary key (thread, player)
);
create index if not exists chat_members_player_idx on public.chat_members (player);
alter table public.chat_members enable row level security;

create table if not exists public.chat_lines (
  id bigint generated always as identity primary key,
  thread text not null references public.chat_threads (id) on delete cascade,
  sender text not null,
  body text not null check (char_length(body) between 1 and 300),
  at timestamptz not null default now()
);
create index if not exists chat_lines_thread_idx on public.chat_lines (thread, id);
create index if not exists chat_lines_sender_idx on public.chat_lines (sender, at desc);
alter table public.chat_lines enable row level security;

create table if not exists public.chat_blocks (
  blocker text not null,
  blocked text not null,
  at timestamptz not null default now(),
  primary key (blocker, blocked)
);
create index if not exists chat_blocks_blocked_idx on public.chat_blocks (blocked);
alter table public.chat_blocks enable row level security;

create table if not exists public.chat_line_reports (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  reporter text not null,
  line bigint,
  thread text,
  sender text,
  body text,
  reason text check (char_length(reason) <= 60)
);
alter table public.chat_line_reports enable row level security;
drop policy if exists "admins read chat reports" on public.chat_line_reports;
create policy "admins read chat reports" on public.chat_line_reports for select using (public.is_admin());
drop policy if exists "admins read chat lines" on public.chat_lines;
create policy "admins read chat lines" on public.chat_lines for select using (public.is_admin());

-- The Quad: one open group for everyone. The pinned topic is the first entry of data/campusville/topics.json
-- (npm run check fails if this line and that file disagree).
-- QUAD TOPIC START
insert into public.chat_threads (id, kind, name, topic, open) values ('quad', 'group', 'The Quad', 'R15 for a taxi to town: fair or robbery?', true)
on conflict (id) do update set name = excluded.name, topic = excluded.topic, open = true;
-- QUAD TOPIC END

-- Who is calling: raises unless p_secret is the secret this id was first seen with.
create or replace function public.chat_me(p_id text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or p_secret is null or not exists (select 1 from chat_players where id = p_id and secret_hash = md5(p_secret)) then
    raise exception 'not you';
  end if;
end $$;
revoke all on function public.chat_me(text, text) from public;

-- Either of the two has blocked the other.
create or replace function public.chat_blocked(a text, b text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
revoke all on function public.chat_blocked(text, text) from public;

-- A thread as p_id sees it: { id, kind, name, topic, members, peer, last, unread }.
create or replace function public.chat_thread_json(p_id text, t public.chat_threads) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare peer chat_players%rowtype; last_line jsonb; n_unread int; n_members int; mine bigint;
begin
  select last_read into mine from chat_members where thread = t.id and player = p_id;
  if t.kind = 'dm' then
    select p.* into peer from chat_members m join chat_players p on p.id = m.player where m.thread = t.id and m.player <> p_id limit 1;
  end if;
  select jsonb_build_object('id', l.id, 'body', l.body, 'at', l.at, 'sender', l.sender, 'name', coalesce(p.name, 'Student'))
    into last_line
    from chat_lines l left join chat_players p on p.id = l.sender
    where l.thread = t.id and not chat_blocked(p_id, l.sender) order by l.id desc limit 1;
  select count(*) into n_unread from chat_lines l
    where l.thread = t.id and l.id > coalesce(mine, 0) and l.sender <> p_id and not chat_blocked(p_id, l.sender);
  select count(*) into n_members from chat_members where thread = t.id;
  return jsonb_build_object('id', t.id, 'kind', t.kind, 'name', case when t.kind = 'dm' then coalesce(peer.name, 'Student') else t.name end,
    'topic', t.topic, 'members', n_members, 'creator', t.creator,
    'peer', case when t.kind = 'dm' and peer.id is not null then jsonb_build_object('id', peer.id, 'name', peer.name, 'handle', peer.handle, 'house', peer.house, 'look', peer.look) end,
    'last', last_line, 'unread', n_unread);
end $$;
revoke all on function public.chat_thread_json(text, public.chat_threads) from public;

drop function if exists public.chat_sync(text, text, text, text, text, jsonb, int); -- (Social A's version, below, replaces this one each run)
-- Hello: who I am (the first call from a phone claims its id), join every open group, and my thread list.
-- Returns { ok, threads: [...], blocked: [ids I blocked] }.
create or replace function public.chat_sync(p_id text, p_secret text, p_name text default null, p_handle text default null, p_house text default null, p_look jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(coalesce(nullif(trim(p_name), ''), 'Student'), 24); list jsonb; mine jsonb;
begin
  if p_id is null or length(p_id) not between 8 and 64 or p_secret is null or length(p_secret) < 16 then raise exception 'bad player'; end if;
  begin nm := public.clean_chat_body(nm); exception when others then nm := 'Student'; end;
  if nm is null or nm = '' then nm := 'Student'; end if;
  insert into chat_players (id, secret_hash, name) values (p_id, md5(p_secret), nm) on conflict (id) do nothing;
  perform chat_me(p_id, p_secret);
  update chat_players set seen_at = now(),
    name = case when p_name is null then name else nm end,
    handle = case when p_handle is null then handle else left(regexp_replace(lower(p_handle), '[^a-z0-9_]', '', 'g'), 20) end,
    house = case when p_house is null then house else left(p_house, 40) end,
    look = case when p_look is null or length(p_look::text) > 2000 then look else p_look end
    where id = p_id;
  -- (a new member of an open group starts with nothing unread)
  insert into chat_members (thread, player, last_read) select t.id, p_id, t.last_id from chat_threads t where t.open on conflict do nothing;
  select coalesce(jsonb_agg(x.j order by x.at desc nulls last), '[]'::jsonb) into list from (
    select chat_thread_json(p_id, t) as j, coalesce(t.last_at, case when t.kind = 'group' then t.created_at end) as at
    from chat_members m join chat_threads t on t.id = m.thread
    where m.player = p_id
      and (t.kind = 'group' or (t.last_id > 0 and not exists (
        select 1 from chat_members o where o.thread = t.id and o.player <> p_id and chat_blocked(p_id, o.player))))
  ) x;
  select coalesce(jsonb_agg(blocked), '[]'::jsonb) into mine from chat_blocks where blocker = p_id;
  return jsonb_build_object('ok', true, 'threads', list, 'blocked', mine);
end $$;
grant execute on function public.chat_sync(text, text, text, text, text, jsonb) to anon, authenticated;

-- The lines of a thread after p_after (at most the last 200), oldest first, never from anyone blocked either way.
-- Returns { ok, thread, lines: [{ id, sender, body, at }], people: { id: { name, handle, house, look } } }.
create or replace function public.chat_fetch(p_id text, p_secret text, p_thread text, p_after bigint default 0, p_mark boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; rows jsonb; people jsonb;
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_threads where id = p_thread;
  if not found or not exists (select 1 from chat_members where thread = p_thread and player = p_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  with recent as (
    select l.id, l.sender, l.body, l.at from chat_lines l
    where l.thread = p_thread and l.id > coalesce(p_after, 0) and not chat_blocked(p_id, l.sender)
      and (not chat_is_quad(p_thread) or l.at > now() - interval '24 hours') -- (job I: the Quad shows its last 24 hours)
    order by l.id desc limit 200
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'sender', r.sender, 'body', r.body, 'at', r.at) order by r.id), '[]'::jsonb),
    coalesce((select jsonb_object_agg(p.id, jsonb_build_object('name', p.name, 'handle', p.handle, 'house', p.house, 'look', p.look))
      from chat_players p where p.id in (select sender from recent)), '{}'::jsonb)
    into rows, people from recent r;
  if p_mark then update chat_members set last_read = t.last_id where thread = p_thread and player = p_id; end if;
  return jsonb_build_object('ok', true, 'thread', chat_thread_json(p_id, t), 'lines', rows, 'people', people);
end $$;
grant execute on function public.chat_fetch(text, text, text, bigint, boolean) to anon, authenticated;

-- Send a line. Limits (server clock): one message per 2 s and 30 per 5 minutes per player; 300 characters; the
-- word filter (a slur refuses the message). Keeps the last 200 lines of the thread.
-- Returns { ok, line: { id, sender, body, at }, to: [the other member of a DM] } or { ok: false, reason, wait }.
--   reason: not_member | blocked | empty | word | slow | flood
create or replace function public.chat_send(p_id text, p_secret text, p_thread text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; body text := left(trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), 300);
  last_at timestamptz; recent int; oldest timestamptz; new_id bigint; new_at timestamptz; others jsonb := '[]'::jsonb;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chat:' || p_id));
  select * into t from chat_threads where id = p_thread;
  if not found or not exists (select 1 from chat_members where thread = p_thread and player = p_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if t.kind = 'dm' then
    if exists (select 1 from chat_members o where o.thread = p_thread and o.player <> p_id and chat_blocked(p_id, o.player)) then
      return jsonb_build_object('ok', false, 'reason', 'blocked');
    end if;
    select coalesce(jsonb_agg(player), '[]'::jsonb) into others from chat_members where thread = p_thread and player <> p_id;
  end if;
  begin body := public.clean_chat_body(body); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  if body is null or body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  select max(at), count(*), min(at) into last_at, recent, oldest from chat_lines where sender = p_id and at > now() - interval '5 minutes';
  if last_at is not null and last_at > now() - interval '2 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'slow', 'wait', ceil(extract(epoch from (last_at + interval '2 seconds' - now())) * 1000));
  end if;
  if recent >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'flood', 'wait', ceil(extract(epoch from (oldest + interval '5 minutes' - now())) * 1000));
  end if;
  insert into chat_lines (thread, sender, body) values (p_thread, p_id, left(body, 300)) returning id, at into new_id, new_at;
  update chat_threads set last_id = new_id, last_at = new_at where id = p_thread;
  update chat_members set last_read = new_id where thread = p_thread and player = p_id;
  delete from chat_lines where thread = p_thread and id <= (select id from chat_lines where thread = p_thread order by id desc offset 200 limit 1);
  return jsonb_build_object('ok', true, 'line', jsonb_build_object('id', new_id, 'sender', p_id, 'body', left(body, 300), 'at', new_at), 'to', others);
end $$;
grant execute on function public.chat_send(text, text, text, text) to anon, authenticated;

-- Open (or make) the DM with another player. Returns { ok, thread } or { ok: false, reason: unknown | self | blocked }.
create or replace function public.chat_dm(p_id text, p_secret text, p_other text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tid text;
begin
  perform chat_me(p_id, p_secret);
  if p_other is null or p_other = p_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not exists (select 1 from chat_players where id = p_other) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if chat_blocked(p_id, p_other) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
  tid := 'dm:' || least(p_id, p_other) || ':' || greatest(p_id, p_other);
  insert into chat_threads (id, kind, creator) values (tid, 'dm', p_id) on conflict (id) do nothing;
  insert into chat_members (thread, player) values (tid, p_id), (tid, p_other) on conflict do nothing;
  return jsonb_build_object('ok', true, 'thread', tid);
end $$;
grant execute on function public.chat_dm(text, text, text) to anon, authenticated;

-- Block (or unblock) a player: their lines are hidden from you and yours from them, in every thread.
create or replace function public.chat_block(p_id text, p_secret text, p_other text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  if p_other is null or p_other = p_id or length(p_other) > 64 then return jsonb_build_object('ok', false); end if;
  if p_on then insert into chat_blocks (blocker, blocked) values (p_id, p_other) on conflict do nothing;
  else delete from chat_blocks where blocker = p_id and blocked = p_other; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_block(text, text, text, boolean) to anon, authenticated;

-- Report a line you can see (a copy of its text is kept). 20 reports an hour per player.
create or replace function public.chat_report(p_id text, p_secret text, p_line bigint, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare l chat_lines%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into l from chat_lines where id = p_line;
  if not found or not exists (select 1 from chat_members where thread = l.thread and player = p_id) then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if (select count(*) from chat_line_reports where reporter = p_id and at > now() - interval '1 hour') >= 20 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  insert into chat_line_reports (reporter, line, thread, sender, body, reason) values (p_id, l.id, l.thread, l.sender, l.body, left(coalesce(p_reason, ''), 60));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_report(text, text, bigint, text) to anon, authenticated;

-- Groups v1 (no screen for it yet): make a group, and its creator sets the pinned topic.
create or replace function public.chat_group_create(p_id text, p_secret text, p_name text, p_topic text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(trim(coalesce(p_name, '')), 40); tp text := left(trim(coalesce(p_topic, '')), 120); tid text;
begin
  perform chat_me(p_id, p_secret);
  begin nm := public.clean_chat_body(nm); tp := public.clean_chat_body(tp); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  if char_length(nm) < 3 or nm ~ '\*\*\*' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  if (select count(*) from chat_threads where creator = p_id and kind = 'group') >= 5 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  tid := 'g:' || gen_random_uuid()::text;
  insert into chat_threads (id, kind, name, topic, creator) values (tid, 'group', nm, tp, p_id);
  insert into chat_members (thread, player) values (tid, p_id);
  return jsonb_build_object('ok', true, 'thread', tid);
end $$;
grant execute on function public.chat_group_create(text, text, text, text) to anon, authenticated;

create or replace function public.chat_set_topic(p_id text, p_secret text, p_thread text, p_topic text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tp text := left(trim(coalesce(p_topic, '')), 120);
begin
  perform chat_me(p_id, p_secret);
  begin tp := public.clean_chat_body(tp); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  update chat_threads set topic = tp where id = p_thread and kind = 'group' and creator = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_set_topic(text, text, text, text) to anon, authenticated;

-- =====================================================================================================
-- SOCIAL A (owner, 11 Nov): groups you make and invite people to, friends, a Quad per room, join toasts.
-- Same rules as above: no table is readable, every function checks the phone's secret. Re-runnable.
--   Limits (server clock): 3 groups made a day and 10 alive per player; 40 members a group; 40 invites a day
--   (people added or asked, plus WhatsApp links made); 200 friends; one "just joined" announcement per player, ever.
-- =====================================================================================================
alter table public.chat_threads add column if not exists code text;
create unique index if not exists chat_threads_code_idx on public.chat_threads (code) where code is not null;
alter table public.chat_members add column if not exists muted boolean not null default false;
alter table public.chat_players add column if not exists room int not null default 1;
alter table public.chat_players add column if not exists joined_said boolean not null default false;
-- SOCIAL C (owner, 11 Nov; its functions are the last block of this file):
--   find_day: the day (SAST) you said "let friends find me"; you share only while it is today. spot: where you
--   stand in the game ({ part, x, z, in }), never a real place. suggest_day: the last day a group was suggested.
alter table public.chat_players add column if not exists find_day date;
alter table public.chat_players add column if not exists spot jsonb;
alter table public.chat_players add column if not exists spot_at timestamptz;
alter table public.chat_players add column if not exists suggest_day date;
--   listed: an Open group (it can be suggested); tag: one of the 12 interests; reports_hidden: three reports of its
--   name or topic took it out of suggestions until an admin sets this back to false.
alter table public.chat_threads add column if not exists listed boolean not null default false;
alter table public.chat_threads add column if not exists tag text;
alter table public.chat_threads add column if not exists reports_hidden boolean not null default false;

create table if not exists public.chat_friends (
  player text not null,
  friend text not null,
  at timestamptz not null default now(),
  primary key (player, friend)
);
alter table public.chat_friends enable row level security;

-- What the limits count: kind 'group' (one made), 'invite' (someone added, or a WhatsApp link made).
create table if not exists public.chat_events (
  id bigint generated always as identity primary key,
  player text not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists chat_events_idx on public.chat_events (player, kind, at desc);
alter table public.chat_events enable row level security;

-- LOOPS (owner, 11 Nov): a group's flame, and "invite a friend".
--   flame: how many days running at least 3 members of the group were active (opened the game: a sync); flame_day:
--   the last such day (SAST). Shown as 0 once a day has been missed.
alter table public.chat_threads add column if not exists flame int not null default 0;
alter table public.chat_threads add column if not exists flame_day date;
--   ref_code: a player's invite code (made the first time they ask for their link).
alter table public.chat_players add column if not exists ref_code text;
create unique index if not exists chat_players_ref_idx on public.chat_players (ref_code) where ref_code is not null;
--   One row per friend who came in through someone's link: a friend is counted once, ever. paid: the inviter's
--   phone has been told (and has added the reward).
create table if not exists public.chat_refs (
  friend text primary key,
  inviter text not null,
  at timestamptz not null default now(),
  paid boolean not null default false
);
create index if not exists chat_refs_inviter_idx on public.chat_refs (inviter);
alter table public.chat_refs enable row level security;

-- SOCIAL A FOLLOW-UPS (owner, 11 Nov): nobody lands in a group they did not agree to.
--   An ask: "[Name] wants to add you to [Group]. Join / No thanks." One per player per group, good for 24 hours.
--   state: pending | yes | no. The asker is told "added" or "can't right now" on their next sync, then the row goes.
create table if not exists public.chat_group_asks (
  id bigint generated always as identity primary key,
  thread text not null references public.chat_threads (id) on delete cascade,
  asker text not null,
  player text not null,
  at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending', 'yes', 'no')),
  unique (thread, player)
);
create index if not exists chat_group_asks_player_idx on public.chat_group_asks (player);
create index if not exists chat_group_asks_asker_idx on public.chat_group_asks (asker);
alter table public.chat_group_asks enable row level security;
-- A player the creator removed: the group's link no longer lets them in.
create table if not exists public.chat_group_bans (
  thread text not null references public.chat_threads (id) on delete cascade,
  player text not null,
  at timestamptz not null default now(),
  primary key (thread, player)
);
alter table public.chat_group_bans enable row level security;
-- Friends both ways: each has the other on their list.
create or replace function public.chat_mutual(a text, b text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from chat_friends where player = a and friend = b) and exists (select 1 from chat_friends where player = b and friend = a)
$$;
revoke all on function public.chat_mutual(text, text) from public;

-- The Quad per room: room 1 talks in 'quad', room n in 'quad:n', each with the same pinned topic. Nobody is
-- in every Quad any more, so 'quad' stops being an open group; chat_sync puts you in your room's.
update public.chat_threads set open = false where id = 'quad';
create or replace function public.chat_quad_id(n int) returns text language sql immutable as $$
  select case when coalesce(n, 1) <= 1 then 'quad' else 'quad:' || n end
$$;
create or replace function public.chat_is_quad(t text) returns boolean language sql immutable as $$
  select t = 'quad' or t like 'quad:%'
$$;

-- A thread as p_id sees it, now with: muted, code (a group you are in; never a Quad), quad.
create or replace function public.chat_thread_json(p_id text, t public.chat_threads) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare peer chat_players%rowtype; last_line jsonb; n_unread int; n_members int; mine bigint; is_muted boolean;
begin
  select last_read, muted into mine, is_muted from chat_members where thread = t.id and player = p_id;
  if t.kind = 'dm' then
    select p.* into peer from chat_members m join chat_players p on p.id = m.player where m.thread = t.id and m.player <> p_id limit 1;
  end if;
  select jsonb_build_object('id', l.id, 'body', l.body, 'at', l.at, 'sender', l.sender, 'name', coalesce(p.name, 'Student'))
    into last_line
    from chat_lines l left join chat_players p on p.id = l.sender
    where l.thread = t.id and not chat_blocked(p_id, l.sender)
      and (not chat_is_quad(t.id) or l.at > now() - interval '24 hours') order by l.id desc limit 1;
  select count(*) into n_unread from chat_lines l
    where l.thread = t.id and l.id > coalesce(mine, 0) and l.sender <> p_id and not chat_blocked(p_id, l.sender)
      and (not chat_is_quad(t.id) or l.at > now() - interval '24 hours');
  select count(*) into n_members from chat_members where thread = t.id;
  return jsonb_build_object('id', t.id, 'kind', t.kind, 'name', case when t.kind = 'dm' then coalesce(peer.name, 'Student') else t.name end,
    'topic', t.topic, 'members', n_members, 'creator', t.creator,
    'peer', case when t.kind = 'dm' and peer.id is not null then jsonb_build_object('id', peer.id, 'name', peer.name, 'handle', peer.handle, 'house', peer.house, 'look', peer.look)
      -- (job I: "online" or "last seen" for a friend both ways only)
      || case when chat_mutual(p_id, peer.id) then jsonb_build_object('online', peer.seen_at > now() - interval '70 seconds', 'seen', peer.seen_at) else '{}'::jsonb end end,
    'last', last_line, 'unread', n_unread, 'muted', coalesce(is_muted, false), 'quad', chat_is_quad(t.id),
    -- (Loops: the group's flame; 0 once a day has been missed)
    'flame', case when t.flame_day >= (now() at time zone 'Africa/Johannesburg')::date - 1 then t.flame else 0 end,
    -- (Social C: Open or Private, and the interest an Open group is about)
    'listed', (t.kind = 'group' and t.listed), 'tag', t.tag,
    'code', case when t.kind = 'group' and not chat_is_quad(t.id) and mine is not null then t.code end);
end $$;
revoke all on function public.chat_thread_json(text, public.chat_threads) from public;

-- Hello, now with the room you are in (p_room: 1, 2, 3...; left out = where you were). Puts you in that room's
-- Quad and out of the others. Returns { ok, threads, blocked, friends: [{ id, name, handle, house, look, online }], room }.
drop function if exists public.chat_sync(text, text, text, text, text, jsonb);
create or replace function public.chat_sync(p_id text, p_secret text, p_name text default null, p_handle text default null, p_house text default null, p_look jsonb default null, p_room int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(coalesce(nullif(trim(p_name), ''), 'Student'), 24); list jsonb; mine jsonb; pals jsonb; rm int; qid text; asks jsonb; answers jsonb;
  today date := (now() at time zone 'Africa/Johannesburg')::date; refs jsonb;
begin
  if p_id is null or length(p_id) not between 8 and 64 or p_secret is null or length(p_secret) < 16 then raise exception 'bad player'; end if;
  begin nm := public.clean_chat_body(nm); exception when others then nm := 'Student'; end;
  if nm is null or nm = '' then nm := 'Student'; end if;
  insert into chat_players (id, secret_hash, name) values (p_id, md5(p_secret), nm) on conflict (id) do nothing;
  perform chat_me(p_id, p_secret);
  select greatest(1, least(coalesce(p_room, room, 1), 99)) into rm from chat_players where id = p_id;
  update chat_players set seen_at = now(), room = rm,
    name = case when p_name is null then name else nm end,
    handle = case when p_handle is null then handle else left(regexp_replace(lower(p_handle), '[^a-z0-9_]', '', 'g'), 20) end,
    house = case when p_house is null then house else left(p_house, 40) end,
    look = case when p_look is null or length(p_look::text) > 2000 then look else p_look end
    where id = p_id;
  -- your room's Quad (made the first time anyone lands in that room), with the one pinned topic
  qid := chat_quad_id(rm);
  insert into chat_threads (id, kind, name, topic) select qid, 'group', 'The Quad', q.topic from chat_threads q where q.id = 'quad'
    on conflict (id) do update set topic = excluded.topic, name = excluded.name;
  delete from chat_members where player = p_id and chat_is_quad(thread) and thread <> qid;
  insert into chat_members (thread, player, last_read) select t.id, p_id, t.last_id from chat_threads t where t.id = qid on conflict do nothing;
  -- (a new member of an open group starts with nothing unread)
  insert into chat_members (thread, player, last_read) select t.id, p_id, t.last_id from chat_threads t where t.open on conflict do nothing;
  -- Loops: a group's flame grows on every day 3 or more of its members are active (this sync is you being active).
  -- Counted once a day per group, by whichever member's sync makes it three.
  update chat_threads t set flame = case when t.flame_day = today - 1 then t.flame + 1 else 1 end, flame_day = today
    where t.kind = 'group' and not chat_is_quad(t.id) and t.id not like 'p:%'
      and (t.flame_day is null or t.flame_day < today)
      and exists (select 1 from chat_members m where m.thread = t.id and m.player = p_id)
      and (select count(*) from chat_members m join chat_players pl on pl.id = m.player
           where m.thread = t.id and (pl.seen_at at time zone 'Africa/Johannesburg')::date = today) >= 3;
  select coalesce(jsonb_agg(x.j order by x.at desc nulls last), '[]'::jsonb) into list from (
    select chat_thread_json(p_id, t) as j, coalesce(t.last_at, case when t.kind = 'group' then t.created_at end) as at
    from chat_members m join chat_threads t on t.id = m.thread
    where m.player = p_id and t.id not like 'p:%' -- (Social B: the replies to a post are opened from the post, not listed)
      and (t.kind = 'group' or ((t.last_id > 0
          -- (job I: a chat request that was accepted lists the DM before its first line)
          or (to_regclass('public.chat_dm_asks') is not null and exists (select 1 from chat_members o join chat_dm_asks a on a.state = 'yes'
            and ((a.asker = o.player and a.player = p_id) or (a.player = o.player and a.asker = p_id)) where o.thread = t.id and o.player <> p_id)))
        and not exists (
        select 1 from chat_members o where o.thread = t.id and o.player <> p_id and chat_blocked(p_id, o.player))))
  ) x;
  select coalesce(jsonb_agg(blocked), '[]'::jsonb) into mine from chat_blocks where blocker = p_id;
  -- (who is online is only told about friends both ways: a one-way friend has no "online" in the reply at all)
  -- (Social C: where a friend is in the game, only if they said yes today, are online, and are a friend both ways)
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'handle', x.handle, 'house', x.house, 'look', x.look, 'mutual', x.mutual)
      || case when x.mutual then jsonb_build_object('online', x.online, 'seen', x.seen_at) else '{}'::jsonb end
      || case when x.mutual and x.online and x.find_day = today and x.spot is not null then jsonb_build_object('spot', x.spot) else '{}'::jsonb end
      order by (x.mutual and x.online) desc, x.name), '[]'::jsonb)
    into pals from (
      select p.id, p.name, p.handle, p.house, p.look, chat_mutual(p_id, p.id) as mutual, p.seen_at > now() - interval '70 seconds' as online, p.seen_at, p.find_day, p.spot
      from chat_friends f join chat_players p on p.id = f.friend where f.player = p_id and not chat_blocked(p_id, p.id)) x;
  -- asks waiting for your answer (24 hours, never from someone blocked either way)
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'thread', a.thread, 'group', t.name, 'from', coalesce(p.name, 'Student'), 'from_id', a.asker) order by a.at), '[]'::jsonb)
    into asks from chat_group_asks a join chat_threads t on t.id = a.thread left join chat_players p on p.id = a.asker
    where a.player = p_id and a.state = 'pending' and a.at > now() - interval '24 hours' and not chat_blocked(p_id, a.asker);
  -- what became of the asks you sent: "added" or "can't right now" (said no, or 24 hours went by), told once
  with done as (
    delete from chat_group_asks a where a.asker = p_id and (a.state <> 'pending' or a.at <= now() - interval '24 hours')
    returning a.thread, a.player, a.state)
  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(p.name, 'Student'), 'group', coalesce(t.name, 'the group'), 'added', d.state = 'yes')), '[]'::jsonb)
    into answers from done d left join chat_players p on p.id = d.player left join chat_threads t on t.id = d.thread;
  -- Loops: friends who finished the quick start through your link since you were last told (told once: the phone adds the reward)
  with told as (update chat_refs r set paid = true where r.inviter = p_id and not r.paid returning r.friend)
  select coalesce(jsonb_agg(coalesce(pl.name, 'A friend')), '[]'::jsonb) into refs from told left join chat_players pl on pl.id = told.friend;
  return jsonb_build_object('ok', true, 'threads', list, 'blocked', mine, 'friends', pals, 'room', rm, 'asks', asks, 'answers', answers, 'refs', refs,
    -- (Social B: your follower count and your interests; null until its block below has been run)
    'followers', (select count(*) from chat_follows where followed = p_id),
    'interests', (select to_jsonb(interests) from chat_players where id = p_id),
    -- (Social C: are you letting friends find you today)
    'find', (select coalesce(find_day = today, false) from chat_players where id = p_id),
    -- (Notifications: your choices, and a newcomer from your town to welcome; both null until that block is run)
    'push', (select jsonb_build_object('quiet', push_quiet, 'hide', push_hide, 'area', push_area, 'town', town) from chat_players where id = p_id),
    'welcome', chat_welcome_for(p_id),
    -- (job I: chat requests waiting for you, and what became of yours; null until its block below has been run)
    'dm_asks', case when to_regclass('public.chat_dm_asks') is not null then chat_dm_asks_for(p_id) end,
    'dm_answers', case when to_regclass('public.chat_dm_asks') is not null then chat_dm_answers_for(p_id) end);
end $$;
grant execute on function public.chat_sync(text, text, text, text, text, jsonb, int) to anon, authenticated;

-- Make a group: 3 a day, 10 alive; it gets a code for its invite link.
create or replace function public.chat_group_create(p_id text, p_secret text, p_name text, p_topic text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(trim(coalesce(p_name, '')), 40); tp text := left(trim(coalesce(p_topic, '')), 120); tid text;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chat:' || p_id));
  begin nm := public.clean_chat_body(nm); tp := public.clean_chat_body(tp); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  if char_length(nm) < 3 or nm ~ '\*\*\*' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  if (select count(*) from chat_threads where creator = p_id and kind = 'group') >= 10 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  if (select count(*) from chat_events where player = p_id and kind = 'group' and at > now() - interval '1 day') >= 3 then return jsonb_build_object('ok', false, 'reason', 'today'); end if;
  tid := 'g:' || gen_random_uuid()::text;
  insert into chat_threads (id, kind, name, topic, creator, code) values (tid, 'group', nm, tp, p_id, substr(md5(tid || random()::text), 1, 8));
  insert into chat_members (thread, player) values (tid, p_id);
  insert into chat_events (player, kind) values (p_id, 'group');
  return jsonb_build_object('ok', true, 'thread', tid);
end $$;
grant execute on function public.chat_group_create(text, text, text, text) to anon, authenticated;

-- A group p_id is in and may change (never a Quad, a DM or an open group). Null if not.
create or replace function public.chat_my_group(p_id text, p_thread text) returns public.chat_threads
language sql stable security definer set search_path = public as $$
  select t.* from chat_threads t where t.id = p_thread and t.kind = 'group' and not t.open and not chat_is_quad(t.id)
    and t.id not like 'p:%' and t.id not like 'i:%' -- (Social B: a post's replies, an interest's standing group)
    and exists (select 1 from chat_members m where m.thread = t.id and m.player = p_id)
$$;
revoke all on function public.chat_my_group(text, text) from public;

-- Add someone to a group you are in. Friends both ways go straight in ({ ok, added: true, to }). Anyone else gets
-- an ask they must answer ({ ok, asked: true, to }); it counts against the 40 invites a day and lasts 24 hours.
-- If either of you has blocked the other nothing is sent, and the reply looks exactly like an ask that was.
--   { ok: false, reason }: not_member | too_many (your own limits) | already | full (the group) | cant (no such player)
create or replace function public.chat_group_add(p_id text, p_secret text, p_thread text, p_other text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chatg:' || coalesce(p_thread, '')));
  t := chat_my_group(p_id, p_thread);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_other is null or p_other = p_id or not exists (select 1 from chat_players where id = p_other) then return jsonb_build_object('ok', false, 'reason', 'cant'); end if;
  if exists (select 1 from chat_members where thread = t.id and player = p_other) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  if (select count(*) from chat_members where thread = t.id) >= 40 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  if (select count(*) from chat_events where player = p_id and kind = 'invite' and at > now() - interval '1 day') >= 40 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  insert into chat_events (player, kind) values (p_id, 'invite');
  if chat_blocked(p_id, p_other) then return jsonb_build_object('ok', true, 'asked', true, 'to', '[]'::jsonb); end if;
  if chat_mutual(p_id, p_other) then
    insert into chat_members (thread, player, last_read) values (t.id, p_other, t.last_id);
    delete from chat_group_bans where thread = t.id and player = p_other;
    delete from chat_group_asks where thread = t.id and player = p_other;
    return jsonb_build_object('ok', true, 'added', true, 'to', jsonb_build_array(p_other));
  end if;
  insert into chat_group_asks (thread, asker, player) values (t.id, p_id, p_other)
    on conflict (thread, player) do update set asker = excluded.asker, at = now(), state = 'pending';
  return jsonb_build_object('ok', true, 'asked', true, 'to', jsonb_build_array(p_other));
end $$;
grant execute on function public.chat_group_add(text, text, text, text) to anon, authenticated;

-- Answer an ask: Join or No thanks. { ok, thread (if you joined), to: [the asker] } or { ok: false, reason: gone | full }.
create or replace function public.chat_group_answer(p_id text, p_secret text, p_ask bigint, p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a chat_group_asks%rowtype; t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into a from chat_group_asks where id = p_ask and player = p_id and state = 'pending' and at > now() - interval '24 hours';
  if not found then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  perform pg_advisory_xact_lock(hashtext('chatg:' || a.thread));
  select * into t from chat_threads where id = a.thread;
  if not coalesce(p_yes, false) or chat_blocked(p_id, a.asker) then
    update chat_group_asks set state = 'no' where id = a.id;
    return jsonb_build_object('ok', true, 'to', jsonb_build_array(a.asker));
  end if;
  if (select count(*) from chat_members where thread = a.thread) >= 40 then
    update chat_group_asks set state = 'no' where id = a.id;
    return jsonb_build_object('ok', false, 'reason', 'full', 'to', jsonb_build_array(a.asker));
  end if;
  insert into chat_members (thread, player, last_read) values (a.thread, p_id, t.last_id) on conflict do nothing;
  delete from chat_group_bans where thread = a.thread and player = p_id;
  update chat_group_asks set state = 'yes' where id = a.id;
  return jsonb_build_object('ok', true, 'thread', a.thread, 'to', jsonb_build_array(a.asker));
end $$;
grant execute on function public.chat_group_answer(text, text, bigint, boolean) to anon, authenticated;

-- The creator removes a member: they are out, and the group's link will not let them back in. { ok, to: [them] }.
create or replace function public.chat_group_remove(p_id text, p_secret text, p_thread text, p_other text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  t := chat_my_group(p_id, p_thread);
  if t.id is null or t.creator is distinct from p_id then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  if p_other is null or p_other = p_id then return jsonb_build_object('ok', false, 'reason', 'cant'); end if;
  delete from chat_members where thread = t.id and player = p_other;
  if not found then return jsonb_build_object('ok', false, 'reason', 'cant'); end if;
  insert into chat_group_bans (thread, player) values (t.id, p_other) on conflict do nothing;
  delete from chat_group_asks where thread = t.id and player = p_other;
  return jsonb_build_object('ok', true, 'to', jsonb_build_array(p_other));
end $$;
grant execute on function public.chat_group_remove(text, text, text, text) to anon, authenticated;

-- The creator renames the group: the same word filter as a new group. { ok, name }.
create or replace function public.chat_group_rename(p_id text, p_secret text, p_thread text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; nm text := left(trim(coalesce(p_name, '')), 40);
begin
  perform chat_me(p_id, p_secret);
  t := chat_my_group(p_id, p_thread);
  if t.id is null or t.creator is distinct from p_id then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  begin nm := public.clean_chat_body(nm); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  if char_length(nm) < 3 or nm ~ '\*\*\*' then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  update chat_threads set name = nm where id = t.id;
  return jsonb_build_object('ok', true, 'name', nm);
end $$;
grant execute on function public.chat_group_rename(text, text, text, text) to anon, authenticated;

-- The invite link's code (WhatsApp): a member asks for it; counts as an invite sent. { ok, code }.
create or replace function public.chat_group_invite(p_id text, p_secret text, p_thread text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; c text;
begin
  perform chat_me(p_id, p_secret);
  t := chat_my_group(p_id, p_thread);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if (select count(*) from chat_events where player = p_id and kind = 'invite' and at > now() - interval '1 day') >= 40 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  c := t.code;
  if c is null then c := substr(md5(t.id || random()::text), 1, 8); update chat_threads set code = c where id = t.id; end if;
  insert into chat_events (player, kind) values (p_id, 'invite');
  return jsonb_build_object('ok', true, 'code', c);
end $$;
grant execute on function public.chat_group_invite(text, text, text) to anon, authenticated;

-- Join by the code in an invite link. { ok, thread } or { ok: false, reason: unknown | full | blocked }.
create or replace function public.chat_group_join(p_id text, p_secret text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_threads where code = lower(left(coalesce(p_code, ''), 16)) and kind = 'group';
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  perform pg_advisory_xact_lock(hashtext('chatg:' || t.id));
  if exists (select 1 from chat_members where thread = t.id and player = p_id) then return jsonb_build_object('ok', true, 'thread', t.id); end if;
  if t.creator is not null and chat_blocked(p_id, t.creator) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
  -- (the creator took them out: the link is no way back in)
  if exists (select 1 from chat_group_bans where thread = t.id and player = p_id) then return jsonb_build_object('ok', false, 'reason', 'removed'); end if;
  if (select count(*) from chat_members where thread = t.id) >= 40 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  insert into chat_members (thread, player, last_read) values (t.id, p_id, t.last_id);
  delete from chat_group_asks where thread = t.id and player = p_id; -- (they tapped the link themselves: that is agreeing)
  return jsonb_build_object('ok', true, 'thread', t.id);
end $$;
grant execute on function public.chat_group_join(text, text, text) to anon, authenticated;

-- Leave a group. The creator leaving hands it to whoever joined first; the last one out closes it.
create or replace function public.chat_group_leave(p_id text, p_secret text, p_thread text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  t := chat_my_group(p_id, p_thread);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  delete from chat_members where thread = t.id and player = p_id;
  if not exists (select 1 from chat_members where thread = t.id) then delete from chat_threads where id = t.id;
  elsif t.creator = p_id then update chat_threads set creator = (select player from chat_members where thread = t.id order by joined_at, player limit 1) where id = t.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_group_leave(text, text, text) to anon, authenticated;

-- Mute (or unmute) a thread you are in: it still fills up, it just never pings or counts on your badge.
create or replace function public.chat_mute(p_id text, p_secret text, p_thread text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  update chat_members set muted = coalesce(p_on, true) where thread = p_thread and player = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_mute(text, text, text, boolean) to anon, authenticated;

-- Who is in a group you are in: { ok, members: [{ id, name, handle, house, look, online, creator }] }.
create or replace function public.chat_group_members(p_id text, p_secret text, p_thread text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; list jsonb;
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_threads where id = p_thread and kind = 'group';
  if not found or not exists (select 1 from chat_members where thread = p_thread and player = p_id) then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'handle', p.handle, 'house', p.house, 'look', p.look, 'creator', p.id = t.creator)
      || case when p.id = p_id or chat_mutual(p_id, p.id) then jsonb_build_object('online', p.seen_at > now() - interval '70 seconds') else '{}'::jsonb end
      order by (p.id = t.creator) desc, m.joined_at), '[]'::jsonb)
    into list from chat_members m join chat_players p on p.id = m.player where m.thread = p_thread and not chat_blocked(p_id, p.id);
  return jsonb_build_object('ok', true, 'members', list);
end $$;
grant execute on function public.chat_group_members(text, text, text) to anon, authenticated;

-- Friends: add or remove someone on your list (yours alone; they are not told here). 200 at most.
create or replace function public.chat_friend(p_id text, p_secret text, p_other text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  if p_other is null or p_other = p_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not coalesce(p_on, true) then delete from chat_friends where player = p_id and friend = p_other; return jsonb_build_object('ok', true); end if;
  if not exists (select 1 from chat_players where id = p_other) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if chat_blocked(p_id, p_other) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
  if (select count(*) from chat_friends where player = p_id) >= 200 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  insert into chat_friends (player, friend) values (p_id, p_other) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_friend(text, text, text, boolean) to anon, authenticated;

-- "{name} just joined": a phone may announce its player once, ever. { ok } the first time, else { ok: false, reason: 'done' }.
create or replace function public.chat_joined(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  update chat_players set joined_said = true where id = p_id and not joined_said;
  if not found then return jsonb_build_object('ok', false, 'reason', 'done'); end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_joined(text, text) to anon, authenticated;

-- =====================================================================================================
-- SOCIAL B (owner, 11 Nov): the Board (posts, stamps, replies, reports), follow, the Feed, interests.
-- Same rules: no table is readable, every function checks the phone's secret. Re-runnable.
--   Limits (server clock, SAST days): 3 posts a day, 140 characters, no links but our own share links;
--   one stamp per player per post; 3 reports hide a post until reviewed; 20 post reports an hour.
-- =====================================================================================================
alter table public.chat_players add column if not exists interests text[] not null default '{}';
alter table public.chat_players add column if not exists followers_seen int not null default 0;

-- author: a player's id, or 'npc:<slug>' for the seeded posts of named people (npc is then the slug, name their name).
create table if not exists public.chat_posts (
  id bigint generated always as identity primary key,
  author text not null,
  name text not null default '',
  npc text unique,
  body text not null check (char_length(body) between 1 and 140),
  district text not null default 'campus',
  at timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists chat_posts_author_idx on public.chat_posts (author, id desc);
create index if not exists chat_posts_at_idx on public.chat_posts (at desc);
alter table public.chat_posts enable row level security;
drop policy if exists "admins read posts" on public.chat_posts;
create policy "admins read posts" on public.chat_posts for select using (public.is_admin());

create table if not exists public.chat_stamps (
  post bigint not null references public.chat_posts (id) on delete cascade,
  player text not null,
  at timestamptz not null default now(),
  primary key (post, player)
);
alter table public.chat_stamps enable row level security;

create table if not exists public.chat_post_reports (
  post bigint not null references public.chat_posts (id) on delete cascade,
  reporter text not null,
  reason text check (char_length(reason) <= 60),
  at timestamptz not null default now(),
  primary key (post, reporter)
);
alter table public.chat_post_reports enable row level security;
drop policy if exists "admins read post reports" on public.chat_post_reports;
create policy "admins read post reports" on public.chat_post_reports for select using (public.is_admin());

create table if not exists public.chat_follows (
  follower text not null,
  followed text not null,
  at timestamptz not null default now(),
  primary key (follower, followed)
);
create index if not exists chat_follows_followed_idx on public.chat_follows (followed);
alter table public.chat_follows enable row level security;

-- The 12 interests' standing groups ('i:<id>'): data/campusville/interests.json (npm run check fails if they disagree).
-- INTERESTS START
insert into public.chat_threads (id, kind, name, topic) values
  ('i:football', 'group', '⚽ Football', 'Scores, boots, who is actually coming to play on the Quad.'),
  ('i:music', 'group', '🎵 Music', 'Playlists, open mic, what the lounge is playing tonight.'),
  ('i:fashion', 'group', '👗 Fashion', 'Fits, laundry days, and whether the mall window is worth it.'),
  ('i:gym', 'group', '💪 Gym', 'Sets, rest days, and who skipped leg day with a straight face.'),
  ('i:faith', 'group', '🙏 Faith', 'Quiet pews, choir practice, and being kind on a hard week.'),
  ('i:gaming', 'group', '🎮 Gaming', 'Arcade scores, Noah''s broken laptop, and whose turn it is.'),
  ('i:food', 'group', '🍲 Food', 'Caf trays, kota debates, and who still owes a vetkoek.'),
  ('i:studying', 'group', '📚 Studying', 'Tests, group tables, and the library chair that is legally yours.'),
  ('i:cars', 'group', '🚗 Cars', 'Licences, first cars, and which taxi actually stops.'),
  ('i:art', 'group', '🎨 Art', 'Quad poems, Aya''s fabric, and the gallery student wall.'),
  ('i:money', 'group', '💰 Money', 'Gigs, Woza splits, and how far R2,100 really goes.'),
  ('i:movies', 'group', '🎬 Movies', 'Mall cinema, lecture slides that feel like a film, spoilers banned.')
on conflict (id) do update set name = excluded.name, topic = excluded.topic;
-- INTERESTS END

-- The 20 board posts of named people, so the Feed is never empty: data/campusville/npc_posts.json.
-- NPC POSTS START
insert into public.chat_posts (author, name, npc, body) values
  ('npc:mama_liz', 'Mama Liz', 'mama_liz', 'If you skipped breakfast I know. Come. The gravy is still here and so am I.'),
  ('npc:kyle', 'Kyle', 'kyle', 'New mix on the kiosk speaker. Hate it and I change it after this song. Maybe.'),
  ('npc:david_okafor', 'David Okafor', 'david_okafor', 'Jollof at Mzansi House. I will be kind about the rice. For ten minutes. Then we talk.'),
  ('npc:grace_wanjiru', 'Grace Wanjiru', 'grace_wanjiru', 'Study group, campus library, six. Late and I start. Bring a charger, not a speech.'),
  ('npc:tendai_moyo', 'Tendai Moyo', 'tendai_moyo', 'Open mic list is full. I wrote your name anyway. Do not make me look foolish.'),
  ('npc:lerato', 'Lerato', 'lerato', 'Headphones on. If you need the charger, ask. If you need a lecture, keep walking.'),
  ('npc:aunty_premi', 'Aunty Premi', 'aunty_premi', 'Biryani is not a suggestion today. Sit first. Then we discuss that test you are avoiding.'),
  ('npc:uncle_jaco', 'Uncle Jaco', 'uncle_jaco', 'Grill is honest. Your match opinions can wait until the roll has landed.'),
  ('npc:mam_gugu', 'Mam'' Gugu', 'mam_gugu', 'Hello my child. Looking is free. Vetkoek is ten rand. Eating is the wise one.'),
  ('npc:lethabo', 'Lethabo', 'lethabo', 'Wrote a line about the rank and the lights stayed on. Open mic. I will not beg.'),
  ('npc:naledi', 'Naledi', 'naledi', 'The terrace seat is still mine. Bring an argument or bring rooibos. Both preferred.'),
  ('npc:noah', 'Noah', 'noah', 'Laptop has three working keys. The board post has more. Come fix yours, not mine.'),
  ('npc:aya', 'Aya', 'aya', 'Outfit today is a seven. Fixable. Fitting Thursday if you want an eight.'),
  ('npc:luke', 'Luke', 'luke', 'Pap and a gym. That is the whole personality. Third plate is a love language.'),
  ('npc:priya', 'Priya', 'priya', 'Twenty-seven bones in the hand. I counted again. Study angel, I still need you.'),
  ('npc:amir', 'Amir', 'amir', 'Res kettle only sparks a little now. I work for vetkoek. Headphones welcome.'),
  ('npc:jordan', 'Jordan', 'jordan', 'Audition: Romeo in a taxi. Experimental. Front row, clap like you mean the fare.'),
  ('npc:kayla', 'Kayla', 'kayla', 'If your budget has feelings, sit down. I have a spreadsheet and a kind face.'),
  ('npc:chloe', 'Chloe', 'chloe', 'Did you sleep. That was not a question. Study group still has a chair with your name.'),
  ('npc:ethan', 'Ethan', 'ethan', 'Phone on 12%. If you have a charger you are my favourite person until supper.')
on conflict (npc) do update set body = excluded.body, name = excluded.name;
-- NPC POSTS END

-- A post as p_id sees it: { id, author, name, handle, house, look, npc, body, at, stamps, mine, replies }.
create or replace function public.chat_post_json(p_id text, p public.chat_posts) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'author', p.author, 'npc', p.npc is not null,
    'name', case when p.npc is not null then p.name else coalesce(pl.name, 'Student') end,
    'handle', coalesce(pl.handle, ''), 'house', coalesce(pl.house, ''), 'look', coalesce(pl.look, '{}'::jsonb),
    'body', p.body, 'at', p.at,
    'stamps', (select count(*) from chat_stamps s where s.post = p.id),
    'mine', exists (select 1 from chat_stamps s where s.post = p.id and s.player = p_id),
    'replies', (select count(*) from chat_lines l where l.thread = 'p:' || p.id))
  from (select 1) one left join chat_players pl on pl.id = p.author
$$;
revoke all on function public.chat_post_json(text, public.chat_posts) from public;

-- Post on your Board. { ok, post } or { ok: false, reason: empty | long | link | word | today }.
create or replace function public.chat_post(p_id text, p_secret text, p_body text, p_district text default 'campus')
returns jsonb language plpgsql security definer set search_path = public as $$
declare body text := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')); p chat_posts%rowtype;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chat:' || p_id));
  if body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(body) > 140 then return jsonb_build_object('ok', false, 'reason', 'long'); end if;
  -- (no links, except the game's own share links)
  if regexp_replace(body, 'https://softlifeza\.vercel\.app[^\s]*', '', 'gi') ~* '(https?://|www\.|\.com\M|\.co\.za\M|wa\.me)' then
    return jsonb_build_object('ok', false, 'reason', 'link');
  end if;
  begin body := public.clean_chat_body(body); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  if body is null or body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if (select count(*) from chat_posts where author = p_id
      and (at at time zone 'Africa/Johannesburg')::date = (now() at time zone 'Africa/Johannesburg')::date) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'today');
  end if;
  insert into chat_posts (author, body, district) values (p_id, left(body, 140), left(coalesce(nullif(p_district, ''), 'campus'), 30)) returning * into p;
  return jsonb_build_object('ok', true, 'post', chat_post_json(p_id, p));
end $$;
grant execute on function public.chat_post(text, text, text, text) to anon, authenticated;

-- How many follow this player.
create or replace function public.chat_follower_count(p_who text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from chat_follows where followed = p_who
$$;
revoke all on function public.chat_follower_count(text) from public;

-- Someone's Board: { ok, who, posts, followers, following }. A block either way shows nothing.
create or replace function public.chat_board(p_id text, p_secret text, p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare list jsonb; who jsonb;
begin
  perform chat_me(p_id, p_secret);
  if p_who is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if chat_blocked(p_id, p_who) then return jsonb_build_object('ok', true, 'posts', '[]'::jsonb, 'followers', 0, 'following', false, 'blocked', true); end if;
  select coalesce(jsonb_agg(chat_post_json(p_id, p) order by p.id desc), '[]'::jsonb) into list
    from (select * from chat_posts where author = p_who and (not hidden or author = p_id) order by id desc limit 30) p;
  select jsonb_build_object('id', pl.id, 'name', pl.name, 'handle', pl.handle, 'house', pl.house, 'look', pl.look) into who from chat_players pl where pl.id = p_who;
  return jsonb_build_object('ok', true, 'who', who, 'posts', list, 'followers', chat_follower_count(p_who),
    'following', exists (select 1 from chat_follows where follower = p_id and followed = p_who));
end $$;
grant execute on function public.chat_board(text, text, text) to anon, authenticated;

-- A stamp (one per player per post), on or off. { ok, stamps }.
create or replace function public.chat_stamp(p_id text, p_secret text, p_post bigint, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p chat_posts%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into p from chat_posts where id = p_post and not hidden;
  if not found or chat_blocked(p_id, p.author) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if coalesce(p_on, true) then insert into chat_stamps (post, player) values (p_post, p_id) on conflict do nothing;
  else delete from chat_stamps where post = p_post and player = p_id; end if;
  return jsonb_build_object('ok', true, 'stamps', (select count(*) from chat_stamps where post = p_post));
end $$;
grant execute on function public.chat_stamp(text, text, bigint, boolean) to anon, authenticated;

-- Report a post: once per player per post; the third report hides it until someone has looked (hidden = false again).
create or replace function public.chat_post_report(p_id text, p_secret text, p_post bigint, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare p chat_posts%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into p from chat_posts where id = p_post;
  if not found or p.author = p_id then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if (select count(*) from chat_post_reports where reporter = p_id and at > now() - interval '1 hour') >= 20 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  insert into chat_post_reports (post, reporter, reason) values (p_post, p_id, left(coalesce(p_reason, ''), 60)) on conflict do nothing;
  if p.npc is null and (select count(*) from chat_post_reports where post = p_post) >= 3 then update chat_posts set hidden = true where id = p_post; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_post_report(text, text, bigint, text) to anon, authenticated;

-- The replies to a post: a chat thread hanging off it ('p:<post id>'); opening it makes you a member. { ok, thread }.
create or replace function public.chat_post_thread(p_id text, p_secret text, p_post bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p chat_posts%rowtype; tid text;
begin
  perform chat_me(p_id, p_secret);
  select * into p from chat_posts where id = p_post and not hidden;
  if not found or chat_blocked(p_id, p.author) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  tid := 'p:' || p.id;
  insert into chat_threads (id, kind, name, topic) values (tid, 'group', 'Replies', left(p.body, 120)) on conflict (id) do nothing;
  insert into chat_members (thread, player) values (tid, p_id) on conflict do nothing;
  return jsonb_build_object('ok', true, 'thread', tid);
end $$;
grant execute on function public.chat_post_thread(text, text, bigint) to anon, authenticated;

-- Follow or unfollow a player. { ok, followers: theirs now }.
create or replace function public.chat_follow(p_id text, p_secret text, p_other text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  if p_other is null or p_other = p_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not coalesce(p_on, true) then delete from chat_follows where follower = p_id and followed = p_other;
  else
    if not exists (select 1 from chat_players where id = p_other) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
    if chat_blocked(p_id, p_other) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
    insert into chat_follows (follower, followed) values (p_id, p_other) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'followers', chat_follower_count(p_other));
end $$;
grant execute on function public.chat_follow(text, text, text, boolean) to anon, authenticated;

-- Follower counts for the players on screen (cards, leaderboard rows by @handle, race results): { ids: {}, handles: {} }.
create or replace function public.chat_followers(p_id text, p_secret text, p_ids text[] default '{}', p_handles text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; b jsonb;
begin
  perform chat_me(p_id, p_secret);
  select coalesce(jsonb_object_agg(x, chat_follower_count(x)), '{}'::jsonb) into a from unnest((coalesce(p_ids, '{}'::text[]))[1:60]) x;
  select coalesce(jsonb_object_agg(pl.handle, chat_follower_count(pl.id)), '{}'::jsonb) into b
    from chat_players pl where pl.handle <> '' and pl.handle = any ((coalesce(p_handles, '{}'::text[]))[1:60]);
  return jsonb_build_object('ok', true, 'ids', a, 'handles', b);
end $$;
grant execute on function public.chat_followers(text, text, text[], text[]) to anon, authenticated;

-- "+N followers while you were away": how many more than the last time you looked; looking resets it. { ok, new, followers }.
create or replace function public.chat_followers_seen(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; was int;
begin
  perform chat_me(p_id, p_secret);
  n := chat_follower_count(p_id);
  select followers_seen into was from chat_players where id = p_id;
  update chat_players set followers_seen = n where id = p_id;
  return jsonb_build_object('ok', true, 'new', greatest(n - coalesce(was, 0), 0), 'followers', n);
end $$;
grant execute on function public.chat_followers_seen(text, text) to anon, authenticated;

-- The Feed: posts from the people you follow, then the day's hot posts in your district, and the named people's
-- posts to fill it. { ok, following: [...], hot: [...], npc: [...] }.
create or replace function public.chat_feed(p_id text, p_secret text, p_district text default 'campus')
returns jsonb language plpgsql security definer set search_path = public as $$
declare f jsonb; h jsonb; n jsonb;
begin
  perform chat_me(p_id, p_secret);
  select coalesce(jsonb_agg(chat_post_json(p_id, p) order by p.id desc), '[]'::jsonb) into f from chat_posts p where p.id in (
    select po.id from chat_posts po join chat_follows fo on fo.followed = po.author and fo.follower = p_id
    where not po.hidden and not chat_blocked(p_id, po.author) order by po.id desc limit 30);
  select coalesce(jsonb_agg(chat_post_json(p_id, p) order by x.n desc, p.id desc), '[]'::jsonb) into h from (
    select po.id, (select count(*) from chat_stamps s where s.post = po.id) as n from chat_posts po
    where po.npc is null and not po.hidden and po.at > now() - interval '1 day' and po.district = coalesce(nullif(p_district, ''), 'campus')
      and po.author <> p_id and not chat_blocked(p_id, po.author)
    order by n desc, po.id desc limit 10) x join chat_posts p on p.id = x.id;
  select coalesce(jsonb_agg(chat_post_json(p_id, p) order by p.id), '[]'::jsonb) into n from chat_posts p where p.npc is not null;
  return jsonb_build_object('ok', true, 'following', f, 'hot', h, 'npc', n);
end $$;
grant execute on function public.chat_feed(text, text, text) to anon, authenticated;

-- Your three interests (ids of the standing groups above): you are put in their groups and taken out of the
-- ones you dropped. { ok, interests }.
create or replace function public.chat_interests(p_id text, p_secret text, p_list text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare picks text[];
begin
  perform chat_me(p_id, p_secret);
  select coalesce(array_agg(x order by ord), '{}') into picks from (
    select x, min(ord) as ord from unnest(coalesce(p_list, '{}')) with ordinality as u(x, ord)
    where exists (select 1 from chat_threads t where t.id = 'i:' || x) group by x order by min(ord) limit 3) q;
  update chat_players set interests = picks where id = p_id;
  delete from chat_members where player = p_id and thread like 'i:%' and thread <> all (select 'i:' || unnest(picks));
  insert into chat_members (thread, player, last_read) select t.id, p_id, t.last_id from chat_threads t where t.id = any (select 'i:' || unnest(picks)) on conflict do nothing;
  return jsonb_build_object('ok', true, 'interests', to_jsonb(picks));
end $$;
grant execute on function public.chat_interests(text, text, text[]) to anon, authenticated;

-- The Daily's live part: who joined today (SAST). { ok, joined, names: [up to 3 first names] }.
create or replace function public.chat_daily(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; names jsonb;
begin
  perform chat_me(p_id, p_secret);
  select count(*) into n from chat_players where (created_at at time zone 'Africa/Johannesburg')::date = (now() at time zone 'Africa/Johannesburg')::date;
  select coalesce(jsonb_agg(split_part(x.name, ' ', 1)), '[]'::jsonb) into names from (
    select name from chat_players where (created_at at time zone 'Africa/Johannesburg')::date = (now() at time zone 'Africa/Johannesburg')::date
      and id <> p_id and not chat_blocked(p_id, id) order by created_at desc limit 3) x;
  return jsonb_build_object('ok', true, 'joined', n, 'names', names);
end $$;
grant execute on function public.chat_daily(text, text) to anon, authenticated;

-- =====================================================================================================
-- LOOPS (owner, 11 Nov): "invite a friend". The link carries the inviter's code; when the friend finishes the
-- quick start their phone claims it, once per friend, checked here: the friend's account must be new (made in
-- the last day), not the inviter, and never claimed before. An inviter is rewarded for 10 friends a day at most.
-- The reward itself (game rand) is added by each phone: the friend's when the claim says ok, the inviter's when
-- chat_sync lists the friend under refs.
-- =====================================================================================================
-- Your invite code (made the first time). { ok, code }.
create or replace function public.chat_ref_code(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c text;
begin
  perform chat_me(p_id, p_secret);
  select ref_code into c from chat_players where id = p_id;
  if c is null then
    c := substr(md5(p_id || random()::text || clock_timestamp()::text), 1, 8);
    update chat_players set ref_code = c where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'code', c);
end $$;
grant execute on function public.chat_ref_code(text, text) to anon, authenticated;

-- A new player claims the code they came in with. { ok, inviter: name } or { ok: false, reason: unknown | self | old | done | limit }.
create or replace function public.chat_ref_claim(p_id text, p_secret text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv chat_players%rowtype;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chatref:' || p_id));
  select * into inv from chat_players where ref_code = lower(left(coalesce(p_code, ''), 16));
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if inv.id = p_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if exists (select 1 from chat_refs where friend = p_id) then return jsonb_build_object('ok', false, 'reason', 'done'); end if;
  if (select created_at from chat_players where id = p_id) < now() - interval '1 day' then return jsonb_build_object('ok', false, 'reason', 'old'); end if;
  if (select count(*) from chat_refs where inviter = inv.id and at > now() - interval '1 day') >= 10 then return jsonb_build_object('ok', false, 'reason', 'limit'); end if;
  insert into chat_refs (friend, inviter) values (p_id, inv.id);
  return jsonb_build_object('ok', true, 'inviter', inv.name);
end $$;
grant execute on function public.chat_ref_claim(text, text, text) to anon, authenticated;

-- =====================================================================================================
-- SOCIAL C (owner, 11 Nov): find me, and suggested groups. Run the whole file again (it is re-runnable).
--   Find me: a player can let friends both ways see where they stand IN THE GAME (never a real place), for one
--   day (SAST) at a time. Off unless they said yes today. Who sees it is decided here: chat_sync gives a friend's
--   spot only to friends both ways, only while that friend is online, and never past a block.
--   Open groups: a group's creator can make it Open, with one of the 12 interests as its tag. A player whose
--   interests match gets at most one suggestion a day; "Not now" keeps that group away for 7 days; a group with
--   anyone the player has blocked (or who blocked them) is never suggested. Three reports of a group's name or
--   topic take it out of suggestions until an admin looks (reports_hidden back to false).
-- (the columns are added near the top of this file's Social A block; chat_thread_json and chat_sync above use them)
-- =====================================================================================================
create table if not exists public.chat_group_snoozes (
  thread text not null references public.chat_threads (id) on delete cascade,
  player text not null,
  until timestamptz not null,
  primary key (thread, player)
);
alter table public.chat_group_snoozes enable row level security;
create table if not exists public.chat_group_reports (
  thread text not null references public.chat_threads (id) on delete cascade,
  reporter text not null,
  reason text not null default '',
  name text not null default '',
  topic text not null default '',
  at timestamptz not null default now(),
  primary key (thread, reporter)
);
alter table public.chat_group_reports enable row level security;

-- "Let friends find you today?" Yes (p_on true) lasts until the end of today (SAST); No, or turning it off in the
-- menu, clears your spot at once. { ok, on }.
create or replace function public.chat_find(p_id text, p_secret text, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  update chat_players set find_day = case when coalesce(p_on, true) then (now() at time zone 'Africa/Johannesburg')::date end,
    spot = case when coalesce(p_on, true) then spot end, spot_at = case when coalesce(p_on, true) then spot_at end where id = p_id;
  return jsonb_build_object('ok', true, 'on', coalesce(p_on, true));
end $$;
grant execute on function public.chat_find(text, text, boolean) to anon, authenticated;

-- Where you stand in the game: a district (campus, gate, town, suburbs, beachfront, township, industrial), metres east
-- and south of the campus's middle, and the place you are inside if any. Kept only while you share today.
-- { ok, on }: on false = you are not sharing (nothing was kept).
create or replace function public.chat_spot(p_id text, p_secret text, p_part text, p_x numeric, p_z numeric, p_in text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare sharing boolean;
begin
  perform chat_me(p_id, p_secret);
  select find_day = (now() at time zone 'Africa/Johannesburg')::date into sharing from chat_players where id = p_id;
  if not coalesce(sharing, false) then
    update chat_players set spot = null, spot_at = null where id = p_id and spot is not null;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  -- ('gate': SunnyBay's Campus district, outside the campus fence)
  if p_part is null or p_part not in ('campus', 'gate', 'town', 'suburbs', 'beachfront', 'township', 'industrial')
    or p_x is null or p_z is null or abs(p_x) > 2000 or abs(p_z) > 2000 then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  update chat_players set spot = jsonb_build_object('part', p_part, 'x', round(p_x, 1), 'z', round(p_z, 1), 'in', left(regexp_replace(coalesce(p_in, ''), '[^a-z0-9_]', '', 'g'), 40)),
    spot_at = now(), seen_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'on', true);
end $$;
grant execute on function public.chat_spot(text, text, text, numeric, numeric, text) to anon, authenticated;

-- Open or Private. Only the group's creator; Open needs one of the 12 interests as its tag. { ok, listed, tag }.
--   { ok: false, reason }: not_yours | tag (no such interest)
create or replace function public.chat_group_open(p_id text, p_secret text, p_thread text, p_on boolean, p_tag text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; tg text := lower(left(coalesce(p_tag, ''), 20));
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_my_group(p_id, p_thread);
  if t.id is null or t.creator is distinct from p_id then return jsonb_build_object('ok', false, 'reason', 'not_yours'); end if;
  if coalesce(p_on, false) then
    if not exists (select 1 from chat_threads i where i.id = 'i:' || tg) then return jsonb_build_object('ok', false, 'reason', 'tag'); end if;
    update chat_threads set listed = true, tag = tg where id = t.id;
    return jsonb_build_object('ok', true, 'listed', true, 'tag', tg);
  end if;
  update chat_threads set listed = false where id = t.id;
  return jsonb_build_object('ok', true, 'listed', false, 'tag', t.tag);
end $$;
grant execute on function public.chat_group_open(text, text, text, boolean, text) to anon, authenticated;

-- Can this open group be offered to (or joined by) this player right now?
create or replace function public.chat_group_fits(p_id text, t public.chat_threads) returns boolean
language sql stable security definer set search_path = public as $$
  select t.kind = 'group' and t.listed and not t.reports_hidden and t.tag is not null and t.id like 'g:%'
    and not exists (select 1 from chat_members m where m.thread = t.id and m.player = p_id)
    and not exists (select 1 from chat_group_bans b where b.thread = t.id and b.player = p_id)
    and (select count(*) from chat_members m where m.thread = t.id) between 1 and 39
    -- (never a group with someone you blocked, or who blocked you)
    and not exists (select 1 from chat_members m where m.thread = t.id and chat_blocked(p_id, m.player))
$$;
revoke all on function public.chat_group_fits(text, public.chat_threads) from public;

-- One suggestion a day at most: an open group whose tag is one of your interests. { ok, group: null } when there
-- is none for you (or you have had today's); else { ok, group: { thread, name, members, tag, interest } }.
create or replace function public.chat_group_suggest(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me chat_players%rowtype; t chat_threads%rowtype; today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  perform chat_me(p_id, p_secret);
  select * into me from chat_players where id = p_id;
  if me.suggest_day = today then return jsonb_build_object('ok', true, 'group', null); end if;
  select g.* into t from chat_threads g
    where g.listed and g.tag = any (me.interests) and chat_group_fits(p_id, g)
      and not exists (select 1 from chat_group_snoozes s where s.thread = g.id and s.player = p_id and s.until > now())
    order by g.last_at desc nulls last, g.created_at desc limit 1;
  if not found then return jsonb_build_object('ok', true, 'group', null); end if;
  update chat_players set suggest_day = today where id = p_id;
  return jsonb_build_object('ok', true, 'group', jsonb_build_object('thread', t.id, 'name', t.name, 'tag', t.tag,
    'members', (select count(*) from chat_members m where m.thread = t.id),
    'interest', coalesce((select regexp_replace(i.name, '^[^A-Za-z]+', '') from chat_threads i where i.id = 'i:' || t.tag), t.tag)));
end $$;
grant execute on function public.chat_group_suggest(text, text) to anon, authenticated;

-- Join (you are in, with nothing unread) or Not now (that group is not suggested to you again for 7 days).
--   { ok, thread } | { ok, snoozed: true } | { ok: false, reason: 'gone' } (no longer open, full, or not for you)
create or replace function public.chat_group_suggest_answer(p_id text, p_secret text, p_thread text, p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_threads where id = p_thread;
  if not found then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  if not coalesce(p_yes, false) then
    insert into chat_group_snoozes (thread, player, until) values (t.id, p_id, now() + interval '7 days')
      on conflict (thread, player) do update set until = excluded.until;
    return jsonb_build_object('ok', true, 'snoozed', true);
  end if;
  perform pg_advisory_xact_lock(hashtext('chatg:' || t.id));
  if exists (select 1 from chat_members where thread = t.id and player = p_id) then return jsonb_build_object('ok', true, 'thread', t.id); end if;
  if not chat_group_fits(p_id, t) then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  insert into chat_members (thread, player, last_read) values (t.id, p_id, t.last_id);
  delete from chat_group_asks where thread = t.id and player = p_id;
  return jsonb_build_object('ok', true, 'thread', t.id);
end $$;
grant execute on function public.chat_group_suggest_answer(text, text, text, boolean) to anon, authenticated;

-- Report a group's name or topic (a member, or someone it was suggested to). Once per player per group, 20 an
-- hour; the third report takes the group out of suggestions until an admin sets reports_hidden back to false.
-- A copy of the name and topic as they were is kept with the report.
create or replace function public.chat_group_report(p_id text, p_secret text, p_thread text, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_threads where id = p_thread and kind = 'group' and id like 'g:%';
  if not found or t.creator = p_id then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if not t.listed and not exists (select 1 from chat_members where thread = t.id and player = p_id) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if (select count(*) from chat_group_reports where reporter = p_id and at > now() - interval '1 hour') >= 20 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  insert into chat_group_reports (thread, reporter, reason, name, topic) values (t.id, p_id, left(coalesce(p_reason, ''), 60), t.name, t.topic) on conflict do nothing;
  if (select count(*) from chat_group_reports where thread = t.id) >= 3 then update chat_threads set reports_hidden = true where id = t.id; end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_group_report(text, text, text, text) to anon, authenticated;

-- =====================================================================================================
-- NOTIFICATIONS (owner, 11 Nov): web push for messages, and the local welcome. Re-runnable.
-- The phone keeps its push subscription here (chat_push_sub) and its choices (chat_push_prefs). The pushes are
-- SENT by the game's own server function (api/push.js on Vercel), which calls chat_push_due with the service
-- role after a phone has sent a line; only the service role may call chat_push_due, chat_push_gone and
-- chat_push_digest (the subscriptions are never handed to a phone).
-- Rules, all decided here:
--   never from a blocked player (either way); never for a muted thread, The Quad or a post's replies; never to a
--   player who is in the game (seen in the last 60 s); at most one push per thread per player per 10 minutes
--   (lines in between fold into the next one: a group's says how many are unread); quiet hours 23:00 to 07:00
--   SAST unless the player turned them off; "hide message text" sends no words from the message.
-- The local welcome: a new player who picked a town (chat_joined's p_area) is told to the online players from the
-- same town (chat_sync's `welcome`, at most one per player per 10 minutes, never past a block), and those who
-- are not in the game get one summary push a day (chat_push_digest) if they have notifications and "new
-- students from my area" on.
-- =====================================================================================================
alter table public.chat_players add column if not exists town text not null default '';
alter table public.chat_players add column if not exists push_quiet boolean not null default true;
alter table public.chat_players add column if not exists push_hide boolean not null default false;
alter table public.chat_players add column if not exists push_area boolean not null default true;
alter table public.chat_players add column if not exists welcome_at timestamptz;
alter table public.chat_players add column if not exists welcome_seen bigint not null default 0;
alter table public.chat_players add column if not exists digest_day date;
alter table public.chat_members add column if not exists pushed_at timestamptz;

create table if not exists public.chat_push_subs (
  endpoint text primary key,
  player text not null,
  p256dh text not null,
  auth text not null,
  at timestamptz not null default now()
);
create index if not exists chat_push_subs_player_idx on public.chat_push_subs (player);
alter table public.chat_push_subs enable row level security;

create table if not exists public.chat_welcomes (
  id bigint generated always as identity primary key,
  player text not null,
  name text not null,
  area text not null,
  look jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists chat_welcomes_area_idx on public.chat_welcomes (area, at desc);
alter table public.chat_welcomes enable row level security;

-- Keep (p_on) or drop this phone's push subscription. At most 5 phones a player (the oldest goes).
--   { ok, on } | { ok: false, reason: 'bad' }
create or replace function public.chat_push_sub(p_id text, p_secret text, p_endpoint text, p_p256dh text default null, p_auth text default null, p_on boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform chat_me(p_id, p_secret);
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 800 then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if not coalesce(p_on, true) then
    delete from chat_push_subs where endpoint = p_endpoint and player = p_id;
    return jsonb_build_object('ok', true, 'on', false);
  end if;
  if p_p256dh is null or p_auth is null or length(p_p256dh) > 200 or length(p_auth) > 100 then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  insert into chat_push_subs (endpoint, player, p256dh, auth) values (p_endpoint, p_id, p_p256dh, p_auth)
    on conflict (endpoint) do update set player = excluded.player, p256dh = excluded.p256dh, auth = excluded.auth, at = now();
  delete from chat_push_subs where player = p_id and endpoint in (select endpoint from chat_push_subs where player = p_id order by at desc offset 5);
  return jsonb_build_object('ok', true, 'on', true);
end $$;
grant execute on function public.chat_push_sub(text, text, text, text, text, boolean) to anon, authenticated;

-- The player's choices (a null leaves one as it is). { ok, quiet, hide, area, phones }
create or replace function public.chat_push_prefs(p_id text, p_secret text, p_quiet boolean default null, p_hide boolean default null, p_area boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me chat_players%rowtype;
begin
  perform chat_me(p_id, p_secret);
  update chat_players set push_quiet = coalesce(p_quiet, push_quiet), push_hide = coalesce(p_hide, push_hide), push_area = coalesce(p_area, push_area)
    where id = p_id returning * into me;
  return jsonb_build_object('ok', true, 'quiet', me.push_quiet, 'hide', me.push_hide, 'area', me.push_area,
    'phones', (select count(*) from chat_push_subs where player = p_id));
end $$;
grant execute on function public.chat_push_prefs(text, text, boolean, boolean, boolean) to anon, authenticated;

-- Is it quiet hours (23:00 to 07:00 SAST) right now?
create or replace function public.chat_quiet_now() returns boolean language sql stable as $$
  select extract(hour from (now() at time zone 'Africa/Johannesburg')) >= 23 or extract(hour from (now() at time zone 'Africa/Johannesburg')) < 7
$$;

-- After p_id sent a line to p_thread: who gets a push now, and what it says. Service role only (api/push.js).
-- The sender proves who they are with their secret, and their latest line in the thread must be under 2 minutes
-- old. Marks each one pushed (the 10-minute window). Returns { ok, pushes: [{ endpoint, p256dh, auth, player,
-- kind: 'dm' | 'group', thread, from, group, first, unread, hide }] }.
create or replace function public.chat_push_due(p_id text, p_secret text, p_thread text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype; line chat_lines%rowtype; who text; out jsonb;
begin
  perform chat_me(p_id, p_secret);
  select * into t from chat_threads where id = p_thread;
  if not found or chat_is_quad(t.id) or t.id like 'p:%' then return jsonb_build_object('ok', true, 'pushes', '[]'::jsonb); end if;
  select * into line from chat_lines where thread = p_thread and sender = p_id order by id desc limit 1;
  if not found or line.at < now() - interval '2 minutes' then return jsonb_build_object('ok', true, 'pushes', '[]'::jsonb); end if;
  select name into who from chat_players where id = p_id;
  with due as (
    select m.player, m.last_read from chat_members m join chat_players pl on pl.id = m.player
    where m.thread = t.id and m.player <> p_id and not m.muted
      and not chat_blocked(p_id, m.player)
      and pl.seen_at < now() - interval '60 seconds'
      and (m.pushed_at is null or m.pushed_at < now() - interval '10 minutes')
      and not (pl.push_quiet and chat_quiet_now())
      and m.last_read < line.id
      and exists (select 1 from chat_push_subs s where s.player = m.player)
  ), marked as (
    update chat_members m set pushed_at = now() from due where m.thread = t.id and m.player = due.player returning m.player, due.last_read
  )
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'player', mk.player,
      'kind', t.kind, 'thread', t.id, 'from', coalesce(who, 'Student'), 'group', t.name, 'first', line.body, 'hide', pl.push_hide,
      'unread', (select count(*) from chat_lines l where l.thread = t.id and l.id > mk.last_read and l.sender <> mk.player and not chat_blocked(mk.player, l.sender)))), '[]'::jsonb)
    into out from marked mk join chat_push_subs s on s.player = mk.player join chat_players pl on pl.id = mk.player;
  return jsonb_build_object('ok', true, 'pushes', out);
end $$;
revoke all on function public.chat_push_due(text, text, text) from public, anon, authenticated;

-- A push service said this subscription is gone (404 or 410): forget it. Service role only.
create or replace function public.chat_push_gone(p_endpoint text) returns void
language sql security definer set search_path = public as $$ delete from chat_push_subs where endpoint = p_endpoint $$;
revoke all on function public.chat_push_gone(text) from public, anon, authenticated;

-- Once a day (api/push-daily.js, a Vercel cron): for each player not in the game who has notifications and "new
-- students from my area" on, how many players from their town joined today (not themselves, never someone
-- blocked either way). At most one a day per player, never in quiet hours if they keep them. Service role only.
-- Returns { ok, pushes: [{ endpoint, p256dh, auth, player, area, count, name }] } (name: the one, when count is 1).
create or replace function public.chat_push_digest()
returns jsonb language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Africa/Johannesburg')::date; out jsonb;
begin
  with joined as (
    select pl.id as player, pl.town as area, count(w.id) as n, min(w.name) as name
    from chat_players pl join chat_welcomes w on w.area = pl.town and w.player <> pl.id and not chat_blocked(pl.id, w.player)
      and (w.at at time zone 'Africa/Johannesburg')::date = today
    where pl.town <> '' and pl.push_area and (pl.digest_day is null or pl.digest_day < today)
      and pl.seen_at < now() - interval '60 seconds' and not (pl.push_quiet and chat_quiet_now())
      and exists (select 1 from chat_push_subs s where s.player = pl.id)
    group by pl.id, pl.town
  ), marked as (
    update chat_players p set digest_day = today from joined j where p.id = j.player returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'player', m.player,
      'area', m.area, 'count', m.n, 'name', m.name)), '[]'::jsonb)
    into out from marked m join chat_push_subs s on s.player = m.player;
  return jsonb_build_object('ok', true, 'pushes', out);
end $$;
revoke all on function public.chat_push_digest() from public, anon, authenticated;

-- "{name} just joined": a phone may announce its player once, ever (Social A). The local welcome: with p_area (a
-- town picked under the province) the newcomer is also told to the online players from that town.
drop function if exists public.chat_joined(text, text);
create or replace function public.chat_joined(p_id text, p_secret text, p_area text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare area text := left(trim(coalesce(p_area, '')), 60); me chat_players%rowtype;
begin
  perform chat_me(p_id, p_secret);
  update chat_players set joined_said = true, town = case when area = '' then town else area end where id = p_id and not joined_said returning * into me;
  if not found then return jsonb_build_object('ok', false, 'reason', 'done'); end if;
  if area <> '' then insert into chat_welcomes (player, name, area, look) values (p_id, me.name, area, me.look); end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_joined(text, text, text) to anon, authenticated;

-- Your town (for the welcomes and the daily summary), set again when you change it. { ok, town }
create or replace function public.chat_town(p_id text, p_secret text, p_town text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tw text := left(trim(coalesce(p_town, '')), 60);
begin
  perform chat_me(p_id, p_secret);
  update chat_players set town = tw where id = p_id;
  return jsonb_build_object('ok', true, 'town', tw);
end $$;
grant execute on function public.chat_town(text, text, text) to anon, authenticated;

-- The welcome waiting for you (chat_sync calls this): a newcomer from your town in the last 15 minutes, never
-- past a block, at most one every 10 minutes, each newcomer once. null when there is none.
create or replace function public.chat_welcome_for(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me chat_players%rowtype; w chat_welcomes%rowtype;
begin
  select * into me from chat_players where id = p_id;
  if me.town = '' or (me.welcome_at is not null and me.welcome_at > now() - interval '10 minutes') then return null; end if;
  select * into w from chat_welcomes x where x.area = me.town and x.player <> p_id and x.id > me.welcome_seen
    and x.at > now() - interval '15 minutes' and not chat_blocked(p_id, x.player) order by x.id desc limit 1;
  if not found then return null; end if;
  update chat_players set welcome_at = now(), welcome_seen = w.id where id = p_id;
  return jsonb_build_object('id', w.player, 'name', w.name, 'area', w.area, 'gender', w.look->>'gender');
end $$;
revoke all on function public.chat_welcome_for(text) from public;

-- (the game's server function calls these with the service role)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.chat_push_due(text, text, text) to service_role;
    grant execute on function public.chat_push_gone(text) to service_role;
    grant execute on function public.chat_push_digest() to service_role;
  end if;
end $$;

-- =====================================================================================================
-- FIRST-PLAY FIXES (owner, 12 Nov, job I): a chat is a request, "last seen", the card's counts. Re-runnable.
--   A DM opens straight away only between friends both ways, or when the two already have a chat. Anyone else:
--   chat_dm makes a request ({ ok, asked: true }); the other player sees "X wants to chat. Accept / Decline".
--   Decline tells the asker only "can't right now", and they cannot ask that player again for 7 days. A request
--   nobody answered goes after 24 hours (also "can't right now", and they may ask again). Never past a block:
--   a player who blocked you gets nothing, and you are told the same as for any request. 20 requests a day.
--   The Quad shows only its last 24 hours (chat_fetch and chat_thread_json, above).
-- =====================================================================================================
create table if not exists public.chat_dm_asks (
  asker text not null,
  player text not null,
  state text not null default 'pending' check (state in ('pending', 'yes', 'no')),
  at timestamptz not null default now(),
  answered_at timestamptz,
  told boolean not null default false,
  primary key (asker, player)
);
create index if not exists chat_dm_asks_player_idx on public.chat_dm_asks (player, state, at desc);
alter table public.chat_dm_asks enable row level security;

-- Open the DM with another player, or ask for it.
-- Returns { ok, thread } (open), { ok, asked: true } (a request is waiting for their answer), or
-- { ok: false, reason: unknown | self | blocked | later | today }. later: they said no in the last 7 days.
create or replace function public.chat_dm(p_id text, p_secret text, p_other text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare tid text; t chat_threads%rowtype; mine chat_dm_asks%rowtype; theirs chat_dm_asks%rowtype;
begin
  perform chat_me(p_id, p_secret);
  if p_other is null or p_other = p_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not exists (select 1 from chat_players where id = p_other) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if exists (select 1 from chat_blocks where blocker = p_id and blocked = p_other) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
  -- (they blocked you: told the same as any request, and nothing reaches them)
  if chat_blocked(p_id, p_other) then return jsonb_build_object('ok', true, 'asked', true); end if;
  tid := 'dm:' || least(p_id, p_other) || ':' || greatest(p_id, p_other);
  select * into t from chat_threads where id = tid;
  select * into theirs from chat_dm_asks where asker = p_other and player = p_id;
  -- friends both ways, a chat you already have, a request of theirs waiting for you, or one they accepted: open
  if chat_mutual(p_id, p_other) or (t.id is not null and t.last_id > 0)
     or (theirs.asker is not null and theirs.state = 'pending' and theirs.at > now() - interval '24 hours')
     or (theirs.asker is not null and theirs.state = 'yes')
     or exists (select 1 from chat_dm_asks where asker = p_id and player = p_other and state = 'yes') then
    insert into chat_threads (id, kind, creator) values (tid, 'dm', p_id) on conflict (id) do nothing;
    insert into chat_members (thread, player) values (tid, p_id), (tid, p_other) on conflict do nothing;
    update chat_dm_asks set state = 'yes', answered_at = now(), told = true where asker = p_other and player = p_id and state = 'pending';
    return jsonb_build_object('ok', true, 'thread', tid);
  end if;
  select * into mine from chat_dm_asks where asker = p_id and player = p_other;
  if mine.asker is not null and mine.state = 'no' and mine.answered_at > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'later');
  end if;
  if mine.asker is not null and mine.state = 'pending' and mine.at > now() - interval '24 hours' then
    return jsonb_build_object('ok', true, 'asked', true);
  end if;
  if (select count(*) from chat_events where player = p_id and kind = 'dm_ask' and at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'today');
  end if;
  insert into chat_dm_asks (asker, player) values (p_id, p_other)
    on conflict (asker, player) do update set state = 'pending', at = now(), answered_at = null, told = false;
  insert into chat_events (player, kind) values (p_id, 'dm_ask');
  return jsonb_build_object('ok', true, 'asked', true);
end $$;
grant execute on function public.chat_dm(text, text, text) to anon, authenticated;

-- Answer a request: Accept (the DM opens: { ok, thread }) or Decline ({ ok }). The asker hears on their next sync.
create or replace function public.chat_dm_answer(p_id text, p_secret text, p_from text, p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a chat_dm_asks%rowtype; tid text;
begin
  perform chat_me(p_id, p_secret);
  select * into a from chat_dm_asks where asker = p_from and player = p_id and state = 'pending' and at > now() - interval '24 hours';
  if not found then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  if not coalesce(p_yes, false) or chat_blocked(p_id, p_from) then
    update chat_dm_asks set state = 'no', answered_at = now() where asker = p_from and player = p_id;
    return jsonb_build_object('ok', true);
  end if;
  update chat_dm_asks set state = 'yes', answered_at = now() where asker = p_from and player = p_id;
  tid := 'dm:' || least(p_id, p_from) || ':' || greatest(p_id, p_from);
  insert into chat_threads (id, kind, creator) values (tid, 'dm', p_from) on conflict (id) do nothing;
  insert into chat_members (thread, player) values (tid, p_id), (tid, p_from) on conflict do nothing;
  return jsonb_build_object('ok', true, 'thread', tid, 'to', jsonb_build_array(p_from));
end $$;
grant execute on function public.chat_dm_answer(text, text, text, boolean) to anon, authenticated;

-- Requests waiting for you (chat_sync calls this): [{ from, name, handle, look }], 24 hours, never past a block.
create or replace function public.chat_dm_asks_for(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('from', a.asker, 'name', coalesce(p.name, 'Student'), 'handle', coalesce(p.handle, ''), 'house', coalesce(p.house, ''), 'look', coalesce(p.look, '{}'::jsonb)) order by a.at), '[]'::jsonb)
  from chat_dm_asks a left join chat_players p on p.id = a.asker
  where a.player = p_id and a.state = 'pending' and a.at > now() - interval '24 hours' and not chat_blocked(p_id, a.asker)
$$;
revoke all on function public.chat_dm_asks_for(text) from public;

-- What became of your requests, told once: [{ id, name, thread }] for a yes, [{ id, name }] for "can't right now"
-- (a no, or 24 hours without an answer: the asker cannot tell them apart).
create or replace function public.chat_dm_answers_for(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  with done as (
    update chat_dm_asks a set told = true
    where a.asker = p_id and not a.told and (a.state <> 'pending' or a.at <= now() - interval '24 hours')
    returning a.player, a.state)
  select coalesce(jsonb_agg(jsonb_build_object('id', d.player, 'name', coalesce(p.name, 'Student'), 'yes', d.state = 'yes')
      || case when d.state = 'yes' then jsonb_build_object('thread', 'dm:' || least(p_id, d.player) || ':' || greatest(p_id, d.player)) else '{}'::jsonb end), '[]'::jsonb)
    into out from done d left join chat_players p on p.id = d.player where not chat_blocked(p_id, d.player);
  return out;
end $$;
revoke all on function public.chat_dm_answers_for(text) from public;

-- What a player's card shows about them: { followers, friends (friends both ways), following (you follow them),
-- mutual (you are friends both ways), online and seen (only when mutual), chat: open | asked | later | ask }.
create or replace function public.chat_card(p_id text, p_secret text, p_who text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p chat_players%rowtype; mu boolean; tid text; chat text := 'ask'; a chat_dm_asks%rowtype;
begin
  perform chat_me(p_id, p_secret);
  select * into p from chat_players where id = p_who;
  if not found or chat_blocked(p_id, p_who) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  mu := chat_mutual(p_id, p_who);
  tid := 'dm:' || least(p_id, p_who) || ':' || greatest(p_id, p_who);
  select * into a from chat_dm_asks where asker = p_id and player = p_who;
  if mu or exists (select 1 from chat_threads where id = tid and last_id > 0)
     or exists (select 1 from chat_dm_asks where ((asker = p_id and player = p_who) or (asker = p_who and player = p_id)) and state = 'yes') then chat := 'open';
  elsif a.asker is not null and a.state = 'pending' and a.at > now() - interval '24 hours' then chat := 'asked';
  elsif a.asker is not null and a.state = 'no' and a.answered_at > now() - interval '7 days' then chat := 'later';
  end if;
  return jsonb_build_object('ok', true,
    'followers', (select count(*) from chat_follows where followed = p_who),
    'following', exists (select 1 from chat_follows where follower = p_id and followed = p_who),
    'friends', (select count(*) from chat_friends f where f.player = p_who and exists (select 1 from chat_friends g where g.player = f.friend and g.friend = p_who)),
    'mutual', mu, 'chat', chat)
    || case when mu then jsonb_build_object('online', p.seen_at > now() - interval '70 seconds', 'seen', p.seen_at) else '{}'::jsonb end;
end $$;
grant execute on function public.chat_card(text, text, text) to anon, authenticated;

-- =====================================================================================================
-- LAUNCH SAFETY (job H, 13 Nov)
--   1. A player deletes their own Board post (its stamps, reports and replies go with it) or their own reply. A
--      deleted post still counts towards the day's three (chat_events 'post_del'), so delete-and-post is no way round it.
--   2. Invite a friend pays only when the friend comes back on a second SAST day: a claim is noted (first_day, and
--      paid = true so the inviter's sync says nothing yet); chat_ref_back on a later day marks it back, sets paid =
--      false (the inviter's next chat_sync tells them, as before) and tells the friend once (friend_paid).
-- =====================================================================================================
create or replace function public.chat_post_delete(p_id text, p_secret text, p_post bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a text;
begin
  perform chat_me(p_id, p_secret);
  select author into a from chat_posts where id = p_post;
  if a is null or a <> p_id then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  insert into chat_events (player, kind, at) select p_id, 'post_del', p.at from chat_posts p where p.id = p_post;
  delete from chat_threads where id = 'p:' || p_post;
  delete from chat_posts where id = p_post;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.chat_post_delete(text, text, bigint) to anon, authenticated;

create or replace function public.chat_line_delete(p_id text, p_secret text, p_line bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform chat_me(p_id, p_secret);
  delete from chat_lines where id = p_line and sender = p_id and thread like 'p:%';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end $$;
grant execute on function public.chat_line_delete(text, text, bigint) to anon, authenticated;

-- (chat_post again: the day's three count deleted posts too)
create or replace function public.chat_post(p_id text, p_secret text, p_body text, p_district text default 'campus')
returns jsonb language plpgsql security definer set search_path = public as $$
declare body text := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')); p chat_posts%rowtype;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chat:' || p_id));
  if body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(body) > 140 then return jsonb_build_object('ok', false, 'reason', 'long'); end if;
  if regexp_replace(body, 'https://softlifeza\.vercel\.app[^\s]*', '', 'gi') ~* '(https?://|www\.|\.com\M|\.co\.za\M|wa\.me)' then
    return jsonb_build_object('ok', false, 'reason', 'link');
  end if;
  begin body := public.clean_chat_body(body); exception when others then return jsonb_build_object('ok', false, 'reason', 'word'); end;
  if body is null or body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if (select count(*) from chat_posts where author = p_id and (at at time zone 'Africa/Johannesburg')::date = today)
     + (select count(*) from chat_events where player = p_id and kind = 'post_del' and (at at time zone 'Africa/Johannesburg')::date = today) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'today');
  end if;
  insert into chat_posts (author, body, district) values (p_id, left(body, 140), left(coalesce(nullif(p_district, ''), 'campus'), 30)) returning * into p;
  return jsonb_build_object('ok', true, 'post', chat_post_json(p_id, p));
end $$;
grant execute on function public.chat_post(text, text, text, text) to anon, authenticated;

alter table public.chat_refs add column if not exists first_day date;
alter table public.chat_refs add column if not exists back boolean not null default false;
alter table public.chat_refs add column if not exists friend_paid boolean not null default false;

create or replace function public.chat_ref_claim(p_id text, p_secret text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv chat_players%rowtype;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chatref:' || p_id));
  select * into inv from chat_players where ref_code = lower(left(coalesce(p_code, ''), 16));
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if inv.id = p_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if exists (select 1 from chat_refs where friend = p_id) then return jsonb_build_object('ok', false, 'reason', 'done'); end if;
  if (select created_at from chat_players where id = p_id) < now() - interval '1 day' then return jsonb_build_object('ok', false, 'reason', 'old'); end if;
  if (select count(*) from chat_refs where inviter = inv.id and at > now() - interval '1 day') >= 10 then return jsonb_build_object('ok', false, 'reason', 'limit'); end if;
  -- (paid = true: nothing for the inviter until the friend comes back on another day)
  insert into chat_refs (friend, inviter, first_day, paid) values (p_id, inv.id, (now() at time zone 'Africa/Johannesburg')::date, true);
  return jsonb_build_object('ok', true, 'inviter', inv.name, 'pending', true);
end $$;
grant execute on function public.chat_ref_claim(text, text, text) to anon, authenticated;

-- The friend's phone asks once a session while it has a claim waiting. { ok, state: none | wait | reward, inviter }.
create or replace function public.chat_ref_back(p_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r chat_refs%rowtype; today date := (now() at time zone 'Africa/Johannesburg')::date; nm text;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chatref:' || p_id));
  select * into r from chat_refs where friend = p_id;
  if not found or r.first_day is null then return jsonb_build_object('ok', true, 'state', 'none'); end if;
  if not r.back and today > r.first_day then
    update chat_refs set back = true, paid = false where friend = p_id;
    r.back := true;
  end if;
  if not r.back then return jsonb_build_object('ok', true, 'state', 'wait'); end if;
  if r.friend_paid then return jsonb_build_object('ok', true, 'state', 'none'); end if;
  update chat_refs set friend_paid = true where friend = p_id;
  select name into nm from chat_players where id = r.inviter;
  return jsonb_build_object('ok', true, 'state', 'reward', 'inviter', coalesce(nm, 'A friend'));
end $$;
grant execute on function public.chat_ref_back(text, text) to anon, authenticated;
-- LAUNCH SAFETY END

-- =====================================================================================================
-- OWNER REPORTS (job G, 13 Nov): #/owner. Only the owner's account (public.is_admin(): profiles.role = 'admin' for
-- the signed-in Supabase user) may call these; everybody else gets 'owner only'. Counts and lists only; what is
-- recorded and why: docs/owner-reports.md and the privacy page. p_days: the time range (1, 7, 30).
-- =====================================================================================================
create or replace function public.owner_report(p_kind text, p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
  d0 date := ((now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))) at time zone 'Africa/Johannesburg')::date;
  today date := (now() at time zone 'Africa/Johannesburg')::date;
  r jsonb;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'owner only'; end if;
  if p_kind = 'growth' then
    with firsts as (select player, min(day) as first from play_days group by player)
    select jsonb_build_object(
      'today', (select count(*) from firsts where first = today),
      'week', (select count(*) from firsts where first > today - 7),
      'range', (select count(*) from firsts where first >= d0),
      -- of the players who started in the range (and long enough ago): back the next day, back after 7 days
      'd1', (select jsonb_build_object('of', count(*), 'back', count(*) filter (where exists (select 1 from play_days p where p.player = f.player and p.day = f.first + 1))) from firsts f where f.first >= d0 and f.first < today),
      'd7', (select jsonb_build_object('of', count(*), 'back', count(*) filter (where exists (select 1 from play_days p where p.player = f.player and p.day >= f.first + 7))) from firsts f where f.first >= d0 - 7 and f.first <= today - 7),
      'countries', coalesce((select jsonb_agg(x order by x.n desc) from (select coalesce(country, 'Not given') as country, count(distinct player) as n from play_days where day >= d0 group by 1 order by 2 desc limit 15) x), '[]'::jsonb),
      'byDay', coalesce((select jsonb_agg(x order by x.day) from (select first as day, count(*) as n from firsts where first >= d0 group by 1) x), '[]'::jsonb)) into r;
  elsif p_kind = 'time' then
    with s as (select player, day, extract(epoch from (last - started)) / 60 as mins from play_sessions where day >= d0)
    select jsonb_build_object(
      'sessions', (select count(*) from s),
      'avgSession', (select round(coalesce(avg(mins), 0)::numeric, 1) from s),
      'minutesPerPlayerDay', (select round(coalesce(avg(t), 0)::numeric, 1) from (select player, day, sum(mins) as t from s group by 1, 2) x),
      'sessionsPerPlayerDay', (select round(coalesce(avg(c), 0)::numeric, 2) from (select player, day, count(*) as c from s group by 1, 2) x),
      'byDay', coalesce((select jsonb_agg(x order by x.day) from (select day, count(*) as sessions, count(distinct player) as players, round(sum(mins)::numeric) as minutes from s group by 1) x), '[]'::jsonb)) into r;
  elsif p_kind = 'hot' then
    select jsonb_build_object(
      'areas', coalesce((select jsonb_agg(x order by x.minutes desc) from (select area, sum(minutes) as minutes from area_minutes where day >= d0 group by 1 order by 2 desc limit 30) x), '[]'::jsonb),
      'hours', coalesce((select jsonb_agg(x order by x.hour) from (select hour, sum(minutes) as minutes from area_minutes where day >= d0 group by 1) x), '[]'::jsonb),
      'places', coalesce((select jsonb_agg(x order by x.visits desc) from (select coalesce(nullif(place, ''), '(none)') as place, count(*) as visits from activity_log where at >= since group by 1 order by 2 desc limit 30) x), '[]'::jsonb)) into r;
  elsif p_kind = 'feedback' then
    select jsonb_build_object('rows', coalesce((select jsonb_agg(x order by x.at desc) from (select created_at as at, stars, message, kind, build, device from feedback where created_at >= since order by created_at desc limit 100) x), '[]'::jsonb)) into r;
  elsif p_kind = 'support' then
    select jsonb_build_object(
      'posts', coalesce((select jsonb_agg(x order by x.reports desc) from (
        select p.id, p.name, p.body, p.hidden, p.at, count(rp.*) as reports from chat_posts p join chat_post_reports rp on rp.post = p.id
        group by p.id order by count(rp.*) desc, p.id desc limit 50) x), '[]'::jsonb),
      'groups', coalesce((select jsonb_agg(x order by x.reports desc) from (
        select t.id, t.name, t.topic, t.reports_hidden as hidden, count(g.*) as reports from chat_threads t join chat_group_reports g on g.thread = t.id
        group by t.id order by count(g.*) desc limit 50) x), '[]'::jsonb),
      'blocks', coalesce((select jsonb_agg(x order by x.day) from (select (at at time zone 'Africa/Johannesburg')::date as day, count(*) as n from chat_blocks where at >= since group by 1) x), '[]'::jsonb),
      'filter', coalesce((select jsonb_agg(x order by x.day) from (select day, n from daily_counts where kind = 'filter' and day >= d0) x), '[]'::jsonb),
      'lineReports', (select count(*) from chat_line_reports where at >= since)) into r;
  elsif p_kind = 'chat' then
    select jsonb_build_object(
      'perHour', coalesce((select jsonb_agg(x order by x.hour) from (select extract(hour from at at time zone 'Africa/Johannesburg')::int as hour, count(*) as n from chat_lines where at >= since group by 1) x), '[]'::jsonb),
      'lines', (select count(*) from chat_lines where at >= since),
      'quad', (select count(*) from chat_lines where at >= since and (thread = 'quad' or thread like 'quad:%')),
      'activeGroups', (select count(distinct thread) from chat_lines where at >= since and (thread like 'g:%' or thread like 'i:%')),
      'pings', (select count(*) from chat_members where pushed_at >= since),
      'pingsOn', (select count(distinct player) from chat_push_subs)) into r;
  elsif p_kind = 'errors' then
    select jsonb_build_object('rows', coalesce((select jsonb_agg(x order by x.at desc) from (select created_at as at, kind, message, screen, step, device, build from client_errors where created_at >= since and coalesce(kind, 'error') not in ('funnel', 'feedback', 'player_report') order by created_at desc limit 100) x), '[]'::jsonb),
      'byKind', coalesce((select jsonb_agg(x) from (select coalesce(kind, 'error') as kind, count(*) as n from client_errors where created_at >= since and coalesce(kind, 'error') not in ('funnel', 'feedback', 'player_report') group by 1) x), '[]'::jsonb)) into r;
  elsif p_kind = 'economy' then
    select jsonb_build_object(
      'players', (select count(*) from player_money where at >= since),
      'spread', (select jsonb_build_object('p10', percentile_disc(0.1) within group (order by money), 'p50', percentile_disc(0.5) within group (order by money), 'p90', percentile_disc(0.9) within group (order by money), 'max', max(money)) from player_money where at >= since),
      'bands', coalesce((select jsonb_agg(x order by x.band) from (select width_bucket(money, 0, 10000, 10) as band, count(*) as n from player_money where at >= since group by 1) x), '[]'::jsonb),
      'invites', coalesce((select jsonb_agg(x order by x.claimed desc) from (select r2.inviter, coalesce(pl.name, 'Student') as name, count(*) as claimed, count(*) filter (where r2.back) as back from chat_refs r2 left join chat_players pl on pl.id = r2.inviter where r2.at >= since group by 1, 2 order by 3 desc limit 30) x), '[]'::jsonb)) into r;
  else
    raise exception 'unknown report';
  end if;
  return coalesce(r, '{}'::jsonb) || jsonb_build_object('kind', p_kind, 'days', p_days, 'at', now());
end $$;
grant execute on function public.owner_report(text, int) to authenticated;

-- The review screen's buttons: Keep (shown again, the reports cleared) or Hide (a post deleted; a group stays out of
-- suggestions and closed to the link). p_kind: post | group.
create or replace function public.owner_moderate(p_kind text, p_id text, p_keep boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'owner only'; end if;
  if p_kind = 'post' then
    if p_keep then update chat_posts set hidden = false where id = p_id::bigint; delete from chat_post_reports where post = p_id::bigint;
    else delete from chat_posts where id = p_id::bigint; end if;
  elsif p_kind = 'group' then
    if p_keep then update chat_threads set reports_hidden = false where id = p_id; delete from chat_group_reports where thread = p_id;
    else update chat_threads set reports_hidden = true, listed = false, code = null where id = p_id; end if;
  else
    raise exception 'unknown kind';
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.owner_moderate(text, text, boolean) to authenticated;
-- OWNER REPORTS END
