import { getClient } from './net.js'
import { filterText } from './engine/filter.js'

// Presence: the other real students on campus (retention spec, item 1).
// One Supabase Realtime channel per campus. Every player broadcasts where they stand,
// which way they face and what they're doing a few times a second while they move
// (and a heartbeat every 2 s while still); everyone else draws them, interpolated
// (src/world/others.js). Realtime presence tells us when someone's connection drops;
// a goodbye on closing the tab, and a 7 s silence, cover the rest, so a closed tab is
// gone for everyone within 10 s. No polling, no database writes.

const params = new URLSearchParams(location.search)
// ?room=<name> picks the channel (tests use their own). Automated tests without one
// never join: they'd walk about on the live campus.
const BASE = params.get('room') || (navigator.webdriver ? '' : 'campus')
// A room holds at most 40 players (owner, 9 Nov: Supabase Realtime and a phone's drawing both have a limit). The 41st
// player lands in campus-2, the next in campus-3. ?roomcap=<n> lowers it for tests.
const CAP = Math.max(1, Number(params.get('roomcap')) || 40)
let roomNo = 1
const roomName = () => (roomNo === 1 ? BASE : `${BASE}-${roomNo}`)
const ROOM = BASE // (is there a campus to join at all)
const RATE = 250 // ms between updates while moving: 4 a second (while few are online)
// Supabase's free plan carries 100 messages a second for the whole project, and every
// delivery counts: with n players each update goes to n - 1 phones. Updates slow down
// as the campus fills, to stay inside this budget (4 a second up to 4 players, 2 a
// second at 6, 1 a second at 9).
const BUDGET = 70
const KEEP = 2000 // a heartbeat while standing still
const GONE = 7000 // heard nothing for this long: they've gone (well within 10 s)
const META_EVERY = 5000 // the name and look ride along this often (and on a hello)
// ?bye=0: leave without saying goodbye (tests the silent drop, as a phone killing a tab)
const SAY_BYE = params.get('bye') !== '0'

const peers = new Map() // id -> { id, meta, snaps: [{t, x, z, y, h, p}], off, heard, area }
const hidden = new Set() // players you reported: never drawn, their pokes ignored
export function hidePlayer(id) { if (id) hidden.add(id) }
const listeners = new Set()
let channel = null
let live = false
let me = null // { id, num }
let meta = null // { n: name, s: student number, k: look }
let local = { a: 'away' }
let lastSent = 0
let lastMeta = 0
let lastSig = ''
let joinedAt = 0
let replyDue = 0
let started = false
let lastCount = -1

// Who this phone is on the channel. The student number is a stand-in until enrolment
// (item 3) issues real ones from the server; it keeps the 26 + six digits look.
function identity() {
  const key = 'mzansiville.presence'
  // (secret: proves to Supabase that a card is this phone's own; never broadcast)
  const token = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`)
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    if (saved?.id && saved?.num) {
      if (!saved.secret) { saved.secret = token(); localStorage.setItem(key, JSON.stringify(saved)) }
      return saved
    }
  } catch { /* storage blocked: a fresh one for this visit */ }
  const id = token().slice(0, 36)
  const num = `26${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`
  const made = { id, num, secret: token() }
  try { localStorage.setItem(key, JSON.stringify(made)) } catch { /* fine */ }
  return made
}

export function myNumber() {
  if (!me) me = identity()
  return me.num
}
export function myIdentity() {
  if (!me) me = identity()
  return me
}

// Join (or update who you are: a new name, look or card is sent at once).
// card: the compact player card (cards.js) others see when they tap you.
export function joinPresence(character, card = null) {
  if (!character) return
  if (!me) me = identity()
  const next = { n: String(character.name || 'Student').slice(0, 24), s: me.num, k: character.avatar || {}, h: character.residence || '', c: card }
  const changed = JSON.stringify(next) !== JSON.stringify(meta)
  meta = next
  if (changed) lastMeta = 0
  if (started) return
  started = true
  if (!ROOM) return
  connect()
  setInterval(pump, 100)
  addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', () => {
    // A phone that switches apps isn't on campus: gone at once, back with a hello (into the first room with space).
    if (document.hidden) leave()
    else if (!channel) { roomNo = 1; connect() }
  })
}

async function connect() {
  const client = await getClient()
  if (!client || channel) return
  const ch = client.channel(`presence:${roomName()}`, { config: { broadcast: { self: false }, presence: { key: me.id } } })
  channel = ch
  let accepted = false
  let probed = false
  // Who is in this room, oldest first: [[id, since]]. A joiner decides after the first sync: if 40 are
  // already here, go to the next room; after joining, if a race left more than 40, the youngest ones move on.
  const members = () => Object.entries(ch.presenceState()).map(([key, metas]) => [key, Math.min(...metas.map((m) => Number(m.t) || Infinity))])
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
  const nextRoom = () => {
    if (channel !== ch) return
    roomNo += 1
    channel = null
    live = false
    peers.clear()
    notify()
    client.removeChannel(ch)
    connect()
  }
  const accept = () => {
    accepted = true
    live = true
    joinedAt = Date.now()
    lastMeta = 0
    ch.track({ i: me.id, t: joinedAt }).catch(() => {})
    ch.send({ type: 'broadcast', event: 'hello', payload: { i: me.id } }).catch(() => {})
    send(true)
    // (after the others have heard us: a race that left 41 sends the last to arrive on)
    setTimeout(() => {
      if (channel !== ch) return
      const list = members()
      const rank = list.findIndex(([id]) => id === me.id)
      if (rank >= CAP) nextRoom()
    }, 1500)
  }
  const probe = () => {
    if (probed || channel !== ch) return
    probed = true
    const others = members().filter(([id]) => id !== me.id).length
    if (others >= CAP) nextRoom()
    else accept()
  }
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => { if (accepted) heard(payload) })
    .on('broadcast', { event: 'hello' }, ({ payload }) => {
      if (accepted && payload?.i && payload.i !== me.id) { lastMeta = 0; replyDue = Date.now() + 100 + Math.random() * 300 }
    })
    .on('broadcast', { event: 'bye' }, ({ payload }) => drop(payload?.i))
    .on('broadcast', { event: 'poke' }, ({ payload }) => { if (payload?.to === me.id && payload.from !== me.id && !hidden.has(payload.from)) for (const fn of pokeListeners) fn(payload) })
    .on('broadcast', { event: 'say' }, ({ payload }) => { if (payload?.i && payload.i !== me.id && !hidden.has(payload.i) && typeof payload.text === 'string') for (const fn of sayListeners) fn(payload) })
    .on('presence', { event: 'sync' }, probe)
    .on('presence', { event: 'leave' }, ({ key }) => drop(key))
    .subscribe((status) => {
      if (channel !== ch) return
      if (status === 'SUBSCRIBED') {
        // (the first sync normally follows at once; if it does not, decide on what is known after a second)
        setTimeout(probe, 1000)
      } else if (accepted) live = false
    })
}

function leave() {
  const ch = channel
  if (!ch) return
  if (live && SAY_BYE) ch.send({ type: 'broadcast', event: 'bye', payload: { i: me.id } }).catch(() => {})
  live = false
  channel = null
  peers.clear()
  notify()
  // (after the goodbye has gone out)
  setTimeout(() => getClient().then((client) => client?.removeChannel(ch)), SAY_BYE ? 150 : 0)
}

function heard(m) {
  if (!m?.i || m.i === me?.id) return
  const now = Date.now()
  let peer = peers.get(m.i)
  if (!peer) {
    peer = { id: m.i, meta: null, snaps: [], off: now - m.t, heard: now, area: m.a }
    peers.set(m.i, peer)
  }
  if (m.m) peer.meta = { name: filterText(m.m.n || 'Student').text || 'Student', num: String(m.m.s || ''), look: m.m.k || {}, house: String(m.m.h || ''), card: m.m.c || null }
  // Their clock against ours: the smallest gap seen is the truest (it drifts up slowly).
  const gap = now - m.t
  peer.off = gap < peer.off ? gap : peer.off + (gap - peer.off) * 0.02
  peer.heard = now
  peer.area = m.a
  if (m.a === 'campus') {
    const last = peer.snaps[peer.snaps.length - 1]
    if (!last || m.t > last.t) peer.snaps.push({ t: m.t, x: m.x, z: m.z, y: m.y || 0, h: m.h || 0, p: m.p || 'stand' })
    if (peer.snaps.length > 30) peer.snaps.splice(0, peer.snaps.length - 30)
  } else peer.snaps.length = 0
  notify()
}

function drop(id) {
  if (!id || !peers.has(id)) return
  peers.delete(id)
  notify()
}

// The scene says where you are, every frame it draws ({ a: 'campus', x, z, y, h, p }),
// or { a: 'away' } (the morning, a lecture, a room off the map, another screen).
export function reportLocal(state) {
  local = state
}

function round(v, k = 100) { return Math.round((v || 0) * k) / k }

function send(force) {
  if (!channel || !live || !meta) return
  const now = Date.now()
  const msg = { i: me.id, t: now, a: local.a }
  if (local.a === 'campus') Object.assign(msg, { x: round(local.x), z: round(local.z), y: round(local.y), h: round(local.h), p: local.p })
  if (now - lastMeta >= META_EVERY) { msg.m = meta; lastMeta = now }
  lastSent = now
  lastSig = sig()
  channel.send({ type: 'broadcast', event: 'pos', payload: msg }).catch(() => {})
}

// How often to send while moving, for the number online now.
function rate() {
  const n = Math.max(2, onlineCount())
  return Math.min(1500, Math.max(RATE, (1000 * n * (n - 1)) / BUDGET))
}

function sig() {
  return local.a === 'campus' ? `${round(local.x, 20)}|${round(local.z, 20)}|${round(local.h, 10)}|${local.p}|${round(local.y, 20)}` : local.a
}

function pump() {
  const now = Date.now()
  if (live) {
    const moved = sig() !== lastSig
    if ((moved && now - lastSent >= rate()) || now - lastSent >= KEEP || (replyDue && now >= replyDue)) {
      replyDue = 0
      send()
    }
  }
  let changed = false
  for (const [id, peer] of peers) if (now - peer.heard > GONE) { peers.delete(id); changed = true }
  if (changed) notify()
}

function notify() {
  const n = onlineCount()
  if (n !== lastCount) {
    lastCount = n
    const label = countLabel()
    for (const el of document.querySelectorAll('[data-online]')) { el.textContent = label; el.title = `${n} student${n === 1 ? '' : 's'} on campus` }
  }
  for (const fn of listeners) fn()
}

// Everyone online right now, you included (once you're connected).
export function onlineCount() {
  let n = 0
  for (const peer of peers.values()) if (peer.meta) n += 1
  return n + (started ? 1 : 0)
}
export function countLabel() {
  const n = Math.max(1, onlineCount())
  return `${n} on campus`
}
// Someone did something to you (Piece 1a: wave, hi, friend): { from, kind, name }.
const pokeListeners = new Set()
export function onPoke(fn) {
  pokeListeners.add(fn)
  return () => pokeListeners.delete(fn)
}
export function sendPoke(to, kind) {
  if (!channel || !live || !meta) return false
  channel.send({ type: 'broadcast', event: 'poke', payload: { to, from: me.id, kind, name: meta.n, num: meta.s } }).catch(() => {})
  return true
}
// Piece 3, chat: a message goes out on the channel with where you stood when you said
// it; each phone keeps only what was said within 15 m of its own player (chat.js).
// { i, t, x, z, text, n: name, s: number }
const sayListeners = new Set()
export function onSay(fn) {
  sayListeners.add(fn)
  return () => sayListeners.delete(fn)
}
export function sendSay(text) {
  if (!channel || !live || !meta || local.a !== 'campus') return false
  channel.send({ type: 'broadcast', event: 'say', payload: { i: me.id, t: Date.now(), x: round(local.x), z: round(local.z), text: String(text).slice(0, 120), n: meta.n, s: meta.s, h: meta.c?.handle || '' } }).catch(() => {})
  return true
}
// Where this phone's player is (what the scene last reported).
export function whereAmI() { return local }
export function isHidden(id) { return hidden.has(id) }

// What presence knows about someone (their name, number, look, house, card), or null.
export function peerMeta(id) {
  return peers.get(id)?.meta || null
}

export function onPresence(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
// Connected and the people already here have had a moment to answer the hello.
export function settled() {
  return live && Date.now() - joinedAt > 1200
}
export function connected() { return live }
export function presenceRoom() { return roomName() }

// The real students on the campus map, each placed where they were a moment ago (in
// their own clock), between the two updates either side of that moment.
export function peersOnCampus() {
  const now = Date.now()
  const out = []
  const step = rate()
  const delay = step + 100 // 350 ms behind at 4 updates a second
  for (const peer of peers.values()) {
    if (peer.area !== 'campus' || !peer.meta || !peer.snaps.length || hidden.has(peer.id)) continue
    out.push({ id: peer.id, meta: peer.meta, ...sample(peer.snaps, now - peer.off - delay, step) })
  }
  return out
}

function lerpAngle(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * k
}

function sample(snaps, t, step) {
  const first = snaps[0]
  const last = snaps[snaps.length - 1]
  if (t <= first.t) return { x: first.x, z: first.z, y: first.y, h: first.h, p: first.p }
  if (t >= last.t) return { x: last.x, z: last.z, y: last.y, h: last.h, p: last.p }
  let i = snaps.length - 2
  while (i > 0 && snaps[i].t > t) i--
  const a = snaps[i]
  const b = snaps[i + 1]
  // A long gap means they stood still, then set off: the step starts at most one
  // update before the new one, never spread over the whole quiet spell.
  const from = Math.max(a.t, b.t - step * 1.2)
  if (t <= from) return { x: a.x, z: a.z, y: a.y, h: a.h, p: a.p }
  const k = (t - from) / (b.t - from)
  // A jump of more than 8 m between updates is a respawn: no gliding across campus.
  if (Math.hypot(b.x - a.x, b.z - a.z) > 8) return { x: b.x, z: b.z, y: b.y, h: b.h, p: b.p }
  const near = k < 0.5 ? a : b
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: near.y, h: lerpAngle(a.h, b.h, k), p: near.p }
}

// Tests (read only): who's here and what this phone sees of them.
window.mzansiPresence = () => ({
  room: roomName(),
  base: BASE,
  cap: CAP,
  live,
  rate: rate(),
  me: me && { id: me.id, num: me.num },
  count: onlineCount(),
  label: countLabel(),
  peers: [...peers.values()].map((p) => ({ id: p.id, name: p.meta?.name, num: p.meta?.num, area: p.area, heard: Date.now() - p.heard, snaps: p.snaps.length })),
})
