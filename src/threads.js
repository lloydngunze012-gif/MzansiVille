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
import { hidePlayer, myIdentity, presenceRoomNo } from './presence.js'
import { PUBLIC_URL } from './config.js'

const params = new URLSearchParams(location.search)
const live = () => !navigator.webdriver || params.get('chat') === '1'
// (tests chat on their own channels: ?room=<name>)
const PREFIX = `chat:${params.get('room') || 'live'}:`
const POLL = 25000
// An invite link (?g=<code>, Social A): the code waits on this phone until the chat is up, which for a newcomer
// is after the quick start; then they land in the group (ui/threads.js, on the first sync).
const INVITE_KEY = 'mzansiville.groupInvite'
try { const g = params.get('g'); if (g && /^[0-9a-f]{6,16}$/i.test(g)) localStorage.setItem(INVITE_KEY, g.toLowerCase()) } catch { /* storage blocked: no invite */ }
export function waitingInvite() { try { return localStorage.getItem(INVITE_KEY) || '' } catch { return '' } }
export function clearInvite() { try { localStorage.removeItem(INVITE_KEY) } catch { /* fine */ } }

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
let firstDone = false
let syncing = null
let syncTimer = 0
let syncAgain = false
// Social A (owner, 11 Nov): friends, groups you make, a Quad per room. Until the owner has re-run supabase/chat.sql
// the server has none of it: social is false, chat works as before and the new buttons say "opens soon".
let friends = [] // [{ id, name, handle, house, look, online }]
let social = false
let asks = [] // (follow-ups: groups someone wants to add you to, waiting for Join or No thanks)
let socialB = false // (Social B: the Board, follow, the Feed, interests)
let interests = []
let followers = 0
let roomArg = true // (the older chat_sync takes no p_room)
// The room of 40 you are in (presence.js: campus, campus-2, campus.town-3...): its number picks your Quad.
const roomNumber = () => Math.max(1, Number(presenceRoomNo()) || 1)
let roomSent = 0

const emit = (kind, detail) => { for (const fn of listeners) fn(kind, detail) }
// fn(kind, detail): 'list' (the thread list or a count changed), 'lines' (thread id), 'ping' ({ thread, line }).
export function onThreads(fn) { listeners.add(fn); return () => listeners.delete(fn) }
export const chatStatus = () => status
export const threadList = () => threads
// (side: threads that are open but never listed, such as the replies to a Board post, 'p:<post id>')
const side = new Map()
export const threadOf = (id) => threads.find((t) => t.id === id) || side.get(id) || null
export const linesOf = (id) => cache.get(id) || { lines: [], people: {} }
// (a muted thread still fills up; it never counts on the badge or pings)
export const unreadTotal = () => threads.reduce((n, t) => n + (t.muted ? 0 : t.unread || 0), 0)
export const groupUnread = () => threads.reduce((n, t) => n + (t.kind === 'group' && !t.quad && !t.muted ? t.unread || 0 : 0), 0)
export const friendList = () => friends
export const isFriend = (id) => friends.some((f) => f.id === id)
export const socialReady = () => social
export const groupAsks = () => asks
export const socialBReady = () => socialB
export const myInterests = () => interests
export const myFollowers = () => followers
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
export function startThreads(character, blocks = [], pals = []) {
  if (!character) return
  localPals = pals
  profile = { p_name: String(character.name || 'Student').slice(0, 24), p_handle: String(character.handle || '').replace(/^@/, '').slice(0, 20), p_house: String(character.residence || '').slice(0, 40), p_look: character.avatar || {} }
  for (const id of blocks) blocked.add(id)
  if (!live()) return
  if (started) { if (JSON.stringify(profile) !== profileSent) sync(); return }
  started = true
  status = 'loading'
  sync().then(() => {
    // (blocks made before the chat existed, or on this phone while offline, are told to the server once)
    for (const id of blocks) if (!serverBlocked.has(id)) rpc('chat_block', { p_other: id, p_on: true })
    // (friends made before the Friends list existed, or while they had no chat yet: told to the server now)
    if (social) { const missing = localPals.filter((f) => f?.id && !isFriend(f.id) && !blocked.has(f.id)).slice(0, 50); if (missing.length) Promise.all(missing.map((f) => rpc('chat_friend', { p_other: f.id, p_on: true }))).then(() => sync()) }
  })
  // (before chat.sql has been run this keeps asking, so the chat comes alive on its own once it is)
  setInterval(() => { if (!document.hidden) sync() }, POLL)
  // (moved to another room of 40: that room's Quad)
  setInterval(() => { if (!document.hidden && roomArg && roomSent && roomNumber() !== roomSent) sync() }, 3000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { sync(); if (openId) fetchLines(openId) } })
}
const serverBlocked = new Set()
let localPals = []

export function sync() {
  if (!started || !profile) return Promise.resolve()
  // (asked again while one is on its way: one more runs straight after, so nothing new is missed)
  if (syncing) { syncAgain = true; return syncing }
  syncing = (async () => {
    const send = JSON.stringify(profile) !== profileSent ? profile : {}
    const room = roomNumber()
    let { data, error } = await rpc('chat_sync', roomArg ? { ...send, p_room: room } : send)
    // (chat.sql from before Social A: the same call without the room)
    if (error === 'soon' && roomArg) { roomArg = false; status = 'loading'; ({ data, error } = await rpc('chat_sync', send)) }
    if (error || !data?.ok) {
      status = error === 'soon' ? 'soon' : threads.length ? 'ready' : 'offline'
      emit('list')
      return
    }
    if (send === profile) profileSent = JSON.stringify(profile)
    status = 'ready'
    social = Array.isArray(data.friends)
    socialB = Array.isArray(data.interests)
    asks = (data.asks || []).filter((a) => !blocked.has(a.from_id)).map((a) => ({ ...a, group: filterText(String(a.group || 'a group')).text || 'a group', from: filterText(String(a.from || 'Someone')).text || 'Someone' }))
    // (what became of the asks you sent: "added" or "can't right now", told once)
    // (Loops: friends who started playing through your invite link since you were last told)
    if (data.refs?.length) emit('refs', data.refs.map((n) => filterText(String(n || 'A friend')).text || 'A friend'))
    if (data.answers?.length) emit('answers', data.answers.map((a) => ({ name: filterText(String(a.name || 'They')).text || 'They', group: filterText(String(a.group || 'the group')).text || 'the group', added: Boolean(a.added) })))
    interests = socialB ? data.interests : []
    followers = Number(data.followers) || 0
    roomSent = room
    friends = (data.friends || []).map((f) => ({ ...f, name: filterText(String(f.name || 'Student')).text || 'Student' })).filter((f) => !blocked.has(f.id))
    for (const id of data.blocked || []) { serverBlocked.add(id); if (!blocked.has(id)) { blocked.add(id); hidePlayer(id) } }
    threads = (data.threads || []).map(tidyThread)
    // (the thread on screen is read as it arrives)
    for (const t of threads) if (t.id === openId) t.unread = 0
    const pings = []
    for (const t of threads) {
      const lastId = t.last?.id || 0
      const before = firstSync ? lastId : seen.get(t.id) || 0
      if (lastId > before && t.last.sender !== myId() && t.id !== openId && t.unread > 0 && !t.muted) pings.push(t)
      seen.set(t.id, Math.max(lastId, seen.get(t.id) || 0))
      if (t.kind === 'group') listen(t.id)
    }
    if (firstSync) firstDone = true
    firstSync = false
    // (the thread on screen is behind: a nudge was lost, or the sender has no Realtime)
    const shown = openId && threadOf(openId)
    if (shown?.last && shown.last.id > (cache.get(openId)?.lines.at(-1)?.id || 0)) fetchLines(openId)
    listen(`u:${myId()}`)
    emit('list')
    if (firstDone) { firstDone = false; emit('first') }
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
  // (Chat V2: somebody is typing in a thread of yours: no fetch, no sync, just the line under the messages)
  if (p.ty) { noteTyping(p); return }
  // (someone blocked or unblocked you: what you can see has changed)
  if (p.x) { if (openId) fetchLines(openId, true); syncSoon(); return }
  if (p.t && p.t === openId) fetchLines(openId)
  else syncSoon()
}
async function nudge(threadId, to = [], extra = {}) {
  // (a typing signal carries `ty`, never `t`: an older phone's `t` would make the other side fetch for nothing)
  const payload = extra.ty ? { f: myId(), ...extra } : { t: threadId, f: myId(), ...extra }
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

// ---------- "Typing…" (Chat V2, owner 11 Nov) ----------
// In DMs and in groups of up to TYPING_MAX members (never the Quad): while you type, at most one small signal every
// TYPING_GAP ms goes to the thread (a DM: to the other player's own channel, like a nudge). Nothing is sent when you
// stop: the other side lets the line go after TYPING_SHOWN ms without a new signal, or when your message lands.
// The Realtime cost is one message per typer per 3 s, to at most 7 phones.
export const TYPING_GAP = 3000
const TYPING_MAX = 8
const TYPING_SHOWN = 4500
const typingNow = new Map() // thread id -> { id, name, until } (cleared when that player's message lands: ui/threads.js)
let typingSentAt = 0
let typingSent = 0
let typingTimer = 0
export function canType(t) { return Boolean(t && !t.quad && (t.kind === 'dm' || (t.kind === 'group' && (t.members || 1) <= TYPING_MAX))) }
// Call on every keystroke: it decides whether a signal goes.
export function typing(threadId) {
  const t = threadOf(threadId)
  const now = Date.now()
  if (!canType(t) || !live() || now - typingSentAt < TYPING_GAP) return false
  typingSentAt = now
  typingSent += 1
  const extra = { ty: threadId, n: String(profile?.p_name || 'Student').split(' ')[0].slice(0, 16) }
  nudge(t.kind === 'group' ? threadId : '', t.kind === 'dm' && t.peer?.id ? [t.peer.id] : [], extra)
  return true
}
function noteTyping(p) {
  const t = threadOf(p.ty)
  if (!canType(t) || !p.f || p.f === myId()) return
  typingNow.set(p.ty, { id: p.f, name: filterText(String(p.n || '')).text || 'Someone', until: Date.now() + TYPING_SHOWN })
  emit('typing', p.ty)
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => { for (const [id, v] of typingNow) if (v.until <= Date.now()) { typingNow.delete(id); emit('typing', id) } }, TYPING_SHOWN + 50)
}
// Who is typing in this thread right now ('' if nobody).
export function typingIn(threadId) {
  const v = typingNow.get(threadId)
  if (!v || v.until <= Date.now()) return ''
  // (their message has landed: they are not typing it any more)
  const last = cache.get(threadId)?.lines?.at(-1)
  if (last && last.sender === v.id && Date.parse(last.at) > v.until - TYPING_SHOWN - 500) { typingNow.delete(threadId); return '' }
  return v.name
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
    if (error || !data?.ok) {
      // (no longer a member: the creator removed you, or the group closed. It leaves this phone at once.)
      if (data?.reason === 'not_member' && threads.some((t) => t.id === id)) {
        threads = threads.filter((t) => t.id !== id)
        cache.delete(id)
        emit('list', { gone: [id] })
        return false
      }
      emit('lines', id)
      return false
    }
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
    else if (String(id).startsWith('p:')) side.set(id, { ...fromServer, unread: 0, quad: true }) // (quad: no group page for it)
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

// ---------- Groups (Social A) ----------
const GROUP_WHY = {
  word: 'That name isn’t allowed. Pick another.', name: 'Pick another name for the group.', today: 'You’ve made 3 groups today. Try again tomorrow.',
  too_many: 'That’s the limit for now. Try again tomorrow.', full: 'This group is full (40 members).', unknown: 'They haven’t opened their chat yet.',
  blocked: 'You can’t add this player.', already: 'They’re already in the group.', not_member: 'You’re not in this group.', not_creator: 'Only the person who made the group can change the topic.',
  cant: 'They can’t right now.', removed: 'You can’t join this group.', gone: 'That invite has gone.',
  soon: 'Groups open soon.', offline: 'Couldn’t reach the chat. Check your connection.',
}
const why = (error, data) => GROUP_WHY[error || data?.reason] || GROUP_WHY.offline
async function act(fn, args) {
  if (!live()) return { ok: false, note: GROUP_WHY.offline }
  const { data, error } = await rpc(fn, args)
  if (error || !data?.ok) return { ok: false, reason: error || data?.reason, note: why(error, data) }
  return { ok: true, data }
}
// (src/board.js: the Board, follow, the Feed and interests go through the same door)
export const chatCall = act
// Make a group (the name passes engine/groupname.js first: the filter and handle_blocklist.json).
export async function createGroup(name, topic = '') {
  if (!groupNameOk(name)) return { ok: false, note: GROUP_WHY.name }
  const res = await act('chat_group_create', { p_name: String(name).trim(), p_topic: String(topic || '').trim() })
  if (!res.ok) return res
  await sync()
  return { ok: true, thread: res.data.thread }
}
// Add someone to a group you are in. A friend both ways goes straight in ({ ok, added: true }); anyone else gets a
// card to answer ({ ok, added: false }): nobody lands in a group they did not agree to. What became of an ask comes
// back on a later sync as 'answers' ("added" or "can't right now", nothing more).
export async function addToGroup(threadId, otherId) {
  const res = await act('chat_group_add', { p_thread: threadId, p_other: otherId })
  if (res.ok) { nudge(threadId, res.data.to || []); sync() }
  return res.ok ? { ok: true, added: Boolean(res.data.added) } : res
}
// Answer an ask: Join (true) or No thanks. { ok, thread } when you joined.
export async function answerAsk(askId, yes) {
  asks = asks.filter((a) => a.id !== askId)
  emit('list')
  const res = await act('chat_group_answer', { p_ask: askId, p_yes: Boolean(yes) })
  nudge(res.data?.thread || '', res.data?.to || []) // (the asker's phone hears at once)
  if (res.ok && res.data.thread) await sync()
  return res.ok ? { ok: true, thread: res.data.thread || '' } : res
}
// The creator: take a member out (the link will not let them back), rename the group.
export async function removeMember(threadId, otherId) {
  const res = await act('chat_group_remove', { p_thread: threadId, p_other: otherId })
  if (res.ok) { nudge(threadId, res.data.to || []); sync() }
  return res
}
export async function renameGroup(threadId, name) {
  if (!groupNameOk(name)) return { ok: false, note: GROUP_WHY.name }
  const res = await act('chat_group_rename', { p_thread: threadId, p_name: String(name).trim() })
  if (res.ok) { const t = threadOf(threadId); if (t) t.name = filterText(res.data.name).text || t.name; emit('list'); nudge(threadId) }
  return res
}
export async function groupMembers(threadId) {
  const res = await act('chat_group_members', { p_thread: threadId })
  return res.ok ? res.data.members.map((m) => ({ ...m, name: filterText(String(m.name || 'Student')).text || 'Student' })).filter((m) => !blocked.has(m.id)) : []
}
export async function leaveGroup(threadId) {
  const res = await act('chat_group_leave', { p_thread: threadId })
  if (res.ok) { threads = threads.filter((t) => t.id !== threadId); cache.delete(threadId); emit('list', { gone: [threadId] }); nudge(threadId) }
  return res
}
export async function muteThread(threadId, on) {
  const res = await act('chat_mute', { p_thread: threadId, p_on: Boolean(on) })
  if (res.ok) { const t = threadOf(threadId); if (t) t.muted = Boolean(on); emit('list') }
  return res
}
export async function setTopic(threadId, topic) {
  const clean = cleanMessage(String(topic || '').slice(0, 120))
  if (clean.blocked) return { ok: false, note: WHY.word }
  const res = await act('chat_set_topic', { p_thread: threadId, p_topic: clean.text })
  if (res.ok) { const t = threadOf(threadId); if (t) t.topic = clean.text; emit('list'); nudge(threadId) }
  return res
}
// The WhatsApp invite: a wa.me link with a short message and the game link carrying the group's code.
export const groupLink = (code) => `https://${PUBLIC_URL}/?g=${encodeURIComponent(code)}`
export async function inviteLink(threadId) {
  const res = await act('chat_group_invite', { p_thread: threadId })
  if (!res.ok) return res
  const t = threadOf(threadId)
  const url = groupLink(res.data.code)
  const text = `Join “${t?.name || 'my group'}” on Soft Life. House chat is waiting: ${url}`
  return { ok: true, url, text, wa: `https://wa.me/?text=${encodeURIComponent(text)}` }
}
// A newcomer (or anyone) who opened the game through an invite link: the code waits on the phone (main.js
// keeps ?g= in mzansiville.groupInvite) and is used once the chat is up, after the quick start.
export async function joinByCode(code) {
  const res = await act('chat_group_join', { p_code: String(code || '').toLowerCase().slice(0, 16) })
  if (!res.ok) return res
  await sync()
  nudge(res.data.thread)
  return { ok: true, thread: res.data.thread }
}

// ---------- Friends (Social A) ----------
// who: what this phone knows of them ({ name, handle, look, house }), shown until the server answers.
export async function addFriend(id, who = {}) {
  if (!id || blocked.has(id)) return { ok: false }
  if (!isFriend(id)) { friends = friends.concat({ id, name: who.name || 'Student', handle: who.handle || '', house: who.house || '', look: who.look || {}, online: true }); emit('list') }
  const res = await act('chat_friend', { p_other: id, p_on: true })
  // (they have not opened their chat yet: they stay on this phone's list and are sent again later)
  if (res.ok) sync()
  return res
}
export async function removeFriend(id) {
  friends = friends.filter((f) => f.id !== id)
  emit('list')
  return act('chat_friend', { p_other: id, p_on: false })
}
// "{name} just joined": the server lets a player announce themselves once, ever.
export async function mayAnnounce() { return (await act('chat_joined', {})).ok }

// Tests: a nudge as if it had come over Realtime (the test server has no Realtime; a typing signal is one).
window.mzansiNudge = (p) => nudged(p || {})
// Tests (read only): what this phone's chat holds.
window.mzansiThreads = () => ({
  status, open: openId, unread: unreadTotal(), live: started,
  typingSent, typing: Object.fromEntries([...typingNow].filter(([, v]) => v.until > Date.now()).map(([k, v]) => [k, v.name])),
  social, socialB, interests, followers, room: roomSent, asks: asks.map((a) => ({ id: a.id, thread: a.thread, group: a.group, from: a.from })), friends: friends.map((f) => ({ id: f.id, name: f.name, online: f.online, mutual: Boolean(f.mutual) })),
  threads: threads.map((t) => ({ id: t.id, kind: t.kind, name: t.name, topic: t.topic, unread: t.unread, last: t.last?.body || '', muted: Boolean(t.muted), quad: Boolean(t.quad), members: t.members, code: t.code || '', flame: Number(t.flame) || 0 })),
  lines: openId ? linesOf(openId).lines.map((l) => ({ id: l.id, me: l.sender === myId(), sender: l.sender, body: l.body })) : [],
})
