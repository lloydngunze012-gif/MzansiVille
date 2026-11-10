// SunnyBay, the city around the campus: the plan and the travel rules. No Three.js here.
// The city is defined in ONE data file, data/campusville/sunnybay.json (parts of the city, roads, the
// river and its bridges, the 18 place lots, the 12 wave 2 plots, taxi stops, fares). Players see
// "district"; in code a district is a data pack (src/districts), so the parts of the city are "parts".
// Metres, x east, z south; the campus sits at the origin (the same frame as the campus scene).
// Map and docs: docs/world-designer/sunnybay.md.
import CITY from '../../data/campusville/sunnybay.json' with { type: 'json' }

export { CITY }
export const PARTS = CITY.parts
export const BOUNDS = CITY.bounds
export const FENCE_R = 103 // the campus fence (src/world/surroundings.js)
export const RING_OUT = 113 // the outer edge of the campus ring road
export const GATE = { x: 0, z: 106, half: 4.5 } // the gap in the fence: the way in and out of campus
export const SPAWN = { x: 0, z: 112.5 } // where you stand when you walk out of the gate
const BRIDGE_HALF = 5

const inRect = (r, x, z, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad

export function partAt(x, z) {
  for (const p of PARTS) if (inRect(p.rect, x, z)) return p
  // (past the edge of the plan: the nearest part)
  let best = PARTS[0]
  let dist = Infinity
  for (const p of PARTS) {
    const dx = Math.max(p.rect[0] - x, 0, x - p.rect[2])
    const dz = Math.max(p.rect[1] - z, 0, z - p.rect[3])
    const d = Math.hypot(dx, dz)
    if (d < dist) { dist = d; best = p }
  }
  return best
}
export const partOf = (id) => PARTS.find((p) => p.id === id) || PARTS[0]

// A lot's door: where you stand when you have arrived. Buildings: outside the middle of the door wall.
const SIDE = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }
function doorOf(lot) {
  if (lot.at) return { x: lot.at[0], z: lot.at[1] }
  const [sx, sz] = SIDE[lot.door || 's']
  return { x: lot.x + sx * (lot.w / 2 + 2.4), z: lot.z + sz * (lot.d / 2 + 2.4) }
}
export const LOTS = CITY.lots.map((lot) => ({ ...lot, short: lot.short || lot.name, door: doorOf(lot), side: lot.door || 's', wave: 1 }))
// Wave 2: a fenced, empty plot with a board. PLOT is its size.
export const PLOT = { w: 22, d: 16 }
export const WAVE2 = CITY.wave2.map((lot) => ({ ...lot, short: lot.name, door: { x: lot.x, z: lot.z + PLOT.d / 2 + 2 }, side: 's', wave: 2 }))
export const STOPS = CITY.stops
export const HOMES = CITY.homes
export const lotOf = (id) => LOTS.find((l) => l.id === id) || WAVE2.find((l) => l.id === id) || null
export const stopOf = (id) => STOPS.find((s) => s.id === id) || null
export const stopIn = (partId) => STOPS.find((s) => s.part === partId) || STOPS[0]
export function nearestStop(x, z) {
  let best = STOPS[0]
  let dist = Infinity
  for (const s of STOPS) { const d = Math.hypot(s.x - x, s.z - z); if (d < dist) { dist = d; best = s } }
  return { stop: best, dist }
}

// ---------- where a body may stand ----------
export function inRiver(x, z, pad = 0) {
  const r = CITY.river.rect
  if (x < r[0] - pad || x > r[2] + pad) return false
  return !CITY.bridges.some((b) => Math.abs(z - b.z) < BRIDGE_HALF - pad)
}
export function inCampus(x, z, pad = 0) {
  if (Math.hypot(x, z) > FENCE_R + 0.8 + pad) return false
  return !(Math.abs(x - GATE.x) < GATE.half - pad && z > 90) // (the gate's corridor)
}
// The plan's own limits: the edge of the city, the river, the sea, the campus fence. (Buildings are the scene's.)
export function offLimits(x, z, pad = 0) {
  const b = BOUNDS
  if (x < b.x0 + pad || x > b.x1 - pad || z < b.z0 + pad || z > b.z1 - pad) return true
  return inRiver(x, z, pad) || inCampus(x, z, pad)
}
// Walking in through the gate: back onto campus.
export const atGate = (x, z) => Math.abs(x - GATE.x) < GATE.half && z < GATE.z - 1.5 && z > 90

// ---------- travel (docs/world-designer/city.md, the money section: a taxi trip is R15 to R25) ----------
export const TAXI = CITY.travel.taxi
export const PETROL = CITY.travel.car.petrol
export const WALK_SPEED = 4 // m/s: long trips are jogged (src/world/player.js)

// R15 to the next district, R25 across the city. The same district costs the near fare.
export function taxiFare(fromPart, toPart) {
  if (fromPart === toPart) return TAXI.near
  return partOf(fromPart).next.includes(toPart) ? TAXI.near : TAXI.far
}
export const moneyOf = (run) => Math.floor(run?.stats?.money || 0)
// A car works when the save has both a licence and a car (job B grants them: run.licence = true, run.car = { id }).
export const canDrive = (run) => Boolean(run?.licence && run?.car)
// Where the car is parked: 'res' (outside your house on campus) or a lot's id.
export const carAt = (run) => (canDrive(run) ? run.carAt || 'res' : null)

// Pay for a taxi. { ok, fare } or { ok: false, fare, short } (R short); the money is only taken when ok.
export function payTaxi(run, fromPart, toPart) {
  const fare = taxiFare(fromPart, toPart)
  const money = moneyOf(run)
  if (money < fare) return { ok: false, fare, money, short: fare - money }
  run.stats.money = (run.stats.money || 0) - fare
  return { ok: true, fare, money: moneyOf(run), minutes: TAXI.minutes }
}
// Drive somewhere: R8 petrol, instant; the car is then parked there ('res' or a lot's id).
export function payDrive(run, to) {
  if (!canDrive(run)) return { ok: false, why: 'nocar' }
  if (moneyOf(run) < PETROL) return { ok: false, why: 'short', fare: PETROL, money: moneyOf(run) }
  run.stats.money -= PETROL
  run.carAt = to
  return { ok: true, fare: PETROL, money: moneyOf(run) }
}

// The ways to a spot from where you stand, for the map: walking (always, free), a taxi (from the nearest stop
// to the stop of that district), the car. from: { x, z, campus } (campus: you are inside the campus fence).
export function waysTo(run, from, dest) {
  const fx = from.campus ? SPAWN.x : from.x
  const fz = from.campus ? SPAWN.z : from.z
  const metres = Math.round(Math.hypot(dest.x - fx, dest.z - fz) * 1.25 + (from.campus ? Math.hypot(from.x - 0, from.z - 100) : 0))
  const walk = { metres, minutes: Math.max(1, Math.round(metres / WALK_SPEED / 60)) }
  const board = from.campus ? { stop: stopOf('gate'), dist: Math.hypot(from.x - 0, from.z - 100) + 14 } : nearestStop(from.x, from.z)
  const toPart = dest.part
  const fromPart = board.stop.part
  const taxi = fromPart === toPart ? null : { stop: board.stop, dist: Math.round(board.dist), fare: taxiFare(fromPart, toPart), minutes: TAXI.minutes, short: Math.max(0, taxiFare(fromPart, toPart) - moneyOf(run)) }
  let car = null
  if (canDrive(run)) {
    const parked = carAt(run)
    const here = from.campus ? parked === 'res' : (() => { const l = lotOf(parked); return Boolean(l && Math.hypot(l.door.x - from.x, l.door.z - from.z) < 60) })()
    car = { fare: PETROL, here, parked, parkedName: parked === 'res' ? 'your res' : lotOf(parked)?.name || 'your res', short: Math.max(0, PETROL - moneyOf(run)) }
  }
  return { walk, taxi, car }
}

// Rooms (src/presence.js): one Realtime room per district, each with the launch job's cap of 40
// (campus, campus.town, campus.suburbs...; a full room overflows to -2, -3).
export const roomAreas = () => PARTS.map((p) => p.id)
