import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { buildDistrict, coursePlaceId, homePlaceId } from '../src/engine/model.js'
import { balancedScore } from '../src/engine/board.js'
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

console.log(`${passed} checks passed`)
