// The health check (#/health, owner 9 Nov): what build is running, can it reach Supabase, are the launch SQL
// blocks in, and how many rooms and players are on campus right now. Read only: it watches the campus
// channels without joining them. No secrets on the page.
import { authEnabled, getClient, supabaseConfig } from './net.js'

// eslint-disable-next-line no-undef
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'
export const COMMIT = BUILD.split(' ')[0]

async function ping(path) {
  const t = performance.now()
  try {
    const res = await fetch(`${supabaseConfig.url}${path}`, { headers: { apikey: supabaseConfig.key, Authorization: `Bearer ${supabaseConfig.key}` } })
    return { status: res.status, ms: Math.round(performance.now() - t) }
  } catch { return { status: 0, ms: Math.round(performance.now() - t) } }
}

// Rooms in use: campus, campus-2, ... until one is empty. Watching only (never tracked, so never counted).
async function rooms(client, base) {
  const out = []
  for (let n = 1; n <= 8; n++) {
    const name = n === 1 ? base : `${base}-${n}`
    const count = await new Promise((resolve) => {
      const ch = client.channel(`presence:${name}`, { config: { presence: { key: `health-${Math.random().toString(36).slice(2, 8)}` } } })
      const done = (v) => { clearTimeout(timer); client.removeChannel(ch); resolve(v) }
      const timer = setTimeout(() => done(-1), 4000)
      ch.on('presence', { event: 'sync' }, () => done(Object.keys(ch.presenceState()).length))
      ch.subscribe((status) => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') done(-1) })
    })
    if (count < 0) break
    if (count === 0 && n > 1) break
    out.push({ room: name, players: count })
    if (count === 0) break
  }
  return out
}

export async function checkHealth() {
  const result = { at: new Date().toISOString(), build: BUILD, commit: COMMIT, connected: authEnabled, supabase: null, sql: {}, rooms: [], players: 0 }
  if (!authEnabled) return result
  const auth = await ping('/auth/v1/health')
  result.supabase = { ok: auth.status > 0 && auth.status < 500, ms: auth.ms, status: auth.status }
  // The launch block (supabase/launch.sql): present if its tables answer (an empty list or rows; 404 means missing).
  const [rules, feedback, handles, chat, socialA, socialB, socialF, socialC, pushT, pushApi] = await Promise.all([
    ping('/rest/v1/score_rules?select=activity_id&limit=1'),
    ping('/rest/v1/feedback?select=id&limit=1'),
    ping('/rest/v1/player_cards?select=id&limit=1'),
    // (Chat sprint: supabase/chat.sql; its tables answer with an empty list, since nobody may read them directly)
    ping('/rest/v1/chat_threads?select=id&limit=1'),
    // (Social A, Social B and the follow-ups: the newest table of each block of supabase/chat.sql)
    ping('/rest/v1/chat_friends?select=player&limit=1'),
    ping('/rest/v1/chat_follows?select=follower&limit=1'),
    ping('/rest/v1/chat_group_asks?select=id&limit=1'),
    ping('/rest/v1/chat_group_snoozes?select=thread&limit=1'), // (Social C)
    ping('/rest/v1/chat_push_subs?select=endpoint&limit=1'), // (Notifications)
    fetch('/api/push', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})), // (the push server's keys in Vercel)
  ])
  result.sql = { leaderboard: rules.status === 200, feedback: feedback.status === 200, cards: handles.status === 200, chat: chat.status === 200, social: [socialA.status === 200, socialB.status === 200, socialF.status === 200, socialC.status === 200, pushT.status === 200] }
  // (the push server's keys: /api/push says whether every one it needs is set; the values never leave the server)
  result.push = Boolean(pushApi?.ready)
  if (result.supabase.ok) {
    try {
      const client = await getClient()
      const base = new URLSearchParams(location.search).get('room') || 'campus'
      result.rooms = await rooms(client, base)
      result.players = result.rooms.reduce((n, r) => n + r.players, 0)
    } catch { /* leave empty */ }
  }
  return result
}
