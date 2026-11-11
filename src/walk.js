// Walk together (Social A, owner 11 Nov): from a DM or a player's card, "Walk with me" plus where to and how
// (walk, or taxi in SunnyBay). The ask travels as a together.js invite (kind 'walk'), so it is the same
// Accept / No thanks card as the race. On accept both set off: the one who asked leads, the other walks at
// their side (following where the leader really is, a step to their right) until the leader is nearly there,
// then both finish at the door. By taxi each pays their own fare and both ride from the nearest stop.
// The chat sheet is not a dialog, so it stays open the whole way.
// Both must be in the same place (the same district room): an ask to someone elsewhere simply times out.
import './ui/walk.css'
import { LOTS } from './city/plan.js'
import { peerAt } from './presence.js'
import { inviteToast, onInvite, sendInvite } from './world/together.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const first = (name) => String(name || 'Student').split(' ')[0]
let source = { places: () => [], toast: () => {} }
let card = null
let asked = null // { id, name, dest, destName, mode, city }: the ask that is out
let follow = 0 // the timer while you walk at someone's side
let state = { with: '', dest: '', mode: '', lead: false }

const inCity = () => document.body.dataset.city === '1'
// Where you can go from here: SunnyBay's places (and the campus gate), or the campus's places.
function dests() {
  if (inCity()) return [{ id: 'campus', name: 'Campus gate' }, ...LOTS.map((l) => ({ id: l.id, name: l.name }))]
  return source.places().filter((p) => p.id && p.name).map((p) => ({ id: p.id, name: p.name }))
}
function go(dest, mode, city) {
  if (city) window.dispatchEvent(new CustomEvent('mzansi-city-travel', { detail: { way: mode === 'taxi' ? 'taxi' : 'walk', target: dest } }))
  else window.dispatchEvent(new CustomEvent('mzansi-go-place', { detail: { id: dest } }))
}
const walkXz = (x, z) => window.dispatchEvent(new CustomEvent(inCity() ? 'mzansi-city-walk' : 'mzansi-walk-xz', { detail: { x, z } }))
function stopFollowing() {
  clearInterval(follow)
  follow = 0
  window.removeEventListener('pointerdown', onTouch, true)
}
// (a tap on the world is you taking over: the walk at their side ends there)
function onTouch(event) { if (event.target?.tagName === 'CANVAS') { stopFollowing(); state = { with: '', dest: '', mode: '', lead: false } } }

// The one who was asked walks beside the one who asked.
function walkBeside(leaderId, dest, city) {
  stopFollowing()
  let last = null
  let still = 0
  let ticks = 0
  const tick = () => {
    ticks += 1
    const p = peerAt(leaderId)
    // (they left, or five minutes have gone by: finish on your own)
    if (!p || ticks > 600) { stopFollowing(); go(dest, 'walk', city); return }
    const moved = last ? Math.hypot(p.x - last.x, p.z - last.z) : 1
    still = moved < 0.05 ? still + 1 : 0
    // a step to their right, a touch behind (their heading: where they have just moved, else where they face)
    const h = last && moved > 0.05 ? Math.atan2(p.x - last.x, p.z - last.z) : Number(p.h) || 0
    last = { x: p.x, z: p.z }
    // (they have stopped for 3 s: they are there, or held up; walk the rest yourself)
    if (still >= 6 && ticks > 8) { stopFollowing(); go(dest, 'walk', city); return }
    walkXz(p.x + Math.cos(h) * 0.9 - Math.sin(h) * 0.3, p.z - Math.sin(h) * 0.9 - Math.cos(h) * 0.3)
  }
  follow = setInterval(tick, 500)
  window.addEventListener('pointerdown', onTouch, true)
  tick()
}

// "Walk with me": where to, and how.
function ask(id, name) {
  close()
  const list = dests()
  if (!list.length) { source.toast('Nowhere to walk to from here.'); return }
  const city = inCity()
  card = document.createElement('section')
  card.className = 'wk-card'
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', 'Walk with me')
  card.innerHTML = `<h3>Walk with ${esc(first(name))}</h3><p>Where to?</p>
    <div class="wk-list">${list.map((d, i) => `<button type="button" class="wk-dest" data-dest="${esc(d.id)}" aria-pressed="${i === 0}">\u{1F4CD} ${esc(d.name)}</button>`).join('')}</div>
    ${city ? '<div class="wk-modes" role="group" aria-label="How"><button type="button" data-mode="walk" aria-pressed="true">\u{1F6B6} Walk</button><button type="button" data-mode="taxi" aria-pressed="false">\u{1F690} Taxi (you each pay)</button></div>' : ''}
    <div class="wk-row"><button type="button" class="wk-go" data-wk="send">Ask ${esc(first(name))}</button><button type="button" class="wk-x" data-wk="close">Cancel</button></div>`
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) card.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  card.addEventListener('click', (event) => {
    const d = event.target.closest('[data-dest]')
    if (d) { for (const b of card.querySelectorAll('[data-dest]')) b.setAttribute('aria-pressed', String(b === d)); return }
    const m = event.target.closest('[data-mode]')
    if (m) { for (const b of card.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b === m)); return }
    const k = event.target.closest('[data-wk]')?.dataset.wk
    if (k === 'close') { close(); return }
    if (k !== 'send') return
    const dest = card.querySelector('[data-dest][aria-pressed="true"]')?.dataset.dest
    const mode = card.querySelector('[data-mode][aria-pressed="true"]')?.dataset.mode || 'walk'
    const destName = list.find((x) => x.id === dest)?.name || 'there'
    close()
    if (!dest) return
    if (!sendInvite('walk', id, name, { dest, destName, mode, city })) { source.toast('You already asked someone. Give them a moment.'); return }
    asked = { id, name, dest, destName, mode, city }
    source.toast(`\u{1F6B6} Asked ${first(name)} to ${mode === 'taxi' ? 'take a taxi' : 'walk'} with you to ${destName}…`)
  })
  document.body.append(card)
}
function close() { card?.remove(); card = null }

export function initWalk(opts) {
  source = { ...source, ...opts }
  window.addEventListener('mzansi-walk-ask', (event) => { const { id, name } = event.detail || {}; if (id) ask(id, name) })
  // Someone asked you.
  onInvite('walk', (from, name, data, { accept, decline }) => {
    const city = Boolean(data.city)
    // (a walk on the campus cannot be joined from SunnyBay, or the other way round; nor in the middle of a card)
    if (city !== inCity() || typeof data.dest !== 'string') { decline(); return }
    const how = data.mode === 'taxi' ? 'take a taxi' : 'walk'
    inviteToast({
      text: `${esc(first(name))} wants to ${how} with you to ${esc(String(data.destName || 'there').slice(0, 40))} \u{1F6B6}`,
      onAccept: () => {
        accept()
        state = { with: from, dest: data.dest, mode: data.mode === 'taxi' ? 'taxi' : 'walk', lead: false }
        document.body.dataset.walkWith = from
        if (state.mode === 'taxi') go(data.dest, 'taxi', city)
        else walkBeside(from, data.dest, city)
      },
      onDecline: decline,
    })
  })
  window.addEventListener('mzansi-together-accepted', (event) => {
    if (event.detail?.kind !== 'walk' || !asked) return
    const a = asked
    asked = null
    state = { with: a.id, dest: a.dest, mode: a.mode, lead: true }
    document.body.dataset.walkWith = a.id
    source.toast(`${first(a.name)} is coming with you.`)
    go(a.dest, a.mode, a.city)
  })
  window.addEventListener('mzansi-together-declined', (event) => { if (event.detail?.kind === 'walk' && asked) { source.toast(`${first(asked.name)} can’t right now.`); asked = null } })
  window.addEventListener('mzansi-together-timeout', (event) => { if (event.detail?.kind === 'walk' && asked) { source.toast(`${first(asked.name)} didn’t answer. They may not be nearby.`); asked = null } })
}

// Tests (read only).
window.mzansiWalk = () => ({ ...state, following: Boolean(follow), asked: asked && { id: asked.id, dest: asked.dest, mode: asked.mode } })
