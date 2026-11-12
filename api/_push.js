// Notifications (owner, 11 Nov): what a push says, and the two jobs that send them. Shared by api/push.js (after a
// phone sends a line), api/push-daily.js (the daily "new students from your area" summary) and the tests
// (tests/presence/push.spec.js runs these with its own database and keys). A file starting with _ is not a route.
// Who gets a push is decided in Postgres (supabase/chat.sql, NOTIFICATIONS): here we only word it and send it.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const WORDS = require('../data/campusville/notify.json')

const fill = (line, vars) => String(line).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
const first = (name) => String(name || 'Student').split(' ')[0].slice(0, 24)
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }

// One row from chat_push_due -> { title, body, tag, url }. A group's lines in the last 10 minutes fold into its
// unread count; "hide message text" sends no words from the message.
export function messagePush(row, words = WORDS) {
  const w = words.push
  const url = `/?thread=${encodeURIComponent(row.thread)}#/play`
  if (row.kind === 'dm') {
    const body = row.hide ? fill(w.dmHidden, { name: first(row.from) }) : fill(w.dm, { name: first(row.from), line: clip(row.first, 120) })
    return { title: w.title, body, tag: row.thread, url }
  }
  const n = Math.max(1, Number(row.unread) || 1)
  const body = fill(n === 1 ? w.groupOne : w.group, { group: clip(row.group, 40), n })
  return { title: w.title, body, tag: row.thread, url }
}

// One row from chat_push_digest -> the summary for the day.
export function digestPush(row, words = WORDS) {
  const w = words.push
  const n = Number(row.count) || 1
  const body = n === 1 ? fill(w.areaOne, { name: first(row.name), area: row.area }) : fill(w.area, { n, area: row.area })
  return { title: w.title, body, tag: 'area', url: '/#/play' }
}

// rpc(fn, args) -> the function's JSON (service role); send(sub, payloadString) -> { statusCode } or throws with
// .statusCode. A subscription the push service says is gone (404, 410) is forgotten.
async function deliver(rows, word, { rpc, send }) {
  let sent = 0
  let gone = 0
  await Promise.all(rows.map(async (row) => {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
    try {
      await send(sub, JSON.stringify(word(row)))
      sent += 1
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) { gone += 1; await rpc('chat_push_gone', { p_endpoint: row.endpoint }).catch(() => {}) }
    }
  }))
  return { sent, gone, due: rows.length }
}

export async function pushForLine({ id, secret, thread }, deps) {
  if (typeof id !== 'string' || typeof secret !== 'string' || typeof thread !== 'string' || thread.length > 80) return { error: 'bad' }
  const res = await deps.rpc('chat_push_due', { p_id: id, p_secret: secret, p_thread: thread })
  if (!res?.ok) return { error: 'refused' }
  return deliver(res.pushes || [], (row) => messagePush(row), deps)
}

export async function pushDigest(deps) {
  const res = await deps.rpc('chat_push_digest', {})
  if (!res?.ok) return { error: 'refused' }
  return deliver(res.pushes || [], (row) => digestPush(row), deps)
}

// The real thing on Vercel: Supabase over HTTP with the service role, web-push with our VAPID keys.
// Environment (Vercel project settings, never in the repo): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (mailto: or https: address), SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_URL (or the VITE_SUPABASE_URL the game
// already has); CRON_SECRET for the daily job.
export async function liveDeps() {
  const env = process.env
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'https://softlifeza.vercel.app', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  // (the legacy service_role key is a JWT and also goes as the bearer token; a new sb_secret_ key goes as apikey only)
  const rpc = async (fn, args) => {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, ...(key.startsWith('eyJ') ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' }, body: JSON.stringify(args) })
    if (!r.ok) throw new Error(`${fn} ${r.status}`)
    const text = await r.text()
    return text ? JSON.parse(text) : null
  }
  const send = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' })
  return { rpc, send }
}
