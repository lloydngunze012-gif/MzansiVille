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
--   (people added plus WhatsApp links made); 200 friends; one "just joined" announcement per player, ever.
-- =====================================================================================================
alter table public.chat_threads add column if not exists code text;
create unique index if not exists chat_threads_code_idx on public.chat_threads (code) where code is not null;
alter table public.chat_members add column if not exists muted boolean not null default false;
alter table public.chat_players add column if not exists room int not null default 1;
alter table public.chat_players add column if not exists joined_said boolean not null default false;

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
    where l.thread = t.id and not chat_blocked(p_id, l.sender) order by l.id desc limit 1;
  select count(*) into n_unread from chat_lines l
    where l.thread = t.id and l.id > coalesce(mine, 0) and l.sender <> p_id and not chat_blocked(p_id, l.sender);
  select count(*) into n_members from chat_members where thread = t.id;
  return jsonb_build_object('id', t.id, 'kind', t.kind, 'name', case when t.kind = 'dm' then coalesce(peer.name, 'Student') else t.name end,
    'topic', t.topic, 'members', n_members, 'creator', t.creator,
    'peer', case when t.kind = 'dm' and peer.id is not null then jsonb_build_object('id', peer.id, 'name', peer.name, 'handle', peer.handle, 'house', peer.house, 'look', peer.look) end,
    'last', last_line, 'unread', n_unread, 'muted', coalesce(is_muted, false), 'quad', chat_is_quad(t.id),
    'code', case when t.kind = 'group' and not chat_is_quad(t.id) and mine is not null then t.code end);
end $$;
revoke all on function public.chat_thread_json(text, public.chat_threads) from public;

-- Hello, now with the room you are in (p_room: 1, 2, 3...; left out = where you were). Puts you in that room's
-- Quad and out of the others. Returns { ok, threads, blocked, friends: [{ id, name, handle, house, look, online }], room }.
drop function if exists public.chat_sync(text, text, text, text, text, jsonb);
create or replace function public.chat_sync(p_id text, p_secret text, p_name text default null, p_handle text default null, p_house text default null, p_look jsonb default null, p_room int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare nm text := left(coalesce(nullif(trim(p_name), ''), 'Student'), 24); list jsonb; mine jsonb; pals jsonb; rm int; qid text;
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
  select coalesce(jsonb_agg(x.j order by x.at desc nulls last), '[]'::jsonb) into list from (
    select chat_thread_json(p_id, t) as j, coalesce(t.last_at, case when t.kind = 'group' then t.created_at end) as at
    from chat_members m join chat_threads t on t.id = m.thread
    where m.player = p_id and t.id not like 'p:%' -- (Social B: the replies to a post are opened from the post, not listed)
      and (t.kind = 'group' or (t.last_id > 0 and not exists (
        select 1 from chat_members o where o.thread = t.id and o.player <> p_id and chat_blocked(p_id, o.player))))
  ) x;
  select coalesce(jsonb_agg(blocked), '[]'::jsonb) into mine from chat_blocks where blocker = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'handle', p.handle, 'house', p.house, 'look', p.look,
      'online', p.seen_at > now() - interval '70 seconds') order by (p.seen_at > now() - interval '70 seconds') desc, p.name), '[]'::jsonb)
    into pals from chat_friends f join chat_players p on p.id = f.friend where f.player = p_id and not chat_blocked(p_id, p.id);
  return jsonb_build_object('ok', true, 'threads', list, 'blocked', mine, 'friends', pals, 'room', rm,
    -- (Social B: your follower count and your interests; null until its block below has been run)
    'followers', (select count(*) from chat_follows where followed = p_id),
    'interests', (select to_jsonb(interests) from chat_players where id = p_id));
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

-- Add someone to a group you are in. Returns { ok, to: [them] } or { ok: false, reason }.
--   reason: not_member | unknown | blocked | already | full | too_many
create or replace function public.chat_group_add(p_id text, p_secret text, p_thread text, p_other text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t chat_threads%rowtype;
begin
  perform chat_me(p_id, p_secret);
  perform pg_advisory_xact_lock(hashtext('chatg:' || coalesce(p_thread, '')));
  t := chat_my_group(p_id, p_thread);
  if t.id is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_other is null or not exists (select 1 from chat_players where id = p_other) then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if chat_blocked(p_id, p_other) then return jsonb_build_object('ok', false, 'reason', 'blocked'); end if;
  if exists (select 1 from chat_members where thread = t.id and player = p_other) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  if (select count(*) from chat_members where thread = t.id) >= 40 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  if (select count(*) from chat_events where player = p_id and kind = 'invite' and at > now() - interval '1 day') >= 40 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  insert into chat_members (thread, player, last_read) values (t.id, p_other, t.last_id);
  insert into chat_events (player, kind) values (p_id, 'invite');
  return jsonb_build_object('ok', true, 'to', jsonb_build_array(p_other));
end $$;
grant execute on function public.chat_group_add(text, text, text, text) to anon, authenticated;

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
  if (select count(*) from chat_members where thread = t.id) >= 40 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  insert into chat_members (thread, player, last_read) values (t.id, p_id, t.last_id);
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
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'handle', p.handle, 'house', p.house, 'look', p.look,
      'online', p.seen_at > now() - interval '70 seconds', 'creator', p.id = t.creator) order by (p.id = t.creator) desc, m.joined_at), '[]'::jsonb)
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
