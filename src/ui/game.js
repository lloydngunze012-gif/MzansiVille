import { actionState, actionsAt, weekdayName } from '../engine/sim.js'
import { formatClock, formatMoney, toMinutes } from '../engine/format.js'
import { homePlaceId } from '../engine/model.js'
import { cardHtml, esc, summaryRows } from './render.js'
import './game.css'

// UI-only state that should not be saved.
export const ui = { tip: '', gear: false, confirmReset: false, delta: null, notice: '' }

// Display layout (percent of map box). Keeps places.csv geography (north up)
// but spreads the clustered centre so every label is tappable at 360px.
const LAYOUT = {
  science: [34, 9], law: [68, 11],
  engineering: [13, 27], library: [37, 28], sports_centre: [86, 27],
  cafeteria: [70, 38], quad: [50, 45], smig: [22, 47],
  health_sciences: [76, 54], res_other: [12, 61],
  res_o: [17, 73], res_r: [36, 73], res_s: [27, 84],
  bus_station: [60, 74], gate: [62, 88], off_campus: [86, 88],
}
const ICON = {
  hub: '\u{1F333}', food: '\u{1F37D}', transit: '\u{1F68C}', venue: '\u26BD', study: '\u{1F4DA}',
  lecture: '\u{1F393}', residence: '\u{1F3E0}',
}
const SHORT = {
  'SMIG Lecture Venue': 'SMIG', 'Health Sciences Lecture Venue': 'Health Sci', 'Science Lecture Venue': 'Science',
  'Law Lecture Venue': 'Law', 'Engineering Lecture Venue': 'Engineering', 'Other on-campus blocks': 'Other blocks',
  'Off-campus res (bus home)': 'Off-campus res', 'Main Bus Station': 'Bus station',
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
  const at = opensAt(district, run, placeId)
  if (at) return { open: false, label: `opens ${at}` }
  const closed = items.find((item) => /Closed/.test(item.state.reason))
  if (closed) return { open: false, label: 'closed' }
  return { open: false, label: items.length ? 'done today' : '' }
}

function bar(key, word, color, value, max) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  const shown = key === 'money' ? formatMoney(value) : value
  return `<button class="g-stat${ui.tip === key ? ' on' : ''}" type="button" data-act="stat" data-k="${key}" aria-label="${word} ${shown}">
    <span class="g-stat-top"><b>${word}</b><i>${esc(String(shown))}</i></span>
    <span class="g-bar"><span style="width:${pct}%;background:${color}"></span></span>
  </button>`
}

export function phaseStrip(district, run) {
  const phases = district.meta.phases
  const idx = phases.findIndex((p) => p.id === run.phase)
  const segs = phases.map((p, i) => `<li class="${i < idx ? 'past' : i === idx ? 'now' : ''}"><b>${PHASE_SHORT[p.id] || p.label}</b><small>${p.start}</small></li>`).join('')
  const total = district.meta.day.slots
  const pipsHtml = Array.from({ length: total }, (_, i) => `<i class="${i < run.slotsLeft ? 'full' : ''}"></i>`).join('')
  return `<div class="g-phases" aria-label="Phase of the day"><ol>${segs}</ol><div class="g-slots" title="Time slots left today"><span>${pipsHtml}</span><small>${run.slotsLeft} of ${total} slots</small></div></div>`
}

export function hud(district, run, opts = {}) {
  if (!run) return ''
  const day = weekdayName(district.meta, run.day).slice(0, 3)
  const tip = STATS.find((s) => s[0] === ui.tip)
  const chips = [run.examWeek ? 'Exam week' : '', run.status || '', run.noodlesOnly ? 'Noodles only' : ''].filter(Boolean)
  return `<header class="g-hud">
    <div class="g-row">
      <span class="g-day"><b>Day ${run.day}</b> ${day}</span>
      <span class="g-clock">${formatClock(run.minutes)}</span>
      <button class="g-gear" type="button" data-act="gear" aria-label="Menu">\u2699\uFE0F</button>
    </div>
    <div class="g-stats">${STATS.map(([k, w, c]) => bar(k, w, c, run.stats[k], k === 'money' ? 3000 : (k === 'energy' ? run.energyCap : 100))).join('')}</div>
    ${tip ? `<p class="g-tip" role="status">${esc(tip[3])}</p>` : ''}
    ${chips.length ? `<p class="g-chips">${chips.map((c) => `<span>${esc(c)}</span>`).join('')}</p>` : ''}
    ${opts.strip === false ? '' : phaseStrip(district, run)}
  </header>
  ${ui.gear ? gearMenu(run) : ''}`
}

export function soundOn() {
  try { return localStorage.getItem('mzansiville.sound') !== 'off' } catch { return true }
}

function gearMenu(run) {
  return `<div class="g-scrim" data-act="gear"></div>
  <aside class="g-menu" role="dialog" aria-label="Menu">
    <h3>Menu</h3>
    <button type="button" data-act="sound">Sound: <b>${soundOn() ? 'On' : 'Off'}</b></button>
    <button type="button" data-act="nav" data-go="profile">Student card</button>
    <button type="button" data-act="nav" data-go="board">Leaderboard</button>
    <button type="button" data-act="nav" data-go="chat">Campus chat</button>
    <button type="button" data-act="nav" data-go="rules">Community rules</button>
    <button type="button" data-act="nav" data-go="privacy">Privacy</button>
    <button type="button" data-act="nav" data-go="world">3D campus (beta)</button>
    ${ui.confirmReset
      ? '<button type="button" class="danger" data-act="new">Tap again: delete this student</button>'
      : '<button type="button" data-act="reset">Reset character</button>'}
    ${run.userId ? '<button type="button" data-act="signout">Sign out</button>' : '<button type="button" data-act="nav" data-go="save">Save progress / sign in</button>'}
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

function sheetHtml(district, run, placeId) {
  const place = district.places.find((p) => p.id === placeId)
  if (!place) return ''
  const items = visibleActions(district, run, placeId)
  const status = placeStatus(district, run, placeId)
  const rows = items.map(({ action, state }) => {
    const mins = action.slots > 0 ? (district.meta.slotMinutes[run.phase] || 30) * action.slots : 10
    const cost = [action.slots ? `${action.slots} slot${action.slots > 1 ? 's' : ''}` : 'free', `${mins} min`].join(' \u00b7 ')
    const warn = ''
    return `<button class="g-act" type="button" data-act="do" data-id="${action.id}" data-place="${placeId}"${state.disabled ? ' disabled' : ''}>
      <span class="g-act-top"><strong>${esc(action.name)}</strong><small>${cost}</small></span>
      <span class="g-act-fx">${effectChips(action.deltas)}</span>
      ${action.twist ? `<span class="g-twist">${esc(action.twist)}</span>` : ''}
      ${state.disabled ? `<span class="g-why">${esc(state.reason)}</span>` : warn}
    </button>`
  }).join('')
  const empty = status.label ? `Nothing here right now \u00b7 ${status.label}.` : 'Nothing to do here this phase.'
  return `<div class="g-scrim soft" data-act="close-sheet"></div>
  <section class="g-sheet" role="dialog" aria-label="${esc(place.name)}">
    <div class="g-grab"></div>
    <div class="g-sheet-head"><span>${ICON[place.kind] || ''}</span><div><h2>${esc(place.name)}</h2><p>${esc(place.blurb || '')}</p></div><button type="button" class="g-x" data-act="close-sheet" aria-label="Close">\u00d7</button></div>
    <div class="g-acts">${rows || `<p class="g-empty">${esc(empty)}</p>`}</div>
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
  if (run.phase === 'night') line = 'Night. Go home and sleep to end the day.'
  else if (run.slotsLeft === 1) line = `1 slot left \u2014 keep it for Sleep at 21:00.`
  else if (glowing.length) line = `Tap a glowing place: ${glowing.slice(0, 2).map(placeName).join(' or ')}.`
  else line = 'Nothing open now.'
  if (run.phase === 'night') {
    return `<div class="g-cta"><p>${esc(line)}</p><button type="button" class="g-go" data-act="place-open" data-id="${sleepPlace}">Go home</button></div>`
  }
  const skipLabel = next ? `Skip to ${PHASE_SHORT[next.id]} ${next.start}` : 'End day'
  const jump = run.slotsLeft === 1 ? '<button type="button" class="g-go" data-act="to-night">Skip to Night</button>' : ''
  return `<div class="g-cta"><p>${esc(line)}</p>${jump || `<button type="button" class="g-go ghost" data-act="phase">${skipLabel}</button>`}</div>`
}

function resultCard(state) {
  const { run } = state
  const q = run.queue
  const card = q[0]
  if (!card) return ''
  if (card.choices || card.kind === 'shop') return `<div class="g-card-wrap">${cardHtml(card, state)}</div>`
  const twist = card.kind === 'result' && q[1]?.kind === 'twist' ? q[1] : null
  const label = { result: 'Done', twist: 'Meanwhile', spot: 'Spot test', bestie: 'Your bestie', milestone: 'Milestone', event: 'Event' }[card.kind] || 'Note'
  const fx = card.kind === 'result' && ui.delta && card.id.startsWith('result-') ? effectChips(ui.delta, 'big') : ''
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

function summaryCard(state) {
  const { run } = state
  const s = run.summary || {}
  const line = s.hungry ? 'You slept hungry. Tomorrow starts a little tired.'
    : s.slept ? 'You made it to bed. Energy refills overnight.'
      : 'You never slept. Tomorrow starts 30 energy down.'
  return `<div class="g-scrim"></div>
  <aside class="g-result g-summary" role="dialog" data-screen-card="summary">
    <p class="g-kind">End of day ${s.day || run.day}</p>
    <h2>${s.slept ? 'Lights out' : "That's the day"}</h2>
    <p>${esc(line)}</p>
    <ul class="g-delta">${summaryRows(state.morning, run.stats)}</ul>
    <div class="g-two"><button type="button" class="g-go ghost" data-act="nav" data-go="share">Share my day</button><button type="button" class="g-go" data-act="next">Start day ${(s.day || run.day) + 1}</button></div>
  </aside>`
}

function mapSvg() {
  const lines = Object.keys(LAYOUT).filter((k) => k !== 'quad').map((k) => {
    const [x, y] = LAYOUT[k]
    return `<line x1="50" y1="45" x2="${x}" y2="${y}" />`
  }).join('')
  return `<svg class="g-ground" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><radialGradient id="gq" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#2f6b3f"/><stop offset="1" stop-color="#173825"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#gq)"/>
    <path d="M0 95 Q30 90 50 93 T100 92 L100 100 L0 100Z" fill="#2a2f3a"/>
    <ellipse cx="50" cy="45" rx="14" ry="7" fill="#3e8a52" stroke="#9fd8a8" stroke-opacity=".25" stroke-width=".4"/>
    <g stroke="#e9dcb8" stroke-opacity=".35" stroke-width=".9" stroke-linecap="round" vector-effect="non-scaling-stroke">${lines}</g>
    <g fill="#215234">${[[8, 15], [92, 14], [6, 85], [94, 70], [55, 20], [45, 62], [88, 45], [8, 45]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g>
  </svg>`
}

export function mapHome(state, openPlace = '') {
  const { district, run } = state
  const here = hereOf(district, run)
  const home = homePlaceId(district, run.character.residence)
  const pins = district.places.map((place) => {
    const [x, y] = layoutOf(place.id)
    const st = placeStatus(district, run, place.id)
    const mine = place.id === home ? ' mine' : ''
    return `<button type="button" class="g-pin ${st.open ? 'open' : 'dim'}${mine}${openPlace === place.id ? ' sel' : ''}" data-act="place-open" data-id="${place.id}" style="left:${x}%;top:${y}%">
      <span class="g-dot">${ICON[place.kind] || ''}</span>
      <span class="g-name">${esc(placeName(place))}${place.id === home ? ' \u00b7 home' : ''}</span>
      ${st.open ? '' : st.label ? `<small>${esc(st.label)}</small>` : ''}
    </button>`
  }).join('')
  const [ax, ay] = layoutOf(here)
  let layer = ''
  if (run.mode === 'summary') layer = summaryCard(state)
  else if (run.queue?.[0]) layer = resultCard(state)
  else if (run.promptSave && !run.userId && !run.saveSnooze && run.mode === 'play') {
    layer = `<div class="g-scrim"></div><aside class="g-result"><p class="g-kind">Day ${run.day}</p><h2>Keep ${esc(run.character.name)}?</h2><p>Guests live on this phone only. Make a free account so this student survives a cleared browser.</p><div class="g-two"><button type="button" class="g-go ghost" data-act="snooze">Not now</button><button type="button" class="g-go" data-act="nav" data-go="save">Save progress</button></div></aside>`
  } else if (openPlace) layer = sheetHtml(district, run, openPlace)
  return `<main class="screen g-screen" data-screen="${run.mode === 'summary' ? 'summary' : openPlace ? 'place' : 'play'}">
    ${hud(district, run)}
    <section class="g-map" aria-label="Campus map">
      ${mapSvg()}
      ${pins}
      <span class="g-me" id="g-me" style="left:${ax}%;top:${ay}%" aria-label="You"><span>${esc((run.character.name || '?').slice(0, 1).toUpperCase())}</span></span>
    </section>
    ${run.mode === 'play' && !layer ? ctaBar(district, run) : ''}
    ${ui.notice ? `<p class="g-notice" role="status">${esc(ui.notice)}</p>` : ''}
    ${layer}
  </main>`
}

export function withHud(state, html) {
  if (!state.run) return html
  return html.replace(/(<main[^>]*>)/, `$1${hud(state.district, state.run, { strip: false })}`)
}
