// Chat threads (Chat sprint, owner 11 Nov): DMs and groups that last, on this phone's side.
//   Server:  supabase/chat.sql. Every read and write goes through its functions (chat_sync, chat_fetch, chat_send,
//            chat_dm, chat_block, chat_report), which check the phone's secret, membership, the limits (one message
//            per 2 s, 30 per 5 minutes, 300 characters) and the word filter. No table is readable directly.
//   Realtime: carries no message text. After a send the sender broadcasts a small nudge ({ t: thread }) on the
//            group's channel, or on the other player's own channel for a DM; a phone that hears one fetches the new
//            lines from the server. A nudge that gets lost is caught by the sync every 25 s.
//   Ping:    a line from someone else in a thread that is not open plays the ding and shows the banner (ui/threads.js).
// Until chat.sql has been run the functions do not exist: status() is 'soon' and the sheet says so.
// Under automation nothing is sent unless ?chat=1 (tests answer the functions from a local Postgres).
import { cleanMessage, filterText } from './engine/filter.js'
import { groupNameOk } from './engine/groupname.js'
import { getClient } from './net.js'
import { hidePlayer, myIdentity } from './presence.js'

const params = new URLSearchParams(location.search)
const live = () => !navigator.webdriver || params.get('chat') === '1'
// (tests chat on their own channels: ?room=<name>)
const PREFIX = `chat:${params.get('room') || 'live'}:`
const POLL = 25000

let status = 'idle' // idle | loading | ready | soon | offline
let threads = [] // newest first: { id, kind, name, topic, members, peer, last, unread }
const blocked = new Set()
const cache = new Map() // thread id -> { lines: [{ id, sender, body, at }], people: { id: { name, handle, house, look } } }
const seen = new Map() // thread id -> the newest line id this phone has pinged for (or shown)
const subs = new Map() // channel topic -> channel (listening)
const outs = new Map() // channel topic -> channel (send only: another player's own channel)
const listeners = new Set()
let profile = null
let profileSent = ''
let openId = ''
let started = false
let firstSync = true
let syncing = null
let syncTimer = 0
let syncAgain = false

const emit = (kind, detail) => { for (const fn of listeners) fn(kind, detail) }
// fn(kind, detail): 'list' (the thread list or a count changed), 'lines' (thread id), 'ping' ({ thread, line }).
export function onThreads(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export const chatStatus = () => status
export const threadList = () => threads
export const threadOf = (id) => threads.find((t) => t.id === id) || null
export const linesOf = (id) => cache.get(id) || { lines: [], people: {} }
export const unreadTotal = () => threads.reduce((n, t) => n + (t.unread || 0), 0)
export const openThreadId = () => openId
export const isBlocked = (id) => blocked.has(id)
export const myId = () => myIdentity().id

async function rpc(fn, args = {}) {
  try {
    const client = await getClient()
    if (!client) return { error: 'offline' }
    const me = myIdentity()
    const { data, error } = await client.rpc(fn, { p_id: me.id, p_secret: me.secret, ...args })
    if (error) {
      const missing = /does not exist|not find the function|schema cache/i.test(error.message || '')
      if (missing) status = 'soon'
      return { error: missing ? 'soon' : 'offline' }
    }
    return { data }
  } catch { return { error: 'offline' } }
}

// What a line or a name looks like on this phone: filtered again on the way in.
function tidyLine(l) {
  const f = filterText(String(l.body || ''))
  return f.blocked || !f.text ? null : { id: Number(l.id), sender: String(l.sender), body: f.text, at: l.at }
}
function tidyThread(t) {
  const last = t.last ? tidyLine(t.last) : null
  return { ...t, name: filterText(String(t.name || '')).text || (t.kind === 'dm' ? 'Student' : 'Group'), topic: filterText(String(t.topic || '')).text, last: last && { ...last, name: filterText(String(t.last.name || 'Student')).text || 'Student' }, unread: Number(t.unread) || 0 }
}

// ---------- Starting, and keeping the list fresh ----------
// character: the save's student (name, handle, house and look go on their lines). blocks: players already blocked on this phone.
export function startThreads(character, blocks = []) {
  if (!character) return
  profile = { p_name: String(character.name || 'Student').slice(0, 24), p_handle: String(character.handle || '').replace(/^@/, '').slice(0, 20), p_house: String(character.residence || '').slice(0, 40), p_look: character.avatar || {} }
  for (const id of blocks) blocked.add(id)
  if (!live()) return
  if (started) { if (JSON.stringify(profile) !== profileSent) sync(); return }
  started = true
  status = 'loading'
  sync().then(() => {
    // (blocks made before the chat existed, or on this phone while offline, are told to the server once)
    for (const id of blocks) if (!serverBlocked.has(id)) rpc('chat_block', { p_other: id, p_on: true })
  })
  // (before chat.sql has been run this keeps asking, so the chat comes alive on its own once it is)
  setInterval(() => { if (!document.hidden) sync() }, POLL)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sync(); if (openId) fetchLines(openId) } })
}
const serverBlocked = new Set()

export function sync() {
  if (!started || !profile) return Promise.resolve()
  // (asked again while one is on its way: one more runs straight after, so nothing new is missed)
  if (syncing) { syncAgain = true; return syncing }
  syncing = (async () => {
    const send = JSON.stringify(profile) !== profileSent ? profile : {}
    const { data, error } = await rpc('chat_sync', send)
    if (error || !data?.ok) {
      status = error === 'soon' ? 'soon' : threads.length ? 'ready' : 'offline'
      emit('list')
      return
    }
    if (send === profile) profileSent = JSON.stringify(profile)
    status = 'ready'
    for (const id of data.blocked || []) { serverBlocked.add(id); if (!blocked.has(id)) { blocked.add(id); hidePlayer(id) } }
    threads = (data.threads || []).map(tidyThread)
    // (the thread on screen is read as it arrives)
    for (const t of threads) if (t.id === openId) t.unread = 0
    const pings = []
    for (const t of threads) {
      const lastId = t.last?.id || 0
      const before = firstSync ? lastId : seen.get(t.id) || 0
      if (lastId > before && t.last.sender !== myId() && t.id !== openId && t.unread > 0) pings.push(t)
      seen.set(t.id, Math.max(lastId, seen.get(t.id) || 0))
      if (t.kind === 'group') listen(t.id)
    }
    firstSync = false
    // (the thread on screen is behind: a nudge was lost, or the sender has no Realtime)
    const shown = openId && threadOf(openId)
    if (shown?.last && shown.last.id > (cache.get(openId)?.lines.at(-1)?.id || 0)) fetchLines(openId)
    listen(`u:${myId()}`)
    emit('list')
    // (one banner at a time: the newest)
    if (pings.length) emit('ping', { thread: pings[0], line: pings[0].last })
  })().finally(() => { syncing = null; if (syncAgain) { syncAgain = false; sync() } })
  return syncing
}
function syncSoon(ms = 150) {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(sync, ms)
}

// ---------- Realtime nudges ----------
async function listen(topic) {
  if (subs.has(topic)) return
  subs.set(topic, null)
  const client = await getClient()
  if (!client) { subs.delete(topic); return }
  const ch = client.channel(PREFIX + topic, { config: { broadcast: { self: false } } })
  ch.on('broadcast', { event: 'n' }, ({ payload }) => nudged(payload || {})).subscribe()
  subs.set(topic, ch)
}
function nudged(p) {
  if (p.f && blocked.has(p.f)) return
  // (someone blocked or unblocked you: what you can see has changed)
  if (p.x) { if (openId) fetchLines(openId, true); syncSoon(); return }
  if (p.t && p.t === openId) fetchLines(openId)
  else syncSoon()
}
async function nudge(threadId, to = [], extra = {}) {
  const payload = { t: threadId, f: myId(), ...extra }
  const client = await getClient()
  if (!client) return
  const group = subs.get(threadId)
  if (group) group.send({ type: 'broadcast', event: 'n', payload }).catch(() => {})
  for (const id of to) {
    const topic = PREFIX + `u:${id}`
    let ch = outs.get(topic)
    if (!ch) { ch = client.channel(topic); outs.set(topic, ch) }
    // (not joined: the message goes over HTTP)
    const sent = typeof ch.httpSend === 'function' ? ch.httpSend('n', payload) : ch.send({ type: 'broadcast', event: 'n', payload })
    Promise.resolve(sent).catch(() => {})
  }
}

// ---------- A thread ----------
// The thread view is on screen (ui/threads.js): its lines load, it counts as read, and it never pings.
export function openThread(id) {
  openId = id
  const t = threadOf(id)
  if (t) t.unread = 0
  emit('list')
  return fetchLines(id)
}
export function closeThread() { openId = '' }

const fetching = new Map()
const fetchAgain = new Set()
// all: start again from nothing (after a block: lines may have gone).
export function fetchLines(id, all = false) {
  if (fetching.has(id)) { fetchAgain.add(id); return fetching.get(id) }
  const job = (async () => {
    const had = all ? null : cache.get(id)
    const after = had?.lines.length ? had.lines[had.lines.length - 1].id : 0
    const { data, error } = await rpc('chat_fetch', { p_thread: id, p_after: after, p_mark: openId === id })
    if (error || !data?.ok) { emit('lines', id); return false }
    const fresh = (data.lines || []).map(tidyLine).filter((l) => l && !blocked.has(l.sender))
    const lines = (had ? had.lines : []).concat(fresh.filter((l) => !had || !had.lines.some((x) => x.id === l.id))).slice(-200)
    const people = { ...(had?.people || {}) }
    for (const [pid, p] of Object.entries(data.people || {})) people[pid] = { ...p, name: filterText(String(p.name || 'Student')).text || 'Student' }
    cache.set(id, { lines, people })
    if (lines.length) seen.set(id, Math.max(lines[lines.length - 1].id, seen.get(id) || 0))
    // (the list's row follows what the thread now shows)
    const fromServer = tidyThread(data.thread)
    const at = threads.findIndex((t) => t.id === id)
    if (at >= 0) threads[at] = { ...fromServer, unread: openId === id ? 0 : fromServer.unread }
    else threads.unshift({ ...fromServer, unread: 0 })
    if (fromServer.kind === 'group') listen(id)
    emit('lines', id)
    emit('list')
    return true
  })().finally(() => { fetching.delete(id); if (fetchAgain.delete(id)) fetchLines(id) })
  fetching.set(id, job)
  return job
}

const WHY = {
  slow: 'Slow down a little: one message every 2 seconds.',
  flood: 'That’s a lot of messages. Take a breather and try again in a few minutes.',
  word: 'That word isn’t allowed here. Nothing was sent.',
  blocked: 'You can’t message this player.',
  not_member: 'You’re not in this chat.',
  empty: '',
  soon: 'Chat opens soon.',
  offline: 'Couldn’t send. Check your connection and try again.',
}
// Send a line to a thread. Returns { ok, note }: note says what was taken out, or why nothing was sent.
export async function sendLine(id, raw) {
  const res = cleanMessage(raw)
  if (res.blocked) return { ok: false, note: WHY.word }
  if (!res.text) return { ok: false, note: res.removed.length ? `${res.removed.join(' ')} Nothing left to send.` : '' }
  if (!live()) return { ok: false, note: WHY.offline }
  const { data, error } = await rpc('chat_send', { p_thread: id, p_body: res.text })
  if (error) return { ok: false, note: WHY[error] || WHY.offline }
  if (!data?.ok) return { ok: false, reason: data?.reason, note: WHY[data?.reason] ?? WHY.offline }
  const line = tidyLine(data.line)
  const had = cache.get(id) || { lines: [], people: {} }
  if (line && !had.lines.some((l) => l.id === line.id)) had.lines = had.lines.concat(line).slice(-200)
  cache.set(id, had)
  seen.set(id, Math.max(line?.id || 0, seen.get(id) || 0))
  const at = threads.findIndex((t) => t.id === id)
  if (at >= 0) {
    const [t] = threads.splice(at, 1)
    threads.unshift({ ...t, last: line && { ...line, name: profile?.p_name || 'You' } })
  }
  emit('lines', id)
  emit('list')
  nudge(id, data.to || [])
  window.dispatchEvent(new CustomEvent('mzansi-said')) // (counted for the weekly leaderboard: main.js)
  return { ok: true, note: res.removed.join(' ') }
}

// The DM with another player (made if it is the first time). who: what this phone already knows of them
// ({ name, handle, look, house }), so the header shows at once. Returns { ok, thread, note }.
export async function dmWith(otherId, who = {}) {
  if (!live()) return { ok: false, note: WHY.offline }
  if (blocked.has(otherId)) return { ok: false, note: 'You blocked this player.' }
  const { data, error } = await rpc('chat_dm', { p_other: otherId })
  if (error) return { ok: false, note: error === 'soon' ? WHY.soon : 'Couldn’t open the chat. Check your connection.' }
  if (!data?.ok) return { ok: false, note: data?.reason === 'unknown' ? 'They haven’t opened their chat yet. Try again in a moment.' : data?.reason === 'blocked' ? WHY.blocked : 'Couldn’t open the chat.' }
  if (!threadOf(data.thread)) threads.unshift({ id: data.thread, kind: 'dm', name: filterText(String(who.name || 'Student')).text || 'Student', topic: '', members: 2, peer: { id: otherId, name: who.name || 'Student', handle: who.handle || '', house: who.house || '', look: who.look || {} }, last: null, unread: 0 })
  return { ok: true, thread: data.thread }
}

// Block: their lines go from every thread on this phone, and (on the server) yours from theirs.
export function blockInChat(id) {
  if (!id) return
  blocked.add(id)
  for (const [tid, c] of cache) {
    const kept = c.lines.filter((l) => l.sender !== id)
    if (kept.length !== c.lines.length) { cache.set(tid, { ...c, lines: kept }); emit('lines', tid) }
  }
  const gone = threads.filter((t) => t.kind === 'dm' && t.peer?.id === id).map((t) => t.id)
  threads = threads.filter((t) => !gone.includes(t.id))
  emit('list', { gone })
  if (!live() || !started) return
  rpc('chat_block', { p_other: id, p_on: true }).then(({ error }) => {
    if (error) return
    serverBlocked.add(id)
    nudge('', [id], { x: 1 })
    sync()
  })
}

// Report a line (the server keeps a copy of its text). Returns true when it reached the server.
export async function reportLine(lineId, reason = 'Reported from chat') {
  const { data, error } = await rpc('chat_report', { p_line: lineId, p_reason: reason })
  return !error && Boolean(data?.ok)
}

// Groups v1: The Quad is made by chat.sql. Making a group has no screen yet; the server side is ready
// (chat_group_create, chat_set_topic) and a name must pass engine/groupname.js groupNameOk first.
export async function createGroup(name, topic = '') {
  if (!groupNameOk(name)) return { ok: false, note: 'Pick another name for the group.' }
  const { data, error } = await rpc('chat_group_create', { p_name: String(name).trim(), p_topic: String(topic || '').trim() })
  if (error || !data?.ok) return { ok: false, note: 'Couldn’t make the group.' }
  await sync()
  return { ok: true, thread: data.thread }
}

// Tests (read only): what this phone's chat holds.
window.mzansiThreads = () => ({
  status, open: openId, unread: unreadTotal(), live: started,
  threads: threads.map((t) => ({ id: t.id, kind: t.kind, name: t.name, topic: t.topic, unread: t.unread, last: t.last?.body || '' })),
  lines: openId ? linesOf(openId).lines.map((l) => ({ id: l.id, me: l.sender === myId(), sender: l.sender, body: l.body })) : [],
})
