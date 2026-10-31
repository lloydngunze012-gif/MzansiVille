import { balancedScore } from './board.js'
import { formatDelta, hashString, toMinutes, weekdayName, fillTemplate } from './format.js'
import { coursePlaceId, homePlaceId, pickBestie } from './model.js'
import { checkGoals, goalText, goalsCard, startGoals, trackToday } from './goals.js'
import { FUNDING_MONEY } from '../story.js'
import { identityCard, identityFromAction } from './identity.js'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function sessionKey(now, refillHour) {
  const d = new Date(now)
  if (d.getHours() < refillHour) d.setDate(d.getDate() - 1)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function nextRefill(now, refillHour) {
  const d = new Date(now)
  if (d.getHours() >= refillHour) d.setDate(d.getDate() + 1)
  d.setHours(refillHour, 0, 0, 0)
  d.setMilliseconds(0)
  return d.toISOString()
}

export function isExamWeek(meta, day) {
  const every = meta.calendar.examEvery
  const tail = meta.calendar.examTail
  const mod = ((day - 1) % every) + 1
  return mod > every - tail
}

export function referralCode(shop, seed) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let n = hashString(seed)
  let out = ''
  const length = shop.codeLength || 4
  for (let i = 0; i < length; i++) {
    out += alphabet[n % alphabet.length]
    n = Math.floor(n / alphabet.length) || hashString(out + seed + i)
  }
  return `${shop.codePrefix || ''}${out}`
}

function phaseById(meta, id) {
  return meta.phases.find((phase) => phase.id === id) || meta.phases[0]
}

function enqueue(run, card) {
  if (run.queue.some((item) => item.id === card.id)) return
  run.queue.push(card)
}

function placeMatches(district, run, action, placeId) {
  if (action.scope === 'home') return homePlaceId(district, run.character.residence) === placeId
  if (action.scope === 'course') return coursePlaceId(district, run.character.course) === placeId
  if (action.scope === 'campusRes') {
    const place = district.places.find((item) => item.id === placeId)
    return Boolean(place && place.kind === 'residence' && place.id !== 'off_campus')
  }
  return action.placeId === placeId
}

export function actionsAt(district, run, placeId) {
  return district.activities.filter(
    (action) => action.phases.includes(run.phase) && placeMatches(district, run, action, placeId),
  )
}

function hoursFor(district, action) {
  return district.hours.actions[action.id] || district.hours.places[action.placeId] || null
}

function hoursOpen(hours, run) {
  if (!hours) return true
  if (run.examWeek && hours.examOpen) return true
  const t = run.minutes
  return t >= toMinutes(hours.opens) && t < toMinutes(hours.closes)
}

export function actionState(district, run, action) {
  if (action.unlockDay && run.day < action.unlockDay) {
    return { disabled: true, hidden: true, reason: `Unlocks day ${action.unlockDay}` }
  }
  if (action.unlockExam && !run.examWeek) return { disabled: true, hidden: true, reason: 'Exam week only' }
  if (run.doneToday.includes(action.id)) return { disabled: true, hidden: false, reason: 'Already done today' }
  const group = (district.meta.exclusive || []).find((ids) => ids.includes(action.id))
  if (group && group.some((id) => id !== action.id && run.doneToday.includes(id))) {
    return { disabled: true, hidden: false, reason: 'You already chose' }
  }
  if (action.weeklyLimit && (run.weekly[action.id] || 0) >= action.weeklyLimit) {
    return { disabled: true, hidden: false, reason: 'No shifts left this week' }
  }
  const hours = hoursFor(district, action)
  if (hours && !hoursOpen(hours, run)) {
    return { disabled: true, hidden: false, reason: `Closed · opens ${hours.opens}` }
  }
  if (run.stats.hunger < district.meta.day.hungerStudyBlock && action.tags.includes('study')) {
    return { disabled: true, hidden: false, reason: 'Too hungry to study' }
  }
  if (run.noodlesOnly && action.tags.includes('meal') && action.deltas.money < 0 && action.id !== 'wake_noodles') {
    return { disabled: true, hidden: false, reason: 'Noodles only until a shift' }
  }
  if (action.slots > run.slotsLeft) return { disabled: true, hidden: false, reason: `Needs ${action.slots} slots` }
  return { disabled: false, hidden: false, reason: '' }
}

function applyStats(run, deltas) {
  const stats = run.stats
  if (deltas.money) stats.money = Math.round(stats.money + deltas.money)
  if (deltas.energy) stats.energy = clamp(stats.energy + deltas.energy, 0, run.energyCap)
  if (deltas.grades) stats.grades = clamp(stats.grades + deltas.grades, 0, 100)
  if (deltas.social) stats.social = clamp(stats.social + deltas.social, 0, 100)
  if (deltas.hunger) stats.hunger = clamp(stats.hunger + deltas.hunger, 0, 100)
  const broke = stats.money < 0
  if (broke && !run.noodlesOnly) {
    enqueue(run, {
      id: `broke-${run.day}-${run.minutes}`,
      kind: 'consequence',
      tone: 'broke',
      title: 'Broke',
      text: 'Your balance is below R0. It is noodles only until a shift or an allowance pays you back up.',
    })
  }
  run.noodlesOnly = broke
}

function socialBoost(district, run, social) {
  if (social <= 0) return social
  const name = weekdayName(district.meta, run.day)
  if (name !== district.meta.calendar.socialBoostWeekday) return social
  return Math.round(social * district.meta.calendar.socialBoost)
}

function shapeDeltas(district, run, action, extra = {}) {
  let { money, energy, grades, social, hunger } = action.deltas
  if (extra.moneyFactor) money = Math.round(money * extra.moneyFactor)
  if (run.examWeek && action.tags.includes('study')) grades *= 2
  if (run.examWeek && action.tags.includes('party') && social > 0) social = Math.round(social * 0.5)
  social = socialBoost(district, run, social)
  if (run.fallingBehind > 0 && grades > 0) grades = Math.floor(grades * district.meta.day.gradeHalve)
  return { money, energy, grades, social, hunger }
}

function shapeLoose(district, run, deltas) {
  const next = { money: 0, energy: 0, grades: 0, social: 0, hunger: 0, ...deltas }
  next.social = socialBoost(district, run, next.social)
  if (run.fallingBehind > 0 && next.grades > 0) next.grades = Math.floor(next.grades * district.meta.day.gradeHalve)
  return next
}

function prepOutcome(meta, prep) {
  const table = meta.calendar.prep
  if (prep >= table.high) return { grades: table.highGrades, text: table.highText, behind: false }
  if (prep >= table.mid) return { grades: table.midGrades, text: table.midText, behind: false }
  return { grades: table.lowGrades, text: table.lowText, behind: true }
}

function markBehind(district, run, cards) {
  run.fallingBehind = district.meta.day.fallingBehindDays
  run.studyClears = 0
  run.status = 'Falling behind'
  if (!run.examWeek) {
    cards.push({
      id: `behind-${run.day}`,
      kind: 'consequence',
      tone: 'behind',
      title: 'Falling behind',
      text: `Your prep is too thin. Grade gains are halved for ${district.meta.day.fallingBehindDays} days. Attend and study to catch up, and do not fall behind in exam week.`,
    })
  }
  if (run.examWeek) {
    run.excluded = true
    run.excludeText = 'Falling behind in exam week.'
    cards.push({ id: `exclude-${run.day}`, kind: 'over', title: 'Excluded', text: run.excludeText })
  }
}

function rememberStat(run) {
  const money = `${run.stats.money < 0 ? '-' : ''}R${String(Math.abs(run.stats.money)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
  run.lastStatLine = `Grades ${run.stats.grades} · ${money} in your pocket`
}

function pushHistory(run, now) {
  run.history = run.history || []
  run.history.push({
    at: new Date(now).toISOString(),
    money: run.stats.money,
    grades: run.stats.grades,
    balanced: balancedScore(run.stats),
  })
  if (run.history.length > 21) run.history = run.history.slice(-21)
}

function dailyEventId(district, run) {
  const sunday = district.meta.calendar.sundayEvent
  if (weekdayName(district.meta, run.day) === 'Sunday') return sunday
  const pool = district.events.filter((event) => event.id !== sunday)
  if (!pool.length) return null
  const index = hashString(`${run.character.name}|${run.day}|${run.sessionKey}`) % pool.length
  return pool[index].id
}

function bestieCard(district, run) {
  const moment = (district.besties.moments || []).find((item) => item.day === run.day)
  if (!moment || run.bestieSeen[run.day]) return
  run.bestieSeen[run.day] = true
  enqueue(run, {
    id: `bestie-${run.day}`,
    kind: 'bestie',
    title: run.bestieName,
    text: fillTemplate(moment.text, {
      name: run.bestieName,
      residence: run.character.residence,
      you: run.character.name,
      district: district.meta.name,
    }),
  })
}

function revealEvent(district, run) {
  if (run.eventSeen || !run.dailyEventId) return
  const event = district.events.find((item) => item.id === run.dailyEventId)
  if (!event) return
  run.eventSeen = true
  enqueue(run, {
    id: `event-${event.id}-${run.day}`,
    kind: 'event',
    title: event.title,
    text: event.text,
    choices: event.choices.map((choice) => choice.label),
    eventId: event.id,
  })
}

function skipLecture(district, run, cards) {
  if (run.lectureResolved) return
  const prep = district.meta.calendar.prep
  run.prep = Math.max(0, run.prep + prep.skip)
  run.lectureStreak = 0
  run.attendedToday = false
  run.lectureResolved = true
  if (run.spotTest && !run.spotResolved) {
    applyStats(run, { grades: prep.lowGrades })
    run.spotResolved = true
    cards.push({
      id: `spot-miss-${run.day}`,
      kind: 'result',
      title: 'Spot test',
      text: `You were not in the seat. Grades ${prep.lowGrades}.`,
    })
  }
}

function rollSpot(district, run, rng) {
  const name = weekdayName(district.meta, run.day)
  const table = district.meta.calendar.spotTest
  let chance = table.defaultWeekday
  if ((district.meta.calendar.weekend || []).includes(name)) chance = table.weekend
  else if (table[name] != null) chance = table[name]
  // Fix 1 (pass 2): no spot tests before a new student has had a chance to prep.
  if (run.day < (district.meta.calendar.spotGraceDays || 0)) chance = 0
  run.spotTest = rng() < chance
  run.spotResolved = false
  if (run.spotTest) {
    enqueue(run, {
      id: `spot-${run.day}`,
      kind: 'spot',
      title: 'Spot test',
      text: 'What you did this week is about to matter.',
    })
  }
}

function spendTime(district, run, action) {
  run.slotsLeft -= action.slots
  const phase = phaseById(district.meta, run.phase)
  const step = action.slots > 0 ? (district.meta.slotMinutes[run.phase] || 30) * action.slots : 10
  run.minutes = Math.min(toMinutes(phase.end), run.minutes + step)
  run.doneToday.push(action.id)
  if (action.weeklyLimit) run.weekly[action.id] = (run.weekly[action.id] || 0) + 1
}

function applyTwistDeltas(district, run, twist, cards, id) {
  if (!twist) return
  if (twist.deltas) applyStats(run, shapeLoose(district, run, twist.deltas))
  if (twist.text) {
    cards.push({ id, kind: 'twist', title: 'Meanwhile', text: twist.text })
    run.lastEventLine = twist.text
  }
}

function rollTwist(district, run, action, rng, cards) {
  const twist = action.twistDef
  if (!twist) return 1
  if (twist.moneyFactor) {
    if (rng() < twist.p) {
      applyTwistDeltas(district, run, { text: twist.text }, cards, `twist-${action.id}-${run.day}`)
      return twist.moneyFactor
    }
    return 1
  }
  if (twist.always) applyTwistDeltas(district, run, twist.always, cards, `twist-always-${action.id}-${run.day}`)
  if (twist.branches) {
    const roll = rng()
    let acc = 0
    for (const branch of twist.branches) {
      acc += branch.p
      if (roll < acc) {
        applyTwistDeltas(district, run, branch, cards, `twist-${action.id}-${run.day}`)
        break
      }
    }
    return 1
  }
  if (twist.p != null && rng() < twist.p) {
    applyTwistDeltas(district, run, twist, cards, `twist-${action.id}-${run.day}`)
  }
  return 1
}

export function endDay(district, run, opts = {}) {
  if (run.mode === 'summary' || run.mode === 'over') return run
  const meta = district.meta
  const cards = []
  if (run.phase === 'lecture') skipLecture(district, run, cards)
  if (!run.attendedToday) run.lectureStreak = 0
  if (!run.pendingNight) {
    run.pendingNight = { slept: Boolean(opts.slept), hungry: false, hangover: run.hangover }
  }
  if (!run.eventSeen) revealEvent(district, run)
  if (run.examWeek && run.day % meta.calendar.examEvery === 0 && !run.wroteExam) {
    applyStats(run, { grades: meta.day.missedExamGrades })
    cards.push({
      id: `missed-exam-${run.day}`,
      kind: 'result',
      title: 'The paper',
      text: 'The Sports Centre filled in without you.',
    })
    run.lastEventLine = 'The Sports Centre filled in without you.'
  }
  if (run.stats.grades < meta.day.lowGrades) run.lowGradeDays += 1
  else run.lowGradeDays = 0
  if (run.lowGradeDays >= meta.day.lowGradesDays) {
    run.excluded = true
    run.excludeText = 'Three days under the line. Excluded.'
  }
  if (run.fallingBehind > 0 && run.examWeek && !run.excluded) {
    run.excluded = true
    run.excludeText = 'Falling behind in exam week.'
  }
  if (!run.excluded && run.day >= meta.day.graduateDay && run.stats.grades >= meta.day.graduateGrades && !run.graduated) {
    run.graduated = true
    run.milestoneSeen = false
    cards.push({
      id: `grad-${run.day}`,
      kind: 'milestone',
      title: 'Graduated first year',
      text: `${meta.name} keeps your person. The next district opens from here.`,
    })
  }
  rememberStat(run)
  pushHistory(run, opts.now || new Date())
  run.queue = cards.concat(run.queue.filter((card) => !cards.some((item) => item.id === card.id)))
  run.summary = {
    day: run.day,
    slept: Boolean(run.pendingNight?.slept),
    hungry: Boolean(run.pendingNight?.hungry),
    stats: { ...run.stats },
  }
  run.inProgress = false
  run.mode = run.excluded ? 'over' : 'summary'
  return run
}

function applyMorning(district, run) {
  const night = run.pendingNight
  if (!night) return
  const rules = district.meta.day
  let energy = run.stats.energy
  run.sleptHungry = Boolean(night.slept && night.hungry)
  if (night.slept && night.hungry) {
    energy = rules.hungrySleepEnergy
    run.morningNote = rules.hungrySleepMessage
    run.lastEventLine = rules.hungrySleepMessage
  } else if (night.slept) {
    energy = Math.min(run.energyCap, energy + rules.sleepEnergy)
    run.morningNote = ''
  } else {
    energy = Math.max(0, energy + rules.noSleepEnergy)
    run.morningNote = 'You did not sleep. Energy is down.'
  }
  if (night.hangover) energy = Math.max(0, energy + rules.hangoverEnergy)
  run.stats.energy = clamp(energy, 0, run.energyCap)
  run.hangover = false
  run.pendingNight = null
}

function resetDay(district, run) {
  const meta = district.meta
  if (weekdayName(meta, run.day) === meta.calendar.prepResetWeekday) {
    run.prep = 0
    run.weekly = {}
    run.gymThisWeek = false
    run.energyCap = 100
    run.stats.energy = Math.min(run.stats.energy, run.energyCap)
  }
  if (run.fallingBehind > 0) run.fallingBehind -= 1
  if (run.fallingBehind <= 0) run.status = ''
  run.phase = meta.phases[0].id
  run.minutes = toMinutes(meta.phases[0].start)
  run.slotsLeft = meta.day.slots
  run.doneToday = []
  run.attendedToday = false
  run.lectureResolved = false
  run.spotTest = null
  run.spotResolved = false
  run.eventSeen = false
  run.wroteExam = false
  run.examWeek = isExamWeek(meta, run.day)
  run.summary = null
  run.inProgress = true
  if (run.fallingBehind > 0 && run.examWeek) {
    run.excluded = true
    run.excludeText = 'Falling behind in exam week.'
    run.mode = 'over'
  }
}

function openDay(district, run) {
  run.examWeek = isExamWeek(district.meta, run.day)
  const unlock = (district.meta.milestones || []).find((item) => item.announce && item.day === run.day)
  if (unlock) enqueue(run, { id: `unlock-${unlock.id}`, kind: 'milestone', title: unlock.title, text: unlock.text })
  if (run.examWeek && !isExamWeek(district.meta, run.day - 1)) {
    enqueue(run, { id: `examweek-${run.day}`, kind: 'milestone', title: 'Exam week', text: 'Study counts double. The exam is at the Sports Centre on the last day. Do not fall behind now.' })
  }
  if (run.sleptHungry) {
    enqueue(run, { id: `hungry-${run.day}`, kind: 'consequence', tone: 'hungry', title: 'You slept hungry', text: `You went to bed under ${district.meta.day.hungrySleepBelow} fullness, so you only woke on ${district.meta.day.hungrySleepEnergy} energy. Eat before you sleep tonight.` })
  }
  run.dailyEventId = dailyEventId(district, run)
  bestieCard(district, run)
  if (run.day >= district.meta.day.savePromptDay && !run.userId && !run.saveSnooze) run.promptSave = true
}

export function createRun(district, character, now = new Date()) {
  const meta = district.meta
  const run = {
    v: 1,
    character: {
      name: character.name.trim(),
      residence: character.residence,
      course: character.course,
      avatar: { ...character.avatar },
      handle: (character.handle || '').replace(/^@/, ''),
      districtId: meta.id,
      // Creator part 2: your story (funding, hometown, who you were, who you want to be, the dream, interest).
      ...Object.fromEntries(['funding', 'hometown', 'past', 'path', 'dream', 'interest'].filter((k) => character[k]).map((k) => [k, character[k]])),
    },
    stats: { ...meta.start, money: meta.start.money + (FUNDING_MONEY[character.funding] || 0) },
    energyCap: 100,
    day: 1,
    phase: meta.phases[0].id,
    minutes: toMinutes(meta.phases[0].start),
    slotsLeft: meta.day.slots,
    slotsTotal: meta.day.slots,
    doneToday: [],
    prep: 0,
    lectureStreak: 0,
    attendedToday: false,
    lectureResolved: false,
    fallingBehind: 0,
    studyClears: 0,
    status: '',
    lowGradeDays: 0,
    noodlesOnly: false,
    weekly: {},
    gymThisWeek: false,
    wroteExam: false,
    badges: [],
    bestieName: pickBestie(district, character.residence, character.name),
    bestieSeen: {},
    queue: [],
    dailyEventId: null,
    eventSeen: false,
    spotTest: null,
    spotResolved: false,
    lastEventLine: 'A quiet day so far.',
    lastStatLine: '',
    pendingNight: null,
    hangover: false,
    morningNote: '',
    mode: 'play',
    sessionKey: sessionKey(now, meta.day.refillHour),
    gameDaysToday: 1,
    lockedUntil: null,
    userId: character.userId || null,
    graduated: false,
    milestoneSeen: false,
    excluded: false,
    excludeText: '',
    saveSnooze: false,
    promptSave: false,
    examWeek: false,
    inProgress: true,
    summary: null,
    history: [],
    referralCode: '',
    chatStamps: [],
  }
  rememberStat(run)
  openDay(district, run)
  return run
}

export function beginNextDay(district, run, now = new Date()) {
  const meta = district.meta
  const key = sessionKey(now, meta.day.refillHour)
  if (key !== run.sessionKey) {
    run.sessionKey = key
    run.gameDaysToday = 0
    run.lockedUntil = null
  }
  if (run.lockedUntil && new Date(now) < new Date(run.lockedUntil)) {
    run.mode = 'locked'
    return run
  }
  if (run.gameDaysToday >= meta.day.realDays) {
    run.lockedUntil = nextRefill(now, meta.day.refillHour)
    run.mode = 'locked'
    return run
  }
  applyMorning(district, run)
  run.day += 1
  run.gameDaysToday += 1
  resetDay(district, run)
  if (run.mode === 'over') return run
  run.mode = 'play'
  openDay(district, run)
  // Three goals for the new day, shown first.
  startGoals(run)
  run.queue.unshift(goalsCard(run))
  return run
}

export function advancePhase(district, run, rng = Math.random) {
  if (run.mode !== 'play') return run
  const phases = district.meta.phases
  const index = phases.findIndex((phase) => phase.id === run.phase)
  const cards = []
  if (run.phase === 'lecture') skipLecture(district, run, cards)
  if (index >= phases.length - 1) {
    run.queue = cards.concat(run.queue)
    return endDay(district, run, { slept: false })
  }
  run.phase = phases[index + 1].id
  run.minutes = toMinutes(phases[index + 1].start)
  if (run.phase === 'lecture') rollSpot(district, run, rng)
  if (run.phase === 'social') revealEvent(district, run)
  if (cards.length) run.queue = cards.concat(run.queue.filter((card) => !cards.some((item) => item.id === card.id)))
  return run
}

export function chooseEvent(district, run, eventId, index) {
  const event = district.events.find((item) => item.id === eventId)
  if (!event) return { ok: false, error: 'Missing event' }
  const choice = event.choices[index]
  if (!choice) return { ok: false, error: 'Missing choice' }
  applyStats(run, shapeLoose(district, run, choice.deltas))
  run.lastEventLine = choice.result
  run.queue = run.queue.filter((card) => card.eventId !== eventId)
  enqueue(run, {
    id: `event-result-${eventId}-${run.day}`,
    kind: 'result',
    title: event.title,
    text: choice.result,
  })
  rememberStat(run)
  return { ok: true }
}

export function dismissCard(run, id) {
  run.queue = run.queue.filter((card) => card.id !== id)
  return run
}

export function applyAction(district, run, actionId, rng = Math.random) {
  if (run.mode !== 'play' || run.excluded) return { ok: false, error: 'The day is not open' }
  const action = district.activities.find((item) => item.id === actionId)
  if (!action) return { ok: false, error: 'Unknown action' }
  const state = actionState(district, run, action)
  if (state.disabled) return { ok: false, error: state.reason }

  const cards = []
  const moneyFactor = rollTwist(district, run, action, rng, cards)
  const deltas = shapeDeltas(district, run, action, { moneyFactor })
  if (action.tags.includes('sleep')) deltas.energy = 0
  const hungrySleep = action.tags.includes('sleep') && run.stats.hunger < district.meta.day.hungrySleepBelow
  applyStats(run, deltas)
  trackToday(run, action, deltas)
  spendTime(district, run, action)

  cards.unshift({ id: `result-${action.id}-${run.day}`, kind: 'result', title: action.name, text: formatDelta(deltas) })
  run.lastEventLine = cards.find((card) => card.kind === 'twist')?.text || action.name

  if (action.tags.includes('attend')) {
    run.prep = Math.max(0, run.prep + district.meta.calendar.prep.attend)
    if (!run.attendedToday) {
      run.attendedToday = true
      run.lectureStreak += 1
      if (run.lectureStreak >= district.meta.day.streakBadge && !run.badges.includes('lectures')) {
        run.badges.push('lectures')
        cards.push({ id: `streak-${run.day}`, kind: 'result', title: 'Lecture streak', text: `${run.lectureStreak} days running.` })
      }
    }
    run.lectureResolved = true
    if (run.spotTest && !run.spotResolved) {
      const outcome = prepOutcome(district.meta, run.prep)
      let grades = outcome.grades
      if (grades > 0 && run.fallingBehind > 0) grades = Math.floor(grades * district.meta.day.gradeHalve)
      if (outcome.text === district.meta.calendar.prep.highText && action.deltas.grades > 0) {
        const extra = run.fallingBehind > 0 ? Math.floor(action.deltas.grades * district.meta.day.gradeHalve) : action.deltas.grades
        grades += extra
      }
      applyStats(run, { grades })
      if (outcome.behind) markBehind(district, run, cards)
      run.spotResolved = true
      cards.push({ id: `spot-result-${run.day}`, kind: 'result', title: outcome.text, text: `Grades ${grades > 0 ? '+' : ''}${grades}.` })
      run.lastEventLine = outcome.text
    }
  }

  if (action.tags.includes('backrow')) {
    run.lectureResolved = true
    run.lectureStreak = 0
    if (run.spotTest && !run.spotResolved) {
      applyStats(run, { grades: -(action.deltas.grades || 0) + district.meta.calendar.prep.lowGrades })
      run.spotResolved = true
      cards.push({ id: `spot-fail-${run.day}`, kind: 'result', title: 'You fail it', text: 'The test found you on your phone.' })
      run.lastEventLine = 'The test found you on your phone.'
    }
  }

  if (action.tags.includes('skip')) {
    run.prep = Math.max(0, run.prep + district.meta.calendar.prep.skip)
    run.lectureStreak = 0
    run.attendedToday = false
    run.lectureResolved = true
    if (run.spotTest && !run.spotResolved) {
      applyStats(run, { grades: district.meta.calendar.prep.lowGrades })
      run.spotResolved = true
      cards.push({ id: `spot-skip-${run.day}`, kind: 'result', title: 'Spot test', text: 'Skipping it was the whole answer.' })
    }
  }

  if (action.tags.includes('study')) {
    run.prep = Math.max(0, run.prep + district.meta.calendar.prep.study)
    if (run.fallingBehind > 0) {
      run.studyClears += 1
      if (run.studyClears >= district.meta.day.studiesToClear) {
        run.fallingBehind = 0
        run.studyClears = 0
        run.status = ''
        cards.push({ id: `clear-${run.day}`, kind: 'result', title: 'Back on track', text: 'Two study sessions. The warning lifts.' })
      }
    }
  }

  if (action.tags.includes('exam')) {
    run.wroteExam = true
    const outcome = prepOutcome(district.meta, run.prep)
    let grades = outcome.grades
    if (grades > 0 && run.fallingBehind > 0) grades = Math.floor(grades * district.meta.day.gradeHalve)
    applyStats(run, { grades })
    if (outcome.behind) markBehind(district, run, cards)
    cards.push({ id: `exam-${run.day}`, kind: 'result', title: outcome.text, text: 'The Sports Centre goes quiet row by row.' })
    run.lastEventLine = outcome.text
  }

  if (action.tags.includes('gym') && !run.gymThisWeek) {
    run.energyCap = 102
    run.gymThisWeek = true
  }
  if (action.tags.includes('party')) run.hangover = true
  if (action.tags.includes('shop') && !run.referralCode) {
    run.referralCode = referralCode(district.shop, `${run.character.name}|${run.day}`)
    cards.push({
      id: `shop-${run.day}`,
      kind: 'shop',
      title: district.shop.brand,
      text: 'Your profile card is ready. The next screen leaves the game.',
    })
  }
  if (action.tags.includes('phone')) revealEvent(district, run)
  if (action.tags.includes('sleep')) {
    run.pendingNight = { slept: true, hungry: hungrySleep, hangover: run.hangover }
    if (hungrySleep) run.lastEventLine = district.meta.day.hungrySleepMessage
  }

  const titled = identityFromAction(run, action, deltas)
  if (titled && titled.level !== 'new') cards.push(identityCard(run, titled))
  for (const goal of checkGoals(run)) cards.push({ id: `goal-${goal.id}-${run.day}`, kind: 'goal', title: 'Goal done', text: goalText(run, goal) })
  rememberStat(run)
  run.queue = cards.concat(run.queue.filter((card) => !cards.some((item) => item.id === card.id)))
  if (run.excluded || action.tags.includes('sleep') || run.slotsLeft <= 0) {
    endDay(district, run, { slept: action.tags.includes('sleep') })
  }
  return { ok: true }
}

export function switchDistrict(run, nextDistrict) {
  run.character.districtId = nextDistrict.meta.id
  const phase = nextDistrict.meta.phases[0]
  run.phase = phase.id
  run.minutes = toMinutes(phase.start)
  run.mode = 'play'
  run.inProgress = true
  return run
}

export { weekdayName }
