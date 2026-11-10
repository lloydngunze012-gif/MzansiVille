import { cleanChat, filterText } from './engine/filter.js'
import { isHidden, onSay, sendSay, whereAmI } from './presence.js'

// Piece 3, chat between players: local, like talking. What you say goes over the
// presence channel (presence.js sendSay) with where you stood; a phone keeps it only if
// its own player was within 15 m. It shows as a speech bubble over the speaker's head
// for 8 seconds (world/bubbles.js) and in a small log (ui/chat.js). Every message is
// filtered when sent and again when shown: a slur blocks it; phone numbers, links and
// social handles are taken out, saying why. Blocked players are never heard.

export const HEAR = 15 // metres
export const BUBBLE_MS = 8000
export const QUICK = ['Howzit! 👋', 'Sharp sharp', 'Where you headed?', 'Wanna grab food?', 'Study together?', 'Lekker vibes 🔥', 'Eish 😅', 'Shap, later!']
const KEEP = 60 // log lines kept
const GAP = 1200 // ms between your messages
const PER_MINUTE = 12

const log = [] // { id: 'me' | presence id, name, num, text, t, me }
const listeners = new Set()
let stamps = []

function push(entry) {
  log.push(entry)
  if (log.length > KEEP) log.splice(0, log.length - KEEP)
  for (const fn of listeners) fn(entry)
}

// Something new was said (yours or someone's within earshot): fn(entry).
export function onChat(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
// The log as it shows: oldest first, never anyone you've blocked.
export function chatLog() {
  return log.filter((m) => m.me || !isHidden(m.id))
}
// What someone said lately (for a report), newest last.
export function saidBy(id, n = 5) {
  return log.filter((m) => m.id === id).slice(-n).map((m) => m.text)
}

// Say something. Returns { ok, text, note }: note says why something was taken out, or
// why nothing was sent.
export function say(raw) {
  const res = cleanChat(raw)
  if (res.blocked) return { ok: false, note: 'That word isn’t allowed here. Nothing was sent.' }
  if (!res.text) return { ok: false, note: res.removed.length ? `${res.removed.join(' ')} Nothing left to send.` : '' }
  const now = Date.now()
  stamps = stamps.filter((t) => now - t < 60000)
  if (stamps.length && now - stamps[stamps.length - 1] < GAP) return { ok: false, note: 'Slow down a little.' }
  if (stamps.length >= PER_MINUTE) return { ok: false, note: 'That’s a lot of messages. Wait a minute.' }
  stamps.push(now)
  const heard = sendSay(res.text)
  push({ id: 'me', name: 'You', text: res.text, t: now, me: true })
  window.dispatchEvent(new CustomEvent('mzansi-said')) // (counted for the weekly leaderboard: main.js)
  return { ok: true, text: res.text, heard, note: res.removed.join(' ') }
}

// Someone else said something: kept if you were within earshot (and they're not blocked).
onSay((m) => {
  const here = whereAmI()
  if (here.a !== 'campus' || isHidden(m.i)) return
  if (!(Math.hypot((m.x || 0) - here.x, (m.z || 0) - here.z) <= HEAR)) return
  const res = cleanChat(m.text)
  if (res.blocked || !res.text) return
  const handle = /^[a-z0-9_]{3,20}$/.test(m.h || '') ? m.h : ''
  push({ id: m.i, name: filterText(String(m.n || 'Student').slice(0, 24)).text || 'Student', handle, num: String(m.s || ''), text: res.text, t: Date.now(), me: false })
})

// Tests (read only): the log this phone shows.
window.mzansiChat = () => chatLog().map((m) => ({ id: m.id, name: m.name, text: m.text, me: m.me }))
