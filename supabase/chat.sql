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
