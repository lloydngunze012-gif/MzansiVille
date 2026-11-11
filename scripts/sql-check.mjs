// Runs supabase/launch.sql on a real Postgres (PGlite, in memory) and tests the leaderboard functions:
// the daily limit, who-you-are, the weekly board, the top-3 badges and the per-player limits on errors.
// What it stands in for: Supabase's roles (anon, authenticated), is_admin(), clean_chat_body() and the base
// client_errors table, which the base schema makes. Run by npm run check.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(root, 'supabase', 'launch.sql'), 'utf8')
const db = new PGlite()
let passed = 0
async function check(name, fn) {
  await fn()
  passed += 1
  console.log('ok', name)
}
const q = async (text, params) => (await db.query(text, params)).rows
const one = async (text, params) => (await q(text, params))[0]

// ---- what Supabase already has ----
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated; -- (Supabase does this: RLS then decides)
  create or replace function public.is_admin() returns boolean language sql as $$ select false $$;
  create or replace function public.clean_chat_body(raw text) returns text language plpgsql as $$
  begin if raw ~* 'slurword' then raise exception 'Message not allowed'; end if; return trim(raw); end $$;
  create table public.client_errors (id bigint generated always as identity primary key, created_at timestamptz not null default now(),
    kind text, message text, stack text, screen text, step text, device text, build text, detail text);
  alter table public.client_errors enable row level security;
  create policy "anyone can report an error" on public.client_errors for insert to anon, authenticated with check (true);
`)

await check('launch.sql runs, and runs again', async () => {
  await db.exec(sql)
  await db.exec(sql)
  assert.ok((await one('select count(*)::int as n from score_rules')).n >= 50)
})

const ID = 'player-one-0001'
const SECRET = 'a-long-secret-0123456789'
let seq = 0
const record = async (activity, { id = ID, secret = SECRET, name = 'Thandi' } = {}) => {
  const event = `ev${Date.now().toString(36)}${++seq}`
  const r = await one('select public.record_activity($1,$2,$3,$4,$5,$6,now(),$7,$8,$9) as r', [id, secret, event, activity, 'lecture_hall', 'academics', name, 'thandi_1', 'Wave House'])
  return { event, ...r.r }
}

await check('a score is capped by its daily limit (lecture_attend: 12 points, 3 a day)', async () => {
  const rule = await one("select * from score_rules where activity_id = 'lecture_attend'")
  assert.equal(rule.daily_limit, 3)
  const results = []
  for (let i = 0; i < 5; i++) results.push(await record('lecture_attend'))
  assert.deepEqual(results.map((r) => r.points), [12, 12, 12, 0, 0])
  assert.deepEqual(results.map((r) => r.reason), ['ok', 'ok', 'ok', 'daily_limit', 'daily_limit'])
  // every finished activity is still logged (counted), scored or not
  assert.equal((await one("select count(*)::int as n from activity_log where player = $1 and activity = 'lecture_attend'", [ID])).n, 5)
  assert.equal((await one("select coalesce(sum(points),0)::int as p from activity_log where player = $1 and board = 'academics'", [ID])).p, 36)
})

await check('the next day the limit is fresh (the server counts SAST days)', async () => {
  await db.exec("update activity_log set day = day - 1")
  const r = await record('lecture_attend')
  assert.equal(r.points, 12)
})

await check('a repeat of the same event does nothing (a send that is retried)', async () => {
  const first = await record('library_study')
  const again = await one('select public.record_activity($1,$2,$3,$4,$5,$6,now()) as r', [ID, SECRET, first.event, 'library_study', 'library', 'academics'])
  assert.equal(again.r.dup, true)
  assert.equal((await one('select count(*)::int as n from activity_log where event = $1', [first.event])).n, 1)
})

await check('an activity with no rule is logged but never scores', async () => {
  const r = await record('wake_skip')
  assert.equal(r.scored, false)
  assert.equal(r.reason, 'no_score')
  assert.equal((await one("select count(*)::int as n from activity_log where activity = 'wake_skip'")).n, 1)
})

await check('only the phone with the secret can post as that player; bad ids and names are refused', async () => {
  await assert.rejects(record('lecture_attend', { secret: 'some-other-secret-0123456789' }), /not you/)
  await assert.rejects(record('Lecture Attend; drop table'), /bad activity/)
  await assert.rejects(record('lecture_attend', { id: 'short' }), /bad activity/)
})

await check('no table can be written to directly (no insert policy)', async () => {
  await db.exec('set role anon')
  await assert.rejects(db.query("insert into activity_log (player, activity, day, week, board, points) values ('x','lecture_attend', current_date, current_date, 'academics', 99)"), /row-level security|permission denied/)
  await assert.rejects(db.query("insert into score_rules values ('hack','sport',100,50)"), /row-level security|permission denied/)
  assert.equal((await db.query("update score_players set name = 'x'")).affectedRows, 0) // (RLS hides every row: nothing changes)
  assert.equal((await db.query("delete from activity_log")).affectedRows, 0)
  await db.exec('reset role')
})

await check('the board: top 10 with ranks, the name cleaned, and where you stand', async () => {
  for (let i = 0; i < 12; i++) {
    const id = `other-player-${String(i).padStart(2, '0')}x`
    for (let k = 0; k <= i % 4; k++) await record('library_study', { id, secret: `${id}-secret-0123456789`, name: i === 3 ? 'slurword' : `Student ${i}` })
  }
  const b = (await one("select public.score_board('academics', $1) as b", [ID])).b
  assert.equal(b.top.length, 10)
  assert.deepEqual(b.top.map((t) => t.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.ok(b.top[0].points >= b.top[9].points)
  assert.ok(b.you && b.you.points === 36 + 12 + 10 + 0 || b.you.points > 0, `you: ${JSON.stringify(b.you)}`)
  const names = b.top.map((t) => t.name)
  assert.ok(!names.includes('slurword'), 'a slur never reaches the board')
  assert.ok((await one("select name from score_players where id = 'other-player-03x'")).name === 'Student')
  await assert.rejects(q("select public.score_board('money', null)"), /unknown board/)
})

await check('the top 3 of a finished week keep a badge, only from the first badge week', async () => {
  await db.exec("update score_config set value = '2026-01-05' where key = 'first_badge_week'")
  await db.exec("insert into activity_log (event, player, activity, day, week, board, points) values ('old-1','p1','sports_gym','2026-11-03','2026-11-02','sport',50), ('old-2','p2','sports_gym','2026-11-03','2026-11-02','sport',40), ('old-3','p3','sports_gym','2026-11-04','2026-11-02','sport',30), ('old-4','p4','sports_gym','2026-11-04','2026-11-02','sport',20)")
  await q("select public.score_board('sport', null)")
  const rows = await q("select rank, player from score_badges where week = '2026-11-02' and board = 'sport' order by rank")
  assert.deepEqual(rows.map((r) => r.player), ['p1', 'p2', 'p3'])
  const mine = (await one("select public.my_badges('p2') as b")).b
  assert.deepEqual(mine, [{ week: '2026-11-02', board: 'sport', rank: 2 }])
  // and a week before the first badge week gets none
  await db.exec("update score_config set value = '2099-01-04' where key = 'first_badge_week'")
  await db.exec("delete from score_weeks_closed; delete from score_badges")
  await q("select public.score_board('sport', null)")
  assert.equal((await one('select count(*)::int as n from score_badges')).n, 0)
})

await check('errors: 20 an hour per player, funnel events 40 an hour, other players unaffected', async () => {
  await db.exec('set role anon')
  for (let i = 0; i < 25; i++) await db.query("insert into client_errors (kind, message, player) values ('error', $1, 'e1')", [`boom ${i}`])
  for (let i = 0; i < 45; i++) await db.query("insert into client_errors (kind, message, player) values ('funnel', $1, 'e1')", [`step ${i}`])
  await db.query("insert into client_errors (kind, message, player) values ('error', 'other', 'e2')")
  await db.query("insert into client_errors (kind, message) values ('error', 'no player')")
  await db.exec('reset role')
  assert.equal((await one("select count(*)::int as n from client_errors where player = 'e1' and kind = 'error'")).n, 20)
  assert.equal((await one("select count(*)::int as n from client_errors where player = 'e1' and kind = 'funnel'")).n, 40)
  assert.equal((await one("select count(*)::int as n from client_errors where player = 'e2'")).n, 1)
})

await check('feedback: anyone can send, nobody but admins can read', async () => {
  await db.exec('set role anon')
  await db.query("insert into feedback (player, stars, message, kind) values ('f1', 4, 'lekker', 'session3')")
  await assert.rejects(db.query("insert into feedback (stars) values (9)"), /check constraint/)
  assert.equal((await db.query('select * from feedback')).rows.length, 0) // (the select policy is admin only)
  await db.exec('reset role')
  assert.equal((await one('select count(*)::int as n from feedback')).n, 1)
})

// ---- Chat sprint (11 Nov): supabase/chat.sql ----
const chatSql = readFileSync(join(root, 'supabase', 'chat.sql'), 'utf8')
const topics = JSON.parse(readFileSync(join(root, 'data', 'campusville', 'topics.json'), 'utf8'))
const P = (n) => ({ id: `chat-player-${n}-0001`, secret: `chat-secret-${n}-0123456789` })
const [CA, CB, CC] = [P('a'), P('b'), P('c')]
const rpc = async (fn, who, ...rest) => (await one(`select public.${fn}($1,$2${rest.map((_, i) => `,$${i + 3}`).join('')}) as r`, [who.id, who.secret, ...rest])).r
// (the 2 s gap is on the server's clock: tests move the sender's earlier lines back instead of waiting)
const age = (who, secs = 3) => db.query('update chat_lines set at = at - make_interval(secs => $2) where sender = $1', [who.id, secs])
const say = async (who, thread, text) => { const r = await rpc('chat_send', who, thread, text); await age(who); return r }

await check('chat.sql runs, and runs again; The Quad carries the first topic of topics.json', async () => {
  await db.exec(chatSql)
  await db.exec(chatSql)
  const quad = await one("select * from chat_threads where id = 'quad'")
  assert.equal(quad.name, 'The Quad')
  assert.equal(quad.open, false) // (Social A: a Quad per room; chat_sync puts you in your room's, nobody is in all of them)
  assert.equal(quad.topic, topics[0], 'the QUAD TOPIC line in supabase/chat.sql must match data/campusville/topics.json')
})

await check('chat: a new player is in The Quad at once; only the phone with the secret is that player', async () => {
  const a = await rpc('chat_sync', CA, 'Thandeka', 'thandeka_1', 'Peak', '{"skin":"deep"}')
  assert.equal(a.ok, true)
  assert.deepEqual(a.threads.map((t) => t.id), ['quad'])
  assert.equal(a.threads[0].topic, topics[0])
  await rpc('chat_sync', CB, 'Kabelo', 'kabelo_1', 'Braam', '{}')
  await rpc('chat_sync', CC, 'Megan', 'megan_1', 'Peak', '{}')
  await assert.rejects(rpc('chat_sync', { id: CA.id, secret: 'another-secret-0123456789' }, 'Fake'), /not you/)
  await assert.rejects(rpc('chat_fetch', { id: CA.id, secret: 'another-secret-0123456789' }, 'quad'), /not you/)
  await assert.rejects(rpc('chat_send', { id: 'nobody-here-0001', secret: 'another-secret-0123456789' }, 'quad', 'hi'), /not you/)
})

let dm = ''
await check('chat: a DM reaches the other player with an unread count, in order, and reading clears it', async () => {
  const made = await rpc('chat_dm', CA, CB.id)
  assert.equal(made.ok, true)
  dm = made.thread
  assert.equal((await rpc('chat_dm', CB, CA.id)).thread, dm, 'one thread per pair, whoever starts it')
  assert.equal((await rpc('chat_dm', CA, 'never-seen-player-01')).reason, 'unknown')
  for (const text of ['Howzit', 'You at the Caf?', 'Come through']) assert.equal((await say(CA, dm, text)).ok, true)
  const b = await rpc('chat_sync', CB)
  const t = b.threads.find((x) => x.id === dm)
  assert.equal(t.unread, 3)
  assert.equal(t.name, 'Thandeka')
  assert.equal(t.peer.handle, 'thandeka_1')
  assert.equal(t.last.body, 'Come through')
  assert.equal(b.threads[0].id, dm, 'newest first')
  const got = await rpc('chat_fetch', CB, dm)
  assert.deepEqual(got.lines.map((l) => l.body), ['Howzit', 'You at the Caf?', 'Come through'])
  assert.equal(got.people[CA.id].name, 'Thandeka')
  assert.equal((await rpc('chat_sync', CB)).threads.find((x) => x.id === dm).unread, 0)
  const newer = await rpc('chat_fetch', CB, dm, got.lines[1].id)
  assert.deepEqual(newer.lines.map((l) => l.body), ['Come through'])
})

await check('chat: only members read or write a thread; no table can be read or written directly', async () => {
  assert.equal((await rpc('chat_fetch', CC, dm)).reason, 'not_member')
  assert.equal((await rpc('chat_send', CC, dm, 'let me in')).reason, 'not_member')
  await db.exec('set role anon')
  for (const table of ['chat_lines', 'chat_threads', 'chat_members', 'chat_players', 'chat_blocks', 'chat_line_reports']) {
    assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} is hidden`)
  }
  await assert.rejects(db.query("insert into chat_lines (thread, sender, body) values ('quad', 'x', 'spam')"), /row-level security|permission denied/)
  await assert.rejects(db.query("insert into chat_members (thread, player) values ($1, 'x')", [dm]), /row-level security|permission denied/)
  assert.equal((await db.query("update chat_threads set topic = 'hacked'")).affectedRows, 0)
  await assert.rejects(db.query("select public.chat_me('a', 'b')"), /permission denied/)
  await db.exec('reset role')
})

await check('chat: one message per 2 s and 30 per 5 minutes, checked by the server; 300 characters; a slur is refused', async () => {
  assert.equal((await rpc('chat_send', CC, 'quad', 'first')).ok, true)
  const fast = await rpc('chat_send', CC, 'quad', 'second, at once')
  assert.equal(fast.ok, false)
  assert.equal(fast.reason, 'slow')
  assert.ok(fast.wait > 0 && fast.wait <= 2000)
  await age(CC)
  for (let i = 0; i < 29; i++) assert.equal((await say(CC, 'quad', `line ${i}`)).ok, true)
  const flood = await rpc('chat_send', CC, 'quad', 'one too many')
  assert.equal(flood.reason, 'flood')
  assert.equal((await one('select count(*)::int as n from chat_lines where sender = $1', [CC.id])).n, 30)
  await age(CC, 400)
  const long = await say(CC, 'quad', 'x'.repeat(400))
  assert.equal(long.line.body.length, 300)
  assert.equal((await rpc('chat_send', CC, 'quad', 'you slurword')).reason, 'word')
  assert.equal((await rpc('chat_send', CC, 'quad', '   ')).reason, 'empty')
})

await check('chat: a thread keeps its last 200 lines', async () => {
  await db.query("insert into chat_lines (thread, sender, body, at) select 'quad', $1, 'old ' || g, now() - interval '1 hour' from generate_series(1, 230) g", [CA.id])
  await say(CA, 'quad', 'the newest')
  assert.equal((await one("select count(*)::int as n from chat_lines where thread = 'quad'")).n, 200)
  const got = await rpc('chat_fetch', CB, 'quad')
  assert.equal(got.lines.length, 200)
  assert.equal(got.lines[199].body, 'the newest')
})

await check('chat: a block hides both players from each other, in the group and the DM', async () => {
  await say(CB, 'quad', 'B in the quad')
  assert.ok((await rpc('chat_fetch', CA, 'quad')).lines.some((l) => l.sender === CB.id))
  assert.equal((await rpc('chat_block', CB, CA.id)).ok, true)
  const forB = await rpc('chat_fetch', CB, 'quad')
  assert.ok(!forB.lines.some((l) => l.sender === CA.id), 'the blocker no longer sees them')
  assert.ok(forB.lines.some((l) => l.sender === CB.id), 'their own lines are still there')
  assert.ok(!(await rpc('chat_fetch', CA, 'quad')).lines.some((l) => l.sender === CB.id), 'and they no longer see the blocker')
  assert.equal((await rpc('chat_send', CA, dm, 'hello?')).reason, 'blocked')
  assert.equal((await rpc('chat_dm', CA, CB.id)).reason, 'blocked')
  const b = await rpc('chat_sync', CB)
  assert.ok(!b.threads.some((t) => t.id === dm), 'the DM leaves the list')
  assert.deepEqual(b.blocked, [CA.id])
  assert.notEqual(b.threads.find((t) => t.id === 'quad').last.sender, CA.id)
  await rpc('chat_block', CB, CA.id, false)
  assert.ok((await rpc('chat_sync', CB)).threads.some((t) => t.id === dm), 'and comes back when unblocked')
})

await check('chat: a member can report a line (a copy of the text is kept); groups: the creator sets the pinned topic', async () => {
  const line = (await rpc('chat_fetch', CB, dm)).lines[0]
  assert.equal((await rpc('chat_report', CB, line.id, 'Rude or hateful')).ok, true)
  assert.equal((await rpc('chat_report', CC, line.id, 'not mine to see')).reason, 'not_member')
  const rep = await one('select * from chat_line_reports')
  assert.equal(rep.body, 'Howzit')
  assert.equal(rep.sender, CA.id)
  const g = await rpc('chat_group_create', CA, 'Study crew', 'Maths 101: who gets question 4?')
  assert.equal(g.ok, true)
  assert.equal((await rpc('chat_group_create', CA, 'slurword crew', '')).reason, 'word')
  assert.equal((await rpc('chat_set_topic', CB, g.thread, 'mine now')).reason, 'not_creator')
  assert.equal((await rpc('chat_set_topic', CA, g.thread, 'Test on Friday')).ok, true)
  assert.equal((await rpc('chat_sync', CA)).threads.find((t) => t.id === g.thread).topic, 'Test on Friday')
  assert.equal((await rpc('chat_fetch', CB, g.thread)).reason, 'not_member')
})

// ---- Social A (11 Nov): groups, friends, a Quad per room, join toasts (the end of supabase/chat.sql) ----
const [CD, CE] = [P('d'), P('e')]
let crew = ''
await check('social: make a group, add a friend, join by the invite code; 40 members at most', async () => {
  await rpc('chat_sync', CD, 'Dineo', 'dineo_1', 'Peak', '{}')
  const g = await rpc('chat_group_create', CD, 'Biryani Council', '')
  assert.equal(g.ok, true)
  crew = g.thread
  const mine = (await rpc('chat_sync', CD)).threads.find((t) => t.id === crew)
  assert.match(mine.code, /^[0-9a-f]{8}$/, 'a group has a code for its link')
  assert.equal((await rpc('chat_group_add', CC, crew, CA.id)).reason, 'not_member', 'only a member adds people')
  assert.equal((await rpc('chat_group_add', CD, crew, 'never-seen-player-01')).reason, 'cant')
  // (friends both ways go straight in: the follow-ups' check below covers everyone else)
  await rpc('chat_friend', CD, CA.id)
  await rpc('chat_friend', CA, CD.id)
  const added = await rpc('chat_group_add', CD, crew, CA.id)
  assert.equal(added.added, true)
  assert.deepEqual(added.to, [CA.id])
  await rpc('chat_friend', CD, CA.id, false)
  await rpc('chat_friend', CA, CD.id, false)
  assert.equal((await rpc('chat_group_add', CD, crew, CA.id)).reason, 'already')
  assert.ok((await rpc('chat_sync', CA)).threads.some((t) => t.id === crew), 'the group is in their list')
  assert.equal((await rpc('chat_group_join', CC, 'nope0000')).reason, 'unknown')
  assert.equal((await rpc('chat_group_join', CC, mine.code)).thread, crew)
  assert.equal((await rpc('chat_group_join', CC, mine.code)).ok, true, 'joining twice is fine')
  assert.equal((await rpc('chat_group_members', CD, crew)).members.length, 3)
  assert.equal((await rpc('chat_group_members', CB, crew)).reason, 'not_member')
  // fill it to 40: the 41st is refused, by code and by a member
  await db.query("insert into chat_players (id, secret_hash, name) select 'filler-player-' || g, md5('x'), 'Filler ' || g from generate_series(1, 38) g")
  await db.query("insert into chat_members (thread, player) select $1, 'filler-player-' || g from generate_series(1, 37) g", [crew])
  assert.equal((await one('select count(*)::int as n from chat_members where thread = $1', [crew])).n, 40)
  assert.equal((await rpc('chat_group_join', CB, mine.code)).reason, 'full')
  assert.equal((await rpc('chat_group_add', CD, crew, CB.id)).reason, 'full')
  await db.query("delete from chat_members where thread = $1 and player like 'filler-player-%'", [crew])
  // the Quad is not a group anyone manages
  assert.equal((await rpc('chat_group_add', CD, 'quad', CB.id)).reason, 'not_member')
  assert.equal((await rpc('chat_group_leave', CD, 'quad')).reason, 'not_member')
})

await check('social: mute, leave (the creator hands over, the last one out closes it), the topic stays the creator\'s', async () => {
  assert.equal((await rpc('chat_mute', CA, crew, true)).ok, true)
  assert.equal((await rpc('chat_sync', CA)).threads.find((t) => t.id === crew).muted, true)
  assert.equal((await rpc('chat_sync', CD)).threads.find((t) => t.id === crew).muted, false)
  assert.equal((await rpc('chat_mute', CB, crew, true)).reason, 'not_member')
  assert.equal((await rpc('chat_set_topic', CA, crew, 'mine')).reason, 'not_creator')
  assert.equal((await rpc('chat_group_leave', CD, crew)).ok, true)
  assert.ok(!(await rpc('chat_sync', CD)).threads.some((t) => t.id === crew))
  assert.equal((await one('select creator from chat_threads where id = $1', [crew])).creator, CA.id, 'the next to have joined runs it now')
  assert.equal((await rpc('chat_set_topic', CA, crew, 'Biryani on Friday?')).ok, true)
  await rpc('chat_group_leave', CA, crew)
  await rpc('chat_group_leave', CC, crew)
  assert.equal(await one('select 1 as x from chat_threads where id = $1', [crew]), undefined, 'empty groups are closed')
})

await check('social: limits on groups made (3 a day, 10 alive) and invites sent (40 a day)', async () => {
  await rpc('chat_sync', CE, 'Ethan', 'ethan_9', 'Braam', '{}')
  for (const n of ['One crew', 'Two crew', 'Three crew']) assert.equal((await rpc('chat_group_create', CE, n, '')).ok, true)
  assert.equal((await rpc('chat_group_create', CE, 'Four crew', '')).reason, 'today')
  await db.query("update chat_events set at = at - interval '2 days' where player = $1", [CE.id])
  for (let i = 4; i <= 10; i++) { assert.equal((await rpc('chat_group_create', CE, `Crew number ${i}`, '')).ok, true); await db.query("update chat_events set at = at - interval '2 days' where player = $1", [CE.id]) }
  assert.equal((await rpc('chat_group_create', CE, 'Eleven crew', '')).reason, 'too_many')
  const g = (await one("select id from chat_threads where creator = $1 and kind = 'group' limit 1", [CE.id])).id
  for (let i = 0; i < 39; i++) assert.equal((await rpc('chat_group_invite', CE, g)).ok, true)
  assert.equal((await rpc('chat_group_add', CE, g, CA.id)).ok, true, 'the 40th invite of the day')
  assert.equal((await rpc('chat_group_invite', CE, g)).reason, 'too_many')
  assert.equal((await rpc('chat_group_add', CE, g, CC.id)).reason, 'too_many')
  assert.equal((await rpc('chat_group_invite', CB, g)).reason, 'not_member')
})

await check('social: friends (add, remove, who is online); a Quad per room with the same topic; one join toast per player', async () => {
  assert.equal((await rpc('chat_friend', CA, CC.id)).ok, true)
  assert.equal((await rpc('chat_friend', CA, 'never-seen-player-01')).reason, 'unknown')
  assert.equal((await rpc('chat_friend', CA, CA.id)).reason, 'self')
  await db.query("update chat_players set seen_at = now() - interval '10 minutes' where id = $1", [CC.id])
  let pals = (await rpc('chat_sync', CA)).friends
  // a one-way friend: the name, and nothing about being online in the reply at all
  assert.deepEqual(pals.map((f) => [f.id, f.mutual, 'online' in f]), [[CC.id, false, false]])
  assert.equal((await rpc('chat_sync', CC)).friends.length, 0, 'a friends list is your own')
  // friends both ways: now each is told when the other is online
  await rpc('chat_friend', CC, CA.id)
  await db.query("update chat_players set seen_at = now() - interval '10 minutes' where id = $1", [CC.id])
  pals = (await rpc('chat_sync', CA)).friends
  assert.deepEqual([pals[0].mutual, pals[0].online], [true, false])
  await rpc('chat_sync', CC)
  assert.equal((await rpc('chat_sync', CA)).friends[0].online, true)
  await rpc('chat_friend', CC, CA.id, false)
  assert.equal('online' in (await rpc('chat_sync', CA)).friends[0], false, 'and not once it is one way again')
  await rpc('chat_friend', CA, CC.id, false)
  assert.equal((await rpc('chat_sync', CA)).friends.length, 0)
  // rooms: room 2 has its own Quad, with the pinned topic; moving room moves you
  const two = await rpc('chat_sync', CC, null, null, null, null, 2)
  assert.equal(two.room, 2)
  assert.ok(two.threads.some((t) => t.id === 'quad:2' && t.quad && t.topic === topics[0]))
  assert.ok(!two.threads.some((t) => t.id === 'quad'))
  assert.equal((await rpc('chat_send', CC, 'quad', 'still here?')).reason, 'not_member')
  await age(CC, 400)
  assert.equal((await say(CC, 'quad:2', 'room two says hi')).ok, true)
  assert.ok(!(await rpc('chat_sync', CA)).threads.some((t) => t.id === 'quad:2'), 'room 1 never sees room 2\'s Quad')
  assert.equal((await rpc('chat_sync', CC)).room, 2, 'no room given: where you were')
  const back = await rpc('chat_sync', CC, null, null, null, null, 1)
  assert.ok(back.threads.some((t) => t.id === 'quad') && !back.threads.some((t) => t.id === 'quad:2'))
  // the join toast
  assert.equal((await rpc('chat_joined', CE)).ok, true)
  assert.equal((await rpc('chat_joined', CE)).reason, 'done')
  await db.exec('set role anon')
  for (const table of ['chat_friends', 'chat_events']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} is hidden`)
  await db.exec('reset role')
})

// ---- Social B (11 Nov): the Board, follow, the Feed, interests (the end of supabase/chat.sql) ----
const dataOf = (name) => JSON.parse(readFileSync(join(root, 'data', 'campusville', name), 'utf8'))
const agePosts = (who, hours = 30) => db.query('update chat_posts set at = at - make_interval(hours => $2) where author = $1', [who.id, hours])
await check('social: the interests\' groups and the named people\'s posts in chat.sql match data/campusville', async () => {
  const want = dataOf('interests.json').interests
  const got = (await db.query("select id, name, topic from chat_threads where id like 'i:%'")).rows
  assert.equal(got.length, 12)
  for (const i of want) {
    const row = got.find((g) => g.id === `i:${i.id}`)
    assert.ok(row, `the group of ${i.id}`)
    assert.equal(row.name, `${i.emoji} ${i.label}`)
    assert.equal(row.topic, i.about)
  }
  const posts = dataOf('npc_posts.json').posts
  const seeded = (await db.query('select npc, name, body from chat_posts where npc is not null')).rows
  assert.equal(seeded.length, 20, 'the seed does not double on a second run')
  for (const p of posts) assert.deepEqual(seeded.find((s) => s.npc === p.slug), { npc: p.slug, name: p.who, body: p.post })
  assert.ok(posts.every((p) => p.post.length <= 140))
})

let post1 = 0
await check('social: a Board post: 140 characters, the filter, no links but our own, 3 a day on the server\'s clock', async () => {
  const a = await rpc('chat_post', CA, 'First day and the Caf queue already knows my name.', 'campus')
  assert.equal(a.ok, true)
  post1 = a.post.id
  assert.equal(a.post.stamps, 0)
  assert.equal((await rpc('chat_post', CA, 'x'.repeat(141), 'campus')).reason, 'long')
  assert.equal((await rpc('chat_post', CA, '   ', 'campus')).reason, 'empty')
  assert.equal((await rpc('chat_post', CA, 'you slurword', 'campus')).reason, 'word')
  assert.equal((await rpc('chat_post', CA, 'cheap airtime at www.scam.example', 'campus')).reason, 'link')
  assert.equal((await rpc('chat_post', CA, 'join my group http://bit.ly/x', 'campus')).reason, 'link')
  assert.equal((await rpc('chat_post', CA, 'Race me: https://softlifeza.vercel.app/?g=abc12345', 'campus')).ok, true, 'our own share link is fine')
  assert.equal((await rpc('chat_post', CA, 'Third one today', 'campus')).ok, true)
  assert.equal((await rpc('chat_post', CA, 'A fourth', 'campus')).reason, 'today')
  await agePosts(CA)
  assert.equal((await rpc('chat_post', CA, 'A new day, a new post', 'campus')).ok, true)
  assert.equal((await rpc('chat_board', CB, CA.id)).posts.length, 4)
  await assert.rejects(rpc('chat_post', { id: CA.id, secret: 'another-secret-0123456789' }, 'not me', 'campus'), /not you/)
})

await check('social: one stamp per player per post; replies are a thread off the post; 3 reports hide it; a block hides both ways', async () => {
  assert.equal((await rpc('chat_stamp', CB, post1)).stamps, 1)
  assert.equal((await rpc('chat_stamp', CB, post1)).stamps, 1, 'a second tap adds nothing')
  assert.equal((await rpc('chat_stamp', CC, post1)).stamps, 2)
  assert.equal((await rpc('chat_stamp', CB, post1, false)).stamps, 1)
  const seen = (await rpc('chat_board', CC, CA.id)).posts.find((p) => p.id === post1)
  assert.deepEqual([seen.stamps, seen.mine], [1, true])
  // replies
  const th = await rpc('chat_post_thread', CB, post1)
  assert.equal(th.thread, `p:${post1}`)
  await age(CB, 400)
  assert.equal((await say(CB, th.thread, 'Same. Mama Liz remembered my order.')).ok, true)
  assert.equal((await rpc('chat_fetch', CC, th.thread)).reason, 'not_member', 'you read replies once you have opened them')
  await rpc('chat_post_thread', CC, post1)
  assert.equal((await rpc('chat_fetch', CC, th.thread)).lines.length, 1)
  assert.equal((await rpc('chat_board', CC, CA.id)).posts.find((p) => p.id === post1).replies, 1)
  assert.ok(!(await rpc('chat_sync', CB)).threads.some((t) => t.id === th.thread), 'replies never clutter the chat list')
  assert.equal((await rpc('chat_group_leave', CB, th.thread)).reason, 'not_member')
  // a block: the board is empty both ways, no stamp, no replies
  await rpc('chat_block', CD, CA.id)
  assert.deepEqual([(await rpc('chat_board', CD, CA.id)).posts.length, (await rpc('chat_board', CA, CD.id)).blocked], [0, true])
  assert.equal((await rpc('chat_stamp', CD, post1)).reason, 'unknown')
  await rpc('chat_block', CD, CA.id, false)
  // reports: your own post cannot be reported, one report per player, the third hides it (its author still sees it)
  assert.equal((await rpc('chat_post_report', CA, post1, 'mine')).reason, 'unknown')
  for (const who of [CB, CB, CC]) assert.equal((await rpc('chat_post_report', who, post1, 'Rude or hateful')).ok, true)
  assert.ok((await rpc('chat_board', CD, CA.id)).posts.some((p) => p.id === post1), 'two reports: still up')
  await rpc('chat_post_report', CD, post1, 'Spam')
  assert.ok(!(await rpc('chat_board', CD, CA.id)).posts.some((p) => p.id === post1), 'three reports: hidden until reviewed')
  assert.ok((await rpc('chat_board', CA, CA.id)).posts.some((p) => p.id === post1))
  assert.equal((await rpc('chat_stamp', CC, post1)).reason, 'unknown')
  // a named person's post is never hidden by reports
  const npc = (await one("select id from chat_posts where npc = 'mama_liz'")).id
  for (const who of [CB, CC, CD]) await rpc('chat_post_report', who, npc, 'test')
  assert.equal((await one('select hidden from chat_posts where id = $1', [npc])).hidden, false)
})

await check('social: follow and unfollow, counts by id and by @handle, "+N while you were away"; the Feed; interests and their groups', async () => {
  assert.equal((await rpc('chat_follow', CB, CA.id)).followers, 1)
  assert.equal((await rpc('chat_follow', CB, CA.id)).followers, 1, 'following twice counts once')
  assert.equal((await rpc('chat_follow', CC, CA.id)).followers, 2)
  assert.equal((await rpc('chat_follow', CA, CA.id)).reason, 'self')
  assert.equal((await rpc('chat_follow', CB, 'never-seen-player-01')).reason, 'unknown', 'only accounts past the quick start exist to follow or be followed')
  const counts = await rpc('chat_followers', CD, [CA.id, CB.id], ['thandeka_1'])
  assert.deepEqual([counts.ids[CA.id], counts.ids[CB.id], counts.handles.thandeka_1], [2, 0, 2])
  const board = await rpc('chat_board', CB, CA.id)
  assert.deepEqual([board.followers, board.following], [2, true])
  assert.equal((await rpc('chat_sync', CA)).followers, 2)
  assert.deepEqual([(await rpc('chat_followers_seen', CA)).new, (await rpc('chat_followers_seen', CA)).new], [2, 0])
  assert.equal((await rpc('chat_follow', CC, CA.id, false)).followers, 1)
  // the Feed: who you follow first; the day's hot posts in your district (most stamps first); the named people's posts
  await rpc('chat_post', CD, 'Pier at dusk. Who is in?', 'beachfront')
  const d1 = (await rpc('chat_post', CD, 'Library table by the window is free.', 'campus')).post.id
  const e1 = (await rpc('chat_post', CE, 'Vetkoek run. Orders now.', 'campus')).post.id
  await rpc('chat_stamp', CA, e1)
  await rpc('chat_stamp', CC, e1)
  await rpc('chat_stamp', CA, d1)
  const feed = await rpc('chat_feed', CB, 'campus')
  assert.ok(feed.following.length >= 1 && feed.following.every((p) => p.author === CA.id), 'only the people you follow')
  assert.ok(!feed.following.some((p) => p.id === post1), 'never a hidden post')
  assert.deepEqual(feed.hot.slice(0, 2).map((p) => p.id), [e1, d1], 'hot: most stamps first')
  assert.ok(!feed.hot.some((p) => p.body.startsWith('Pier at dusk')), 'only your district')
  assert.equal(feed.npc.length, 20)
  assert.equal((await rpc('chat_feed', CB, 'beachfront')).hot.length, 1)
  // interests: three at most, only real ones; you are in their groups, and out of one you drop
  const picks = await rpc('chat_interests', CB, ['food', 'nonsense', 'music', 'cars', 'gym'])
  assert.deepEqual(picks.interests, ['food', 'music', 'cars'])
  let mine = (await rpc('chat_sync', CB))
  assert.deepEqual(mine.interests, ['food', 'music', 'cars'])
  assert.deepEqual(mine.threads.filter((t) => t.id.startsWith('i:')).map((t) => t.id).sort(), ['i:cars', 'i:food', 'i:music'])
  await age(CB, 400)
  assert.equal((await say(CB, 'i:food', 'Kota or bunny?')).ok, true)
  assert.equal((await rpc('chat_send', CA, 'i:food', 'not in it')).reason, 'not_member')
  await rpc('chat_interests', CB, ['food', 'art', 'music'])
  mine = await rpc('chat_sync', CB)
  assert.deepEqual(mine.threads.filter((t) => t.id.startsWith('i:')).map((t) => t.id).sort(), ['i:art', 'i:food', 'i:music'])
  assert.equal((await rpc('chat_group_leave', CB, 'i:food')).reason, 'not_member', 'you leave an interest by changing your picks')
  // who joined today
  const daily = await rpc('chat_daily', CB)
  assert.ok(daily.joined >= 5 && daily.names.length === 3 && !daily.names.includes('Kabelo'))
  await db.exec('set role anon')
  for (const table of ['chat_posts', 'chat_stamps', 'chat_follows', 'chat_post_reports']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} is hidden`)
  await db.exec('reset role')
})

// ---- Social A follow-ups (11 Nov): asks, online for friends both ways only, remove and rename ----
await check('follow-ups: adding someone who is not a friend both ways sends an ask; Join or No thanks; 24 hours; never past a block', async () => {
  const g = (await rpc('chat_group_create', CA, 'Greenway Run Club', '')).thread
  const code = (await rpc('chat_sync', CA)).threads.find((t) => t.id === g).code
  // CB is not CA's friend both ways: nobody lands in the group; an ask waits for them
  const r = await rpc('chat_group_add', CA, g, CB.id)
  assert.deepEqual([r.ok, r.asked, r.added, r.to], [true, true, undefined, [CB.id]])
  assert.ok(!(await rpc('chat_sync', CB)).threads.some((t) => t.id === g), 'not in the group')
  assert.equal((await rpc('chat_send', CB, g, 'hello?')).reason, 'not_member')
  const asks = (await rpc('chat_sync', CB)).asks
  assert.deepEqual(asks.map((a) => [a.thread, a.group, a.from]), [[g, 'Greenway Run Club', 'Thandeka']])
  assert.equal((await rpc('chat_group_answer', CC, asks[0].id, true)).reason, 'gone', 'only the one who was asked answers')
  assert.deepEqual((await rpc('chat_sync', CA)).answers, [], 'nothing to tell the asker yet')
  // Join
  const yes = await rpc('chat_group_answer', CB, asks[0].id, true)
  assert.deepEqual([yes.ok, yes.thread, yes.to], [true, g, [CA.id]])
  assert.ok((await rpc('chat_sync', CB)).threads.some((t) => t.id === g))
  assert.deepEqual((await rpc('chat_sync', CB)).asks, [])
  assert.deepEqual((await rpc('chat_sync', CA)).answers, [{ name: 'Kabelo', group: 'Greenway Run Club', added: true }])
  assert.deepEqual((await rpc('chat_sync', CA)).answers, [], 'told once')
  // No thanks: the asker hears "can't right now" and nothing more
  await rpc('chat_group_add', CA, g, CC.id)
  const ask2 = (await rpc('chat_sync', CC)).asks[0]
  assert.equal((await rpc('chat_group_answer', CC, ask2.id, false)).ok, true)
  assert.ok(!(await rpc('chat_sync', CC)).threads.some((t) => t.id === g))
  assert.deepEqual((await rpc('chat_sync', CA)).answers, [{ name: 'Megan', group: 'Greenway Run Club', added: false }])
  assert.equal((await rpc('chat_group_answer', CC, ask2.id, true)).reason, 'gone')
  // 24 hours: the ask is gone for them, and the asker hears the same "can't right now"
  await rpc('chat_group_add', CA, g, CC.id)
  await db.query("update chat_group_asks set at = at - interval '25 hours' where player = $1", [CC.id])
  assert.deepEqual((await rpc('chat_sync', CC)).asks, [])
  assert.deepEqual((await rpc('chat_sync', CA)).answers, [{ name: 'Megan', group: 'Greenway Run Club', added: false }])
  // a block either way: nothing is sent, and the reply is the same as an ask that was
  await rpc('chat_block', CD, CA.id)
  const blocked = await rpc('chat_group_add', CA, g, CD.id)
  assert.deepEqual([blocked.ok, blocked.asked, blocked.to], [true, true, []])
  assert.equal((await one('select count(*)::int as n from chat_group_asks where player = $1', [CD.id])).n, 0)
  assert.deepEqual((await rpc('chat_sync', CD)).asks, [])
  await rpc('chat_block', CD, CA.id, false)
  // an ask that was waiting is never shown once either has blocked the other, and cannot be accepted
  await rpc('chat_group_add', CA, g, CD.id)
  const ask3 = (await one('select id from chat_group_asks where player = $1', [CD.id])).id
  await rpc('chat_block', CA, CD.id)
  assert.deepEqual((await rpc('chat_sync', CD)).asks, [])
  assert.equal((await rpc('chat_group_answer', CD, ask3, true)).thread, undefined)
  assert.ok(!(await rpc('chat_sync', CD)).threads.some((t) => t.id === g))
  await rpc('chat_block', CA, CD.id, false)
  // every ask counted against the 40 invites a day (5 so far: CB, CC twice, CD twice)
  assert.equal((await one("select count(*)::int as n from chat_events where player = $1 and kind = 'invite' and at > now() - interval '1 hour'", [CA.id])).n, 5)
  await db.query("insert into chat_events (player, kind) select $1, 'invite' from generate_series(1, 35)", [CA.id])
  assert.equal((await rpc('chat_group_add', CA, g, CE.id)).reason, 'too_many')
  await db.query("delete from chat_events where player = $1 and kind = 'invite'", [CA.id])
  // the WhatsApp link, tapped by the person themselves, is agreeing: straight in, and a waiting ask goes
  await rpc('chat_group_add', CA, g, CE.id)
  assert.equal((await rpc('chat_group_join', CE, code)).thread, g)
  assert.deepEqual((await rpc('chat_sync', CE)).asks, [])
  crew = g
})

await check('follow-ups: the creator removes a member (the link will not let them back) and renames the group; nobody else can', async () => {
  const code = (await rpc('chat_sync', CA)).threads.find((t) => t.id === crew).code
  assert.equal((await rpc('chat_group_remove', CB, crew, CE.id)).reason, 'not_creator')
  assert.equal((await rpc('chat_group_remove', CA, crew, CA.id)).reason, 'cant')
  assert.equal((await rpc('chat_group_remove', CA, crew, CD.id)).reason, 'cant', 'not a member')
  const out = await rpc('chat_group_remove', CA, crew, CE.id)
  assert.deepEqual([out.ok, out.to], [true, [CE.id]])
  assert.ok(!(await rpc('chat_sync', CE)).threads.some((t) => t.id === crew))
  assert.equal((await rpc('chat_fetch', CE, crew)).reason, 'not_member')
  assert.equal((await rpc('chat_group_join', CE, code)).reason, 'removed', 'the link is no way back in')
  assert.equal((await rpc('chat_group_members', CA, crew)).members.length, 2)
  // (a member may still ask them back; if they say yes they are in again)
  const again = await rpc('chat_group_add', CA, crew, CE.id)
  assert.equal(again.asked, true)
  assert.equal((await rpc('chat_group_answer', CE, (await rpc('chat_sync', CE)).asks[0].id, true)).thread, crew)
  await rpc('chat_sync', CA)
  // rename: the creator only, the same word filter as a new group
  assert.equal((await rpc('chat_group_rename', CB, crew, 'Mine now')).reason, 'not_creator')
  assert.equal((await rpc('chat_group_rename', CA, crew, 'slurword club')).reason, 'word')
  assert.equal((await rpc('chat_group_rename', CA, crew, 'ab')).reason, 'name')
  assert.equal((await rpc('chat_group_rename', CA, crew, 'a *** b')).reason, 'name', 'a name the filter has starred out is refused')
  assert.equal((await rpc('chat_group_rename', CA, crew, 'Pier or Nowhere')).name, 'Pier or Nowhere')
  assert.equal((await rpc('chat_sync', CB)).threads.find((t) => t.id === crew).name, 'Pier or Nowhere')
  // who is online in a group: yourself and friends both ways only
  const seen = (await rpc('chat_group_members', CA, crew)).members
  assert.equal('online' in seen.find((m) => m.id === CA.id), true)
  assert.equal('online' in seen.find((m) => m.id === CB.id), false)
  await db.exec('set role anon')
  for (const table of ['chat_group_asks', 'chat_group_bans']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} is hidden`)
  await db.exec('reset role')
})

console.log(`${passed} sql checks passed`)
