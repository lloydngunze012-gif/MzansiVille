// SunnyBay's places (City job B): what you can do at each one, when it is open, what a row needs,
// and what running it does. No Three.js and no browser here, so the game, the sim checks and the
// score rules all read the same thing.
//   docs/world-designer/city.md -> scripts/city-build.mjs -> data/campusville/city.json (the rows)
//   data/campusville/city_places.json (the template and the dressing of each place)
//   data/campusville/sunnybay.json (the lots: a place is OPEN when it has a wave 1 lot)
// The save: run.licence, run.car ({ id, name }), run.carAt, run.showoffs ([{ id, name, place, day }]),
// run.city ({ day, thirds, gigDay, yard, road, owned: [row ids] }).
import DATA from '../../data/campusville/city.json' with { type: 'json' }
import DRESS from '../../data/campusville/city_places.json' with { type: 'json' }
import { formatMoney, toMinutes } from '../engine/format.js'
import { applyStats, lateNight } from '../engine/sim.js'
import { checkGoals, goalText, trackToday } from '../engine/goals.js'
import { LOTS } from './plan.js'
import { activityEnergy, tooTired, TIRED_REASON } from '../engine/energy.js'

export const TEMPLATES = DRESS.templates
// Every place in city.md, open or not: { id, name, wave, feel, open, rows, template, dress, lot, isOpen }.
export const ALL_PLACES = DATA.places.map((p) => {
  const dress = DRESS.places[p.id] || {}
  const lot = LOTS.find((l) => l.id === p.id) || null
  return { ...p, name: lot?.name || p.name, template: dress.template || '', dress, lot, isOpen: Boolean(lot && dress.template) }
})
// The places you can walk into today (wave 1: 18 of them).
export const PLACES = ALL_PLACES.filter((p) => p.isOpen)
// The people of a place (one staff, its patrons) take their looks from this seed on (src/world/city.js seatFolk).
export const folkSeed = (place) => PLACES.indexOf(place) * 3 + 1
export const placeOf = (id) => PLACES.find((p) => p.id === id) || null
export const rowOf = (place, rowId) => place?.rows.find((r) => r.id === rowId) || null

// ---------- the day's slots (city.md: Morning, Lecture, Social, Free, Night) ----------
export const SLOT_OF_PHASE = { wake: 'morning', transit: 'morning', lecture: 'lecture', social: 'social', leisure: 'free', night: 'night' }
export const SLOT_NAME = { morning: 'Morning', lecture: 'Lecture', social: 'Social', free: 'Free', night: 'Night' }
const FIRST_PHASE = { morning: 'wake', lecture: 'lecture', social: 'social', free: 'leisure', night: 'night' }
export const slotOf = (run) => SLOT_OF_PHASE[run?.phase] || 'morning'
export const openNow = (run, place) => place.open.includes(slotOf(run))
// When the door opens next: { slot, name, time, phase, today }. today: later the same day (you can wait for it).
export function opensAt(meta, run, place) {
  const order = DATA.slots
  const now = order.indexOf(slotOf(run))
  const later = order.slice(now + 1).find((s) => place.open.includes(s))
  const slot = later || order.find((s) => place.open.includes(s))
  const phase = FIRST_PHASE[slot]
  return { slot, name: SLOT_NAME[slot], phase, time: meta.phases.find((p) => p.id === phase)?.start || '', today: Boolean(later) }
}
export const openLine = (place) => place.open.map((s) => SLOT_NAME[s]).join(', ')

// ---------- the save ----------
export function cityOf(run) {
  const c = (run.city ||= { day: run.day, thirds: 0, gigDay: 0, yard: false, road: false, owned: [] })
  if (c.day !== run.day) { c.day = run.day; c.thirds = 0; c.reps = {} } // (a part-used slot does not carry over the night)
  c.reps ||= {}
  c.owned ||= []
  return c
}
export const CARS = { first: 'First car', runabout: 'Used runabout' }

// How many of the day's slots a row takes now. A quick row (15 to 30 minutes) is a third of a slot: the first one
// opens a slot and the next two ride in it. Any other row: its minutes over this slot's minutes
// (meta.slotMinutes), rounded, at least 1 and never more than 3.
export function slotsFor(meta, run, row) {
  if (row.quick) return cityOf(run).thirds > 0 ? 0 : 1
  const per = meta.slotMinutes?.[run.phase] || 60
  return Math.max(1, Math.min(3, Math.round(row.minutes / per)))
}

// Repeat limit (meta.cityRepeat): a plain row done again the same game day pays factors[n] of its gains
// (full, then half), then is greyed. Gigs, show-offs and grants keep their own limits.
const repeats = (row) => !(row.gig || row.showoff || row.grants)
export function repeatFactor(meta, run, row) {
  if (!repeats(row)) return 1
  const f = meta.cityRepeat?.factors || [1, 0.5]
  const n = cityOf(run).reps[row.id] || 0
  return n < f.length ? f[n] : 0
}

// Can this row be picked now? { disabled, reason, why, slots, social }. ctx.friends: other players in this place.
// why: closed | owned | licence | car | lesson | gig | money | time | day | tired (for the tests and the sheet's icon).
export function rowState(district, run, place, row, ctx = {}) {
  const meta = district.meta
  const c = cityOf(run)
  const money = Math.floor(run.stats?.money || 0)
  const social = row.friends && !(ctx.friends > 0) ? Math.floor(row.social / 2) : row.social
  const slots = slotsFor(meta, run, row)
  const off = (reason, why) => ({ disabled: true, reason, why, slots, social })
  if (run.mode !== 'play' || run.excluded) return off('The day is not open', 'day')
  if (!openNow(run, place)) { const o = opensAt(meta, run, place); return off(`Closed now. Opens ${o.name} ${o.time}`, 'closed') }
  if (row.slots && !row.slots.includes(slotOf(run))) return off(row.needs, 'closed')
  if (row.grants === 'licence' && run.licence) return off('You have your licence', 'owned')
  if (row.grants?.startsWith('car:')) {
    const id = row.grants.slice(4)
    if (run.car?.id === id) return off('This one is yours', 'owned')
    if (id === 'first' && run.car) return off('You already own a car', 'owned')
  } else if (row.showoff && c.owned.includes(row.id)) return off('Already yours', 'owned')
  if (row.need === 'licence' && !run.licence) return off("Needs a driver's licence", 'licence')
  if (row.need === 'car' && !run.car) return off('Needs a car of your own', 'car')
  if (row.need === 'yard' && !c.yard) return off('Do the yard lesson first', 'lesson')
  if (row.need === 'lessons' && !(c.yard && c.road)) return off(c.yard ? 'Do the road lesson first' : 'Do the yard lesson and the road lesson first', 'lesson')
  if (row.gig && c.gigDay === run.day) return off('One city gig a day. Back tomorrow.', 'gig')
  if (repeatFactor(meta, run, row) === 0) return off(`${meta.cityRepeat?.line || 'Come back tomorrow'}`, 'repeat')
  if (tooTired(run, row.energy)) return off(TIRED_REASON, 'tired')
  if (row.cost > money) return off(`Needs ${formatMoney(row.cost)}. You have ${formatMoney(money)}.`, 'money')
  if (slots > run.slotsLeft) return off(run.slotsLeft <= 0 ? 'No time left today. Home to bed.' : `Needs ${slots} slots. ${run.slotsLeft} left today.`, 'time')
  return { disabled: false, reason: '', why: '', slots, social }
}

// Run a row: the stats change, the time passes, what it grants is saved.
// -> { ok, delta (what really changed, after the caps), goals (goal lines just ticked), granted, showoff, half }
export function runRow(district, run, place, row, ctx = {}) {
  const state = rowState(district, run, place, row, ctx)
  if (state.disabled) return { ok: false, error: state.reason, why: state.why }
  const c = cityOf(run)
  const before = { ...run.stats }
  const k = repeatFactor(district.meta, run, row)
  const scale = (v) => (v > 0 ? Math.round(v * k) : v) // gains shrink; costs always apply in full
  const deltas = { money: scale(row.money), energy: activityEnergy(run, scale(row.energy)), hunger: scale(row.fullness), grades: scale(row.grades), social: scale(state.social) }
  ctx.adjust?.(deltas) // (job K: a mini-game's score sets some of what it gives: the Grades gain, the Energy cost)
  if (repeats(row)) c.reps[row.id] = (c.reps[row.id] || 0) + 1
  applyStats(run, deltas)
  trackToday(run, { id: row.id, tags: [] }, deltas)
  // time: the slot budget, and the clock (never past the end of this part of the day)
  if (row.quick) { if (c.thirds > 0) c.thirds -= 1; else { run.slotsLeft -= 1; c.thirds = 2 } } else run.slotsLeft -= state.slots
  const phase = district.meta.phases.find((p) => p.id === run.phase)
  run.minutes = Math.min(phase ? toMinutes(phase.end) : run.minutes + row.minutes, run.minutes + row.minutes)
  if (row.gig) c.gigDay = run.day
  if (row.grants === 'yard') c.yard = true
  else if (row.grants === 'road') c.road = true
  else if (row.grants === 'licence') run.licence = true
  else if (row.grants?.startsWith('car:')) {
    const id = row.grants.slice(4)
    run.car = { id, name: CARS[id] || 'Car', day: run.day }
    run.carAt = place.id // (parked outside the dealership)
  }
  if (row.showoff) {
    if (!c.owned.includes(row.id)) c.owned.push(row.id)
    const list = (run.showoffs ||= [])
    list.push({ id: row.id, name: row.name, place: place.name, day: run.day })
    if (list.length > 30) list.splice(0, list.length - 30)
  }
  run.lastEventLine = row.result
  const goals = checkGoals(run).map((g) => goalText(run, g))
  if (run.slotsLeft <= 0) lateNight(district, run)
  const delta = Object.fromEntries(Object.keys(before).map((k) => [k, Math.round((run.stats[k] || 0) - (before[k] || 0))]))
  return { ok: true, delta, goals, granted: row.grants || '', showoff: Boolean(row.showoff), half: Boolean(row.friends && !(ctx.friends > 0)), slots: state.slots }
}

// The rows of the open places as activities, for the weekly leaderboard's rules (src/engine/scores.js):
// every city row takes time, so it can score by what it does.
export function cityActivities() {
  return PLACES.flatMap((p) => p.rows.map((r) => ({ id: r.id, placeId: p.id, name: r.name, slots: 1, tags: r.gig ? ['job'] : [], deltas: { money: r.money, energy: r.energy, hunger: r.fullness, grades: r.grades, social: r.social } })))
}

// ---------- the money check (docs/world-designer/city.md; the report in docs/now.md) ----------
export function balance(startMoney = 2100) {
  const gigs = PLACES.flatMap((p) => p.rows.filter((r) => r.gig).map((r) => ({ place: p.name, name: r.name, pay: r.money })))
  const best = gigs.reduce((a, b) => (b.pay > a.pay ? b : a))
  const school = placeOf('driving_school')
  const licence = school.rows.filter((r) => ['yard', 'road', 'licence'].includes(r.grants)).reduce((n, r) => n + r.cost, 0)
  const car = placeOf('dealership').rows.find((r) => r.grants === 'car:first').cost
  const days = (need, perDay) => Math.max(0, Math.ceil(need / perDay))
  return {
    gigs: gigs.length,
    best,
    perDay: best.pay,
    perWeek: best.pay * 7,
    licence,
    car,
    // game days on the best gig, from the start money: nothing else spent / with city.md's light living (R60 a day)
    licenceDays: days(licence - startMoney, best.pay),
    carDays: days(licence + car - startMoney, best.pay),
    carDaysLiving: days(licence + car - startMoney, best.pay - 60),
  }
}
