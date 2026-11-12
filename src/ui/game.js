import { getCam, getView } from '../cammode.js'
import { preorderOffer } from '../loops.js'
import { chipLabel, countLabel, peersOnCampus } from '../presence.js'
import { actionState, actionsAt, weekdayName } from '../engine/sim.js'
import { formatClock, formatMoney, toMinutes } from '../engine/format.js'
import { homePlaceId } from '../engine/model.js'
import { chatFor } from '../engine/people.js'
import { findMeOn, socialCReady, unreadTotal } from '../threads.js'
import { cardHtml, esc, summaryRows } from './render.js'
import { ART, LAYOUT, groundHtml, inkOn, residence, routeSvg, todOf } from './campus.js'
import { csvToWorld } from '../world/layout.js'
import STORY from '../../data/campusville/place_story.json'
import { GOAL_KIND, dreamOf, dreamProgress, goalText, rightNow } from '../engine/goals.js'
import { identityTitle } from '../engine/identity.js'
import { installMode } from '../install.js'
import { comeBackReasons } from '../engine/dayend.js'
import { MOMENTS } from '../engine/moments.js'
import { beatById } from '../engine/arcs.js'
import { DAY_THEMES, WEEK_GOAL, weekStudied } from '../engine/friday.js'
import './game.css'
import './cream.css'
import './result-card.css'
import './topbar.css'
import './cards.css'
import { resultBody } from './result-card.js'
import { themePicker } from '../theme.js'
import './creator.css'
import './quick.css'
import { venueFor } from '../venues.js'
import { MENUS } from '../menus.js'
import { flagOf } from '../from.js'
import { talkActions } from '../engine/talkactions.js'
import { fridgeName, itemOf } from '../engine/grocer.js'

// UI-only state that should not be saved.
export const ui = { tip: '', gear: false, confirmReset: false, delta: null, notice: '', talk: null }

const ICON = {
  hub: '\u{1F333}', food: '\u{1F37D}', transit: '\u{1F68C}', venue: '\u26BD', study: '\u{1F4DA}',
  lecture: '\u{1F393}', residence: '\u{1F3E0}',
}
const SHORT = {
  'SMIG': 'SMIG', 'Health Sciences Lecture Venue': 'Health Sci', 'Science Lecture Venue': 'Science',
  'Law Lecture Venue': 'Law', 'Engineering Lecture Venue': 'Engineering', 'Main Bus Station': 'Bus station',
  'Greenway Grocer': 'Greenway', 'Sports Centre': 'Sports', 'Main Gate': 'Gate', 'Cafeteria': 'Caf',
}
const CHIP_TIPS = [
  ['exam', '', '', 'Exam week: study counts double and the exam is at the Sports Centre on the last day.'],
  ['behind', '', '', 'Falling behind: grade gains are halved for a few days. Attend lectures and study to recover.'],
  ['broke', '', '', 'Broke: below R0 you can only eat noodles. Work a shift to get back above zero.'],
  ['hungry', '', '', 'Slept hungry: you woke tired. Eat today so fullness is 20+ before you sleep.'],
]

export function statusChips(run) {
  return [
    run.examWeek ? ['exam', '\u270D\uFE0F', 'Exam week'] : null,
    run.fallingBehind > 0 || run.status ? ['behind', '\u{1F4C9}', 'Falling behind'] : null,
    run.noodlesOnly ? ['broke', '\u{1F35C}', 'Noodles only'] : null,
    run.sleptHungry ? ['hungry', '\u{1F971}', 'Slept hungry'] : null,
  ].filter(Boolean)
}

export const STATS = [
  ['money', 'Money', '#f5c542', 'Rands in your pocket. Below R0 it is noodles only until a shift pays.'],
  ['energy', 'Energy', '#47d18c', 'Energy. Sleep gives +60; skipping sleep costs 30.'],
  ['hunger', 'Fullness', '#ff8a4c', 'Fullness. Eat to top it up; under 10 you cannot study.'],
  ['grades', 'Grades', '#6fb6ff', 'Grades out of 100. Three days under 20 and you are excluded.'],
  ['social', 'Social', '#d77bff', 'Friends and vibes. Higher social makes events go your way.'],
]
const PHASE_SHORT = { wake: 'Wake', transit: 'Go', lecture: 'Lecture', social: 'Social', leisure: 'Free', night: 'Night' }

export function placeName(place) { return SHORT[place.name] || place.name }
export function layoutOf(id) { return LAYOUT[id] || [50, 50] }

// The one place that calls you right now, and the words on its tag.
function heroOf(district, run) {
  const home = homePlaceId(district, run.character.residence)
  if (run.dropOff) return { id: home, line: 'Your room' }
  if (run.phase === 'night') return { id: home, line: 'Bed' }
  const venue = venueFor(run)
  if (venue && !run.lectureResolved && ['wake', 'transit', 'lecture'].includes(run.phase) && run.day <= 5) return { id: venue.id, line: run.day === 5 ? 'Test 9:00' : 'Lecture 9:00' }
  const open = (id) => placeStatus(district, run, id).open
  const s = run.stats || {}
  if ((s.hunger ?? 100) < 45 && open('cafeteria')) return { id: 'cafeteria', line: 'Eat' }
  const c = run.crush
  if (c?.met && c.beats?.[run.day] === undefined && open('quad')) return { id: 'quad', line: 'Someone\u2019s here' }
  if ((s.grades ?? 50) < 45 && open('library')) return { id: 'library', line: 'Study' }
  for (const [id, line] of [['quad', 'Hang out'], ['cafeteria', 'Eat'], ['library', 'Study'], ['sports_centre', 'Play']]) if (open(id)) return { id, line }
  return null
}

// Real students on campus right now (presence), each counted at the nearest place
// within 15 m. Nobody near a place: no chip. Never a made-up number.
function crowdAt(district) {
  const out = {}
  let peers = []
  try { peers = peersOnCampus() } catch { return out }
  if (!peers.length) return out
  const spots = district.places.map((p) => ({ id: p.id, ...csvToWorld(p.x, p.y) }))
  for (const peer of peers) {
    let best = null
    let bestD = 15
    for (const s of spots) {
      const d = Math.hypot(s.x - peer.x, s.z - peer.z)
      if (d < bestD) { bestD = d; best = s.id }
    }
    if (best) out[best] = (out[best] || 0) + 1
  }
  return out
}

// The Quad's next event, from its stage sign (place_story.json, e.g. "OPEN MIC · FRIDAY 19:00").
function quadEvent(district, run) {
  const m = /^(.+?)\s*\u00b7\s*([A-Za-z]+)\s+(\d\d:\d\d)$/.exec(STORY.quad?.stage_sign || '')
  if (!m) return ''
  const name = m[1].charAt(0) + m[1].slice(1).toLowerCase()
  const day = m[2].charAt(0) + m[2].slice(1, 3).toLowerCase()
  const today = String(weekdayName(district.meta, run.day) || '').slice(0, 3).toLowerCase() === m[2].slice(0, 3).toLowerCase()
  if (!today) return `\u{1F3A4} ${name} ${day}`
  return run.minutes < toMinutes(m[3]) ? `\u{1F3A4} ${name} tonight ${m[3]}` : `\u{1F3A4} ${name} on now`
}

// A place on the campus map: the hero's beam and tag, a crowd chip, one quiet pill
// for closed places, houses in their own colours.
function pinHtml(place, st, { house, mine, sel, hero, art, label, called, crowd, event }) {
  const [x, y] = layoutOf(place.id)
  const isHero = hero?.id === place.id
  const time = /^opens /.test(st.label) ? st.label.replace(/^opens 0?/, '') : st.label === 'done today' ? '\u2713' : ''
  const name = house
    ? (isHero ? `\u2605 ${esc(hero.line)} <i>\u2302 ${esc(house.short)}</i>` : `${esc(house.short)}${mine ? ' <i>\u2302 Home</i>' : ''}`)
    : `${esc(label)}${!st.open && time && !isHero ? ` <i>${esc(time)}</i>` : ''}`
  const state = st.open ? 'open' : st.public ? 'public' : 'dim'
  const vars = house ? `;--hc:${house.main};--ht:${inkOn(house.main)}` : ''
  const dots = '<b></b>'.repeat(Math.min(3, crowd))
  return `<button type="button" class="g-pin g-b-${place.id} ${state}${mine ? ' mine' : ''}${house ? ' house' : ''}${isHero ? ` hero${y < 20 ? ' hero-top' : ''}` : ''}${sel ? ' sel' : ''}" data-act="place-open" data-id="${place.id}" style="left:${x}%;top:${y}%${vars}" aria-label="${esc(called)}${isHero ? `, next: ${esc(hero.line)}` : ''}${crowd && !house ? `, ${crowd} here now` : ''}">
    ${isHero ? `<span class="g-beacon"><i></i></span>${house ? '' : `<span class="g-next">\u2605 ${esc(hero.line)}</span>`}` : ''}
    ${st.open && !house ? '<span class="g-halo"></span>' : ''}<span class="g-art">${art}</span>
    <span class="g-name">${name}</span>
    ${crowd && !house ? `<span class="g-crowd">${dots}${crowd} here</span>` : ''}
    ${place.id === 'quad' && event ? `<span class="g-live">${esc(event)}</span>` : ''}
  </button>`
}

export function hereOf(district, run) {
  return run.at || homePlaceId(district, run.character.residence) || 'quad'
}

// Fix 1 from play-through: the 5th slot is reserved for Sleep so a day never
// ends at lunchtime by accident.
function guardLastSlot(run, action, state) {
  if (state.disabled || run.phase === 'night' || run.slotsLeft !== 1) return state
  if (action.slots > 0 && !action.tags.includes('sleep')) return { disabled: true, hidden: false, reason: 'Your last slot is saved for Sleep at 21:00' }
  return state
}

function visibleActions(district, run, placeId) {
  return actionsAt(district, run, placeId)
    .map((action) => ({ action, state: guardLastSlot(run, action, actionState(district, run, action)) }))
    .filter((item) => !item.state.hidden)
}

export function anyEnabled(district, run) {
  return district.places.some((place) => visibleActions(district, run, place.id).some((item) => !item.state.disabled))
}

// When does a place next have something to do? Respect opening hours.
function opensAt(district, run, placeId) {
  const phases = district.meta.phases
  const idx = phases.findIndex((p) => p.id === run.phase)
  for (let i = idx; i < phases.length; i += 1) {
    const ghost = { ...run, phase: phases[i].id, minutes: i === idx ? run.minutes : toMinutes(phases[i].start) }
    const list = actionsAt(district, ghost, placeId)
    for (const action of list) {
      const st = actionState(district, ghost, action)
      if (st.hidden || run.doneToday.includes(action.id)) continue
      const m = /opens (\d\d:\d\d)/.exec(st.reason)
      if (m) {
        const end = toMinutes(phases[i].end)
        if (toMinutes(m[1]) < end && toMinutes(m[1]) > ghost.minutes) return m[1]
        continue
      }
      if (i > idx || !st.disabled) return formatClock(ghost.minutes)
    }
  }
  return ''
}

export function placeStatus(district, run, placeId) {
  const items = visibleActions(district, run, placeId)
  const open = items.filter((item) => !item.state.disabled)
  if (open.length) return { open: true, label: '' }
  // Public spaces with no opening hours are never "closed".
  const place = district.places.find((p) => p.id === placeId)
  if (place?.kind === 'hub' && !district.hours.places[placeId]) return { open: false, public: true, label: '' }
  const at = opensAt(district, run, placeId)
  if (at) return { open: false, label: `opens ${at}` }
  const closed = items.find((item) => /Closed/.test(item.state.reason))
  if (closed) return { open: false, label: 'closed' }
  return { open: false, label: items.length ? 'done today' : '' }
}

/// Stat colours (visual only): green at 70 and up, amber 40-69, red under 40; money green
// above R500, amber R100-R500, red under R100 (the existing low threshold). Compact top bar
// (owner, 10 Nov): every low stat is a solid red pill with white text and a slow, gentle
// pulse; two low stats pulse together (one shared phase), and reduced motion keeps the red
// pill without the pulse.
export function statBand(key, value) {
  const v = Number(value) || 0
  if (key === 'money') return v > 500 ? 'good' : v >= 100 ? 'mid' : 'low'
  return v >= 70 ? 'good' : v >= 40 ? 'mid' : 'low'
}
export function lowStats(stats) {
  return STATS.map(([key]) => key).filter((key) => statBand(key, stats[key]) === 'low')
}
const PULSE_MS = 1500
// Always a whole number (energy drains in fractions while you walk); money past R10 000 as "R12k".
export function statText(key, value) {
  const v = Math.round(Number(value) || 0)
  if (key !== 'money') return String(v)
  return Math.abs(v) >= 10000 ? `${v < 0 ? '-' : ''}R${Math.round(Math.abs(v) / 1000)}k` : formatMoney(v)
}
// Money from R1 000 to R9 999 also carries a short form ("R1.5k"), which the narrowest
// phones show instead (topbar.css); the exact amount is in the tip and the label.
function moneyShort(key, value) {
  const full = esc(statText(key, value))
  const v = Math.round(Number(value) || 0)
  if (key !== 'money' || Math.abs(v) < 1000 || Math.abs(v) >= 10000) return full
  const k = (Math.floor(Math.abs(v) / 100) / 10).toFixed(1).replace(/\.0$/, '')
  return `<span class="tb-full">${full}</span><span class="tb-short">${v < 0 ? '-' : ''}R${k}k</span>`
}
function stat(key, word, value, phase) {
  const band = statBand(key, value)
  const low = band === 'low'
  const exact = key === 'money' ? formatMoney(Math.round(Number(value) || 0)) : statText(key, value)
  // (the HUD is redrawn often: the pulse keeps its place in the shared cycle, never restarts)
  const delay = low ? ` style="animation-delay:-${phase}ms"` : ''
  const fill = Math.round(Math.max(0, Math.min(1, (Number(value) || 0) / (key === 'money' ? MONEY_FULL : 100))) * 100)
  return `<button class="tb-stat ${band}${low ? ' pulse' : ''}${ui.tip === key ? ' on' : ''}" type="button" data-act="stat" data-k="${key}" data-band="${band}" aria-label="${word} ${exact}${low ? ', low' : ''}"${delay}><b>${word}</b><i>${moneyShort(key, value)}</i><u aria-hidden="true"><s style="width:${fill}%"></s></u></button>`
}
// The money bar is full at R3 000 (a new student starts on R2 100); the other four are out of 100.
const MONEY_FULL = 3000
// Something new behind the menu button: a notice or message you have not opened Notices
// for yet (run.inboxSeen counts how many you have seen).
export function menuNews(run) {
  return (run?.inbox || []).length > (run?.inboxSeen || 0)
}

export function phaseStrip(district, run) {
  const phases = district.meta.phases
  const idx = phases.findIndex((p) => p.id === run.phase)
  const segs = phases.map((p, i) => `<li class="${i < idx ? 'past' : i === idx ? 'now' : ''}"><b>${PHASE_SHORT[p.id] || p.label}</b><small>${p.start}</small></li>`).join('')
  const total = district.meta.day.slots
  const pipsHtml = Array.from({ length: total }, (_, i) => `<i class="${i < run.slotsLeft ? 'full' : ''}"></i>`).join('')
  return `<div class="g-phases" aria-label="Phase of the day"><ol>${segs}</ol><div class="g-slots" title="Time slots left today"><span>${pipsHtml}</span><small>${run.slotsLeft} of ${total} slots</small></div></div>`
}

// Time-of-day icon and how far through the 06:00-22:00 day we are.
function dayIcon(mins) {
  const h = (((Math.round(mins) % 1440) + 1440) % 1440) / 60
  return h >= 5 && h < 9 ? '\u{1F305}' : h >= 9 && h < 17 ? '☀️' : h >= 17 && h < 20 ? '\u{1F307}' : '\u{1F319}'
}
function dayFill(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return Math.round(Math.max(0, Math.min(1, (m - 360) / 960)) * 100)
}

// The compact top bar (owner, 10 Nov): one slim row at phone width. The time pill (the day
// inside; tap it for the day's timeline, which closes itself after 4 s), the five stats as
// icons with whole numbers (tap one for what it means), and one menu button (leaderboard,
// chat, sound, settings and the rest) with a dot when something is new. Tips and the
// timeline drop down under the bar, so the bar itself never grows.
export function hud(district, run, opts = {}) {
  if (!run) return ''
  const day = weekdayName(district.meta, run.day)
  const tipStat = STATS.find((s) => s[0] === ui.tip)
  const tipChip = CHIP_TIPS.find((s) => `chip-${s[0]}` === ui.tip)
  const tipValue = tipStat ? (tipStat[0] === 'money' ? formatMoney(Math.round(run.stats.money || 0)) : statText(tipStat[0], run.stats[tipStat[0]])) : ''
  const tip = tipStat ? `${tipStat[1]}: ${tipValue}. ${tipStat[3]}` : tipChip ? tipChip[3] : ''
  const phase = Date.now() % PULSE_MS
  const news = menuNews(run)
  const clock = formatClock(run.minutes)
  const goals = opts.goals ? goalBits(run) : { badge: '', chips: '', peek: '' }
  return `<header class="g-hud tb">
    <div class="g-row tb-row">
      ${meButton(run)}
      <button class="tb-time${ui.timeline ? ' on' : ''}" type="button" data-act="timeline" aria-expanded="${ui.timeline ? 'true' : 'false'}" aria-label="Day ${run.day}, ${day}, ${clock}. Today's timeline" style="--day:${dayFill(run.minutes)}%"><i aria-hidden="true">${dayIcon(run.minutes)}</i><b>${day.slice(0, 3)}</b><span>${clock}</span></button>
      <span class="tb-online" data-online data-chip title="Students here right now">${chipLabel()}</span>
      ${goals.badge}${goals.chips}
      <button class="tb-chat" type="button" data-act="chat-open" aria-label="Chat"><span aria-hidden="true">\u{1F4AC}</span><small class="cht-unread" data-chat-unread${unreadTotal() ? '' : ' hidden'}>${unreadTotal() > 99 ? '99+' : unreadTotal() || ''}</small></button>
      <button class="tb-menu${news ? ' news' : ''}" type="button" data-act="gear" aria-label="Menu${news ? ', something new' : ''}" aria-expanded="${ui.gear ? 'true' : 'false'}"><span aria-hidden="true"></span>${news ? '<i class="tb-dot" aria-hidden="true"></i>' : ''}</button>
    </div>
    <div class="g-stats tb-stats">${STATS.map(([k, w]) => stat(k, w, run.stats[k], phase)).join('')}</div>
    ${goals.peek}
    ${tip ? `<p class="g-tip tb-pop" role="status">${esc(tip)}</p>` : ''}
    ${ui.timeline ? `<div class="tb-pop tb-timeline" role="status"><p class="tb-pop-h"><b>Day ${run.day}</b> ${esc(day)}</p>${phaseStrip(district, run)}</div>` : ''}
  </header>
  ${ui.gear ? gearMenu(run) : ''}`
}

// The frame rate the campus draws at on this phone (scene.js counts it), for the
// readout in the menu and Settings, so the owner can report the real number.
export function fpsText() {
  const world = document.getElementById('world')?.dataset || {}
  if (!world.fpsAvg) return 'open the campus to measure'
  const live = world.on === '1' ? `${world.fps} fps now, ` : 'on campus: '
  return `${live}${world.fpsAvg} average, ${world.fpsLow} slowest (last 10 s)`
}

// Your own face with a pencil, first in the top bar on every screen that has the bar (campus, the Caf, SunnyBay):
// it opens the character screen, so you can change your look any time (owner, 12 Nov). The face is a head shot of
// your 3D character (main.js fills it in: setMeFace); until it lands, your initial.
let meFace = { key: '', url: '' }
export function setMeFace(key, url) { meFace = { key, url } }
export const meFaceKey = (run) => JSON.stringify(run?.character?.avatar || {})
function meButton(run) {
  const has = meFace.url && meFace.key === meFaceKey(run)
  const letter = esc(String(run?.character?.name || '?').trim().slice(0, 1).toUpperCase() || '?')
  return `<button class="tb-me" type="button" data-act="edit-look" aria-label="Change your look" title="Change your look"><span class="tb-me-face" data-me-face>${has ? `<img src="${esc(meFace.url)}" alt="">` : `<b>${letter}</b>`}</span><i class="tb-me-pen" aria-hidden="true">\u270E</i></button>`
}
export function musicOn() {
  try { return localStorage.getItem('mzansiville.music') !== 'off' } catch { return true }
}
export function soundOn() {
  try { return localStorage.getItem('mzansiville.sound') !== 'off' } catch { return true }
}

// The one menu button's sheet: the four things the old top row held first (leaderboard,
// chat, sound, settings), then the rest. Notices carry the dot while a message is unread.
function gearMenu(run) {
  const news = menuNews(run)
  return `<div class="g-scrim" data-act="gear"></div>
  <aside class="g-menu" role="dialog" aria-label="Menu">
    <h3>Menu <span class="g-online" data-online title="Students here right now">${countLabel()}</span></h3>
    <button type="button" data-act="lp-board">\u{1F3C6} Weekly leaderboard</button>
    ${preorderOffer(run) ? '<button type="button" class="news" data-act="preorder">\u{1F35B} Order tomorrow’s special <i class="tb-dot" aria-label="new"></i></button>' : ''}
    ${socialCReady() ? `<button type="button" data-act="find-toggle" data-find="${findMeOn() ? 'on' : 'off'}">\u{1F4CD} Friends can find you: <b>${findMeOn() ? 'On today' : 'Off'}</b></button>` : ''}
    <button type="button" data-act="invite-friend">\u{1F381} Invite a friend: R100 each</button>
    <button type="button" data-act="chat-open">\u{1F4AC} Chat <small class="cht-unread inline" data-chat-unread${unreadTotal() ? '' : ' hidden'}>${unreadTotal() > 99 ? '99+' : unreadTotal() || ''}</small></button>
    <button type="button" data-act="sound" aria-pressed="${soundOn() ? 'false' : 'true'}">${soundOn() ? '\u{1F50A} Sound: <b>On</b>' : '\u{1F507} Sound: <b>Muted</b>'}</button>
    <button type="button" data-act="music" aria-pressed="${musicOn() ? 'false' : 'true'}">\u{1F3B5} Music: <b>${musicOn() ? 'On' : 'Off'}</b></button>
    <button type="button" data-act="nav" data-go="settings">⚙️ Settings</button>
    <button type="button" data-act="nav" data-go="notices" class="${news ? 'news' : ''}">\u{1F4E2} Notices${news ? ' <i class="tb-dot" aria-label="new"></i>' : ''}</button>
    ${installMode() === 'done' ? '' : '<button type="button" class="g-install" data-act="install-tap" data-go="install">\u{1F4F2} Install Soft Life</button>'}
    ${location.hash.startsWith('#/play') && document.body.dataset.caf !== '1' ? '<button type="button" data-act="city-map">\u{1F5FA} SunnyBay map</button>' : ''}
    <button type="button" data-act="nav" data-go="profile">Student card</button>
    <button type="button" data-act="nav" data-go="milestones">Milestones</button>
    <button type="button" data-act="nav" data-go="board">All-time boards</button>
    ${themePicker()}
    ${location.hash.startsWith('#/morning') ? '<button type="button" data-act="skip-morning">Skip morning intro</button>' : ''}
    <button type="button" data-act="edit-char">Edit character</button>
    <button type="button" data-act="lp-feedback">Feedback</button>
    <button type="button" data-act="nav" data-go="rules">Community rules</button>
    <button type="button" data-act="nav" data-go="privacy">Privacy</button>
    <button type="button" data-act="nav" data-go="credits">Credits</button>
    <p class="g-fps">Frame rate: <b data-fps-live>${fpsText()}</b></p>
    ${run.userId ? '<button type="button" data-act="signout">Sign out</button>' : '<button type="button" data-act="nav" data-go="save">Save progress / sign in</button>'}
    <button type="button" class="g-home" data-act="home">\u{1F3E0} Home screen</button>
    <button type="button" class="ghost" data-act="gear">Close</button>
  </aside>`
}

function effectChips(deltas, cls = '') {
  const order = [['money', '\u{1F4B0}'], ['energy', '\u26A1'], ['hunger', '\u{1F37D}'], ['grades', '\u{1F4D6}'], ['social', '\u{1F465}']]
  return order.filter(([k]) => deltas[k]).map(([k, ic]) => {
    const v = deltas[k]
    const txt = k === 'money' ? (v > 0 ? `+${formatMoney(v)}` : formatMoney(v)) : `${v > 0 ? '+' : ''}${v}`
    const good = v > 0
    return `<span class="g-fx ${good ? 'up' : 'down'} ${cls}">${ic} ${txt}</span>`
  }).join('')
}

// "Spots here" counts come from the 3D scene (#world data-spots), refreshed every second.
function spotCounts() {
  try { return JSON.parse(document.getElementById('world')?.dataset.spots || '{}') } catch { return {} }
}

function isNight(run) {
  const m = run.minutes % 1440
  return m >= 18 * 60 || m < 6 * 60
}

// Greenway Grocer's shop card: three shelves, a card per item with its price; groceries
// say what goes in your fridge, essentials and treats what they do.
function shopHtml(district, run) {
  const g = district.greenway
  const money = run.stats.money || 0
  const fridge = run.fridge || {}
  return g.shelves.map((shelf) => `<div class="g-row-title gw-shelf"><span>${esc(shelf.label)}</span><small>${esc(shelf.note || '')}</small></div>
    <div class="gw-items">${g.items.filter((item) => item.shelf === shelf.id).map((item) => {
      const short = money < item.price
      const what = item.shelf === 'groceries'
        ? `+${item.portions || 1} ${esc(item.unit || '')}${fridge[item.id] ? ` · ${fridge[item.id]} at home` : ''}`
        : esc(item.says || Object.entries(item.effects || {}).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k === 'hunger' ? 'Fullness' : k[0].toUpperCase() + k.slice(1)}`).join(' · '))
      return `<button type="button" class="gw-item" data-act="buy" data-id="${item.id}"${short ? ' disabled' : ''}><span class="gw-ic">${item.icon}</span><b>${esc(item.name)}</b><span class="gw-price">${formatMoney(item.price)}</span><small>${short ? 'Not enough money' : what}</small></button>`
    }).join('')}</div>`).join('')
}

// Your house fridge: what's in it (portions), on your house's card.
function fridgeHtml(district, run) {
  const fridge = run.fridge || {}
  const have = Object.entries(fridge).filter(([, n]) => n > 0)
  const chips = have.map(([id, n]) => `<span class="gw-have">${itemOf(district, id)?.icon || '\u{1F372}'} ${esc(fridgeName(district, id))} <b>${n}</b></span>`).join('')
  return `<div class="g-row-title"><span>\u{1F9CA} Your fridge</span><small>${(run.credit || 0)} phone credit</small></div>
    <div class="gw-fridge">${chips || '<span class="gw-empty">Empty. Greenway Grocer is by the gate.</span>'}<button type="button" class="gw-go" data-act="go-greenway">\u{1F6D2} Shop at Greenway</button></div>`
}

function sheetHtml(district, run, placeId) {
  const place = district.places.find((p) => p.id === placeId)
  if (!place) return ''
  const story = STORY[placeId]
  const isHouse = (district.houses || []).some((h) => h.place === placeId)
  const items = visibleActions(district, run, placeId)
  const status = placeStatus(district, run, placeId)
  const rows = items.map(({ action, state }) => {
    const mins = action.slots > 0 ? (district.meta.slotMinutes[run.phase] || 30) * action.slots : 10
    // Play-through fix: show what a slot action leaves for the rest of the day.
    const after = run.slotsLeft - (action.slots || 0)
    const warn = action.slots > 0 && !state.disabled && run.phase !== 'night'
      ? `<span class="g-left${after <= 1 ? ' low' : ''}">${after <= 0 ? 'Last slot: the day ends' : after === 1 ? 'Leaves 1 slot (Sleep)' : `Leaves ${after} of ${run.slotsTotal} slots`}</span>`
      : ''
    const money = action.deltas.money || 0
    const price = money < 0 ? formatMoney(-money) : money > 0 ? `Earn ${formatMoney(money)}` : 'Free'
    const fx = { ...action.deltas }
    delete fx.money
    const card = `<button class="g-act g-card" type="button" data-act="do" data-id="${action.id}" data-place="${placeId}"${state.disabled ? ' disabled' : ''}>
      <span class="g-card-top"><span class="g-card-ic">${story?.icon || ICON[place.kind] || '\u2728'}</span><small>\u23F1 ${mins} min</small></span>
      <b class="g-price${money > 0 ? ' earn' : ''}">${price}</b>
      <strong>${esc(action.name)}</strong>
      <span class="g-act-fx">${effectChips(fx)}</span>
      ${state.disabled ? `<span class="g-why">${esc(state.reason)}</span>` : warn}
    </button>`
    // Out of an ingredient (or airtime): the card says what, and Greenway is one tap away.
    return state.greenway ? `<div class="gw-wrap">${card}<button type="button" class="gw-take" data-act="go-greenway" data-for="${action.id}">\u{1F6D2} Take me to Greenway</button></div>` : card
  }).join('')
  const later = opensAt(district, run, placeId)
  // Say plainly which later phases have something here today.
  const phases = district.meta.phases
  const nowIdx = phases.findIndex((p) => p.id === run.phase)
  const ahead = phases.slice(nowIdx + 1).map((ph) => {
    const ghost = { ...run, phase: ph.id, minutes: toMinutes(ph.start) }
    const names = actionsAt(district, ghost, placeId).filter((x) => !run.doneToday.includes(x.id) && !actionState(district, ghost, x).hidden).map((x) => x.name)
    return names.length ? `${ph.label} ${ph.start}: ${names.join(', ')}` : ''
  }).filter(Boolean)
  const nowLabel = phases[nowIdx]?.label || 'now'
  const empty = status.public
    ? `Nothing to do at ${placeName(place)} during ${nowLabel}. ${ahead.length ? `Coming up \u2014 ${ahead.join(' \u00b7 ')}.` : later ? `Things happen here from ${later}.` : 'Nothing else on today.'}`
    : status.label ? `Nothing here right now \u00b7 ${status.label}.` : 'Nothing to do here this phase.'
  const lines = story ? story.flavour[isNight(run) ? 'night' : 'day'] : [place.blurb || '']
  const counts = spotCounts()
  const spots = (story?.spots || []).map((s) => `<button type="button" class="g-spot" data-act="spot" data-place="${placeId}" data-spot="${s.id}">${s.icon} ${esc(s.label)}${counts[`${placeId}:${s.id}`] ? ` <b>${counts[`${placeId}:${s.id}`]}</b>` : ''}</button>`).join('')
  return `<section class="g-sheet g-sheet2" role="dialog" aria-label="${esc(place.name)}">
    <div class="g-grab"></div>
    <div class="g-sheet-head"><span class="g-sheet-ic">${story?.icon || ICON[place.kind] || ''}</span><div><h2>${esc(place.name)}</h2><p class="g-flavour" data-lines="${esc(JSON.stringify(lines))}">${esc(lines[0] || '')}</p></div><button type="button" class="g-x" data-act="close-sheet" aria-label="Close">\u00d7</button></div>
    ${spots ? `<div class="g-row-title"><span>Spots here</span><small>\u{1F463} Tap one to walk there</small></div><div class="g-spots">${spots}</div>` : ''}
    ${placeId === 'greenway' && district.greenway ? shopHtml(district, run) : ''}
    ${isHouse ? fridgeHtml(district, run) : ''}
    ${placeId === 'greenway' && !rows ? '' : `<div class="g-row-title"><span>Things to do</span>${rows ? `<small>${run.slotsLeft} of ${run.slotsTotal} slots left</small>` : ''}</div>
    <div class="g-acts g-cards">${rows || `<p class="g-empty">${esc(empty)}</p>`}</div>`}
  </section>`
}

function nextPhase(district, run) {
  const phases = district.meta.phases
  const i = phases.findIndex((p) => p.id === run.phase)
  return phases[i + 1] || null
}

// One clear line telling the student what to do next.
function ctaBar(district, run) {
  const glowing = district.places.filter((p) => placeStatus(district, run, p.id).open)
  const next = nextPhase(district, run)
  const sleepPlace = homePlaceId(district, run.character.residence)
  let line
  let openHtml = ''
  if (run.dropOff) {
    const house = district.places.find((p) => p.id === sleepPlace)
    return `<div class="g-cta g-route" role="status"><p>\u{1F9F3} Roll your suitcase to <b>${esc(house?.name || 'your house')}</b>. Follow the gold dots.</p></div>`
  }
  if (run.lectureRoute && !run.lectureResolved) {
    return `<div class="g-cta g-route" role="status"><p>\u{1F463} Tap the path to walk. Your lecture is at <b>${esc(venueFor(run).name)}</b></p></div>`
  }
  const atHome = hereOf(district, run) === sleepPlace
  if (run.phase === 'night') line = atHome ? 'Night. You are home \u2014 tap Sleep to end the day.' : 'Night. Go home and sleep to end the day.'
  else if (run.slotsLeft === 1) line = `1 slot left \u2014 keep it for Sleep at 21:00.`
  else if (glowing.length) openHtml = `<span class="g-spark" aria-hidden="true">✨</span> Open now: ${glowing.slice(0, 2).map((p) => `<b>${esc(placeName(p))}</b>`).join(' · ')}`
  else line = 'Nothing open now.'
  // First-visit hint: stays until the player taps a place or dismisses it.
  let seen = true
  try { seen = localStorage.getItem('mzansiville.mapHint') === '1' } catch { /* private mode */ }
  if (!seen && run.phase !== 'night') {
    return `<div class="g-cta g-hint" role="status"><p>\ud83d\udc46 Tap a glowing place to see what you can do.</p><button type="button" class="g-go ghost" data-act="hint-ok" aria-label="Dismiss hint">Got it</button></div>`
  }
  if (run.phase === 'night') {
    if (run.lateNight === run.day) line = `\u{1F319} Late night on campus. ${atHome ? 'Bed is right here.' : 'Carry on, or head home to bed.'}`
    return `<div class="g-cta"><p>${esc(line)}</p><button type="button" class="g-go" data-act="place-open" data-id="${sleepPlace}">${atHome ? 'Sleep' : 'Go home'}</button></div>`
  }
  const skipLabel = next ? `Skip to ${PHASE_SHORT[next.id]} ${next.start}` : 'End day'
  const jump = run.slotsLeft === 1 ? '<button type="button" class="g-go" data-act="to-night">Skip to Night</button>' : ''
  return `<div class="g-cta"><p${openHtml ? ' class="g-open"' : ''}>${openHtml || esc(line)}</p>${jump || `<button type="button" class="g-go ghost" data-act="phase">${skipLabel}</button>`}</div>`
}

function resultCard(state) {
  const { run } = state
  const q = run.queue
  const card = q[0]
  if (!card) return ''
  if (card.kind === 'event' && card.choices) return eventCard(state, card)
  if (card.kind === 'consequence' || card.kind === 'over') return consequenceCard(card)
  if (card.kind === 'milestone') return milestoneCard(state, card)
  if (card.kind === 'goals') return goalsCardHtml(run)
  if (card.kind === 'moment') return momentCardHtml(run, card)
  if (card.kind === 'test') return testCardHtml(run, card)
  if (card.choices || card.kind === 'shop') return `<div class="g-card-wrap">${cardHtml(card, state)}</div>`
  const twist = card.kind === 'result' && q[1]?.kind === 'twist' ? q[1] : null
  const label = { identity: '\u2728 Who you\u2019re becoming', goal: '\u{1F3AF} Goal done', result: 'Done', twist: 'Meanwhile', spot: 'Spot test', bestie: 'Your bestie', milestone: 'Milestone', event: 'Event' }[card.kind] || 'Note'
  const fx = card.kind === 'result' && ui.delta && card.id.startsWith('result-') ? effectChips(ui.delta, 'big') : ''
  const rich = activityCard(state, card, q)
  if (rich) {
    return `<div class="g-scrim soft" data-act="dismiss"></div>
  <aside class="g-result rc${rich.big ? ' big' : ''}" role="dialog" aria-label="${esc(card.title)}"${!twist && q.length === 1 ? ` data-auto="${rich.big ? 8000 : 6000}"` : ''}>
    ${rich.html}
    ${twist ? `<p class="g-twistline">\u{1F3B2} ${esc(twist.text)}</p>` : ''}
    <button type="button" class="g-go block" data-act="dismiss"${twist ? ' data-pair="1"' : ''}>${q.length > (twist ? 2 : 1) ? 'Next' : 'Continue'}</button>
  </aside>`
  }
  const body = fx ? '' : `<p>${esc(String(card.text || '').replaceAll('Hunger', 'Fullness'))}</p>`
  return `<div class="g-scrim soft" data-act="dismiss"></div>
  <aside class="g-result" role="dialog"${!twist && card.kind === 'result' && q.length === 1 ? ' data-auto="1"' : ''}>
    <p class="g-kind">${label}</p>
    <h2>${esc(card.title)}</h2>
    ${fx ? `<div class="g-fxrow">${fx}</div>` : body}
    ${twist ? `<p class="g-twistline">\u{1F3B2} ${esc(twist.text)}</p>` : ''}
    <button type="button" class="g-go block" data-act="dismiss"${twist ? ' data-pair="1"' : ''}>${q.length > (twist ? 2 : 1) ? 'Next' : 'Continue'}</button>
  </aside>`
}

// The activity "DONE" card (icon tile, fun line, gain pills, cost chips); null for other result cards.
function activityCard(state, card, q) {
  if (card.kind !== 'result' || !ui.delta || !String(card.id).startsWith('result-')) return null
  if (!Object.values(ui.delta).some((v) => v)) return null
  const { district, run } = state
  const actionId = String(card.id).slice(7).replace(/-\d+$/, '')
  const action = district.activities.find((a) => a.id === actionId)
  const place = district.places.find((p) => p.id === action?.placeId)
  const venue = venueFor(run)
  return resultBody({
    cardId: card.id, title: card.title, delta: ui.delta, action, esc,
    fill: { lecturer: venue?.lecturerName, subject: venue?.subject, place: place ? placeName(place) : '' },
    goalTicked: q.some((c) => c.kind === 'goal'),
  })
}

// Friday's test: the mark, and which choices this week paid off.
function testCardHtml(run, card) {
  const t = card.test
  return `<section class="g-full g-event g-test ${t.band}" role="dialog" aria-label="Friday test" data-screen-card="test">
    <div class="g-full-in">
      <p class="g-kind">Friday \u00b7 The test</p>
      <div class="g-mark"><b>${t.mark}</b><small>%</small></div>
      <h2>${esc(card.title)}</h2>
      <ul class="g-why"><li><span>Where you started</span><b>${t.base}</b></li>${t.lines.map((l) => `<li class="${l.n > 0 ? 'up' : 'down'}"><span>${esc(l.text)}</span><b>${l.n > 0 ? '+' : ''}${l.n}</b></li>`).join('')}</ul>
      <p class="g-lede">${t.beatRival ? `\u{1F3C6} Thabo got ${t.rival}%. You beat him.` : `\u{1F624} Thabo got ${t.rival}%. Next time.`}${t.repaid ? ` ${esc(run.bestieName || 'Your roommate')} paid back the R${t.repaid}.` : ''}</p>
      <button type="button" class="g-go block" data-act="dismiss">${t.band === 'fail' ? 'Pick yourself up' : 'Celebrate'}</button>
    </div>
  </section>`
}

// A random moment: something happens, and you choose.
function momentCardHtml(run, card) {
  const moment = MOMENTS.find((m) => m.id === card.momentId) || beatById(card.momentId)
  const buttons = card.choices.map((label, i) => `<button type="button" class="g-choice" data-act="moment" data-i="${i}"><strong>${esc(label)}</strong><span class="g-act-fx">${effectChips(moment?.choices[i]?.deltas || {})}</span></button>`).join('')
  return `<section class="g-full g-event g-moment" role="dialog" aria-label="${esc(card.title)}" data-screen-card="moment" data-moment="${esc(card.momentId)}">
    <div class="g-full-in">
      <p class="g-kind">${beatById(card.momentId) ? `Story \u00b7 ${esc(beatById(card.momentId).arc)}` : 'Meanwhile'} \u00b7 Day ${run.day}</p>
      <div class="g-emblem">${card.icon || '\u2728'}</div>
      <h2>${esc(card.title)}</h2>
      <p class="g-lede">${esc(card.text)}</p>
      <div class="g-choices">${buttons}</div>
    </div>
  </section>`
}

// Today's three goals (must, story, dream) and the year dream underneath.
function goalsCardHtml(run) {
  const list = run.goals?.list || []
  const dream = dreamOf(run)
  const pct = Math.round(dreamProgress(run) * 100)
  return `<div class="g-scrim soft" data-act="dismiss"></div>
  <aside class="g-result g-goals" role="dialog" aria-label="Today's goals" data-goals="${list.length}">
    <p class="g-kind">Day ${run.day} \u00b7 Today's goals</p>
    <h2>${list.every((g) => g.done) && list.length ? 'All done today' : esc(DAY_THEMES[run.day] || 'Three things today')}</h2>
    <ol class="g-goal-list">${list.map((g) => `<li class="${g.kind}${g.done ? ' done' : ''}"><span class="g-gk">${GOAL_KIND[g.kind]}</span><span>${esc(goalText(run, g))}</span><b>${g.done ? '\u2713' : ''}</b></li>`).join('')}</ol>
    ${run.goals?.text ? `<p class="g-lasttext">\u{1F4AC} <b>${esc(run.goals.text.from)}:</b> ${esc(run.goals.text.text)}</p>` : ''}
    ${run.day <= 5 ? `<p class="g-week">\u{1F4C5} This week: ${esc(WEEK_GOAL.text)} <b>${Math.min(weekStudied(run), WEEK_GOAL.need)}/${WEEK_GOAL.need}</b></p>` : ''}
    <p class="g-title">${esc(identityTitle(run).text)}</p>
    <p class="g-dream"><span>${dream.icon} Year dream: <b>${esc(dream.label)}</b></span><i><em style="width:${Math.max(3, pct)}%"></em></i><small>${pct}%</small></p>
    <button type="button" class="g-go block" data-act="dismiss">Let's go</button>
  </aside>`
}

/// The goal badge under the top bar (owner, 10 Nov: the goal chip shrinks to its "1/3"
// badge; tapping it shows the goal text). The "right now" line and today's goals open
// under it for a few seconds; tapping that opens the full goals card. An urgent line
// (late for a lecture) keeps a red edge on the badge so it is never missed. The status
// chips (exam week, falling behind...) sit beside it as icons; a tap explains them.
function goalBits(run) {
  const now = rightNow(run)
  const list = run.goals?.day === run.day ? run.goals.list : []
  const chips = statusChips(run)
  if (!now && !list.length && !chips.length) return { badge: '', chips: '', peek: '' }
  const done = list.filter((g) => g.done).length
  const open = Boolean(ui.goalPeek)
  const badge = now || list.length
    ? `<button type="button" class="g-goalsbtn${list.length && done === list.length ? ' win' : ''}${now?.tone === 'urgent' ? ' urgent' : ''}${open ? ' on' : ''}" data-act="goal-peek" aria-expanded="${open}" aria-label="Today's goals${list.length ? `, ${done} of ${list.length} done` : ''}">\u{1F3AF}${list.length ? ` ${done}/${list.length}` : ''}</button>`
    : ''
  const peek = `<div class="tb-goal"${open ? '' : ' hidden'}>${now ? `<p class="g-now ${now.tone}" role="status" data-now>${now.icon} ${esc(now.text)}</p>` : ''}${list.length ? `<button type="button" class="tb-goal-list" data-act="goals"><ol>${list.map((g) => `<li class="${g.done ? 'done' : ''}"><b>${g.done ? '✓' : '•'}</b> ${esc(goalText(run, g))}</li>`).join('')}</ol><small>All goals ›</small></button>` : ''}</div>`
  const chipRow = chips.map(([k, ic, c]) => `<button type="button" class="g-chip tb-chip ${k}" data-act="stat" data-k="chip-${k}" aria-label="${esc(c)}">${ic}</button>`).join('')
  return { badge, chips: chipRow, peek }
}

function summaryCard(state) {
  const { run } = state
  const s = run.summary || {}
  const line = s.hungry ? 'You slept hungry. Tomorrow starts a little tired.'
    : s.slept ? 'You made it to bed. Energy refills overnight.'
      : 'You never slept. Tomorrow starts 30 energy down.'
  const review = s.review || { done: [], missed: [] }
  const c = run.crush
  const people = [
    run.bestieName ? [run.bestieName, run.people?.[run.bestieName.toLowerCase()]?.close || 0] : null,
    c?.met ? [c.nameKnown ? c.name : 'The one from the bus', Math.min(100, (c.closeness || 0) * 4)] : null,
  ].filter(Boolean)
  const reasons = comeBackReasons(run)
  return `<div class="g-scrim"></div>
  <aside class="g-result g-summary" role="dialog" data-screen-card="summary">
    <p class="g-kind">End of day ${s.day || run.day}</p>
    <h2>${s.slept ? 'Lights out' : "That's the day"}</h2>
    ${review.done.length || review.missed.length ? `<ul class="g-review">${review.done.map((t) => `<li class="ok">\u2705 ${esc(t)}</li>`).join('')}${review.missed.map((m) => `<li class="miss">\u274C ${esc(m.text)}${m.then ? `<small>${esc(m.then)}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${review.title && review.title.level !== 'new' ? `<p class="g-shift">\u2728 People are starting to see you as: <b>${esc(review.title.path.name)}</b></p>` : `<p class="g-shift">\u2728 Still the new kid. Tomorrow you choose again.</p>`}
    ${people.length ? `<div class="g-ppl">${people.map(([name, close]) => `<span>${esc(name)}<i><em style="width:${Math.max(4, close)}%"></em></i></span>`).join('')}</div>` : ''}
    <p>${esc(line)}</p>
    <ul class="g-delta">${summaryRows(state.morning, run.stats)}</ul>
    ${s.text ? `<div class="g-phone" data-cliff><p class="g-phone-top">\u{1F4F1} New message</p><p class="g-phone-from">${esc(s.text.from)}</p><p class="g-phone-msg">${esc(s.text.text)}</p></div>` : ''}
    ${reasons.length ? `<p class="g-reasons">Day ${(s.day || run.day) + 1} starts when you're ready: ${reasons.map(esc).join(' \u00b7 ')}</p>` : ''}
    <div class="g-two"><button type="button" class="g-go ghost" data-act="share-day">\u{1F4E4} Share my day</button><button type="button" class="g-go" data-act="next">Start day ${(s.day || run.day) + 1}</button></div>
  </aside>`
}

export const viewFlags = { world: false, gl: true }

export function viewPref() {
  return getView() // (this visit's choice; every visit starts in the 3D Sims view: src/cammode.js)
}

function viewBar(world) {
  let cam = getCam()
  const shot = new URLSearchParams(location.search).get('shot') || ''
  if (shot.startsWith('cam-')) cam = shot.slice(4)
  const views = [['top', '\u25A3', 'Top'], ['sims', '\u25E2', 'Sims'], ['eye', '\u25C9', 'Eye']]
  const gl = viewFlags.gl
  return `<nav class="g-views" aria-label="View">${views.map(([id, ic, label]) => `<button type="button" class="g-view" data-act="view" data-mode="${id}" aria-pressed="${world && cam === id}"${gl ? '' : ' disabled title="3D needs WebGL"'}>${ic} ${label}</button>`).join('')}<button type="button" class="g-view" data-act="view" data-mode="map" aria-pressed="${!world}">\u{1F5FA}\uFE0F Map</button></nav>${gl ? '' : '<p class="g-nogl" role="status">3D is off on this device (no WebGL). Showing the map.</p>'}`
}

export function mapHome(state, openPlace = '') {
  const world = viewFlags.world
  const { district, run } = state
  const here = hereOf(district, run)
  const home = homePlaceId(district, run.character.residence)
  const hero = world ? null : heroOf(district, run)
  const crowd = world ? {} : crowdAt(district)
  const event = world ? '' : quadEvent(district, run)
  const pins = world ? '' : district.places.map((place) => {
    const st = placeStatus(district, run, place.id)
    const house = district.houses?.find((h) => h.place === place.id)
    const art = house ? residence(house.short[0], house.main) : (ART[place.id] || ART.library)()
    const label = house ? house.short : placeName(place)
    const called = `${house ? house.name : place.name}${place.id === home ? ', your house' : ''}${st.label ? ', ' + st.label : ''}`
    return pinHtml(place, st, { house, mine: place.id === home, sel: openPlace === place.id, hero, art, label, called, crowd: crowd[place.id] || 0, event })
  }).join('')
  const [ax, ay] = layoutOf(here)
  let layer = ''
  if (ui.talk) layer = talkCard(run)
  else if (run.queue?.[0]) layer = resultCard(state)
  else if (run.mode === 'summary') layer = summaryCard(state)
  else if (run.lectureCard) {
    layer = `<div class="g-scrim"></div><aside class="g-result g-lecture" role="dialog" aria-label="Lecture starts"><p class="g-kind">${esc(venueFor(run).name)} \u00b7 09:00</p><h2>Lecture starts</h2><p>You made it to your first lecture. Find a seat \u2014 the full lecture is coming soon.</p><button type="button" class="g-go block" data-act="lecture-go">Continue</button></aside>`
  } else if (run.promptSave && !run.userId && !run.saveSnooze && run.mode === 'play') {
    layer = `<div class="g-scrim"></div><aside class="g-result"><p class="g-kind">Day ${run.day}</p><h2>Keep ${esc(run.character.name)}?</h2><p>Guests live on this phone only. Make a free account so this student survives a cleared browser.</p><div class="g-two"><button type="button" class="g-go ghost" data-act="snooze">Not now</button><button type="button" class="g-go" data-act="nav" data-go="save">Save progress</button></div></aside>`
  } else if (openPlace) layer = sheetHtml(district, run, openPlace)
  return `<main class="screen g-screen${world ? ' g-3d' : ''}" data-screen="${run.mode === 'summary' ? 'summary' : openPlace ? 'place' : 'play'}">
    ${hud(district, run, { goals: run.mode === 'play' })}
    ${viewBar(world)}
    ${world ? '<section class="g-map g-world-gap" aria-label="3D campus"></section>' : `<section class="g-map g-campus" data-tod="${todOf(run)}" aria-label="Campus map">
      ${groundHtml()}
      ${hero && hero.id !== here ? routeSvg([ax, ay], layoutOf(hero.id)) : ''}
      ${pins}
      <span class="g-me" id="g-me" style="left:${ax}%;top:${ay}%" aria-label="You"><span class="g-me-head">${esc((run.character.name || '?').slice(0, 1).toUpperCase())}</span><span class="g-me-tag">You</span></span>
    </section>`}
    ${run.mode === 'play' && !layer ? ctaBar(district, run) : ''}
    ${ui.notice ? `<p class="g-notice" role="status">${esc(ui.notice)}</p>` : ''}
    ${layer}
  </main>`
}

export function morningScreen(state) {
  const { district, run } = state
  const left = 9 * 60 - run.minutes
  // Day 1 is leaving home (world/home.js): no lecture countdown yet, and the three cameras.
  if (run.day === 1) {
    return `<main class="screen g-screen g-3d g-morning g-home-day" data-screen="morning">
    ${hud(district, run)}
    <p class="g-goal" role="status"><span>\u{1F3E0} Leaving home today. Next stop: UMzansi.</span></p>
    ${viewBar(true).replace(/<button[^>]*data-mode="map"[^>]*>.*?<\/button>/, '')}
  </main>`
  }
  return `<main class="screen g-screen g-3d g-morning" data-screen="morning">
    ${hud(district, run)}
    <p class="g-goal${left <= 15 ? ' late' : ''}" role="status"><span>\u{1F3AF} Get to your 9:00 lecture on time.</span><b>${left > 0 ? `${left} min left` : `${-left} min late`}</b></p>
  </main>`
}

// A conversation: compact at the bottom, so you still see the two of you talking above it.
function talkCard(run) {
  const t = ui.talk
  const chat = chatFor(run, t.id)
  if (!chat) return ''
  const close = t.res ? t.res.close : chat.close
  const level = t.res ? t.res.level : chat.level
  const head = `<div class="g-talk-head"><span class="g-talk-ic">${esc(chat.name.replace(/^Mam' /, '').slice(0, 1))}</span>
    <div><h2>${esc(chat.name)}${chat.country ? ` <span class="g-talk-flag" title="${esc(chat.country)}">${flagOf(chat.country)}</span>` : ''}</h2><small>${esc(chat.role)}${chat.met || t.res ? '' : ' \u00b7 first meeting'}</small></div>
    <span class="g-talk-level">${esc(level)}<i style="width:${Math.max(4, close)}%"></i></span></div>`
  const acts = talkActions(run, t.id)
  const actRow = acts.length ? `<div class="g-talk-acts">${acts.map((a) => `<button type="button" class="g-talk-act" data-act="talk-act" data-kind="${a.kind}"><b>${esc(a.label)}</b><small>${esc(a.note)}</small></button>`).join('')}</div>` : ''
  const menu = MENUS[t.id]
  const money = run.stats.money || 0
  const priceBtn = (attrs, name, icon, price, fx) => `<button type="button" class="g-talk-item"${money < price ? ' disabled' : ''} ${attrs}><span>${icon || ''} ${esc(name)}</span><b>R${price}</b>${effectChips(fx)}${money < price ? '<small>Not enough money</small>' : ''}</button>`
  // Ordering: the menu, then a size if it has sizes, then sit and eat or take it to go.
  if (menu && t.bought) {
    return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="bought">
      ${head}
      <p class="g-talk-line">Here you go, baby. One ${esc(t.bought.label)}. R${t.bought.price}, thank you!</p>
      <div class="g-two"><button type="button" class="g-go ghost" data-act="talk-eat" data-how="go">\u{1F6B6} Take it to go</button><button type="button" class="g-go" data-act="talk-eat" data-how="sit">\u{1FA91} Sit and eat</button></div>
    </section>`
  }
  if (menu && t.item) {
    const item = menu.items.find((i) => i.id === t.item)
    return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="size">
      ${head}
      <p class="g-talk-you">\u201c${esc(item.name)}, please.\u201d</p>
      <p class="g-talk-line">${esc(item.ask)}</p>
      <div class="g-talk-menu">${item.sizes.map((s) => priceBtn(`data-act="talk-size" data-size="${s.id}"`, s.name, item.icon, s.price, s.fx)).join('')}</div>
      <button type="button" class="g-talk-leave" data-act="talk-menu">\u2190 Something else</button>
    </section>`
  }
  if (menu && t.menu) {
    return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="menu">
      ${head}
      <p class="g-talk-line">${esc(menu.hello)}</p>
      <div class="g-talk-menu">${menu.items.map((i) => i.sizes ? `<button type="button" class="g-talk-item" data-act="talk-item" data-item="${i.id}"><span>${i.icon} ${esc(i.name)}</span><b>from R${Math.min(...i.sizes.map((s) => s.price))}</b><small>${esc(i.ask)}</small></button>` : priceBtn(`data-act="talk-item" data-item="${i.id}"`, i.name, i.icon, i.price, i.fx)).join('')}</div>
      <button type="button" class="g-talk-leave" data-act="talk-bye">\u{1F44B} Nothing for now, thanks</button>
    </section>`
  }
  if (t.swapped) {
    return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="swapped">
      ${head}
      ${t.answer ? `<p class="g-talk-line">${esc(t.answer)}</p>` : ''}
      <p class="g-talk-line">\u{1F4F1} ${esc(chat.name)} is in your phone now. \u201cText me, hey!\u201d</p>
      ${actRow}
      <div class="g-two"><button type="button" class="g-go ghost" data-act="talk-bye" data-away="1">\u{1F44B} Bye</button><button type="button" class="g-go" data-act="talk-phone">\u{1F4F1} See your phone</button></div>
    </section>`
  }
  if (t.res) {
    const r = t.res
    const chips = [
      r.social ? `<span class="g-fx ${r.social > 0 ? 'up' : 'down'}">\u{1F465} ${r.social > 0 ? '+' : ''}${r.social} Social</span>` : '',
      r.closeDelta ? `<span class="g-fx ${r.closeDelta > 0 ? 'up' : 'down'}">${r.closeDelta > 0 ? '\u{1F91D} Closer' : '\u{1F9CA} Cooler'}</span>` : '',
    ].join('')
    return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="answer">
      ${head}
      <p class="g-talk-you">\u201c${esc(t.said)}\u201d</p>
      <p class="g-talk-line">${esc(r.answer)}</p>
      ${chips ? `<p class="g-talk-fx">${chips}</p>` : ''}
      ${r.levelUp ? `<p class="g-talk-up">\u2B50 You and ${esc(chat.name)} are now: ${esc(r.level)}</p>` : ''}
      ${r.act === 'bye' ? `<button type="button" class="g-go block" data-act="talk-bye" data-away="1">\u{1F44B} Bye, ${esc(chat.name.split(' ')[0])}</button>` : `${actRow}
      <div class="g-two"><button type="button" class="g-go ghost" data-act="talk-bye" data-away="1">\u{1F44B} Bye</button><button type="button" class="g-go" data-act="talk-more">Keep talking</button></div>`}
    </section>`
  }
  return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="line">
    ${head}
    <p class="g-talk-line">${esc(chat.line)}</p>
    ${actRow}
    <div class="g-talk-replies">${chat.replies.map((r, i) => `<button type="button" class="g-talk-reply" data-act="talk-reply" data-i="${i}">${esc(r.text)}</button>`).join('')}</div>
    <button type="button" class="g-talk-leave" data-act="talk-bye" data-away="1">\u{1F44B} Walk away</button>
  </section>`
}

export function lectureScreen(state) {
  const { district, run } = state
  return `<main class="screen g-screen g-3d g-morning g-lecture-screen" data-screen="lecture">
    ${hud(district, run)}
    <p class="g-goal" role="status"><span>\u{1F3AF} Find a seat and get through the lecture.</span><b>${esc(venueFor(run).name)}</b></p>
  </main>`
}

export function withHud(state, html) {
  if (!state.run) return html
  return html.replace(/(<main[^>]*>)/, `$1${hud(state.district, state.run, { strip: false })}`)
}

const TONE = {
  behind: ['\u{1F4C9}', 'Consequence'],
  broke: ['\u{1F35C}', 'Consequence'],
  hungry: ['\u{1F971}', 'Consequence'],
  over: ['\u{1F6AA}', 'Game over'],
}

function eventCard(state, card) {
  const event = state.district.events.find((item) => item.id === card.eventId) || {}
  const buttons = card.choices.map((label, i) => {
    const deltas = event.choices?.[i]?.deltas || {}
    return `<button type="button" class="g-choice" data-act="choice" data-i="${i}"><strong>${esc(label)}</strong><span class="g-act-fx">${effectChips(deltas)}</span></button>`
  }).join('')
  return `<section class="g-full g-event" role="dialog" aria-label="${esc(card.title)}" data-screen-card="event">
    <div class="g-full-in">
      <p class="g-kind">Today's event \u00b7 Day ${state.run.day}</p>
      <div class="g-emblem">${event.icon || '\u2728'}</div>
      <h2>${esc(card.title)}</h2>
      <p class="g-lede">${esc(card.text)}</p>
      <div class="g-choices">${buttons}</div>
    </div>
  </section>`
}

function consequenceCard(card) {
  const tone = card.kind === 'over' ? 'over' : card.tone || 'behind'
  const [icon, label] = TONE[tone] || TONE.behind
  return `<section class="g-full g-cons ${tone}" role="dialog" aria-label="${esc(card.title)}" data-screen-card="consequence">
    <div class="g-full-in">
      <p class="g-kind">${label}</p>
      <div class="g-emblem">${icon}</div>
      <h2>${esc(card.title)}</h2>
      <p class="g-lede">${esc(card.text)}</p>
      ${tone === 'over' ? '' : `<p class="g-chipnote">Watch for the <b>${esc(card.title === 'Broke' ? 'Noodles only' : card.title === 'You slept hungry' ? 'Slept hungry' : card.title)}</b> chip in your top bar while it lasts.</p>`}
      <button type="button" class="g-go block" data-act="dismiss">${tone === 'over' ? 'See what happened' : 'Got it'}</button>
    </div>
  </section>`
}

function milestoneCard(state, card) {
  const grad = card.id.startsWith('grad')
  if (grad) return graduationScreen(state, card)
  return `<div class="g-scrim"></div>
  <aside class="g-result g-mile" role="dialog" data-screen-card="milestone">
    <p class="g-kind">\u2B50 Milestone</p>
    <h2>${esc(card.title)}</h2>
    <p>${esc(card.text)}</p>
    <div class="g-two"><button type="button" class="g-go ghost" data-act="share-milestone" data-id="${esc(card.id)}">\u{1F4E4} Share</button><button type="button" class="g-go" data-act="dismiss">Nice</button></div>
    <button type="button" class="g-link" data-act="nav" data-go="milestones">All milestones</button>
  </aside>`
}

function confetti() {
  const colors = ['#ffd23f', '#ff8a3d', '#d77bff', '#6fb6ff', '#47d18c']
  return Array.from({ length: 24 }, (_, i) => `<i style="left:${(i * 41) % 100}%;background:${colors[i % 5]};animation-delay:${(i % 8) * 0.25}s;animation-duration:${3 + (i % 4) * 0.6}s"></i>`).join('')
}

function graduationScreen(state, card) {
  const { run } = state
  return `<section class="g-full g-grad" role="dialog" aria-label="Graduated" data-screen-card="graduation">
    <div class="g-confetti" aria-hidden="true">${confetti()}</div>
    <div class="g-full-in">
      <p class="g-kind">Day ${run.day} \u00b7 First year complete</p>
      <div class="g-emblem big">\u{1F393}</div>
      <h2>${esc(run.character.name)} graduated first year</h2>
      <p class="g-lede">${esc(card.text)}</p>
      <ul class="g-delta">${summaryRows(null, run.stats)}</ul>
      <div class="g-two"><button type="button" class="g-go ghost" data-act="nav" data-go="share">Share it</button><button type="button" class="g-go" data-act="dismiss">Celebrate</button></div>
    </div>
  </section>`
}

export function gameOverScreen(state) {
  const { run, district } = state
  return `<main class="screen g-screen g-overscreen" data-screen="gameover">
    <section class="g-full g-cons over static">
      <div class="g-full-in">
        <p class="g-kind">Game over \u00b7 Day ${run.day}</p>
        <div class="g-emblem">\u{1F6AA}</div>
        <h2>Excluded</h2>
        <p class="g-lede">${esc(run.excludeText || 'Excluded.')} ${esc(run.character.name)}'s first year at ${esc(district.meta.name)} ends here.</p>
        <p class="g-chipnote">Next time: keep grades above ${district.meta.day.lowGrades}, attend lectures, and never fall behind in exam week.</p>
        <ul class="g-delta">${summaryRows(null, run.stats)}</ul>
        <button type="button" class="g-go block" data-act="restart">Start first year again</button>
        <button type="button" class="g-go ghost block" data-act="new">New character</button>
      </div>
    </section>
  </main>`
}

export function milestonesScreen(state) {
  const { run, district } = state
  const list = district.meta.milestones || []
  const done = (m) => {
    if (m.badge) return run.badges.includes(m.badge)
    if (m.id === 'graduate') return run.graduated
    if (m.exam) return run.day >= m.day || run.examWeek
    return run.day >= (m.day || 1)
  }
  const progress = (m) => {
    if (m.badge === 'lectures') return `${Math.min(run.lectureStreak || 0, district.meta.day.streakBadge)} of ${district.meta.day.streakBadge} in a row`
    if (m.day) return run.day >= m.day ? `Day ${m.day}` : `Day ${m.day} \u00b7 ${m.day - run.day} day${m.day - run.day === 1 ? '' : 's'} to go`
    return ''
  }
  const got = list.filter(done).length
  const rows = list.map((m) => {
    const ok = done(m)
    return `<li class="${ok ? 'got' : 'locked'}"><span class="g-ms-ic">${ok ? m.icon : '\u{1F512}'}</span><div><strong>${esc(m.title)}</strong><p>${esc(m.text)}</p><small>${esc(ok ? 'Unlocked' : progress(m))}</small></div></li>`
  }).join('')
  return `<main class="screen g-screen lg" data-screen="milestones">
    ${hud(district, run, { strip: false })}
    <div class="lg-top"><a class="lg-back" href="#/play">\u2190 Back to campus</a></div>
    <article class="lg-card g-ms">
      <p class="lg-kicker">First year</p>
      <h1>Milestones</h1>
      <p class="g-ms-sum"><b>${got}</b> of ${list.length} unlocked \u00b7 Day ${run.day} of ${district.meta.day.graduateDay}</p>
      <div class="g-ms-bar"><span style="width:${Math.round((Math.min(run.day, district.meta.day.graduateDay) / district.meta.day.graduateDay) * 100)}%"></span></div>
      <ol class="g-ms-list">${rows}</ol>
    </article>
  </main>`
}
