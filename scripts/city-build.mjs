// City job B: docs/world-designer/city.md is the source of every "Things to do" row in SunnyBay.
// This writes data/campusville/city.json from it (all 30 places, 300 rows; the 12 wave 2 places stay
// closed until their lot opens in sunnybay.json).
//   npm run city-data                      rewrites city.json
//   node scripts/city-build.mjs --check    exits 1 if city.json and city.md disagree (npm run check)
// Which heading is which place, and which rows grant something, is in data/campusville/city_places.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MD = join(root, 'docs', 'world-designer', 'city.md')
const OUT = join(root, 'data', 'campusville', 'city.json')
const PLACES = join(root, 'data', 'campusville', 'city_places.json')

const SLOTS = ['morning', 'lecture', 'social', 'free', 'night']
const slug = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const rand = (s) => Number(String(s).replace(/[R,\s]/g, ''))
const fail = (msg) => { throw new Error(`city.md: ${msg}`) }

// What the Needs column means. Anything else stops the build: a new need is a code change, on purpose.
function needOf(text, where) {
  const t = text.trim()
  if (t === 'None') return {}
  if (t === 'Better with friends here') return { friends: true }
  if (t === "Driver's licence") return { need: 'licence' }
  if (t === 'You own a car') return { need: 'car' }
  if (t === 'Yard lesson done') return { need: 'yard' }
  if (t === 'Yard lesson and road lesson done') return { need: 'lessons' }
  const span = t.match(/^(\w+) to (\w+) only$/)
  if (span) {
    const a = SLOTS.indexOf(span[1].toLowerCase())
    const b = SLOTS.indexOf(span[2].toLowerCase())
    if (a >= 0 && b >= a) return { slots: SLOTS.slice(a, b + 1) }
  }
  return fail(`${where}: unknown Needs "${t}"`)
}

export function build() {
  const md = readFileSync(MD, 'utf8').replace(/\r\n/g, '\n')
  const config = JSON.parse(readFileSync(PLACES, 'utf8'))
  const idOf = Object.fromEntries(Object.entries(config.places).map(([id, p]) => [p.heading, id]))
  const places = []
  let wave = 0
  let place = null
  for (const line of md.split('\n')) {
    const w = line.match(/^## Wave (\d)/)
    if (w) { wave = Number(w[1]); place = null; continue }
    if (/^## /.test(line)) { wave = 0; place = null; continue }
    if (!wave) continue
    const h = line.match(/^### (.+)$/)
    if (h) {
      const heading = h[1].trim()
      const id = idOf[heading] || fail(`no place in city_places.json has the heading "${heading}"`)
      place = { id, name: heading, wave, feel: '', open: [], rows: [] }
      places.push(place)
      continue
    }
    if (!place) continue
    const feel = line.match(/^\*\*Feel:\*\*\s*(.+)$/)
    if (feel) { place.feel = feel[1].trim(); continue }
    const open = line.match(/^\*\*Open:\*\*\s*(.+)$/)
    if (open) {
      place.open = open[1].replace(/\.$/, '').split(',').map((s) => s.trim().toLowerCase())
      for (const s of place.open) if (!SLOTS.includes(s)) fail(`${place.name}: unknown slot "${s}" in Open`)
      continue
    }
    if (!line.startsWith('|') || /^\|\s*(Activity|---)/.test(line)) continue
    const cells = line.split('|').slice(1, -1).map((s) => s.trim())
    if (cells.length !== 8) fail(`${place.name}: a row with ${cells.length} cells: ${line.slice(0, 60)}`)
    const [name, minutes, cost, stats, quick, gig, needs, result] = cells
    const where = `${place.name} / ${name}`
    const nums = stats.split('/').map((s) => Number(s.trim().replace('+', '')))
    if (nums.length !== 5 || nums.some((n) => !Number.isFinite(n))) fail(`${where}: stats "${stats}"`)
    const [money, energy, fullness, grades, social] = nums
    const row = {
      id: `${place.id}_${slug(name)}`,
      name,
      minutes: Number(minutes),
      cost: rand(cost),
      money, energy, fullness, grades, social,
      quick: quick === 'Yes',
      gig: gig === 'Yes',
      ...needOf(needs, where),
      needs,
      result,
    }
    // the file's own rules (How to read a row)
    if (!Number.isFinite(row.minutes) || row.minutes < 15) fail(`${where}: minutes`)
    if (row.quick !== (row.minutes >= 15 && row.minutes <= 30)) fail(`${where}: Quick must be Yes from 15 to 30 minutes, No outside that`)
    if (row.gig && (row.cost !== 0 || row.money < 120 || row.money > 240)) fail(`${where}: a gig costs R0 and pays R120 to R240`)
    if (!row.gig && row.money !== -row.cost) fail(`${where}: Money (${row.money}) must be minus the cost (R${row.cost})`)
    if (place.rows.some((r) => r.id === row.id)) fail(`${where}: two rows with the same name`)
    place.rows.push(row)
  }
  for (const p of places) {
    if (p.rows.length !== 10) fail(`${p.name}: ${p.rows.length} rows (10 expected)`)
    if (!p.open.length || !p.feel) fail(`${p.name}: no Open or Feel line`)
    // the dearest row is the place's show-off (city.md, Summary): bought once, shown on your card
    const dearest = p.rows.reduce((a, b) => (b.cost > a.cost ? b : a))
    dearest.showoff = true
    const grants = config.places[p.id].grants || {}
    for (const [rowName, what] of Object.entries(grants)) {
      const row = p.rows.find((r) => r.name === rowName) || fail(`${p.name}: city_places.json grants "${rowName}", which is not a row`)
      row.grants = what
    }
  }
  const missing = Object.keys(config.places).filter((id) => !places.some((p) => p.id === id))
  if (missing.length) fail(`city_places.json lists places that city.md does not have: ${missing.join(', ')}`)
  const gigs = places.flatMap((p) => p.rows.filter((r) => r.gig))
  if (places.length !== 30 || gigs.length !== 35) fail(`${places.length} places and ${gigs.length} gigs (30 and 35 expected)`)
  const pays = gigs.map((g) => g.money)
  if (Math.max(...pays) !== 2 * Math.min(...pays)) fail('the best gig must pay exactly twice the smallest')
  return {
    _about: 'GENERATED from docs/world-designer/city.md by scripts/city-build.mjs (npm run city-data). Do not edit: change city.md and run it again. npm run check fails if the two disagree. Stats per row: money, energy, fullness, grades, social. showoff: the dearest row of the place (bought once). friends: better with friends here (alone, social is half, rounded down). need: licence | car | yard | lessons. slots: the row only runs in these day slots. grants: what the row gives (data/campusville/city_places.json).',
    slots: SLOTS,
    places,
  }
}

const text = (data) => `${JSON.stringify(data, null, 1)}\n`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const want = text(build())
  if (process.argv.includes('--check')) {
    let have = ''
    try { have = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') } catch { /* not built yet */ }
    if (have !== want) { console.error('data/campusville/city.json and docs/world-designer/city.md disagree: run npm run city-data'); process.exit(1) }
    const data = JSON.parse(want)
    console.log(`city.json matches city.md (${data.places.length} places, ${data.places.reduce((n, p) => n + p.rows.length, 0)} rows)`)
  } else {
    writeFileSync(OUT, want)
    const data = JSON.parse(want)
    console.log(`wrote ${data.places.length} places, ${data.places.reduce((n, p) => n + p.rows.length, 0)} rows to data/campusville/city.json`)
  }
}
