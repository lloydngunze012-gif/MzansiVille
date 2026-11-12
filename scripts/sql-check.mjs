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
  // (job I: a chat is a request; B accepts, then the DM opens for both)
  const asked = await rpc('chat_dm', CA, CB.id)
  assert.deepEqual(asked, { ok: true, asked: true })
  const answered = await rpc('chat_dm_answer', CB, CA.id, true)
  assert.equal(answered.ok, true)
  dm = answered.thread
  assert.equal((await rpc('chat_dm', CA, CB.id)).thread, dm, 'open once accepted')
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
  assert.deepEqual(await rpc('chat_dm', CA, CB.id), { ok: true, asked: true }, '(job I) the blocked player is told the same as any request')
  assert.equal((await rpc('chat_dm', CB, CA.id)).reason, 'blocked')
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

// ---- Loops (11 Nov): a group's flame, and "invite a friend" ----
await check('loops: a group flame grows on a day 3 members are active, once a day, and is 0 after a missed day', async () => {
  const flameOf = async (who) => (await rpc('chat_sync', who)).threads.find((t) => t.id === crew).flame
  await db.query("update chat_players set seen_at = now() - interval '3 days'")
  await db.query('update chat_threads set flame = 0, flame_day = null')
  // the group has Thandeka (CA), Kabelo (CB) and Ethan (CE): one, then two, then three active today
  assert.equal(await flameOf(CA), 0)
  assert.equal(await flameOf(CB), 0)
  assert.equal(await flameOf(CE), 1, 'the third member active today lights it')
  assert.equal(await flameOf(CA), 1, 'once a day, however often they sync')
  // tomorrow, all three again: 2
  await db.query("update chat_threads set flame_day = flame_day - 1 where id = $1", [crew])
  await db.query("update chat_players set seen_at = now() - interval '2 days'")
  await rpc('chat_sync', CA); await rpc('chat_sync', CB)
  assert.equal(await flameOf(CE), 2)
  // a day with only two active, then a day with three: it starts again at 1; between, it shows 0
  await db.query("update chat_threads set flame_day = flame_day - 2 where id = $1", [crew])
  assert.equal((await one('select flame from chat_threads where id = $1', [crew])).flame, 2)
  await db.query("update chat_players set seen_at = now() - interval '2 days'")
  assert.equal(await flameOf(CA), 0, 'a missed day: no flame')
  await rpc('chat_sync', CB)
  assert.equal(await flameOf(CE), 1)
  assert.equal((await rpc('chat_sync', CA)).threads.find((t) => t.id === 'quad').flame, 0, 'the Quad has no flame')
})

await check('loops: invite a friend: a new player claims the code once; the inviter is told once; old accounts, yourself and a second claim are refused', async () => {
  const code = (await rpc('chat_ref_code', CA)).code
  assert.match(code, /^[0-9a-f]{8}$/)
  assert.equal((await rpc('chat_ref_code', CA)).code, code, 'the same code every time')
  const NEW = P('new')
  await rpc('chat_sync', NEW, 'Lindi', 'lindi_1', 'Peak', '{}')
  assert.equal((await rpc('chat_ref_claim', NEW, 'ffffffff')).reason, 'unknown')
  assert.equal((await rpc('chat_ref_claim', CA, code)).reason, 'self')
  const ok = await rpc('chat_ref_claim', NEW, code)
  assert.deepEqual([ok.ok, ok.inviter], [true, 'Thandeka'])
  assert.equal((await rpc('chat_ref_claim', NEW, code)).reason, 'done', 'once per friend')
  assert.equal((await rpc('chat_ref_claim', NEW, (await rpc('chat_ref_code', CB)).code)).reason, 'done', 'whoever invites them next')
  // an account that is not new cannot claim (the quick start was long ago)
  await db.query("update chat_players set created_at = now() - interval '3 days' where id = $1", [CC.id])
  assert.equal((await rpc('chat_ref_claim', CC, code)).reason, 'old')
  // the inviter hears of it on their next sync, once
  assert.deepEqual((await rpc('chat_sync', CA)).refs, ['Lindi'])
  assert.deepEqual((await rpc('chat_sync', CA)).refs, [])
  assert.deepEqual((await rpc('chat_sync', NEW)).refs, [])
  // 10 friends a day at most for one inviter
  await db.query("insert into chat_refs (friend, inviter) select 'filler-friend-' || g, $1 from generate_series(1, 9) g", [CA.id])
  const ELEVEN = P('eleven')
  await rpc('chat_sync', ELEVEN, 'Zinhle', 'zinhle_1', 'Peak', '{}')
  assert.equal((await rpc('chat_ref_claim', ELEVEN, code)).reason, 'limit')
  await db.exec('set role anon')
  assert.equal((await db.query('select * from chat_refs')).rows.length, 0, 'chat_refs is hidden')
  await db.exec('reset role')
})

// ---- Social C (11 Nov): find me, open groups and their suggestions, reports of a group ----
const [FA, FB, FC, FD, FE] = ['fa', 'fb', 'fc', 'fd', 'fe'].map(P)
await check('social c: find me is off until you say yes, lasts the day, and only friends both ways who are not blocked see your spot', async () => {
  for (const [who, name] of [[FA, 'Emma'], [FB, 'Thabo'], [FC, 'Priya'], [FD, 'Jason']]) await rpc('chat_sync', who, name, `${name.toLowerCase()}_f`, 'Peak', '{}')
  const friends = async (a, b) => { await rpc('chat_friend', a, b.id); await rpc('chat_friend', b, a.id) }
  await friends(FA, FB)
  await rpc('chat_friend', FC, FA.id) // (Priya has Emma on her list; Emma has not added her back)
  await friends(FA, FD)
  const sees = async (who) => (await rpc('chat_sync', who)).friends.find((f) => f.id === FA.id)
  // off by default: a spot sent without a yes is not kept, and nobody is told anything
  assert.equal((await rpc('chat_sync', FA)).find, false)
  assert.deepEqual(await rpc('chat_spot', FA, 'campus', 3.2, -8.1, ''), { ok: true, on: false })
  assert.equal((await one('select spot from chat_players where id = $1', [FA.id])).spot, null)
  assert.equal((await sees(FB)).spot, undefined)
  // yes: friends both ways see where she is in the game; a one-way friend does not
  assert.deepEqual(await rpc('chat_find', FA, true), { ok: true, on: true })
  assert.equal((await rpc('chat_sync', FA)).find, true)
  assert.deepEqual(await rpc('chat_spot', FA, 'town', 12.34, 210.06, 'lifecup'), { ok: true, on: true })
  assert.deepEqual((await sees(FB)).spot, { part: 'town', x: 12.3, z: 210.1, in: 'lifecup' })
  assert.equal((await sees(FC)).spot, undefined, 'a one-way friend never sees it')
  assert.equal((await sees(FC)).online, undefined)
  // a real place is never taken: only the game's districts and a spot on its map
  assert.equal((await rpc('chat_spot', FA, 'Durban', 1, 1, '')).reason, 'bad')
  assert.equal((await rpc('chat_spot', FA, 'town', 99999, 1, '')).reason, 'bad')
  // never past a block, either way
  await rpc('chat_block', FD, FA.id, true)
  assert.equal(await sees(FD), undefined, 'the one who blocked')
  await rpc('chat_block', FD, FA.id, false)
  assert.deepEqual((await sees(FD)).spot?.part, 'town')
  await rpc('chat_block', FA, FD.id, true)
  assert.equal(await sees(FD), undefined, 'the one who was blocked')
  await rpc('chat_block', FA, FD.id, false)
  // gone offline: no spot (the reply has none, not a stale one)
  await db.query("update chat_players set seen_at = now() - interval '5 minutes' where id = $1", [FA.id])
  assert.equal((await sees(FB)).spot, undefined)
  await rpc('chat_sync', FA)
  assert.ok((await sees(FB)).spot)
  // it lasts the day: tomorrow it is off again until she says yes
  await db.query("update chat_players set find_day = find_day - 1 where id = $1", [FA.id])
  assert.equal((await rpc('chat_sync', FA)).find, false)
  assert.equal((await sees(FB)).spot, undefined)
  assert.deepEqual(await rpc('chat_spot', FA, 'campus', 0, 0, ''), { ok: true, on: false })
  // turned off in the menu: the spot goes at once
  await rpc('chat_find', FA, true)
  await rpc('chat_spot', FA, 'campus', 1, 2, '')
  assert.ok((await sees(FB)).spot)
  assert.deepEqual(await rpc('chat_find', FA, false), { ok: true, on: false })
  assert.equal((await sees(FB)).spot, undefined)
  assert.equal((await one('select spot from chat_players where id = $1', [FA.id])).spot, null)
  await assert.rejects(rpc('chat_find', { id: FA.id, secret: 'not-her-secret-0123456789' }, true), /not you/)
})

let openGroup = ''
await check('social c: only the creator opens a group, with a real interest as its tag; private groups are never suggested', async () => {
  await rpc('chat_interests', FB, ['music', 'food'])
  await rpc('chat_interests', FC, ['gym'])
  openGroup = (await rpc('chat_group_create', FA, 'Sunday Sessions', 'What are we playing this week?')).thread
  assert.match(openGroup, /^g:/)
  const mine = async (who) => (await rpc('chat_sync', who)).threads.find((t) => t.id === openGroup)
  assert.deepEqual([(await mine(FA)).listed, (await mine(FA)).tag], [false, null])
  // private: nothing to suggest, and the day is not used up
  assert.equal((await rpc('chat_group_suggest', FB)).group, null)
  assert.equal((await one('select suggest_day from chat_players where id = $1', [FB.id])).suggest_day, null)
  // only its creator, and only a real interest
  assert.equal((await rpc('chat_group_open', FB, openGroup, true, 'music')).reason, 'not_yours')
  assert.equal((await rpc('chat_group_open', FA, openGroup, true, 'napping')).reason, 'tag')
  assert.equal((await rpc('chat_group_open', FA, 'quad', true, 'music')).reason, 'not_yours')
  assert.deepEqual(await rpc('chat_group_open', FA, openGroup, true, 'music'), { ok: true, listed: true, tag: 'music' })
  assert.deepEqual([(await mine(FA)).listed, (await mine(FA)).tag], [true, 'music'])
  // back to private and open again
  assert.equal((await rpc('chat_group_open', FA, openGroup, false)).listed, false)
  assert.equal((await rpc('chat_group_suggest', FB)).group, null)
  await rpc('chat_group_open', FA, openGroup, true, 'music')
})

await check('social c: one suggestion a day for a matching interest; Not now keeps it away 7 days; never a group with someone blocked; Join puts you in', async () => {
  // Priya's interest is gym: not for her
  assert.equal((await rpc('chat_group_suggest', FC)).group, null)
  // Thabo's is music: suggested, once today
  const s = (await rpc('chat_group_suggest', FB)).group
  assert.deepEqual(s, { thread: openGroup, name: 'Sunday Sessions', tag: 'music', members: 1, interest: 'Music' })
  assert.equal((await rpc('chat_group_suggest', FB)).group, null, 'at most one a day')
  // Not now: tomorrow it is still away, and for 7 days
  assert.deepEqual(await rpc('chat_group_suggest_answer', FB, openGroup, false), { ok: true, snoozed: true })
  await db.query('update chat_players set suggest_day = null')
  assert.equal((await rpc('chat_group_suggest', FB)).group, null)
  await db.query("update chat_group_snoozes set until = now() + interval '6 days 23 hours'")
  assert.equal((await rpc('chat_group_suggest', FB)).group, null)
  await db.query("update chat_group_snoozes set until = now() - interval '1 minute'")
  assert.equal((await rpc('chat_group_suggest', FB)).group?.thread, openGroup, 'after the 7 days')
  // a member Thabo blocked (or who blocked him): never suggested
  await db.query('update chat_players set suggest_day = null')
  await rpc('chat_block', FB, FA.id, true)
  assert.equal((await rpc('chat_group_suggest', FB)).group, null, 'he blocked a member')
  assert.equal((await rpc('chat_group_suggest_answer', FB, openGroup, true)).reason, 'gone', 'and he cannot join it that way')
  await rpc('chat_block', FB, FA.id, false)
  await rpc('chat_block', FA, FB.id, true)
  assert.equal((await rpc('chat_group_suggest', FB)).group, null, 'a member blocked him')
  await rpc('chat_block', FA, FB.id, false)
  // a player the creator removed is not offered it again
  await db.query('insert into chat_group_bans (thread, player) values ($1, $2)', [openGroup, FB.id])
  assert.equal((await rpc('chat_group_suggest', FB)).group, null)
  await db.query('delete from chat_group_bans where thread = $1', [openGroup])
  // Join: in, with nothing unread, and never suggested again
  await rpc('chat_send', FA, openGroup, 'First track is up')
  assert.equal((await rpc('chat_group_suggest', FB)).group.members, 1)
  assert.deepEqual(await rpc('chat_group_suggest_answer', FB, openGroup, true), { ok: true, thread: openGroup })
  const row = (await rpc('chat_sync', FB)).threads.find((t) => t.id === openGroup)
  assert.deepEqual([row.members, row.unread], [2, 0])
  await db.query('update chat_players set suggest_day = null')
  assert.equal((await rpc('chat_group_suggest', FB)).group, null, 'already a member')
})

await check('social c: a group\'s name or topic can be reported once per player; three reports take it out of suggestions until an admin looks', async () => {
  for (const [who, name] of [[FE, 'Naledi']]) await rpc('chat_sync', who, name, 'naledi_f', 'Peak', '{}')
  await rpc('chat_interests', FE, ['music'])
  assert.equal((await rpc('chat_group_report', FA, openGroup, 'name')).reason, 'unknown', 'not your own group')
  assert.equal((await rpc('chat_group_report', FB, 'quad', 'name')).reason, 'unknown', 'not the Quad')
  // a private group can only be reported by its members
  const priv = (await rpc('chat_group_create', FA, 'Flat 4 only', '')).thread
  assert.equal((await rpc('chat_group_report', FC, priv, 'name')).reason, 'unknown')
  // one report each: the same player twice is one
  assert.equal((await rpc('chat_group_report', FB, openGroup, 'topic')).ok, true)
  assert.equal((await rpc('chat_group_report', FB, openGroup, 'topic')).ok, true)
  assert.equal((await rpc('chat_group_report', FC, openGroup, 'name')).ok, true)
  assert.equal((await one('select count(*)::int as n from chat_group_reports where thread = $1', [openGroup])).n, 2)
  assert.equal((await rpc('chat_group_suggest', FE)).group?.thread, openGroup, 'two reports: still suggested')
  await db.query('update chat_players set suggest_day = null')
  assert.equal((await rpc('chat_group_report', FD, openGroup, 'name')).ok, true)
  assert.equal((await one('select reports_hidden from chat_threads where id = $1', [openGroup])).reports_hidden, true)
  assert.equal((await rpc('chat_group_suggest', FE)).group, null, 'three reports: out of suggestions')
  // a copy of what was reported is kept; the group itself still works for its members
  assert.deepEqual((await one('select name, topic from chat_group_reports where thread = $1 and reporter = $2', [openGroup, FD.id])), { name: 'Sunday Sessions', topic: 'What are we playing this week?' })
  assert.equal((await rpc('chat_send', FB, openGroup, 'Still here')).ok, true)
  // an admin looks, and it is offered again
  await db.query('update chat_threads set reports_hidden = false where id = $1', [openGroup])
  assert.equal((await rpc('chat_group_suggest', FE)).group?.thread, openGroup)
  await db.exec('set role anon')
  for (const table of ['chat_group_reports', 'chat_group_snoozes']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} is hidden`)
  await db.exec('reset role')
})


// (named arguments, as the phone sends them)
const chat = async (fn, args) => { const keys = Object.keys(args); return (await one(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]))).r }
// ---------- NOTIFICATIONS (owner, 11 Nov) ----------
await check('notifications: a push only to members not in the game, never from a blocked player, never a muted group or The Quad; one per thread per 10 minutes', async () => {
  const mk = async (id) => { await chat('chat_sync', { p_id: id, p_secret: `${id}-secret-0123456789`, p_name: id.split('-')[0] }); return { p_id: id, p_secret: `${id}-secret-0123456789` } }
  const A = await mk('nina-push-0001'), B = await mk('omar-push-0002'), C = await mk('pete-push-0003'), D = await mk('quin-push-0004')
  for (const p of [B, C, D]) await chat('chat_push_sub', { ...p, p_endpoint: `https://push.example/${p.p_id}`, p_p256dh: 'k'.repeat(87), p_auth: 'a'.repeat(22) })
  // (nobody but the game's server may ask who gets a push)
  await db.exec('set role anon')
  await assert.rejects(db.query("select public.chat_push_due('x','y','z')"), /permission denied/)
  for (const table of ['chat_push_subs', 'chat_welcomes']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} is hidden`)
  await db.exec('reset role')
  // B, C and D are "away": seen more than a minute ago; outside quiet hours for this check
  const away = () => db.query("update chat_players set seen_at = now() - interval '5 minutes', push_quiet = false where id <> $1", [A.p_id])
  const g = (await chat('chat_group_create', { ...A, p_name: 'Push Crew' })).thread
  for (const p of [B, C, D]) await db.query('insert into chat_members (thread, player) values ($1, $2) on conflict do nothing', [g, p.p_id])
  await chat('chat_mute', { ...D, p_thread: g, p_on: true }) // D muted the group
  await chat('chat_block', { ...C, p_other: A.p_id, p_on: true }) // C blocked A
  await away()
  await chat('chat_send', { ...A, p_thread: g, p_body: 'Library at 3?' })
  const due = async (p, t) => (await one('select public.chat_push_due($1,$2,$3) as r', [p.p_id, p.p_secret, t])).r
  let r = await due(A, g)
  assert.deepEqual(r.pushes.map((x) => x.player), [B.p_id], 'only B: C blocked A, D muted it')
  assert.equal(r.pushes[0].kind, 'group'); assert.equal(r.pushes[0].group, 'Push Crew'); assert.equal(r.pushes[0].unread, 1)
  // within 10 minutes: nothing more for that thread (the lines fold into the next push)
  await db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [A.p_id])
  await chat('chat_send', { ...A, p_thread: g, p_body: 'Bring snacks' })
  assert.equal((await due(A, g)).pushes.length, 0, 'one push per thread per 10 minutes')
  await db.query("update chat_members set pushed_at = now() - interval '11 minutes' where thread = $1", [g])
  await db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [A.p_id])
  await chat('chat_send', { ...A, p_thread: g, p_body: 'Or 4' })
  r = await due(A, g)
  assert.equal(r.pushes[0].unread, 3, 'the folded lines are counted')
  // in the game (seen in the last minute): no push
  await db.query("update chat_members set pushed_at = null where thread = $1", [g])
  await db.query('update chat_players set seen_at = now() where id = $1', [B.p_id])
  await db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [A.p_id])
  await chat('chat_send', { ...A, p_thread: g, p_body: 'Anyone?' })
  assert.equal((await due(A, g)).pushes.length, 0, 'B is in the game')
  // The Quad never pushes
  await away()
  await chat('chat_send', { ...A, p_thread: 'quad', p_body: 'hi quad' }).catch(() => {})
  assert.equal((await due(A, 'quad')).pushes.length, 0)
  // a DM: the first line, the sender's name; hide message text is passed on
  await db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [A.p_id])
  await chat('chat_friend', { ...A, p_other: B.p_id, p_on: true }); await chat('chat_friend', { ...B, p_other: A.p_id, p_on: true })
  const dm = (await chat('chat_dm', { ...A, p_other: B.p_id })).thread
  await chat('chat_push_prefs', { ...B, p_hide: true })
  await away()
  await chat('chat_send', { ...A, p_thread: dm, p_body: 'You up?' })
  r = await due(A, dm)
  assert.equal(r.pushes.length, 1); assert.equal(r.pushes[0].kind, 'dm'); assert.equal(r.pushes[0].from, 'nina'); assert.equal(r.pushes[0].first, 'You up?'); assert.equal(r.pushes[0].hide, true)
  // an old line (over 2 minutes) never pushes: the sender cannot replay
  await db.exec("update chat_members set pushed_at = null; update chat_lines set at = now() - interval '3 minutes'")
  assert.equal((await due(A, dm)).pushes.length, 0)
  // a subscription can be dropped
  await chat('chat_push_sub', { ...B, p_endpoint: `https://push.example/${B.p_id}`, p_on: false })
  assert.equal((await one('select count(*)::int as n from chat_push_subs where player = $1', [B.p_id])).n, 0)
})

await check('notifications: quiet hours (23:00 to 07:00 SAST) hold pushes back unless the player turned them off', async () => {
  const quiet = (await one('select public.chat_quiet_now() as q')).q
  const P = { p_id: 'rosa-quiet-0001', p_secret: 'rosa-quiet-0001-secret-0123456789' }, S = { p_id: 'sami-quiet-0002', p_secret: 'sami-quiet-0002-secret-0123456789' }
  for (const p of [P, S]) await chat('chat_sync', { ...p, p_name: p.p_id.split('-')[0] })
  await chat('chat_push_sub', { ...S, p_endpoint: 'https://push.example/sami', p_p256dh: 'k'.repeat(87), p_auth: 'a'.repeat(22) })
  await chat('chat_friend', { ...P, p_other: S.p_id, p_on: true }); await chat('chat_friend', { ...S, p_other: P.p_id, p_on: true })
  const dm = (await chat('chat_dm', { ...P, p_other: S.p_id })).thread
  // pretend it is 02:00 SAST: the function reads the clock, so wrap it
  await db.exec("create or replace function public.chat_quiet_now() returns boolean language sql stable as $$ select true $$")
  await db.query("update chat_players set seen_at = now() - interval '5 minutes', push_quiet = true where id = $1", [S.p_id])
  await chat('chat_send', { ...P, p_thread: dm, p_body: 'late night' })
  const due = async () => (await one('select public.chat_push_due($1,$2,$3) as r', [P.p_id, P.p_secret, dm])).r.pushes.length
  assert.equal(await due(), 0, 'quiet hours: held back')
  await chat('chat_push_prefs', { ...S, p_quiet: false })
  assert.equal(await due(), 1, 'quiet hours off: sent')
  // and the clock itself: 23:00 and 06:59 are quiet, 07:00 and 22:59 are not
  for (const [h, want] of [[23, true], [6, true], [7, false], [22, false]]) {
    assert.equal((await one(`select extract(hour from timestamp '2026-11-12 ${String(h).padStart(2, '0')}:30') >= 23 or extract(hour from timestamp '2026-11-12 ${String(h).padStart(2, '0')}:30') < 7 as q`)).q, want)
  }
  await db.exec(chatSql.slice(chatSql.indexOf('create or replace function public.chat_quiet_now()'), chatSql.indexOf('$$;', chatSql.indexOf('create or replace function public.chat_quiet_now()')) + 3))
  assert.equal((await one('select public.chat_quiet_now() as q')).q, quiet)
})

await check('notifications: the local welcome goes to online players from the same town, never past a block, one per 10 minutes; one summary push a day', async () => {
  const mk = async (id, town) => { const p = { p_id: id, p_secret: `${id}-secret-0123456789` }; await chat('chat_sync', { ...p, p_name: id.split('-')[0] }); if (town) await chat('chat_town', { ...p, p_town: town }); return p }
  const U = await mk('una-town-0001', 'Durban'), V = await mk('vic-town-0002', 'Durban'), X = await mk('xan-town-0003', 'Cape Town'), Y = await mk('yas-town-0004', 'Durban')
  await chat('chat_block', { ...Y, p_other: 'emma-new-0005', p_on: true })
  const E = await mk('emma-new-0005')
  assert.equal((await chat('chat_joined', { ...E, p_area: 'Durban' })).ok, true)
  assert.equal((await chat('chat_joined', { ...E, p_area: 'Durban' })).ok, false, 'once, ever')
  const welcome = async (p) => (await chat('chat_sync', p)).welcome
  const w = await welcome(U)
  assert.equal(w.name, 'emma'); assert.equal(w.area, 'Durban'); assert.equal(w.id, E.p_id)
  assert.equal(await welcome(U), null, 'told once')
  assert.equal(await welcome(X), null, 'another town')
  assert.equal(await welcome(Y), null, 'never past a block')
  // a second newcomer within 10 minutes: not told to U yet
  const F = await mk('finn-new-0006')
  await chat('chat_joined', { ...F, p_area: 'Durban' })
  assert.equal(await welcome(U), null, 'one per 10 minutes')
  await db.query("update chat_players set welcome_at = now() - interval '11 minutes' where id = $1", [U.p_id])
  assert.equal((await welcome(U)).name, 'finn')
  // the summary: V (away, notifications on, area on) gets one a day; U turned the area summary off
  for (const p of [U, V]) await chat('chat_push_sub', { ...p, p_endpoint: `https://push.example/${p.p_id}`, p_p256dh: 'k'.repeat(87), p_auth: 'a'.repeat(22) })
  await chat('chat_push_prefs', { ...U, p_area: false })
  await db.query("update chat_players set seen_at = now() - interval '5 minutes', push_quiet = false")
  const d = (await one('select public.chat_push_digest() as r')).r.pushes
  assert.deepEqual(d.map((x) => x.player), [V.p_id]); assert.equal(d[0].count, 2); assert.equal(d[0].area, 'Durban')
  assert.equal((await one('select public.chat_push_digest() as r')).r.pushes.length, 0, 'once a day')
})

// ---- Job I (12 Nov): a chat is a request, last seen for friends both ways, the card's counts, the Quad's 24 hours ----
await check('job I: a chat is a request: accept opens it, decline is "can\u2019t right now" and no asking again for 7 days, never past a block, 20 a day', async () => {
  const mk = async (id) => { const p = { p_id: id, p_secret: `${id}-secret-0123456789` }; await chat('chat_sync', { ...p, p_name: id.split('-')[0] }); return p }
  const [T, U, V, W] = [await mk('thabo-ask-0001'), await mk('una-ask-0002'), await mk('vusi-ask-0003'), await mk('wren-ask-0004')]
  const sync = (p) => chat('chat_sync', p)
  // ask: nothing opens, the other sees the request with the asker's name
  assert.deepEqual(await chat('chat_dm', { ...T, p_other: U.p_id }), { ok: true, asked: true })
  assert.equal((await one("select count(*)::int as n from chat_threads where id like 'dm:%' and id like '%thabo-ask%'")).n, 0, 'no thread before Accept')
  assert.deepEqual((await sync(U)).dm_asks.map((a) => [a.from, a.name]), [[T.p_id, 'thabo']])
  assert.deepEqual(await chat('chat_dm', { ...T, p_other: U.p_id }), { ok: true, asked: true }, 'asking again while it waits is the same request')
  // decline: the asker hears only "can't right now", once; then 7 days of "later"
  assert.equal((await chat('chat_dm_answer', { ...U, p_from: T.p_id, p_yes: false })).ok, true)
  assert.equal((await sync(U)).dm_asks.length, 0)
  assert.deepEqual((await sync(T)).dm_answers, [{ id: U.p_id, name: 'una', yes: false }])
  assert.deepEqual((await sync(T)).dm_answers, [], 'told once')
  assert.equal((await chat('chat_dm', { ...T, p_other: U.p_id })).reason, 'later')
  await db.query("update chat_dm_asks set answered_at = now() - interval '8 days' where asker = $1", [T.p_id])
  assert.deepEqual(await chat('chat_dm', { ...T, p_other: U.p_id }), { ok: true, asked: true }, 'after 7 days they may ask again')
  // accept: the DM opens; the asker hears "yes" with the thread
  const yes = await chat('chat_dm_answer', { ...U, p_from: T.p_id, p_yes: true })
  assert.equal(yes.thread, `dm:${T.p_id}:${U.p_id}`)
  assert.deepEqual((await sync(T)).dm_answers, [{ id: U.p_id, name: 'una', yes: true, thread: yes.thread }])
  // the other asking first: asking back opens it (no request both ways)
  await chat('chat_dm', { ...V, p_other: W.p_id })
  assert.equal((await chat('chat_dm', { ...W, p_other: V.p_id })).thread, `dm:${V.p_id}:${W.p_id}`)
  // friends both ways skip the request
  const X = await mk('xola-ask-0005')
  await chat('chat_friend', { ...X, p_other: T.p_id, p_on: true }); await chat('chat_friend', { ...T, p_other: X.p_id, p_on: true })
  assert.ok((await chat('chat_dm', { ...X, p_other: T.p_id })).thread)
  // a block: the asker is told the same, and nothing reaches the blocker
  const Y = await mk('yara-ask-0006')
  await chat('chat_block', { ...Y, p_other: V.p_id, p_on: true })
  assert.deepEqual(await chat('chat_dm', { ...V, p_other: Y.p_id }), { ok: true, asked: true })
  assert.equal((await sync(Y)).dm_asks.length, 0)
  assert.equal((await chat('chat_dm', { ...Y, p_other: V.p_id })).reason, 'blocked')
  // an unanswered request goes after 24 hours ("can't right now", and no 7-day wait)
  const Z = await mk('zane-ask-0007')
  await chat('chat_dm', { ...Z, p_other: U.p_id })
  await db.query("update chat_dm_asks set at = now() - interval '25 hours' where asker = $1", [Z.p_id])
  assert.equal((await sync(U)).dm_asks.length, 0)
  assert.deepEqual((await sync(Z)).dm_answers, [{ id: U.p_id, name: 'una', yes: false }])
  assert.deepEqual(await chat('chat_dm', { ...Z, p_other: U.p_id }), { ok: true, asked: true })
  // 20 requests a day
  const many = []
  for (let i = 0; i < 21; i++) many.push(await mk(`many-ask-${String(i).padStart(4, '0')}`))
  for (let i = 0; i < 18; i++) assert.equal((await chat('chat_dm', { ...Z, p_other: many[i].p_id })).asked, true) // (Z asked twice above: 20 in all)
  assert.equal((await chat('chat_dm', { ...Z, p_other: many[20].p_id })).reason, 'today')
})

await check('job I: the card counts followers and friends both ways; online and last seen only for friends both ways; the Quad shows its last 24 hours', async () => {
  const mk = async (id) => { const p = { p_id: id, p_secret: `${id}-secret-0123456789` }; await chat('chat_sync', { ...p, p_name: id.split('-')[0] }); return p }
  const [A, B, C] = [await mk('amara-card-0001'), await mk('bongi-card-0002'), await mk('cleo-card-0003')]
  await chat('chat_friend', { ...A, p_other: B.p_id, p_on: true }); await chat('chat_friend', { ...B, p_other: A.p_id, p_on: true })
  await chat('chat_friend', { ...C, p_other: B.p_id, p_on: true }) // (one way: not counted)
  await chat('chat_follow', { ...A, p_other: B.p_id, p_on: true }); await chat('chat_follow', { ...C, p_other: B.p_id, p_on: true })
  const forA = await chat('chat_card', { ...A, p_who: B.p_id })
  assert.equal(forA.followers, 2); assert.equal(forA.friends, 1); assert.equal(forA.following, true); assert.equal(forA.mutual, true); assert.equal(forA.chat, 'open')
  assert.equal(forA.online, true); assert.ok(forA.seen)
  const forC = await chat('chat_card', { ...C, p_who: B.p_id })
  assert.equal(forC.online, undefined, 'one-way: no online'); assert.equal(forC.seen, undefined, 'one-way: no last seen'); assert.equal(forC.chat, 'ask')
  const pals = (await chat('chat_sync', A)).friends
  assert.ok(pals.find((f) => f.id === B.p_id).seen, 'a friend both ways carries last seen')
  assert.equal((await chat('chat_sync', C)).friends.find((f) => f.id === B.p_id).seen, undefined)
  // the Quad: a line from yesterday is not shown or counted
  await chat('chat_send', { ...A, p_thread: 'quad', p_body: 'from yesterday' })
  await db.query("update chat_lines set at = now() - interval '25 hours' where sender = $1", [A.p_id])
  await chat('chat_send', { ...C, p_thread: 'quad', p_body: 'from today' })
  const lines = (await chat('chat_fetch', { ...B, p_thread: 'quad' })).lines.map((l) => l.body)
  assert.ok(lines.includes('from today')); assert.ok(!lines.includes('from yesterday'))
})

await check('job I: the launch reset empties players, messages, groups and posts; keeps the Quad, the interest groups and the named people’s posts', async () => {
  const reset = readFileSync(join(root, 'supabase', 'reset-launch.sql'), 'utf8')
  assert.ok((await one('select count(*)::int as n from chat_players')).n > 5)
  await db.exec(reset)
  await db.exec(reset) // (twice is fine)
  for (const t of ['chat_players', 'chat_lines', 'chat_members', 'chat_friends', 'chat_follows', 'chat_dm_asks', 'activity_log', 'score_players']) {
    assert.equal((await one(`select count(*)::int as n from ${t}`)).n, 0, `${t} is empty`)
  }
  const threads = (await q('select id from chat_threads')).map((r) => r.id)
  assert.ok(threads.includes('quad')); assert.ok(threads.every((id) => id === 'quad' || id.startsWith('i:')), threads.join(','))
  assert.equal((await one("select count(*)::int as n from chat_threads where id like 'i:%'")).n, dataOf('interests.json').interests.length)
  const posts = await q('select author from chat_posts')
  assert.equal(posts.length, dataOf('npc_posts.json').posts.length); assert.ok(posts.every((r) => r.author.startsWith('npc:')))
  assert.equal((await one('select count(*)::int as n from score_rules')).n > 0, true, 'the game data stays')
})

console.log(`${passed} sql checks passed`)
