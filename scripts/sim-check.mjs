import { readFileSync, readdirSync } from 'node:fs'
import { migrateCast } from '../src/cast-ids.js'
import { filterText, cleanBio, canSend } from '../src/engine/filter.js'
import { rankRows, sampleBoard } from '../src/engine/social-data.js'
import { canonicalHouse, registerHouses } from '../src/houses.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { HOME_CHATTERS, HOME_WALKERS, SKIN_MIX, skinFor } from '../src/world/skinmix.js'
import { buildDistrict, coursePlaceId, homePlaceId, houseOf } from '../src/engine/model.js'
import { parseCsvRows } from '../src/engine/csv.js'
import { balancedScore } from '../src/engine/board.js'
import { dreamProgress, rightNow, startGoals } from '../src/engine/goals.js'
import { crushChat, crushReply } from '../src/engine/crush-arc.js'
import { addIdentity, identityFromAction, identityTitle } from '../src/engine/identity.js'
import { cliffhanger } from '../src/engine/dayend.js'
import { MOMENTS, chooseMoment, momentCard, rollMoment } from '../src/engine/moments.js'
import { BEATS } from '../src/engine/arcs.js'
import { fridayTest } from '../src/engine/friday.js'
import { mealCost } from '../src/engine/grocer.js'
import { buildingLayout, doorPoint } from '../src/world/layout.js'
import { byDevice, byPlace, loadLine, median, p90, placeName, stallsOf, statusOf } from '../src/engine/smooth-stats.js'
import { buildGrid, findPath, followStep, nearestOpen, pointBlocked } from '../src/world/nav.js'
import {
  actionState,
  actionsAt,
  advancePhase,
  applyAction,
  beginNextDay,
  buy,
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
  houses: JSON.parse(read('houses.json')),
  events: JSON.parse(read('events.json')),
  hours: JSON.parse(read('hours.json')),
  courses: JSON.parse(read('courses.json')),
  besties: JSON.parse(read('besties.json')),
  twists: JSON.parse(read('twists.json')),
  jobs: JSON.parse(read('jobs.json')),
  shop: JSON.parse(read('shop.json')),
  greenway: JSON.parse(read('greenway.json')),
})

const character = {
  name: 'Aya',
  residence: 'Thekwini House',
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
  assert.equal(district.places.length, 19) // 12 places (the bus stop by the gate since 6 Nov) + the 7 houses
  assert.ok(district.activities.some((action) => action.id === 'organt_rep'))
  assert.equal(district.residences.length, 7)
  assert.equal(district.houses.filter((h) => district.places.some((p) => p.id === h.place && p.kind === 'residence')).length, 7)
  assert.equal(district.meta.dialCode, '031')
})

check('every CSV row has as many columns as its header (QA B01)', () => {
  for (const name of ['activities.csv', 'places.csv']) {
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
  run.crush = { met: 'bus', nameKnown: false, name: 'Mia', closeness: 0 }
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
  run.crush = { id: 'mia', name: 'Mia', romance: true, met: 'bus', nameKnown: false, closeness: 3, opener: 'funny', sat: true }
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

check('identity: New kid, then Becoming, then Known as, from what you do', () => {
  const run = createRun(district, { ...character, path: 'hustler' })
  assert.equal(identityTitle(run).text, 'New kid')
  const job = district.activities.find((a) => a.id === 'job_shift')
  identityFromAction(run, job, { money: 120 })
  const becoming = identityFromAction(run, job, { money: 120 })
  assert.equal(becoming?.text, 'Becoming: The Hustler')
  for (let i = 0; i < 7; i++) identityFromAction(run, job, { money: 120 })
  assert.equal(identityTitle(run).text, 'Known as: The Hustler')
  // A different life catches up: the title follows what you do, not what you said.
  for (let i = 0; i < 12; i++) addIdentity(run, { scholar: 2 })
  assert.equal(identityTitle(run).path.id, 'scholar')
})

check('day summary: goals done and missed, then a cliffhanger text that opens tomorrow', () => {
  const run = createRun(district, character)
  run.crush = { id: 'mia', name: 'Mia', romance: true, met: 'bus', nameKnown: false, closeness: 3, opener: 'bus', sat: true }
  startGoals(run)
  endDay(district, run, { slept: true })
  assert.equal(run.mode, 'summary')
  assert.equal(run.summary.review.done.length + run.summary.review.missed.length, 3)
  assert.match(run.summary.text.text, /earphones/)
  assert.equal(run.summary.text.from, 'Unknown number')
  assert.equal(run.inbox.length, 1)
  beginNextDay(district, run, new Date(Date.now() + 864e5))
  if (run.mode === 'play') {
    assert.match(run.goals.text.text, /earphones/) // last night's text on today's goal card
    assert.equal(run.inbox[0].read, true)
  }
  // Other stories send other texts.
  const nsfas = createRun(district, { ...character, funding: 'nsfas' })
  nsfas.day = 2
  assert.equal(cliffhanger(nsfas).from, 'NSFAS')
})

check('random moments: ten of them, each a choice, two a day at most, once a week', () => {
  assert.equal(MOMENTS.length, 10)
  for (const m of MOMENTS) assert.ok(m.choices.length >= 2 && m.choices.length <= 3, m.id)
  const run = createRun(district, { ...character, past: 'clown', path: 'creative' })
  run.day = 2
  run.phase = 'social'
  run.arcBeats = Object.fromEntries(BEATS.map((b) => [b.id, 0])) // storyline beats have their own check
  let seq = 0
  const rng = () => [0.1, 0.0, 0.1, 0.5, 0.1, 0.9][seq++ % 6]
  const a = rollMoment(run, rng)
  const b = rollMoment(run, rng)
  assert.ok(a, 'first moment')
  assert.equal(b, null, 'not while one is waiting')
  chooseMoment(run, a.momentId, 0)
  assert.equal(run.queue[0].kind, 'result')
  run.queue = []
  const c = rollMoment(run, rng, true)
  assert.ok(c && c.momentId !== a.momentId)
  run.queue = []
  assert.equal(rollMoment(run, rng, true), null, 'two a day at most')
  // Moments read your story: the old school friend remembers the class clown.
  const old = momentCard(run, MOMENTS.find((m) => m.id === 'old_school'))
  assert.match(old.text, /class clown/)
  const before = run.identity?.creative || 0
  run.queue = [old]
  chooseMoment(run, 'old_school', 0)
  assert.ok(run.identity.creative > before) // "Not anymore." pushes the path you chose
  // A cancelled lecture resolves the lecture.
  const lec = createRun(district, character)
  lec.day = 3
  lec.phase = 'lecture'
  chooseMoment(lec, 'lecture_cancelled', 1)
  assert.equal(lec.lectureResolved, true)
})

check('storylines: roommate, rival, money, lecturer, SRC and home beats; two or more arcs move each day', () => {
  const arcs = new Set(BEATS.map((b) => b.arc))
  for (const arc of ['roommate', 'rival', 'money', 'lecturer', 'src', 'home']) assert.ok(arcs.has(arc), arc)
  // With the crush beat every day 1-5, each day moves at least two arcs.
  for (let day = 1; day <= 5; day++) assert.ok(BEATS.filter((b) => b.day === day).length >= 1, `day ${day}`)
  const run = createRun(district, { ...character, funding: 'nsfas' })
  run.bestieName = 'Zoe'
  run.day = 3
  run.phase = 'leisure'
  const card = rollMoment(run, () => 0.99)
  assert.ok(card?.momentId.startsWith('arc_'), 'a due beat comes even without a lucky roll')
  const lend = BEATS.find((b) => b.id === 'arc_roommate_3')
  run.queue = [{ kind: 'moment', momentId: lend.id }]
  const money = run.stats.money
  chooseMoment(run, lend.id, 0)
  assert.equal(run.stats.money, money - 100)
  assert.equal(run.arcs.owed, 100)
  assert.ok(run.people.zoe.close >= 6)
  // The money beat reads your funding.
  const nsfasDay = createRun(district, { ...character, funding: 'nsfas' })
  nsfasDay.day = 2
  assert.match(BEATS.find((b) => b.id === 'arc_money_2').text(nsfasDay), /NSFAS/)
})

check('the week: day themes, and the Friday test mark comes from the choices you made', () => {
  const lazy = createRun(district, character)
  lazy.day = 5
  lazy.arcs = { lecturer: 'clash', noise: 'avoided' }
  lazy.hangover = true
  const worked = createRun(district, character)
  worked.day = 5
  worked.weekStudied = 3
  worked.prep = 8
  worked.arcs = { lecturer: 'impressed', rival: 'friend', owed: 100 }
  worked.crush = { studyDate: true, nameKnown: true, name: 'Mia' }
  const money = worked.stats.money
  const a = fridayTest(lazy)
  const b = fridayTest(worked)
  assert.ok(b.mark > a.mark + 20, `worked ${b.mark} vs lazy ${a.mark}`)
  assert.ok(b.lines.some((l) => /volunteered/.test(l.text)))
  assert.ok(a.lines.some((l) => /joke/.test(l.text) && l.n < 0))
  assert.equal(worked.stats.money, money + 100) // the roommate paid back
  assert.equal(fridayTest(worked), b) // only once
  // On Friday the must goal is the test.
  const fri = createRun(district, character)
  fri.day = 5
  startGoals(fri)
  assert.equal(fri.goals.list[0].id, 'test')
})

check('your course decides your lecture venue; your own venue has no sit-in', () => {
  const law = createRun(district, { ...character, course: 'Law' })
  law.phase = 'lecture'
  assert.ok(actionsAt(district, law, 'law').some((a) => a.id === 'lecture_attend'))
  assert.ok(!actionsAt(district, law, 'smig').some((a) => a.id === 'lecture_attend'))
  assert.ok(!actionsAt(district, law, 'law').some((a) => a.id === 'law_sitin'))
  assert.ok(actionsAt(district, law, 'smig').some((a) => a.id === 'smig_sitin'))
  const cs = createRun(district, { ...character, course: 'Computer Science' })
  cs.phase = 'lecture'
  assert.ok(actionsAt(district, cs, 'science').some((a) => a.id === 'lecture_attend'))
})

check('home and course places', () => {
  assert.equal(homePlaceId(district, 'Thekwini House'), 'res_o')
  assert.equal(homePlaceId(district, 'O Block'), 'res_o') // an old save moves into Thekwini
  assert.equal(homePlaceId(district, 'Jakaranda House'), 'res_j')
  // (any other old residence name gets a house, the same one every time)
  const moved = homePlaceId(district, 'Gapwood Residence')
  assert.ok(district.houses.some((h) => h.place === moved))
  assert.equal(homePlaceId(district, 'Gapwood Residence'), moved)
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

check('the fifth slot brings late night, not the end of the day; sleep ends it', () => {
  const run = createRun(district, character)
  run.slotsLeft = 1
  applyAction(district, run, 'wake_noodles', () => 0.99)
  // (owner, 6 Nov: no end-of-the-day screen; night falls and you carry on, or go to bed)
  assert.equal(run.mode, 'play')
  assert.equal(run.phase, 'night')
  assert.equal(run.lateNight, run.day)
  const bed = district.activities.find((action) => action.tags.includes('sleep') && action.phases.includes('night'))
  assert.ok(bed, 'a bed at night')
  assert.equal(actionState(district, run, bed).disabled, false, 'bed with no slots left')
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
  assert.ok(actionsAt(district, run, 'gate').some((action) => action.id === 'go_walk'))
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

check('card bios: contact details taken out with a reason, slurs blocked (Piece 1a)', () => {
  const a = cleanBio('Call me 072 123 4567 or wa.me/27721234567 ig: thandi_99 @thandi www.mysite.co.za')
  assert.equal(a.text, 'Call me or')
  assert.ok(a.removed.some((r) => /Phone/.test(r)) && a.removed.some((r) => /WhatsApp/.test(r)) && a.removed.some((r) => /Social/.test(r)) && a.removed.some((r) => /Links/.test(r)))
  assert.equal(cleanBio('Class of 2026, room 12, 3 lectures a day').text, 'Class of 2026, room 12, 3 lectures a day')
  assert.deepEqual(cleanBio('Class of 2026, room 12').removed, [])
  assert.equal(cleanBio('x'.repeat(120)).text.length, 80)
  assert.equal(cleanBio('you are a kaffir').blocked, true)
  assert.equal(cleanBio('Law student who loves amapiano and bunny chow').removed.length, 0)
})

check('chat rate limit', () => {
  const now = 1e9
  assert.equal(canSend([now - 1000], now).ok, false)
  assert.equal(canSend(Array.from({ length: 30 }, (_, i) => now - 10000 - i * 1000), now).ok, false)
  assert.equal(canSend([now - 5000], now).ok, true)
})

check('boards rank by residence and overall', () => {
  const rows = sampleBoard()
  const all = rankRows(rows, 'grades', 'all', 'Wave House')
  assert.equal(all[0].display_name, 'Kayla R.')
  assert.ok(rankRows(rows, 'money', 'res', 'Wave House').every((r) => r.residence === 'Wave House'))
  const houses = rankRows(rows, 'balanced', 'houses', 'Wave House')
  assert.ok(houses.length >= 4 && houses.some((h) => h.mine))
})

check('a house renamed: old names still land in the same house, on the boards and on cards', () => {
  registerHouses(JSON.parse(readFileSync(new URL('../data/campusville/houses.json', import.meta.url), 'utf8')))
  assert.equal(canonicalHouse('Thekwini House'), 'Wave House')
  assert.equal(canonicalHouse('Braam House'), 'Goldrush House')
  assert.equal(canonicalHouse('O Block'), 'Wave House')
  assert.equal(canonicalHouse('thekwini'), 'Wave House')
  assert.equal(canonicalHouse('Wave House'), 'Wave House')
  assert.equal(canonicalHouse('Peak House'), 'Peak House')
  // an old pre-house name falls to the house houseOf gives it (same rule as main.js), always a real house
  const houseRows = JSON.parse(readFileSync(new URL('../data/campusville/houses.json', import.meta.url), 'utf8')).houses.map((h) => ({ ...h, was: h.was || [] }))
  const realHouses = houseRows.map((h) => h.name)
  const cane = canonicalHouse('Cane Crescent')
  assert.ok(realHouses.includes(cane), 'Cane Crescent lands in a real house: ' + cane)
  assert.equal(canonicalHouse('Cane Crescent'), cane)
  assert.equal(cane, houseOf({ houses: houseRows }, 'Cane Crescent').name)
  // rows written by a phone before the rename join the new name's group, and "mine" still finds it
  const rows = [
    { user_id: 'a', display_name: 'A', residence: 'Thekwini House', grades: 80, balanced_avg: 70 },
    { user_id: 'b', display_name: 'B', residence: 'Wave House', grades: 60, balanced_avg: 50 },
    { user_id: 'c', display_name: 'C', residence: 'Braam House', grades: 40, balanced_avg: 30 },
    { user_id: 'd', display_name: 'D', residence: 'Goldrush House', grades: 20, balanced_avg: 10 },
  ]
  const houses = rankRows(rows, 'balanced', 'houses', 'Thekwini House')
  assert.deepEqual(houses.map((h) => [h.residence, h.n]), [['Wave House', 2], ['Goldrush House', 2]])
  assert.ok(houses.find((h) => h.residence === 'Wave House').mine)
  assert.equal(rankRows(rows, 'grades', 'res', 'Wave House').length, 2)
  assert.equal(rankRows(rows, 'grades', 'res', 'Braam House').length, 2)
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


// ---- Greenway Grocer and the house fridge (owner, 6 Nov) ----
check('Greenway: 12 items on three shelves, at the asked prices', () => {
  const g = district.greenway
  assert.equal(g.items.length, 12)
  assert.deepEqual(g.shelves.map((x) => x.id), ['groceries', 'essentials', 'treats'])
  const price = Object.fromEntries(g.items.map((i) => [i.id, i.price]))
  assert.deepEqual(price, { bread: 18, eggs: 45, noodles: 8, pasta: 25, chicken: 70, colddrink: 15, airtime: 29, data: 49, toiletries: 40, chips: 14, chocolate: 18, energydrink: 22 })
  assert.ok(district.places.some((p) => p.id === 'greenway' && p.name === 'Greenway Grocer'))
  assert.ok(!district.places.some((p) => p.id === 'bus_station'))
})

check('groceries go in the fridge; cooking needs them, uses them, names what is missing', () => {
  const run = createRun(district, character)
  run.phase = 'leisure'
  const dinner = district.activities.find((a) => a.id === 'house_dinner')
  const out = actionState(district, run, dinner)
  assert.equal(out.disabled, true)
  assert.equal(out.reason, 'Out of pasta and chicken')
  assert.equal(out.greenway, true)
  const money = run.stats.money
  assert.equal(buy(district, run, 'pasta').ok, true)
  assert.equal(buy(district, run, 'chicken').ok, true)
  assert.equal(run.stats.money, money - 95)
  assert.equal(run.fridge.pasta, 4)
  assert.equal(run.fridge.chicken, 4)
  assert.equal(actionState(district, run, dinner).disabled, false)
  const before = run.stats.money
  assert.equal(applyAction(district, run, 'house_dinner', () => 0.99).ok, true)
  assert.equal(run.stats.money, before, 'paid at the shop, not at the stove')
  assert.equal(run.fridge.pasta, 3)
  assert.equal(run.fridge.chicken, 3)
  assert.equal(run.fridge.leftovers, 1)
})

check('cooking at home costs less per meal than the caf, and takes longer', () => {
  const caf = district.activities.find((a) => a.id === 'cafeteria_meal')
  const dinner = district.activities.find((a) => a.id === 'house_dinner')
  const cost = mealCost(district, 'house_dinner')
  assert.ok(cost < -caf.deltas.money, `R${cost} at home vs R${-caf.deltas.money} at the caf`)
  assert.ok(dinner.deltas.hunger >= caf.deltas.hunger)
  assert.ok(dinner.slots > caf.slots, 'two slots at home, one at the caf')
})

check('essentials and treats count at once: the energy drink, airtime for calls', () => {
  const run = createRun(district, character)
  run.stats.energy = 50
  buy(district, run, 'energydrink')
  assert.equal(run.stats.energy, 70)
  run.phase = 'leisure'
  run.credit = 0
  const call = district.activities.find((a) => a.id === 'call_home')
  assert.equal(actionState(district, run, call).reason, 'No airtime or data')
  buy(district, run, 'airtime')
  assert.equal(run.credit, 3)
  const ok = actionState(district, run, call)
  assert.ok(!ok.disabled || ok.reason !== 'No airtime or data')
  const poor = createRun(district, character)
  poor.stats.money = 5
  assert.equal(buy(district, poor, 'chicken').ok, false)
  assert.equal(poor.fridge.chicken || 0, 0)
})

check('smoothness page: groups by place, red and amber, worst first, load line, stalls', () => {
  const row = (place, session, typical, low, below20, seconds = 60, extra = {}) => ({ session, place, scene: 'campus', seconds, fps_typical: typical, fps_low: low, secs_below_20: below20, secs_below_30: below20, long_frames: 6, stalls: 1, tap_ms: 80, gpu: 'Adreno 610', device: 'SM-A135F', net: '4g', load_ms: 3000, created_at: '2026-11-07T10:00:00Z', stall_at: [], ...extra })
  const rows = [
    row('quad', 'a', 58, 40, 0), row('quad', 'b', 60, 44, 1),
    row('cafeteria', 'a', 50, 18, 2),      // worst 10% under 20: red
    row('library', 'a', 28, 24, 1),        // typical under 30: amber
    row('greenway', 'c', 45, 30, 4, 60),   // 6.7% of the time under 20: red
    row('gate', 'c', 40, 30, 3, 60),       // exactly 5%: not red
  ]
  const places = byPlace(rows)
  assert.deepEqual(places.map((g) => `${g.key}:${g.status}`), ['cafeteria:red', 'greenway:red', 'library:amber', 'gate:ok', 'quad:ok'])
  const quad = places.find((g) => g.key === 'quad')
  assert.equal(quad.players, 2)
  assert.equal(quad.minutes, 2)
  assert.equal(quad.typical, 59)
  assert.equal(quad.low, 42)
  assert.equal(statusOf({ low: 20, below20: 5, typical: 30 }), 'ok')
  assert.equal(statusOf({ low: 19, below20: 0, typical: 60 }), 'red')
  assert.equal(statusOf({ low: 30, below20: 5.1, typical: 60 }), 'red')
  assert.equal(statusOf({ low: 30, below20: 0, typical: 29 }), 'amber')
  assert.equal(byDevice(rows).length, 1)
  assert.equal(byDevice([{ ...rows[0], gpu: null }])[0].key, 'SM-A135F')
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9)
  const clocks = loadLine([
    row('quad', 'a', 50, 40, 0, 60, { boot_ms: 1500, load_ms: 2000 }),
    row('quad', 'b', 50, 40, 0, 60, { boot_ms: 4500, load_ms: 6000, net: '3g' }),
    row('quad', 'c', 50, 40, 0, 60, { boot_ms: null, load_ms: null }),
    row('quad', 'd', 50, 40, 0, 60, { boot_ms: 1000, load_ms: null }),
  ])
  assert.equal(clocks.load.all.n, 2)
  assert.equal(clocks.boot.all.n, 3, 'open to title and tap to playing are counted separately')
  assert.equal(clocks.boot.all.median, 1500)
  assert.equal(clocks.load.all.median, 4000)
  assert.deepEqual(clocks.load.byNet.map((x) => x.net).sort(), ['3g', '4g'])
  assert.deepEqual(clocks.boot.byNet.map((x) => x.net).sort(), ['3g', '4g'])
  // Names on the page: places.csv names, houses' common rooms, the scene buckets.
  const names = { places: district.places, houses: district.houses }
  assert.equal(placeName('quad', names), 'The Quad')
  assert.equal(placeName('gate', names), 'Main Gate')
  assert.equal(placeName('common:thekwini', names), 'Wave House common room')
  assert.equal(placeName('common:nobody', names), 'common:nobody')
  assert.equal(placeName('paths', names), 'Paths between places')
  assert.equal(placeName('room', names), 'Activity rooms')
  assert.equal(placeName('home:township', names), 'Day 1 home (township)')
  assert.equal(placeName('mystery_place', names), 'mystery_place')
  for (const place of district.places) assert.notEqual(placeName(place.id, names), place.id, `${place.id} has a name`)
  const named = byPlace([row('quad', 'a', 50, 40, 0)], (r) => placeName(r.place, names))[0]
  assert.equal(named.label, 'The Quad')
  assert.equal(named.key, 'quad')
  const stalled = [row('quad', 'a', 50, 40, 0, 60, { stall_at: [{ k: 'player', h: '2.0 m short', x: 1, z: 2 }], created_at: '2026-11-07T09:00:00Z' }), row('quad', 'b', 50, 40, 0, 60, { stall_at: [{ k: 'npc', h: 'walk 1.6 m short', x: 3, z: 4 }], created_at: '2026-11-07T11:00:00Z' })]
  const list = stallsOf(byPlace(stalled)[0])
  assert.deepEqual(list.map((x) => x.kind), ['npc', 'player'])
  assert.equal(stallsOf({ rows: Array.from({ length: 30 }, (_, i) => row('quad', 'a', 50, 40, 0, 60, { stall_at: [{ k: 'npc', h: 'x', x: i, z: 0 }], created_at: `2026-11-07T10:${String(i).padStart(2, '0')}:00Z` })) }).length, 20)
})

// CAST RULE (docs/cast.md): every NPC spawn list shows a visible mix of skin tones.
check('every NPC spawn list has at least 3 different skin tones (docs/cast.md)', () => {
  const tones = (list) => new Set(list).size
  assert.ok(tones(SKIN_MIX) >= 4, 'SKIN_MIX')
  assert.ok(tones(Array.from({ length: 20 }, (_, i) => skinFor(i))) >= 4, 'campus crowd x0..x19')
  assert.ok(tones(Array.from({ length: 8 }, (_, i) => skinFor(i * 3))) >= 3, 'lecture hall first rows')
  const homes = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data/campusville/homes.json'), 'utf8'))
  const styles = homes.styles || homes
  assert.ok(Object.keys(styles).length >= 2, 'home styles')
  for (const [id, style] of Object.entries(styles)) {
    if (!style.neighbour) continue
    const street = [...HOME_WALKERS, ...HOME_CHATTERS, style.neighbour.look.skin]
    assert.ok(tones(street) >= 3, `home street "${id}" shows ${tones(street)} skin tones`)
  }
  const src = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8')
  assert.ok(tones([...src('src/world/cast.js').matchAll(/skin: '(\w+)'/g)].map((m) => m[1])) >= 3, 'named cast (src/world/cast.js)')
  for (const f of ['src/world/lecture.js', 'src/world/home.js', 'src/world/cast.js']) {
    assert.ok(!/skin: \[|SKINS\s*=/.test(src(f)), `${f} has its own skin list: use skinmix.js`)
  }
})

// CAST, ROOMMATES AND HOME COUNTRY (owner, 9 Nov; docs/cast.md)
check('the cast was renamed: no old name or id is left in data/ or src/ (except the save mapping)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) walk(rel)
      else if (/\.(js|json|css|csv|mjs)$/.test(e.name)) files.push(rel)
    }
  }
  walk('src'); walk('data')
  const old = /\b(zanele|sipho|auntie_pinky|dr_mahlangu|Auntie Pinky|Dr Mahlangu|Zanele|Sipho|Kabelo|Amahle|Lindiwe)\b|['"](kea|thandi|lindiwe|amahle|kabelo)['"]/
  const hits = []
  for (const f of files) {
    if (f === 'src/cast-ids.js') continue
    readFileSync(join(root, f), 'utf8').split('\n').forEach((line, i) => { if (old.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`) })
  }
  assert.deepEqual(hits, [])
})

check('old saves: the renamed people, contacts, crush and roommate move to the new ids', () => {
  const run = {
    bestieName: 'Zanele',
    character: { name: 'A', avatar: { gender: 'female' } },
    people: { zanele: { chats: 2, close: 18 }, kea: { chats: 1, close: 5 }, naledi: { chats: 1, close: 4 }, auntie_pinky: { chats: 3, close: 9 } },
    contacts: [{ id: 'lindiwe', name: 'Lindiwe', day: 2 }, { id: 'naledi', name: 'Naledi', day: 1 }],
    crush: { id: 'amahle', name: 'Amahle', romance: true },
  }
  assert.equal(migrateCast(run), true)
  assert.deepEqual(Object.keys(run.people).sort(), ['kayla', 'mama_liz', 'naledi', 'zoe'])
  assert.equal(run.people.zoe.close, 18)
  assert.deepEqual(run.contacts.map((c) => [c.id, c.name]), [['leah', 'Leah'], ['naledi', 'Naledi']])
  assert.deepEqual([run.crush.id, run.crush.name], ['mia', 'Mia'])
  assert.equal(run.bestieName, 'Zoe')
  assert.equal(run.character.roommate, 'zoe', 'Zanele stays the roommate as Zoe')
  assert.equal(migrateCast(run), false, 'a second time changes nothing')
  const man = { bestieName: 'Sipho', character: { avatar: { gender: 'male' } }, people: { sipho: { chats: 1, close: 3 } }, crush: { id: 'kabelo', name: 'Kabelo' } }
  migrateCast(man)
  assert.deepEqual([man.bestieName, man.character.roommate, Object.keys(man.people)[0], man.crush.id], ['Ethan', 'ethan', 'ethan', 'daniel'])
})

check('roommates: four women and four men, one skin each in the cast mix; lines work for all eight', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const room = JSON.parse(readFileSync(join(root, 'data/campusville/roommates.json'), 'utf8'))
  assert.deepEqual(room.women.map((r) => r.name), ['Zoe', 'Megan', 'Jade', 'Anisha'])
  assert.deepEqual(room.women.map((r) => r.skin), ['deep', 'fair', 'brown', 'amber'])
  assert.deepEqual(room.men.map((r) => r.name), ['Ethan', 'Marcus', 'Ryan', 'Ravi'])
  assert.deepEqual(room.men.map((r) => r.skin), ['fair', 'deep', 'brown', 'amber'])
  for (const r of [...room.women, ...room.men]) assert.equal(r.id, r.name.toLowerCase())
  // No name-specific jokes: a roommate's lines never contain a roommate's name.
  const names = [...room.women, ...room.men].map((r) => r.name)
  const people = JSON.parse(readFileSync(join(root, 'data/campusville/people.json'), 'utf8'))
  const text = JSON.stringify(people.roommate_chats)
  for (const n of names) assert.ok(!new RegExp(`\b${n}\b`).test(text), `roommate_chats mention ${n}`)
  for (const f of ['day1_morning', 'day1_lecture']) {
    const t = readFileSync(join(root, `data/campusville/${f}.json`), 'utf8')
    for (const n of names) assert.ok(!new RegExp(`\b${n}\b`).test(t), `${f}.json names ${n}: use {roommate}`)
  }
})

check('international students: David (Nigeria), Grace (Kenya), Tendai (Zimbabwe), 3-5 friendly lines each', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const people = JSON.parse(readFileSync(join(root, 'data/campusville/people.json'), 'utf8')).people
  for (const [id, name, country] of [['david', 'David Okafor', 'Nigeria'], ['grace', 'Grace Wanjiru', 'Kenya'], ['tendai', 'Tendai Moyo', 'Zimbabwe']]) {
    assert.equal(people[id].name, name)
    assert.equal(people[id].country, country)
    const lines = people[id].chats.flatMap((c) => c.line ? [c.line] : c.lines ? c.lines : [c.warm, c.cold])
    assert.ok(lines.length >= 3 && lines.length <= 10, `${id} has ${lines.length} lines`)
  }
})

// LAST, on purpose: the wording is Cursor's (data/campusville/meta.json "smoothness"). This stops the
// run, and fails, until all three are written; every check above has already run.
check('meta.json smoothness words are all written (Cursor): settingLabel, settingHelp, privacyLine', () => {
  const words = district.meta.smoothness || {}
  const missing = ['settingLabel', 'settingHelp', 'privacyLine'].filter((k) => typeof words[k] !== 'string' || !words[k].trim())
  assert.deepEqual(missing, [], `meta.json smoothness is missing: ${missing.join(', ')} (Cursor fills these in)`)
})

console.log(`${passed} checks passed`)
