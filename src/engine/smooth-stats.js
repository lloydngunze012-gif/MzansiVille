// What Lloyd's #/smooth page shows (owner, 7 Nov; docs/design/smoothness-reports.md section 5):
// the smooth_reports rows (one per place per report) grouped into a row per place or device.
// Pure functions, no DOM: the page (src/ui/smooth.js) and the sim checks both use them.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function median(list) {
  const s = list.filter((v) => num(v) !== null).sort((a, b) => a - b)
  if (!s.length) return null
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
/** The value 9 in 10 are at or under (the slowest 10% start there). */
export function p90(list) {
  const s = list.filter((v) => num(v) !== null).sort((a, b) => a - b)
  if (!s.length) return null
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]
}

// red: the worst 10% are under 20 fps, or over 5% of the time was under 20 fps.
// amber: typical under 30 fps.
export const RED_LOW = 20
export const RED_SHARE = 5
export const AMBER_TYPICAL = 30
export function statusOf(g) {
  if ((g.low !== null && g.low < RED_LOW) || g.below20 > RED_SHARE) return 'red'
  if (g.typical !== null && g.typical < AMBER_TYPICAL) return 'amber'
  return 'ok'
}
const RANK = { red: 0, amber: 1, ok: 2 }

function summarise(key, label, rows) {
  const seconds = rows.reduce((a, r) => a + (num(r.seconds) || 0), 0)
  const minutes = seconds / 60
  const g = {
    key,
    label,
    players: new Set(rows.map((r) => r.session)).size,
    minutes,
    typical: median(rows.map((r) => r.fps_typical)),
    low: median(rows.map((r) => r.fps_low)),
    below20: seconds ? (rows.reduce((a, r) => a + (num(r.secs_below_20) || 0), 0) / seconds) * 100 : 0,
    longPerMin: minutes ? rows.reduce((a, r) => a + (num(r.long_frames) || 0), 0) / minutes : 0,
    stalls: rows.reduce((a, r) => a + (num(r.stalls) || 0), 0),
    tapMs: median(rows.map((r) => r.tap_ms)),
    rows,
  }
  g.status = statusOf(g)
  return g
}

/** Group rows by a key function (place, or gpu), worst first: red, amber, ok; then the lowest worst-10% fps. */
export function groupRows(rows, keyOf, labelOf = keyOf) {
  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  }
  return [...map.entries()]
    .map(([k, list]) => summarise(k, labelOf(list[0]), list))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || (a.low ?? 999) - (b.low ?? 999) || b.below20 - a.below20 || b.minutes - a.minutes)
}

export const byPlace = (rows, nameOf = (r) => r.place) => groupRows(rows, (r) => r.place, nameOf)
export const byDevice = (rows) => groupRows(rows, (r) => r.gpu || r.device || 'unknown', (r) => r.gpu || r.device || 'unknown')

/** One clock (a column), median and slowest 10%, overall and split by connection. */
function clockLine(rows, column) {
  const withIt = rows.filter((r) => num(r[column]) !== null)
  const split = new Map()
  for (const r of withIt) {
    const k = r.net || 'unknown'
    if (!split.has(k)) split.set(k, [])
    split.get(k).push(r[column])
  }
  return {
    all: { n: withIt.length, median: median(withIt.map((r) => r[column])), slow: p90(withIt.map((r) => r[column])) },
    byNet: [...split.entries()].map(([net, list]) => ({ net, n: list.length, median: median(list), slow: p90(list) })).sort((a, b) => b.n - a.n),
  }
}
/** The two load clocks: boot_ms ("Open to title": page start to the first screen usable) and
    load_ms ("Tap to playing": the tap that opens a 3D scene to its first frame). */
export function loadLine(rows) {
  return { boot: clockLine(rows, 'boot_ms'), load: clockLine(rows, 'load_ms') }
}

/** What a report's place id is called on the page: the place's name (places.csv), "<House> common
    room", "Paths between places", "Activity rooms", "Day 1 home (<style>)". Anything else keeps its id. */
export function placeName(id, { places = [], houses = [] } = {}) {
  const key = String(id ?? '')
  if (key.startsWith('common:')) {
    const house = houses.find((h) => h.id === key.slice(7))
    return house ? `${house.name} common room` : key
  }
  if (key.startsWith('home:')) return `Day 1 home (${key.slice(5)})`
  if (key === 'paths') return 'Paths between places'
  if (key === 'room') return 'Activity rooms'
  if (key === 'morning') return 'Morning scene'
  if (key === 'lecture') return 'Lecture scene'
  return places.find((p) => p.id === key)?.name || key
}

/** A place's last 20 stalls, newest first: kind, how, x, z, when (the report's time) and the device. */
export function stallsOf(group, limit = 20) {
  const out = []
  for (const r of group.rows) {
    for (const s of Array.isArray(r.stall_at) ? r.stall_at : []) {
      out.push({ kind: s.k, how: s.h, x: s.x, z: s.z, when: r.created_at, device: r.device || r.gpu || '' })
    }
  }
  return out.sort((a, b) => String(b.when).localeCompare(String(a.when))).slice(0, limit)
}

export const RANGES = { '24h': 24 * 3600 * 1000, '7d': 7 * 24 * 3600 * 1000 }
export const MAX_ROWS = 5000
