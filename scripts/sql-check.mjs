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

console.log(`${passed} sql checks passed`)
