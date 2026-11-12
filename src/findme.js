// Social C (owner, 11 Nov): find me, and suggested groups.
//   Find me: once a visit, at a calm moment, a small card asks "Let friends find you today? Only your spot in the
//   game, never your real location." Off unless you say yes; it lasts that day; the menu turns it off. While it is
//   on, this phone tells the server where you stand in the game (a district and a spot on its map) every so often.
//   Who sees it is decided on the server: friends both ways, online, never past a block (supabase/chat.sql).
//   When a friend who shares comes online you get "Emma is on campus. Go to her / Say hi", at most once per friend
//   per visit; the Friends tab has "Go to" beside friends who share.
//   Go to: walks you to them and stops 2 m short. Same district: the guided walk. Another district: a taxi (the
//   fare as usual), then the walk. A tap on the world ends it.
//   Suggested groups: at most once a day the server offers one open group that matches your interests:
//   "[Group] ([N] members) is talking [interest]. Join / Not now." Not now: not that group again for 7 days.
// Nothing here ever asks the phone for its real location.
import './ui/findme.css'
import { LOTS, PARTS, partAt } from './city/plan.js'
import { calm } from './launch.js'
import { peerAt, whereAmI } from './presence.js'
import { answerSuggestion, findMeOn, groupSuggestion, onThreads, reportGroup, sendSpot, setFindMe, sharingFriends, socialCReady, sync } from './threads.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const first = (name) => String(name || 'Student').split(' ')[0]
const params = new URLSearchParams(location.search)
// (tests shorten the waits: ?findwait=<seconds>)
const WAIT = Math.max(0.2, Number(params.get('findwait')) || 8) * 1000
// (automation: the cards stay away unless the test asks for them with ?findwait=, like the other switches;
// sharing a spot and Go to work either way)
const cardsOn = !navigator.webdriver || params.has('findwait')
// (never on top of another small card that sits in the same place: the wake-up, an ask, a join toast, a new message)
const roomForCard = () => cardsOn && !card && !document.querySelector('.fm-card, .cht-wake, .cht-ask, .jt-toast, .cht-ping:not([hidden]), .sl-pop')
const FENCE = 104 // (the campus fence: inside it is the campus, past it SunnyBay's Campus district)
let api = { toast: () => {} }
let started = false
let startedAt = 0

// ---------- where you are in the game ----------
// { part, x, z, in }: part is 'campus' (inside the fence), 'gate' (SunnyBay's Campus district, outside it), or a
// district of SunnyBay; in: the place you are inside ('caf', a SunnyBay place's id), if any.
let lastCampus = { x: 0, z: 90 }
export function myPlace() {
  const here = whereAmI() || {}
  const city = document.body.dataset.city === '1'
  if (document.body.dataset.caf === '1') return { scene: 'caf', part: 'campus', x: lastCampus.x, z: lastCampus.z, in: 'caf' }
  if (city) {
    const inside = document.body.dataset.cityPlace || ''
    const lot = inside ? LOTS.find((l) => l.id === inside) : null
    const x = lot ? lot.door.x : Number(here.x)
    const z = lot ? lot.door.z : Number(here.z)
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null
    const part = lot ? lot.part : partAt(x, z).id
    return { scene: 'city', part: part === 'campus' ? 'gate' : part, x, z, in: inside }
  }
  if (here.a !== 'campus' || !Number.isFinite(here.x) || !Number.isFinite(here.z)) return document.body.dataset.world === '1' ? { scene: 'campus', part: 'campus', x: lastCampus.x, z: lastCampus.z, in: '' } : null
  lastCampus = { x: here.x, z: here.z }
  return { scene: 'campus', part: 'campus', x: here.x, z: here.z, in: '' }
}
const partName = (part) => (part === 'campus' ? 'on campus' : part === 'gate' ? 'by the campus gate' : `in ${PARTS.find((p) => p.id === part)?.name || 'SunnyBay'}`)
// "her", "him" or "them": from the look the player chose for their own student.
const pronoun = (look) => (look?.gender === 'female' ? 'her' : look?.gender === 'male' ? 'him' : 'them')

// ---------- telling the server where you stand (only while you share) ----------
let sent = null
let sentAt = 0
function shareTick() {
  if (!socialCReady() || !findMeOn() || document.hidden) return
  const at = myPlace()
  if (!at) return
  const now = Date.now()
  const moved = !sent || sent.part !== at.part || sent.in !== at.in || Math.hypot(sent.x - at.x, sent.z - at.z) > 4
  if (now - sentAt < 12000 || (!moved && now - sentAt < 45000)) return
  sent = at
  sentAt = now
  sendSpot(at.part, at.x, at.z, at.in)
}

// ---------- one small card at a time ----------
let card = null
let cardTimer = 0
function closeCard() { clearTimeout(cardTimer); card?.remove(); card = null }
function showCard(kind, html, onClick, ms = 20000) {
  closeCard()
  card = document.createElement('section')
  card.className = 'fm-card'
  card.dataset.fm = kind
  card.setAttribute('role', 'status')
  card.innerHTML = html
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) card.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  card.addEventListener('click', (event) => { const k = event.target.closest('[data-fm-act]')?.dataset.fmAct; if (k) onClick(k, event.target.closest('[data-fm-act]')) })
  document.body.append(card)
  cardTimer = setTimeout(closeCard, ms)
}

// ---------- "Let friends find you today?" ----------
let asked = false
function maybeAsk() {
  if (asked || !roomForCard() || !socialCReady() || findMeOn() || Date.now() - startedAt < WAIT || !calm()) return
  asked = true
  showCard('ask', `<p><b>Let friends find you today?</b><span>Only your spot in the game, never your real location.</span></p>
    <div class="fm-row"><button type="button" class="fm-yes" data-fm-act="yes">Yes</button><button type="button" class="fm-no" data-fm-act="no">Not now</button></div>`, async (k) => {
    closeCard()
    if (k !== 'yes') return
    const res = await setFindMe(true)
    if (res.ok) { sentAt = 0; shareTick(); api.toast('Friends can find you today. Turn it off in the menu any time.') } else api.toast(res.note || 'Couldn’t turn that on right now.')
  }, 30000)
}
// The menu's switch (main.js).
export async function toggleFindMe() {
  const res = await setFindMe(!findMeOn())
  if (res.ok) { sentAt = 0; shareTick(); api.toast(findMeOn() ? 'Friends can find you today.' : 'Friends can’t see where you are now.') } else api.toast(res.note || 'Couldn’t change that right now.')
  return res.ok
}

// ---------- a friend who shares has arrived ----------
const told = new Set() // friends this visit has already been told about
const waiting = []
let firstLook = true
function noteFriends() {
  const here = sharingFriends()
  for (const f of here) {
    if (told.has(f.id)) continue
    told.add(f.id)
    // (your own arrival: one friend who is already about, not a toast for each)
    if (firstLook && waiting.length) continue
    waiting.push(f.id)
  }
  if (socialCReady()) firstLook = false
}
function maybeTell() {
  if (!roomForCard() || !waiting.length || !calm()) return
  const f = sharingFriends().find((x) => x.id === waiting[0])
  waiting.shift()
  if (!f) return
  const who = esc(first(f.name))
  showCard('here', `<p><b>${who} is ${esc(partName(f.spot.part))}.</b></p>
    <div class="fm-row"><button type="button" class="fm-yes" data-fm-act="go">Go to ${pronoun(f.look)}</button><button type="button" class="fm-no" data-fm-act="hi">Say hi</button><button type="button" class="fm-x" data-fm-act="x" aria-label="Close">✕</button></div>`, (k) => {
    closeCard()
    if (k === 'go') goTo(f.id)
    else if (k === 'hi') window.dispatchEvent(new CustomEvent('mzansi-open-threads', { detail: { dm: f.id, who: { name: f.name, handle: f.handle || '' } } }))
  }, 12000)
}

// ---------- Go to ----------
let goal = null // { id, name, timer, last: { x, z } the spot last walked for, sentAt, phase, ticks, stillFor }
const send = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }))
function stopGoing(text) {
  if (!goal) return
  clearInterval(goal.timer)
  window.removeEventListener('pointerdown', onTouch, true)
  goal = null
  document.body.removeAttribute('data-find-going')
  if (text) api.toast(text)
}
// (a tap on the world is you taking over)
function onTouch(event) { if (event.target?.tagName === 'CANVAS') stopGoing() }
export function goTo(id) {
  const f = sharingFriends().find((x) => x.id === id)
  if (!f) { api.toast('They are not sharing where they are right now.'); return false }
  stopGoing()
  goal = { id, name: first(f.name), last: null, sentAt: 0, ticks: 0, phase: '', seen: f.spot, timer: setInterval(goTick, 700) }
  document.body.dataset.findGoing = id
  window.addEventListener('pointerdown', onTouch, true)
  api.toast(`Going to ${goal.name}…`)
  goTick()
  return true
}
// Where they are right now: from the room you share if they are in it (live), else what the server last said.
function whereIs(id, me) {
  const f = sharingFriends().find((x) => x.id === id)
  if (!f) return null
  const p = peerAt(id)
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && me && (me.part === 'campus' || me.part === 'gate') && (f.spot.part === 'campus' || f.spot.part === 'gate') && !f.spot.in) {
    return { part: Math.hypot(p.x, p.z) < FENCE ? 'campus' : 'gate', x: p.x, z: p.z, in: '' }
  }
  if (p && Number.isFinite(p.x) && me && me.part === f.spot.part && !f.spot.in && me.scene === 'city') return { part: f.spot.part, x: p.x, z: p.z, in: '' }
  return f.spot
}
function goTick() {
  if (!goal) return
  goal.ticks += 1
  if (goal.ticks > 430) { stopGoing(`Couldn’t reach ${goal.name}.`); return } // (five minutes)
  if (goal.ticks % 12 === 0) sync() // (their spot, fresh from the server, every eight seconds or so)
  const me = myPlace()
  if (!me) return
  const t = whereIs(goal.id, me)
  if (!t) { stopGoing(`${goal.name} stopped sharing.`); return }
  const now = Date.now()
  const same = me.part === t.part && !me.in
  const dist = Math.hypot(t.x - me.x, t.z - me.z)
  // there: within a few steps, 2 m short of them
  if (same && dist <= 3) { stopGoing(`You found ${goal.name}.`); return }
  // 2 m short of them, on the line from you to them
  const k = dist > 2.2 ? (dist - 2) / dist : 0
  let spot = { x: me.x + (t.x - me.x) * k, z: me.z + (t.z - me.z) * k }
  // Not getting any nearer (a wall or a table is where "2 m short" falls, or the walk could not start): try the
  // other spots 2 m round them, one after the other; after a good few, say so and stop.
  const moved = goal.at ? Math.hypot(goal.at.x - me.x, goal.at.z - me.z) : 1
  goal.at = { x: me.x, z: me.z }
  goal.still = same && moved < 0.15 ? (goal.still || 0) + 1 : 0
  let retry = false
  if (goal.still >= 5) {
    goal.still = 0
    goal.alt = (goal.alt || 0) + 1
    if (goal.alt > 8) { stopGoing(`Couldn’t get any closer to ${goal.name}.`); return }
    retry = true
  }
  if (goal.alt) { const a = Math.atan2(me.x - t.x, me.z - t.z) + Math.ceil(goal.alt / 2) * (goal.alt % 2 ? 1 : -1) * (Math.PI / 4); spot = { x: t.x + Math.sin(a) * 2, z: t.z + Math.cos(a) * 2 } }
  const movedOn = retry || !goal.last || Math.hypot(goal.last.x - t.x, goal.last.z - t.z) > 2.5
  const stale = now - goal.sentAt > 6000
  if (me.scene === 'caf') { if (stale) { goal.sentAt = now; send('mzansi-exit-caf') } return }
  if (same) {
    // the same district: the guided walk
    if (!movedOn && !stale) return
    goal.last = { x: t.x, z: t.z }
    goal.sentAt = now
    if (me.scene === 'campus') send('mzansi-walk-xz', { x: spot.x, z: spot.z })
    else if (goal.alt) send('mzansi-city-walk', { x: spot.x, z: spot.z })
    else send('mzansi-city-goto', { x: t.x, z: t.z, part: t.part, name: goal.name })
    return
  }
  // another district: out (or in) through the gate, a taxi where it is further than the next district
  if (goal.phase === `${me.scene}:${me.part}>${t.part}` && now - goal.sentAt < 45000) {
    // (on the way; in the city, standing at the gate with the campus as the goal: walk in)
    if (me.scene === 'city' && t.part === 'campus' && me.part === 'gate' && Math.hypot(me.x, me.z - 113) < 9 && now - goal.sentAt > 2500) { goal.sentAt = now; send('mzansi-city-leave') }
    return
  }
  goal.phase = `${me.scene}:${me.part}>${t.part}`
  goal.sentAt = now
  goal.last = { x: t.x, z: t.z }
  if (me.scene === 'campus') send('mzansi-city-go', { way: t.part === 'gate' ? 'walk' : 'taxi', target: { point: true, x: t.x, z: t.z, part: t.part, name: goal.name } })
  else if (t.part === 'campus') send('mzansi-city-travel', { way: me.part === 'gate' ? 'walk' : 'taxi', target: 'campus' })
  else send('mzansi-city-goto', { x: t.x, z: t.z, part: t.part, name: goal.name })
}

// ---------- a group you might like ----------
let suggested = false
async function maybeSuggest() {
  if (suggested || !roomForCard() || !socialCReady() || Date.now() - startedAt < WAIT * 2 + 4000 || !calm()) return
  suggested = true
  const g = await groupSuggestion()
  if (!g) return
  const n = Number(g.members) || 1
  showCard('group', `<p><b>${esc(g.name)}</b> <span class="fm-in">(${n} member${n === 1 ? '' : 's'}) is talking ${esc(g.interest || g.tag)}.</span></p>
    <div class="fm-row"><button type="button" class="fm-yes" data-fm-act="join">Join</button><button type="button" class="fm-no" data-fm-act="no">Not now</button><button type="button" class="fm-flag" data-fm-act="report" aria-label="Report this group’s name">⚑</button></div>`, async (k, btn) => {
    if (k === 'report') {
      // (two taps, like every report)
      if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = '⚑ Report?'; return }
      closeCard()
      await reportGroup(g.thread, 'name')
      await answerSuggestion(g.thread, false)
      api.toast('Reported. You won’t be offered that group again soon.')
      return
    }
    closeCard()
    const res = await answerSuggestion(g.thread, k === 'join')
    if (k === 'join') {
      if (res.ok) window.dispatchEvent(new CustomEvent('mzansi-open-threads', { detail: { thread: g.thread } }))
      else api.toast('That group is not open any more.')
    }
  }, 30000)
}

export function initFindMe(opts = {}) {
  api = { ...api, ...opts }
  if (started) return
  started = true
  startedAt = Date.now()
  onThreads((kind) => { if (kind === 'list') noteFriends() })
  setInterval(() => { shareTick(); maybeAsk(); maybeTell(); maybeSuggest() }, 1500)
  window.addEventListener('mzansi-find-go', (event) => { const id = event.detail?.id; if (id) goTo(id) })
}

// Tests (read only, but for `go`: the Friends tab's button does the same).
window.mzansiFind = { state: () => ({ on: findMeOn(), ready: socialCReady(), card: card?.dataset.fm || '', going: goal ? goal.id : '', phase: goal?.phase || '', at: myPlace(), told: [...told], sent }), go: (id) => goTo(id) }
