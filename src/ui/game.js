import { actionState, actionsAt, weekdayName } from '../engine/sim.js'
import { formatClock, formatMoney, toMinutes } from '../engine/format.js'
import { homePlaceId } from '../engine/model.js'
import { cardHtml, esc, summaryRows } from './render.js'
import { ART, LAYOUT, groundHtml } from './campus.js'
import './game.css'

// UI-only state that should not be saved.
export const ui = { tip: '', gear: false, confirmReset: false, delta: null, notice: '' }

const ICON = {
  hub: '\u{1F333}', food: '\u{1F37D}', transit: '\u{1F68C}', venue: '\u26BD', study: '\u{1F4DA}',
  lecture: '\u{1F393}', residence: '\u{1F3E0}',
}
const SHORT = {
  'SMIG Lecture Venue': 'SMIG', 'Health Sciences Lecture Venue': 'Health Sci', 'Science Lecture Venue': 'Science',
  'Law Lecture Venue': 'Law', 'Engineering Lecture Venue': 'Engineering', 'Other on-campus blocks': 'Other blocks',
  'Off-campus res (bus home)': 'Off-campus res', 'Main Bus Station': 'Bus station',
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
  const tip = STATS.find((s) => s[0] === ui.tip) || CHIP_TIPS.find((s) => `chip-${s[0]}` === ui.tip)
  const chips = statusChips(run)
  return `<header class="g-hud">
    <div class="g-row">
      <span class="g-day"><b>Day ${run.day}</b> ${day}</span>
      <span class="g-clock">${formatClock(run.minutes)}</span>
      <a class="g-gear g-soc" href="#/board" aria-label="Leaderboards">\u{1F3C6}</a>
      <a class="g-gear g-soc" href="#/chat" aria-label="Campus lobby">\u{1F4AC}</a>
      <button class="g-gear" type="button" data-act="gear" aria-label="Menu">\u2699\uFE0F</button>
    </div>
    <div class="g-stats">${STATS.map(([k, w, c]) => bar(k, w, c, run.stats[k], k === 'money' ? 3000 : (k === 'energy' ? run.energyCap : 100))).join('')}</div>
    ${tip ? `<p class="g-tip" role="status">${esc(tip[3])}</p>` : ''}
    ${chips.length ? `<p class="g-chips">${chips.map(([k, ic, c]) => `<button type="button" class="g-chip ${k}" data-act="stat" data-k="chip-${k}">${ic} ${esc(c)}</button>`).join('')}</p>` : ''}
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
    <button type="button" data-act="nav" data-go="milestones">Milestones</button>
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
    // Play-through fix: show what a slot action leaves for the rest of the day.
    const after = run.slotsLeft - (action.slots || 0)
    const warn = action.slots > 0 && !state.disabled && run.phase !== 'night'
      ? `<span class="g-left${after <= 1 ? ' low' : ''}">${after <= 0 ? 'Uses your last slot \u2014 the day ends' : after === 1 ? 'Leaves 1 slot (for Sleep)' : `Leaves ${after} of ${run.slotsTotal} slots today`}</span>`
      : ''
    return `<button class="g-act" type="button" data-act="do" data-id="${action.id}" data-place="${placeId}"${state.disabled ? ' disabled' : ''}>
      <span class="g-act-top"><strong>${esc(action.name)}</strong><small>${cost}</small></span>
      <span class="g-act-fx">${effectChips(action.deltas)}</span>
      ${action.twist ? `<span class="g-twist">${esc(action.twist)}</span>` : ''}
      ${state.disabled ? `<span class="g-why">${esc(state.reason)}</span>` : warn}
    </button>`
  }).join('')
  const later = opensAt(district, run, placeId)
  const empty = status.public
    ? `The ${placeName(place).replace(/^The /, '')} is always open. ${later ? `Things happen here from ${later}.` : 'Nothing else on today.'}`
    : status.label ? `Nothing here right now \u00b7 ${status.label}.` : 'Nothing to do here this phase.'
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
  const atHome = hereOf(district, run) === sleepPlace
  if (run.phase === 'night') line = atHome ? 'Night. You are home \u2014 tap Sleep to end the day.' : 'Night. Go home and sleep to end the day.'
  else if (run.slotsLeft === 1) line = `1 slot left \u2014 keep it for Sleep at 21:00.`
  else if (glowing.length) line = `Golden glow = open now. Try ${glowing.slice(0, 2).map(placeName).join(' or ')}.`
  else line = 'Nothing open now.'
  if (run.phase === 'night') {
    return `<div class="g-cta"><p>${esc(line)}</p><button type="button" class="g-go" data-act="place-open" data-id="${sleepPlace}">${atHome ? 'Sleep' : 'Go home'}</button></div>`
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
  if (card.kind === 'event' && card.choices) return eventCard(state, card)
  if (card.kind === 'consequence' || card.kind === 'over') return consequenceCard(card)
  if (card.kind === 'milestone') return milestoneCard(state, card)
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
    <div class="g-two"><button type="button" class="g-go ghost" data-act="share-day">\u{1F4E4} Share my day</button><button type="button" class="g-go" data-act="next">Start day ${(s.day || run.day) + 1}</button></div>
  </aside>`
}

export function mapHome(state, openPlace = '') {
  const { district, run } = state
  const here = hereOf(district, run)
  const home = homePlaceId(district, run.character.residence)
  const pins = district.places.map((place) => {
    const [x, y] = layoutOf(place.id)
    const st = placeStatus(district, run, place.id)
    const mine = place.id === home ? ' mine' : ''
    const art = (ART[place.id] || ART.res_other)()
    return `<button type="button" class="g-pin g-b-${place.id} ${st.open ? 'open' : st.public ? 'public' : 'dim'}${mine}${openPlace === place.id ? ' sel' : ''}" data-act="place-open" data-id="${place.id}" style="left:${x}%;top:${y}%">
      ${st.open ? '<span class="g-halo"></span>' : ''}<span class="g-art">${art}</span>
      <span class="g-name">${esc(placeName(place))}${place.id === home ? ' \u00b7 home' : ''}</span>
      ${st.open ? '' : st.label ? `<small>${esc(st.label)}</small>` : ''}
    </button>`
  }).join('')
  const [ax, ay] = layoutOf(here)
  let layer = ''
  if (run.queue?.[0]) layer = resultCard(state)
  else if (run.mode === 'summary') layer = summaryCard(state)
  else if (run.promptSave && !run.userId && !run.saveSnooze && run.mode === 'play') {
    layer = `<div class="g-scrim"></div><aside class="g-result"><p class="g-kind">Day ${run.day}</p><h2>Keep ${esc(run.character.name)}?</h2><p>Guests live on this phone only. Make a free account so this student survives a cleared browser.</p><div class="g-two"><button type="button" class="g-go ghost" data-act="snooze">Not now</button><button type="button" class="g-go" data-act="nav" data-go="save">Save progress</button></div></aside>`
  } else if (openPlace) layer = sheetHtml(district, run, openPlace)
  return `<main class="screen g-screen" data-screen="${run.mode === 'summary' ? 'summary' : openPlace ? 'place' : 'play'}">
    ${hud(district, run)}
    <section class="g-map" aria-label="Campus map">
      ${groundHtml()}
      ${pins}
      <span class="g-me" id="g-me" style="left:${ax}%;top:${ay}%" aria-label="You"><span class="g-me-head">${esc((run.character.name || '?').slice(0, 1).toUpperCase())}</span><span class="g-me-tag">You</span></span>
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
