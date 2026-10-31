import { actionState, actionsAt, weekdayName } from '../engine/sim.js'
import { formatClock, formatMoney, toMinutes } from '../engine/format.js'
import { homePlaceId } from '../engine/model.js'
import { chatFor } from '../engine/people.js'
import { cardHtml, esc, summaryRows } from './render.js'
import { ART, LAYOUT, groundHtml } from './campus.js'
import STORY from '../../data/campusville/place_story.json'
import { GOAL_KIND, dreamOf, dreamProgress, goalText, rightNow } from '../engine/goals.js'
import { identityTitle } from '../engine/identity.js'
import { comeBackReasons } from '../engine/dayend.js'
import { MOMENTS } from '../engine/moments.js'
import { beatById } from '../engine/arcs.js'
import './game.css'

// UI-only state that should not be saved.
export const ui = { tip: '', gear: false, confirmReset: false, delta: null, notice: '', talk: null }

const ICON = {
  hub: '\u{1F333}', food: '\u{1F37D}', transit: '\u{1F68C}', venue: '\u26BD', study: '\u{1F4DA}',
  lecture: '\u{1F393}', residence: '\u{1F3E0}',
}
const SHORT = {
  'SMIG': 'SMIG', 'Health Sciences Lecture Venue': 'Health Sci', 'Science Lecture Venue': 'Science',
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
      <button class="g-gear g-home" type="button" data-act="home" aria-label="Home">\u{1F3E0}</button>
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
    <button type="button" data-act="sound" aria-pressed="${soundOn() ? 'false' : 'true'}">${soundOn() ? '\u{1F50A} Sound: <b>On</b>' : '\u{1F507} Sound: <b>Muted</b>'}</button>
    <button type="button" data-act="nav" data-go="milestones">Milestones</button>
    <button type="button" data-act="nav" data-go="profile">Student card</button>
    <button type="button" data-act="nav" data-go="board">Leaderboard</button>
    <button type="button" data-act="nav" data-go="chat">Campus chat</button>
    <button type="button" data-act="nav" data-go="rules">Community rules</button>
    <button type="button" data-act="nav" data-go="privacy">Privacy</button>
    ${location.hash.startsWith('#/morning') ? '<button type="button" data-act="skip-morning">Skip morning intro</button>' : ''}
    <button type="button" data-act="edit-char">Edit character</button>
    <button type="button" data-act="nav" data-go="settings">Settings</button>
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

// "Spots here" counts come from the 3D scene (#world data-spots), refreshed every second.
function spotCounts() {
  try { return JSON.parse(document.getElementById('world')?.dataset.spots || '{}') } catch { return {} }
}

function isNight(run) {
  const m = run.minutes % 1440
  return m >= 18 * 60 || m < 6 * 60
}

function sheetHtml(district, run, placeId) {
  const place = district.places.find((p) => p.id === placeId)
  if (!place) return ''
  const story = STORY[placeId]
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
    return `<button class="g-act g-card" type="button" data-act="do" data-id="${action.id}" data-place="${placeId}"${state.disabled ? ' disabled' : ''}>
      <span class="g-card-top"><span class="g-card-ic">${story?.icon || ICON[place.kind] || '\u2728'}</span><small>\u23F1 ${mins} min</small></span>
      <b class="g-price${money > 0 ? ' earn' : ''}">${price}</b>
      <strong>${esc(action.name)}</strong>
      <span class="g-act-fx">${effectChips(fx)}</span>
      ${state.disabled ? `<span class="g-why">${esc(state.reason)}</span>` : warn}
    </button>`
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
    <div class="g-row-title"><span>Things to do</span>${rows ? `<small>${run.slotsLeft} of ${run.slotsTotal} slots left</small>` : ''}</div>
    <div class="g-acts g-cards">${rows || `<p class="g-empty">${esc(empty)}</p>`}</div>
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
  if (run.lectureRoute && !run.lectureResolved) {
    return `<div class="g-cta g-route" role="status"><p>\u{1F463} Tap the path to walk. Your lecture is at SMIG</p></div>`
  }
  const atHome = hereOf(district, run) === sleepPlace
  if (run.phase === 'night') line = atHome ? 'Night. You are home \u2014 tap Sleep to end the day.' : 'Night. Go home and sleep to end the day.'
  else if (run.slotsLeft === 1) line = `1 slot left \u2014 keep it for Sleep at 21:00.`
  else if (glowing.length) line = `Golden glow = open now. Try ${glowing.slice(0, 2).map(placeName).join(' or ')}.`
  else line = 'Nothing open now.'
  // First-visit hint: stays until the player taps a place or dismisses it.
  let seen = true
  try { seen = localStorage.getItem('mzansiville.mapHint') === '1' } catch { /* private mode */ }
  if (!seen && run.phase !== 'night') {
    return `<div class="g-cta g-hint" role="status"><p>\ud83d\udc46 Tap a glowing place to see what you can do.</p><button type="button" class="g-go ghost" data-act="hint-ok" aria-label="Dismiss hint">Got it</button></div>`
  }
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
  if (card.kind === 'goals') return goalsCardHtml(run)
  if (card.kind === 'moment') return momentCardHtml(run, card)
  if (card.choices || card.kind === 'shop') return `<div class="g-card-wrap">${cardHtml(card, state)}</div>`
  const twist = card.kind === 'result' && q[1]?.kind === 'twist' ? q[1] : null
  const label = { identity: '\u2728 Who you\u2019re becoming', goal: '\u{1F3AF} Goal done', result: 'Done', twist: 'Meanwhile', spot: 'Spot test', bestie: 'Your bestie', milestone: 'Milestone', event: 'Event' }[card.kind] || 'Note'
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
  return `<div class="g-scrim"></div>
  <aside class="g-result g-goals" role="dialog" aria-label="Today's goals" data-goals="${list.length}">
    <p class="g-kind">Day ${run.day} \u00b7 Today's goals</p>
    <h2>${list.every((g) => g.done) && list.length ? 'All done today' : 'Three things today'}</h2>
    <ol class="g-goal-list">${list.map((g) => `<li class="${g.kind}${g.done ? ' done' : ''}"><span class="g-gk">${GOAL_KIND[g.kind]}</span><span>${esc(goalText(run, g))}</span><b>${g.done ? '\u2713' : ''}</b></li>`).join('')}</ol>
    ${run.goals?.text ? `<p class="g-lasttext">\u{1F4AC} <b>${esc(run.goals.text.from)}:</b> ${esc(run.goals.text.text)}</p>` : ''}
    <p class="g-title">${esc(identityTitle(run).text)}</p>
    <p class="g-dream"><span>${dream.icon} Year dream: <b>${esc(dream.label)}</b></span><i><em style="width:${Math.max(3, pct)}%"></em></i><small>${pct}%</small></p>
    <button type="button" class="g-go block" data-act="dismiss">Let's go</button>
  </aside>`
}

// The "right now" chip (top left) and the day-goal count beside it.
function nowRow(run) {
  const now = rightNow(run)
  const list = run.goals?.day === run.day ? run.goals.list : []
  if (!now && !list.length) return ''
  const done = list.filter((g) => g.done).length
  return `<div class="g-nowrow">${now ? `<p class="g-now ${now.tone}" role="status" data-now>${now.icon} ${esc(now.text)}</p>` : ''}${list.length ? `<button type="button" class="g-goalsbtn${done === list.length ? ' win' : ''}" data-act="goals" aria-label="Today's goals">\u{1F3AF} ${done}/${list.length}</button>` : ''}</div>`
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
  try { return localStorage.getItem('mzansiville.view') === 'map' ? 'map' : '3d' } catch { return '3d' }
}

function viewBar(world) {
  let cam = 'sims'
  try { cam = localStorage.getItem('mzansiville.camera') || 'sims' } catch { /* ignore */ }
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
  if (ui.talk) layer = talkCard(run)
  else if (run.queue?.[0]) layer = resultCard(state)
  else if (run.mode === 'summary') layer = summaryCard(state)
  else if (run.lectureCard) {
    layer = `<div class="g-scrim"></div><aside class="g-result g-lecture" role="dialog" aria-label="Lecture starts"><p class="g-kind">SMIG \u00b7 09:00</p><h2>Lecture starts</h2><p>You made it to your first lecture. Find a seat \u2014 the full lecture is coming soon.</p><button type="button" class="g-go block" data-act="lecture-go">Continue</button></aside>`
  } else if (run.promptSave && !run.userId && !run.saveSnooze && run.mode === 'play') {
    layer = `<div class="g-scrim"></div><aside class="g-result"><p class="g-kind">Day ${run.day}</p><h2>Keep ${esc(run.character.name)}?</h2><p>Guests live on this phone only. Make a free account so this student survives a cleared browser.</p><div class="g-two"><button type="button" class="g-go ghost" data-act="snooze">Not now</button><button type="button" class="g-go" data-act="nav" data-go="save">Save progress</button></div></aside>`
  } else if (openPlace) layer = sheetHtml(district, run, openPlace)
  return `<main class="screen g-screen${world ? ' g-3d' : ''}" data-screen="${run.mode === 'summary' ? 'summary' : openPlace ? 'place' : 'play'}">
    ${hud(district, run)}
    ${run.mode === 'play' ? nowRow(run) : ''}
    ${viewBar(world)}
    ${world ? '<section class="g-map g-world-gap" aria-label="3D campus"></section>' : `<section class="g-map" aria-label="Campus map">
      ${groundHtml()}
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
    <div><h2>${esc(chat.name)}</h2><small>${esc(chat.role)}${chat.met || t.res ? '' : ' \u00b7 first meeting'}</small></div>
    <span class="g-talk-level">${esc(level)}<i style="width:${Math.max(4, close)}%"></i></span></div>`
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
      <div class="g-two"><button type="button" class="g-go ghost" data-act="talk-bye">Bye</button><button type="button" class="g-go" data-act="talk-more">Keep talking</button></div>
    </section>`
  }
  return `<section class="g-talk" role="dialog" aria-label="Talking to ${esc(chat.name)}" data-talk="${esc(t.id)}" data-phase="line">
    ${head}
    <p class="g-talk-line">${esc(chat.line)}</p>
    <div class="g-talk-replies">${chat.replies.map((r, i) => `<button type="button" class="g-talk-reply" data-act="talk-reply" data-i="${i}">${esc(r.text)}</button>`).join('')}</div>
    <button type="button" class="g-talk-leave" data-act="talk-bye">Walk away</button>
  </section>`
}

export function lectureScreen(state) {
  const { district, run } = state
  return `<main class="screen g-screen g-3d g-morning g-lecture-screen" data-screen="lecture">
    ${hud(district, run)}
    <p class="g-goal" role="status"><span>\u{1F3AF} Find a seat and get through the lecture.</span><b>SMIG</b></p>
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
