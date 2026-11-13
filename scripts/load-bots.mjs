// Job F, item 1 (13 Nov): bots on the TEST Supabase project, never the live one. Each bot is one phone: its own
// Realtime connection, a presence room of 40 like the game (presence:loadtest-<run>-<room>), tracked in presence, and
// position broadcasts at the game's own rates (src/presence.js: heartbeat while still, the moving rate for the room's
// size; half the bots moving). Ramps up in steps and measures, per step: connections that joined, join failures,
// messages a second delivered against what should have been, delivery ratio and latency. Stops at the first step where
// joins fail or delivery falls under 90%, or at --max.
//   node scripts/load-bots.mjs [--steps 20,50,100,150,200] [--room 40] [--hold 20] [--max 400]
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.test (or .env.test.txt). Refuses to run if that URL is
// the live project's (.env / .env.local). Writes docs/sprints/capacity/bots.json.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const read = (f) => (fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => /^\s*[A-Z_]+\s*=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] })) : {})
const test = { ...read('.env.test.txt'), ...read('.env.test') }
const live = { ...read('.env'), ...read('.env.local') }
const ref = (u) => { try { return new URL(u).host.split('.')[0] } catch { return '' } }
if (!test.VITE_SUPABASE_URL || !test.VITE_SUPABASE_ANON_KEY) throw new Error('no .env.test with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
if (ref(test.VITE_SUPABASE_URL) === ref(live.VITE_SUPABASE_URL)) throw new Error('refusing: .env.test points at the LIVE project')
test.VITE_SUPABASE_URL = new URL(test.VITE_SUPABASE_URL).origin // (a URL copied with /rest/v1/ on the end still works)
console.log(`TEST project ${ref(test.VITE_SUPABASE_URL)} (live is ${ref(live.VITE_SUPABASE_URL)}: different)`)

const STEPS = String(arg('steps', '20,50,100,150,200,300')).split(',').map(Number)
const ROOM = Number(arg('room', 40))
const HOLD = Number(arg('hold', 20)) * 1000
const MAX = Number(arg('max', 400))
const RUN = Date.now().toString(36)
// (the game's rates: src/presence.js)
const keepMs = (n) => Math.min(3500, Math.max(2000, (1000 * n * (n - 1)) / 300))
const rateMs = (n) => Math.min(1500, Math.max(250, (1000 * n * (n - 1)) / 70))

const bots = []
let stats = { got: 0, lat: [] }
async function addBot(i) {
  const room = Math.floor(i / ROOM)
  const client = createClient(test.VITE_SUPABASE_URL, test.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 50 } } })
  const id = `bot-${RUN}-${i}`
  const ch = client.channel(`presence:loadtest-${RUN}-${room}`, { config: { broadcast: { self: false }, presence: { key: id } } })
  const bot = { i, id, room, client, ch, ok: false, failed: false, moving: i % 2 === 0, x: Math.random() * 100, z: Math.random() * 100, sent: 0, timer: null }
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => { stats.got++; if (payload?.t) stats.lat.push(Date.now() - payload.t) })
  await new Promise((resolve) => {
    const t = setTimeout(() => { bot.failed = true; resolve() }, 15000)
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); bot.ok = true; ch.track({ i: id, t: Date.now() }).catch(() => {}); resolve() }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(t); bot.failed = true; bot.ok = false; bot.why = `${status}${err?.message ? `: ${err.message}` : ''}`.slice(0, 80); resolve() }
    })
  })
  bots.push(bot)
  return bot
}
function roomSize(room) { return bots.filter((b) => b.ok && b.room === room).length }
function startSending(bot) {
  const tick = () => {
    if (!bot.ok) return
    const n = roomSize(bot.room)
    if (bot.moving) { bot.x += Math.random() - 0.5; bot.z += Math.random() - 0.5 }
    bot.ch.send({ type: 'broadcast', event: 'pos', payload: { i: bot.id, t: Date.now(), a: 'campus', x: bot.x, z: bot.z, p: bot.moving ? 'walk' : 'stand' } }).catch(() => {})
    bot.sent++
    bot.timer = setTimeout(tick, bot.moving ? rateMs(n) : keepMs(n))
  }
  bot.timer = setTimeout(tick, Math.random() * 2000)
}
// What should be delivered a second: every send reaches the others in its room.
function expected() {
  let e = 0
  const rooms = new Set(bots.filter((b) => b.ok).map((b) => b.room))
  for (const r of rooms) {
    const n = roomSize(r)
    const movers = bots.filter((b) => b.ok && b.room === r && b.moving).length
    e += (movers * (1000 / rateMs(n)) + (n - movers) * (1000 / keepMs(n))) * (n - 1)
  }
  return e
}

const results = []
for (const target of STEPS) {
  if (target > MAX) break
  const before = bots.length
  const adds = []
  for (let i = before; i < target; i++) { adds.push(addBot(i).then((b) => { if (b.ok) startSending(b) })); if (adds.length % 10 === 0) await new Promise((r) => setTimeout(r, 300)) }
  await Promise.all(adds)
  await new Promise((r) => setTimeout(r, 4000)) // (settle)
  stats = { got: 0, lat: [] }
  const t0 = Date.now()
  await new Promise((r) => setTimeout(r, HOLD))
  const secs = (Date.now() - t0) / 1000
  const ok = bots.filter((b) => b.ok).length
  const failed = bots.filter((b) => b.failed).length
  const want = expected()
  const got = stats.got / secs
  const lat = stats.lat.sort((a, b) => a - b)
  const why = {}; for (const b of bots) if (b.why) why[b.why] = (why[b.why] || 0) + 1
  const row = { bots: target, joined: ok, failed, why, rooms: new Set(bots.filter((b) => b.ok).map((b) => b.room)).size, expectedPerSec: Math.round(want), deliveredPerSec: Math.round(got), ratio: want ? Math.round((got / want) * 100) / 100 : 1, latencyMs: { p50: lat[Math.floor(lat.length / 2)] || 0, p95: lat[Math.floor(lat.length * 0.95)] || 0 } }
  results.push(row)
  console.log(JSON.stringify(row))
  if (failed > target * 0.1 || row.ratio < 0.9) { console.log('stopping: the project is past its limit at this step'); break }
}
fs.mkdirSync('docs/sprints/capacity', { recursive: true })
fs.writeFileSync(arg('out', 'docs/sprints/capacity/bots.json'), JSON.stringify({ at: new Date().toISOString(), project: 'TEST', room: ROOM, results }, null, 2))
for (const b of bots) { clearTimeout(b.timer); try { await b.client.removeChannel(b.ch) } catch { /* fine */ } try { b.client.realtime.disconnect() } catch { /* fine */ } }
console.log('done')
process.exit(0)
