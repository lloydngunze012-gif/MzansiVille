import { readFileSync } from 'node:fs'
import { filterText, canSend } from '../src/engine/filter.js'
import { rankRows, sampleBoard } from '../src/engine/social-data.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { buildDistrict, coursePlaceId, homePlaceId } from '../src/engine/model.js'
import { parseCsvRows } from '../src/engine/csv.js'
import { balancedScore } from '../src/engine/board.js'
import { dreamProgress, rightNow, startGoals } from '../src/engine/goals.js'
import { crushChat, crushReply } from '../src/engine/crush-arc.js'
import { buildingLayout, doorPoint } from '../src/world/layout.js'
import { buildGrid, findPath, followStep, nearestOpen, pointBlocked } from '../src/world/nav.js'
import {
  actionState,
  actionsAt,
  advancePhase,
  applyAction,
  beginNextDay,
  chooseEvent,
  createRun,
  endDay,
  isExamWeek,
  switchDistrict,
} from '../src/engine/sim.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'data', 'campusville')
const read = (name) => readFileSync(join(dir, name), 'utf8')

const district = buildDistrict({
  meta: JSON.parse(read('meta.json')),
  places: read('places.csv'),
  activities: read('activities.csv'),
  residences: read('residences.csv'),
  events: JSON.parse(read('events.json')),
  hours: JSON.parse(read('hours.json')),
  courses: JSON.parse(read('courses.json')),
  besties: JSON.parse(read('besties.json')),
  twists: JSON.parse(read('twists.json')),
  jobs: JSON.parse(read('jobs.json')),
  shop: JSON.parse(read('shop.json')),
})

const character = {
  name: 'Aya',
  residence: 'O Block',
  course: 'Law',
  avatar: { skin: 'amber', hair: 'braids', outfit: 'organt' },
  handle: '',
}

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log('ok', name)
}

check('csv quotes and district size', () => {
  const quad = district.places.find((place) => place.id === 'quad')
  assert.equal(quad.name, 'The Quad')
  assert.match(quad.blurb, /cafeteria/)
  assert.equal(district.places.length, 16)
  assert.ok(district.activities.some((action) => action.id === 'organt_rep'))
  assert.equal(district.residences.some((row) => row.name.startsWith('ADD ')), false)
  assert.equal(district.meta.dialCode, '031')
})

check('every CSV row has as many columns as its header (QA B01)', () => {
  for (const name of ['activities.csv', 'places.csv', 'residences.csv']) {
    const rows = parseCsvRows(read(name))
    const width = rows[0].length
    rows.slice(1).forEach((row, i) => assert.equal(row.length, width, `${name} row ${i + 2} has ${row.length} columns, header has ${width}`))
  }
})

check('a shift pays money and costs a little grades time, not +120 grades (QA B01)', () => {
  const job = district.activities.find((action) => action.id === 'job_shift')
  assert.equal(job.name, 'Work a shift (tutoring, library desk, promo)')
  assert.ok(job.deltas.money > 0, `job pays R${job.deltas.money}`)
  assert.ok(job.deltas.grades <= 0, `job gives ${job.deltas.grades} grades`)
})

check('every action in activities.csv plays a visible scene (no blank progress bars)', () => {
  const scenesSrc = readFileSync(new URL('../src/world/scenes.js', import.meta.url), 'utf8')
  const actsSrc = readFileSync(new URL('../src/world/activities.js', import.meta.url), 'utf8')
  const quad = new Set([...actsSrc.matchAll(/^\s{2}(\w+): '(\w+)',$/gm)].map((m) => m[1]))
  const mapped = new Set([...scenesSrc.matchAll(/^\s{2}(\w+): \['(\w+)'/gm)].map((m) => m[1]))
  const names = new Set([...scenesSrc.matchAll(/^\s{4}async (\w+)\(place/gm)].map((m) => m[1]))
  for (const m of scenesSrc.matchAll(/^\s{2}(\w+): \['(\w+)'/gm)) assert.ok(names.has(m[2]), `${m[1]} uses missing scene ${m[2]}`)
  const missing = district.activities.filter((a) => !a.id.startsWith('organt') && !quad.has(a.id) && !mapped.has(a.id)).map((a) => a.id)
  assert.deepEqual(missing, [], `no scene for: ${missing.join(', ')}`)
})

check('goal ladder: three day goals (must, story, dream), a right-now nudge, the dream bar', () => {
  const run = createRun(district, { ...character, dream: 'hustle' })
  run.crush = { met: 'bus', nameKnown: false, name: 'Amahle', closeness: 0 }
  startGoals(run)
  assert.deepEqual(run.goals.list.map((g) => g.kind), ['must', 'story', 'dream'])
  assert.deepEqual(run.goals.list.map((g) => g.id), ['lecture1', 'crushName', 'earn50'])
  assert.ok(rightNow(run).text.length > 4)
  // A shift pays: the dream goal (earn R50) ticks off with a goal card, and the dream bar moves.
  const job = district.activities.find((a) => a.id === 'job_shift')
  for (let i = 0; i < 6 && actionState(district, run, job).disabled; i++) advancePhase(district, run)
  const before = dreamProgress(run)
  const res = applyAction(district, run, 'job_shift')
  if (res.ok) {
    assert.ok(run.goals.list.find((g) => g.id === 'earn50').done)
    assert.ok(run.queue.some((card) => card.kind === 'goal'))
    assert.ok(dreamProgress(run) > before)
  }
  // Next day: new goals, the card first.
  const next = createRun(district, character)
  startGoals(next)
  endDay(district, next, { slept: true })
  beginNextDay(district, next, new Date(Date.now() + 864e5))
  if (next.mode === 'play') {
    assert.equal(next.goals.day, next.day)
    assert.equal(next.queue[0].kind, 'goals')
    assert.equal(next.goals.list[0].id, 'lecture')
  }
})

check('crush arc: a beat a day at the Quad; replies set what later days remember', () => {
  const run = createRun(district, { ...character, interest: 'girls' })
  run.crush = { id: 'amahle', name: 'Amahle', romance: true, met: 'bus', nameKnown: false, closeness: 3, opener: 'funny', sat: true }
  run.lectureResolved = true
  assert.match(rightNow(run).text, /from the bus is at the Quad/)
  const d1 = crushChat(run)
  crushReply(run, 0)
  assert.equal(run.crush.nameKnown, true)
  assert.notEqual(crushChat(run).line, d1.line) // today's beat is done: a different line
  run.day = 2
  assert.match(crushChat(run).line, /bus seat/) // you sat next to her: she has your earphones
  crushReply(run, 0)
  run.day = 3
  crushReply(run, 0)
  assert.equal(run.crush.studyDate, true)
  run.day = 5
  assert.ok(run.crush.closeness >= 10)
  crushReply(run, 0)
  assert.equal(run.crush.asked, 'yes')
  assert.deepEqual(Object.keys(run.crush.beats), ['1', '2', '3', '5'])
})

check('home and course places', () => {
  assert.equal(homePlaceId(district, 'O Block'), 'res_o')
  assert.equal(homePlaceId(district, 'Gapwood Residence'), 'off_campus')
  assert.equal(coursePlaceId(district, 'Law'), 'law')
})

check('new run stats and bestie', () => {
  const run = createRun(district, character)
  assert.deepEqual(run.stats, { money: 1500, energy: 100, grades: 50, social: 30, hunger: 70 })
  assert.equal(run.slotsLeft, 5)
  assert.equal(run.queue.some((card) => card.kind === 'bestie'), true)
  assert.notEqual(run.bestieName, 'Aya')
  assert.equal(run.character.districtId, 'campusville')
})

check('noodles stay on the home res', () => {
  const run = createRun(district, character)
  assert.ok(actionsAt(district, run, 'res_o').some((action) => action.id === 'wake_noodles'))
  assert.equal(actionsAt(district, run, 'res_r').some((action) => action.id === 'wake_noodles'), false)
})

check('sleep restores in the morning', () => {
  const run = createRun(district, character)
  run.stats.energy = 40
  run.stats.hunger = 50
  run.phase = 'night'
  const result = applyAction(district, run, 'sleep', () => 0.99)
  assert.equal(result.ok, true)
  assert.equal(run.mode, 'summary')
  assert.equal(run.stats.energy, 40)
  assert.equal(run.stats.hunger, 30)
  beginNextDay(district, run)
  assert.equal(run.stats.energy, 100)
})

check('no sleep costs 30 energy', () => {
  const run = createRun(district, character)
  run.stats.energy = 80
  run.phase = 'night'
  run.lectureResolved = true
  endDay(district, run, { slept: false })
  beginNextDay(district, run)
  assert.equal(run.stats.energy, 50)
})

check('sleeping hungry sets energy to 75', () => {
  const run = createRun(district, character)
  run.stats.energy = 90
  run.stats.hunger = 19
  run.phase = 'night'
  applyAction(district, run, 'sleep', () => 0.99)
  beginNextDay(district, run)
  assert.equal(run.stats.energy, 75)
  assert.equal(run.morningNote, 'You slept hungry')
})

check('hunger blocks study and debt blocks paid meals', () => {
  const run = createRun(district, character)
  run.stats.hunger = 9
  run.phase = 'leisure'
  run.minutes = 15 * 60
  const study = district.activities.find((action) => action.id === 'library_study')
  assert.equal(actionState(district, run, study).reason, 'Too hungry to study')
  run.stats.hunger = 70
  run.stats.money = 5
  run.phase = 'social'
  applyAction(district, run, 'cafeteria_meal', () => 0.99)
  assert.equal(run.noodlesOnly, true)
  const meal = district.activities.find((action) => action.id === 'cafeteria_meal')
  run.doneToday = []
  assert.equal(actionState(district, run, meal).reason, 'Noodles only until a shift')
  const noodles = district.activities.find((action) => action.id === 'wake_noodles')
  assert.equal(actionState(district, run, noodles).disabled, false)
})

check('the fifth slot ends the day', () => {
  const run = createRun(district, character)
  run.slotsLeft = 1
  applyAction(district, run, 'wake_noodles', () => 0.99)
  assert.equal(run.mode, 'summary')
})

check('three days under 20 excludes', () => {
  const run = createRun(district, character)
  run.stats.grades = 10
  for (let i = 0; i < 3; i++) {
    run.mode = 'play'
    run.phase = 'night'
    run.lectureResolved = true
    run.eventSeen = true
    endDay(district, run)
  }
  assert.equal(run.excluded, true)
  assert.equal(run.mode, 'over')
})

check('monday clears prep', () => {
  const run = createRun(district, character)
  run.day = 7
  run.prep = 8
  run.gameDaysToday = 0
  beginNextDay(district, run)
  assert.equal(run.day, 8)
  assert.equal(run.prep, 0)
})

check('friday boosts social', () => {
  const run = createRun(district, character)
  run.day = 5
  run.phase = 'social'
  applyAction(district, run, 'quad_friends', () => 0.99)
  assert.equal(run.stats.social, 48)
})

check('exam week doubles study and halves a party', () => {
  assert.equal(isExamWeek(district.meta, 23), false)
  assert.equal(isExamWeek(district.meta, 24), true)
  const run = createRun(district, character)
  run.day = 24
  run.examWeek = true
  run.phase = 'leisure'
  applyAction(district, run, 'library_study', () => 0.99)
  assert.equal(run.stats.grades, 70)
  const party = createRun(district, character)
  party.day = 24
  party.examWeek = true
  party.phase = 'leisure'
  applyAction(district, party, 'res_party', () => 0.99)
  assert.equal(party.stats.social, 38)
})

check('falling behind halves gains and two studies clear it', () => {
  const run = createRun(district, character)
  run.fallingBehind = 2
  run.phase = 'leisure'
  run.minutes = 15 * 60
  applyAction(district, run, 'library_study', () => 0.99)
  assert.equal(run.stats.grades, 55)
  assert.equal(run.fallingBehind, 2)
  run.doneToday = []
  run.slotsLeft = 5
  run.mode = 'play'
  applyAction(district, run, 'library_study', () => 0.99)
  assert.equal(run.fallingBehind, 0)
  assert.equal(run.status, '')
})

check('falling behind into exam week excludes', () => {
  const run = createRun(district, character)
  run.day = 23
  run.fallingBehind = 3
  run.gameDaysToday = 0
  beginNextDay(district, run)
  assert.equal(run.day, 24)
  assert.equal(run.excluded, true)
})

check('wednesday spot test uses the 40 percent roll', () => {
  const fired = createRun(district, character)
  fired.day = 3
  advancePhase(district, fired, () => 0.1)
  advancePhase(district, fired, () => 0.1)
  assert.equal(fired.spotTest, true)
  const quiet = createRun(district, character)
  quiet.day = 3
  advancePhase(district, quiet, () => 0.5)
  advancePhase(district, quiet, () => 0.5)
  assert.equal(quiet.spotTest, false)
  const weekend = createRun(district, character)
  weekend.day = 6
  advancePhase(district, weekend, () => 0)
  advancePhase(district, weekend, () => 0)
  assert.equal(weekend.spotTest, false)
})

check('sunday is derby day', () => {
  const run = createRun(district, character)
  for (let i = 0; i < 6; i++) {
    run.gameDaysToday = 0
    run.mode = 'play'
    beginNextDay(district, run)
  }
  assert.equal(run.day, 7)
  assert.equal(run.dailyEventId, 'derby_day')
  chooseEvent(district, run, 'derby_day', 0)
  assert.equal(run.stats.social, 40)
  const other = createRun(district, character)
  other.day = 7
  chooseEvent(district, other, 'derby_day', 1)
  assert.equal(other.stats.social, 40)
})

check('jobs and the organt shift', () => {
  const run = createRun(district, character)
  run.phase = 'leisure'
  const early = district.activities.find((action) => action.id === 'job_shift')
  assert.equal(actionState(district, run, early).hidden, true)
  run.day = 3
  assert.equal(actionState(district, run, early).hidden, false)
  run.day = 7
  run.slotsLeft = 5
  applyAction(district, run, 'organt_rep', () => 0.99)
  assert.equal(run.stats.money, 1650)
  assert.equal(run.stats.social, 34)
  assert.match(run.referralCode, /^ORG-[A-Z0-9]{4}$/)
})

check('five lecture days earn the badge', () => {
  const run = createRun(district, character)
  for (let i = 0; i < 5; i++) {
    run.phase = 'lecture'
    run.mode = 'play'
    run.doneToday = []
    run.lectureResolved = false
    run.attendedToday = false
    run.slotsLeft = 5
    applyAction(district, run, 'lecture_attend', () => 0.99)
  }
  assert.equal(run.lectureStreak, 5)
  assert.ok(run.badges.includes('lectures'))
})

check('day 30 with grades graduates', () => {
  const run = createRun(district, character)
  run.day = 30
  run.stats.grades = 50
  run.wroteExam = true
  run.examWeek = true
  run.phase = 'night'
  run.lectureResolved = true
  endDay(district, run)
  assert.equal(run.graduated, true)
  assert.ok(run.queue.some((card) => card.title === 'Graduated first year'))
})

check('closed places and exam-week library', () => {
  const run = createRun(district, character)
  run.minutes = 21 * 60
  const meal = district.activities.find((action) => action.id === 'cafeteria_meal')
  assert.equal(actionState(district, run, meal).reason, 'Closed · opens 07:00')
  run.minutes = 19 * 60
  const vendor = district.activities.find((action) => action.id === 'quad_vendor')
  assert.match(actionState(district, run, vendor).reason, /^Closed · opens/)
  run.minutes = 18 * 60 + 30
  assert.equal(actionState(district, run, vendor).disabled, false)
  const study = district.activities.find((action) => action.id === 'library_study')
  run.minutes = 23 * 60
  run.examWeek = false
  assert.match(actionState(district, run, study).reason, /^Closed/)
  run.examWeek = true
  assert.equal(actionState(district, run, study).disabled, false)
})

check('three game days then the refill lock', () => {
  const run = createRun(district, character)
  run.gameDaysToday = 3
  beginNextDay(district, run)
  assert.equal(run.mode, 'locked')
  assert.ok(run.lockedUntil)
})

check('balanced score and district switch', () => {
  const run = createRun(district, character)
  assert.equal(balancedScore(run.stats), 30)
  const money = run.stats.money
  switchDistrict(run, { ...district, meta: { ...district.meta, id: 'nextville' } })
  assert.equal(run.character.districtId, 'nextville')
  assert.equal(run.stats.money, money)
})

check('walk or bus, and skipping lecture', () => {
  const run = createRun(district, character)
  applyAction(district, run, 'go_walk', () => 0.99)
  const bus = district.activities.find((action) => action.id === 'go_bus')
  assert.equal(actionState(district, run, bus).reason, 'You already chose')
  const skip = createRun(district, character)
  skip.prep = 4
  skip.lectureStreak = 4
  skip.phase = 'lecture'
  applyAction(district, skip, 'lecture_skip', () => 0.99)
  assert.equal(skip.prep, 2)
  assert.equal(skip.lectureStreak, 0)
})

check('campus paths go around buildings', () => {
  const layout = buildingLayout(district)
  const grid = buildGrid(layout.obstacles)
  const quad = layout.buildings.find((building) => building.id === 'quad')
  const home = layout.buildings.find((building) => building.id === 'res_o')
  const walk = (from, to) => {
    let route = findPath(grid, nearestOpen(grid, from), nearestOpen(grid, to))
    assert.ok(route.length > 1)
    let position = { x: route[0].x, z: route[0].z }
    route = route.slice(1)
    let travelled = 0
    let stuck = 0
    for (let i = 0; i < 5000 && route.length; i += 1) {
      const before = position
      const step = followStep(grid, position, route, 0.35)
      if (step.blocked) {
        stuck += 1
        assert.ok(stuck < 8)
        route = findPath(grid, nearestOpen(grid, position), nearestOpen(grid, to))
        if (route.length) route = route.slice(1)
        continue
      }
      stuck = 0
      travelled += Math.hypot(step.position.x - before.x, step.position.z - before.z)
      position = step.position
      route = step.route
      assert.equal(pointBlocked(grid, position.x, position.z), false)
    }
    assert.equal(route.length, 0)
    assert.ok(Math.hypot(position.x - to.x, position.z - to.z) < 3)
    return travelled
  }
  const around = walk(
    { x: quad.x, z: quad.maxZ + 4 },
    { x: quad.x, z: quad.minZ - 4 },
  )
  assert.ok(around > 8, `around ${around}`)
  const across = walk(doorPoint(home), doorPoint(quad))
  assert.ok(across > 20, `across ${across}`)
})

check('a campus day changes the same stats as the action list', () => {
  const run = createRun(district, {
    name: 'Aya',
    residence: 'O Block',
    course: 'Accounting',
    avatar: { skin: 'amber', hair: 'crop', outfit: 'hoodie' },
  })
  assert.equal(homePlaceId(district, run.character.residence), 'res_o')
  assert.equal(coursePlaceId(district, run.character.course), 'smig')
  const rng = () => 0.99
  const morning = actionsAt(district, run, 'res_o').map((action) => action.id)
  assert.ok(morning.includes('wake_phone'))
  assert.equal(applyAction(district, run, 'wake_phone', rng).ok, true)
  advancePhase(district, run, rng)
  assert.ok(actionsAt(district, run, 'bus_station').some((action) => action.id === 'go_walk'))
  assert.equal(applyAction(district, run, 'go_walk', rng).ok, true)
  advancePhase(district, run, rng)
  assert.ok(actionsAt(district, run, 'smig').some((action) => action.id === 'lecture_attend'))
  assert.equal(applyAction(district, run, 'lecture_attend', rng).ok, true)
  advancePhase(district, run, rng)
  assert.ok(actionsAt(district, run, 'quad').some((action) => action.id === 'quad_friends'))
  assert.equal(applyAction(district, run, 'quad_friends', rng).ok, true)
  assert.ok(actionsAt(district, run, 'cafeteria').some((action) => action.id === 'cafeteria_meal'))
  assert.equal(applyAction(district, run, 'cafeteria_meal', rng).ok, true)
  advancePhase(district, run, rng)
  advancePhase(district, run, rng)
  assert.equal(run.phase, 'night')
  assert.ok(actionsAt(district, run, 'res_o').some((action) => action.id === 'sleep'))
  assert.equal(applyAction(district, run, 'sleep', rng).ok, true)
  assert.equal(run.mode, 'summary')
  assert.equal(run.summary.slept, true)
  assert.equal(run.stats.money, 1460)
  assert.equal(run.stats.energy, 80)
  assert.equal(run.stats.hunger, 75)
  assert.equal(run.stats.grades, 58)
  assert.equal(run.stats.social, 53)
  beginNextDay(district, run, new Date())
  assert.equal(run.stats.energy, 100)
  assert.equal(run.phase, 'wake')
})

function sleepThrough(run) {
  run.phase = 'night'
  run.place = 'res_o'
  run.slotsLeft = 1
  assert.equal(applyAction(district, run, 'sleep', rng).ok, true)
}
const rng = () => 0.5

check('slept hungry gives a card next morning', () => {
  const run = createRun(district, character)
  run.queue = []
  run.stats.hunger = 5
  sleepThrough(run)
  beginNextDay(district, run, new Date())
  assert.ok(run.queue.some((card) => card.tone === 'hungry'))
})

check('jobs unlock card on day 3', () => {
  const run = createRun(district, character)
  run.queue = []
  run.day = 2
  sleepThrough(run)
  beginNextDay(district, run, new Date())
  assert.equal(run.day, 3)
  assert.ok(run.queue.some((card) => card.id === 'unlock-jobs'))
})

check('no spot test in the first days', () => {
  const run = createRun(district, character)
  assert.ok(!run.spotTest)
})

check('low grades end the run', () => {
  const run = createRun(district, character)
  run.stats.grades = 1
  run.lowGradeDays = district.meta.day.lowGradesDays - 1
  sleepThrough(run)
  assert.equal(run.mode, 'over')
})

check('filter masks English, Afrikaans and isiZulu swearing', () => {
  for (const t of ['that was kak hard', 'fokken taxi', 'msunu wakho', 'sh1tttt', 'f*ck', 'poes', 'nyoko']) {
    const r = filterText(t)
    assert.ok(r.masked && !r.blocked, t)
  }
  assert.equal(filterText('Lekker vibes, sho ngiyabonga').masked, false)
  assert.equal(filterText('kakhulu').masked, false)
})

check('filter blocks slurs', () => {
  for (const t of ['you k4ffir', 'makwerekwere go home', 'moffie']) assert.equal(filterText(t).blocked, true, t)
})

check('chat rate limit', () => {
  const now = 1e9
  assert.equal(canSend([now - 1000], now).ok, false)
  assert.equal(canSend(Array.from({ length: 30 }, (_, i) => now - 10000 - i * 1000), now).ok, false)
  assert.equal(canSend([now - 5000], now).ok, true)
})

check('boards rank by residence and overall', () => {
  const rows = sampleBoard()
  const all = rankRows(rows, 'grades', 'all', 'O Block')
  assert.equal(all[0].display_name, 'Kayla R.')
  assert.ok(rankRows(rows, 'money', 'res', 'O Block').every((r) => r.residence === 'O Block'))
  const houses = rankRows(rows, 'balanced', 'houses', 'O Block')
  assert.ok(houses.length >= 4 && houses.some((h) => h.mine))
})

check('day 1 morning lines exist for every key the morning uses', () => {
  const src = readFileSync(new URL('../src/world/morning.js', import.meta.url), 'utf8')
  const lines = JSON.parse(readFileSync(new URL('../data/campusville/day1_morning.json', import.meta.url), 'utf8'))
  const get = (path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), lines)
  const keys = new Set()
  for (const m of src.matchAll(/line\(\s*['`]([^'`]+)['`]/g)) {
    if (m[1].includes('${res}')) { keys.add(m[1].replace('${res}', 'on_time')); keys.add(m[1].replace('${res}', 'late')) } else keys.add(m[1])
  }
  assert.ok(keys.size >= 15, `only ${keys.size} line keys found`)
  for (const key of keys) {
    const v = get(key)
    assert.ok(typeof v === 'string' || typeof v?.text === 'string', `missing line ${key}`)
  }
  const ids = [...src.matchAll(/setStep\('([^']+)'\)/g)].map((m) => m[1])
  const internal = new Set(['greet', 'snooze', 'eating'])
  for (const id of ids) assert.ok(internal.has(id) || lines.steps[id], `no steps.${id} in day1_morning.json`)
})

console.log(`${passed} checks passed`)
