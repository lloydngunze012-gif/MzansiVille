// The goal ladder (spec section 2): the year dream, three day goals each morning
// (one must, one story, one dream) and one "right now" nudge. Everything here reads
// and writes the run only; the UI draws it.

export const DREAMS = {
  deans: { id: 'deans', icon: '\u{1F393}', label: "Make the Dean's List", short: "Dean's List" },
  hustle: { id: 'hustle', icon: '\u{1F4BC}', label: 'Build a hustle to R5,000', short: 'R5,000 hustle' },
  src: { id: 'src', icon: '\u{1F4E3}', label: 'Win an SRC seat', short: 'SRC seat' },
  love: { id: 'love', icon: '\u{1F498}', label: 'Find love', short: 'Find love' },
  famous: { id: 'famous', icon: '⭐', label: 'Become campus famous', short: 'Campus famous' },
}

export function dreamOf(run) {
  const id = run?.character?.dream
  return DREAMS[id] || DREAMS.deans
}

// 0..1 toward the year dream.
export function dreamProgress(run) {
  const clamp = (x) => Math.max(0, Math.min(1, x))
  const s = run.stats || {}
  switch (dreamOf(run).id) {
    case 'hustle': return clamp((run.earned || 0) / 5000)
    case 'love': return clamp((run.crush?.closeness || 0) / 20)
    case 'src': return clamp((s.social || 0) / 100 * 0.6 + srcTalks(run) / 10 * 0.4)
    case 'famous': return clamp((s.social || 0) / 100)
    default: return clamp(((s.grades || 0) - 50) / 25) // from the starting 50 up to the Dean's List at 75
  }
}

const SRC_PEOPLE = ['bongani', 'lindiwe', 'ruan']
function srcTalks(run) {
  return SRC_PEOPLE.reduce((n, id) => n + (run.people?.[id]?.chats || 0), 0)
}
function metCount(run) {
  return Object.keys(run.people || {}).length
}

// Today's counters: what the day goals measure.
export function today(run) {
  if (!run.today || run.today.day !== run.day) {
    run.today = { day: run.day, earned: 0, studied: 0, social: run.stats?.social || 0, met: metCount(run) }
  }
  return run.today
}

export function trackToday(run, action, deltas) {
  const t = today(run)
  if ((deltas.money || 0) > 0) {
    t.earned += deltas.money
    run.earned = (run.earned || 0) + deltas.money
  }
  if (action.tags?.includes('study')) { t.studied += 1; run.weekStudied = (run.weekStudied || 0) + 1 }
}

const crushName = (run) => (run.crush?.nameKnown ? run.crush.name : 'the one from the bus')
const GOALS = {
  lecture1: { text: () => 'Get to your 9:00 lecture', done: (run) => Boolean(run.attendedToday) },
  lecture: { text: () => 'Go to your lecture', done: (run) => Boolean(run.attendedToday) },
  test: { text: () => 'Write the test at 9:00', done: (run) => Boolean(run.fridayTest) },
  crushName: { text: () => 'Find out the name of the one from the bus', done: (run) => Boolean(run.crush?.nameKnown) },
  meet2: { text: () => 'Talk to 2 new people', done: (run) => metCount(run) - today(run).met >= 2 },
  earn50: { text: (run) => (run.earned ? 'Earn R50 today' : 'Earn your first R50'), done: (run) => today(run).earned >= 50 },
  study1: { text: () => 'Study once, at the library or in res', done: (run) => today(run).studied >= 1 },
  social10: { text: () => 'Get +10 Social today', done: (run) => (run.stats.social || 0) - today(run).social >= 10 },
  src: { text: () => 'Hear an SRC candidate at the Quad', done: (run) => SRC_PEOPLE.some((id) => run.people?.[id]?.day === run.day) },
}
const DREAM_GOAL = { deans: 'study1', hustle: 'earn50', src: 'src', love: 'crushName', famous: 'social10' }
export const GOAL_KIND = { must: 'Must', story: 'Story', dream: 'Dream' }

export function goalText(run, goal) {
  return GOALS[goal.id]?.text(run) || goal.id
}

// Three goals for the day, set by the schedule, the story and the dream.
export function startGoals(run) {
  today(run)
  if (run.day > 1 && run.day % 7 === 1) run.weekStudied = 0 // a new week
  const must = run.day === 1 ? 'lecture1' : run.day === 5 ? 'test' : 'lecture'
  let story = run.crush?.met && !run.crush.nameKnown ? 'crushName' : 'meet2'
  let dream = DREAM_GOAL[dreamOf(run).id]
  if (dream === story) dream = 'social10'
  if (dream === story) story = 'meet2'
  run.goals = { day: run.day, list: [['must', must], ['story', story], ['dream', dream]].map(([kind, id]) => ({ id, kind, done: false })) }
  checkGoals(run)
  return run.goals
}

// Marks finished goals; returns the ones that just finished (for the celebration).
export function checkGoals(run) {
  const list = run.goals?.day === run.day ? run.goals.list : []
  const fresh = []
  for (const goal of list) {
    if (!goal.done && GOALS[goal.id]?.done(run)) {
      goal.done = true
      fresh.push(goal)
    }
  }
  return fresh
}

export function goalsLeft(run) {
  return (run.goals?.day === run.day ? run.goals.list : []).filter((goal) => !goal.done)
}

// One nudge for the HUD: the most urgent thing right now.
export function rightNow(run) {
  const s = run.stats || {}
  if (run.day === 5 && !run.fridayTest && ['wake', 'transit', 'lecture'].includes(run.phase)) {
    return { icon: '\u{1F4DD}', text: 'Test today at 9:00. Go to your lecture venue', tone: 'urgent' }
  }
  if (run.day === 1 && run.phase === 'lecture' && !run.lectureResolved) {
    const left = 9 * 60 - run.minutes
    return { icon: '\u{1F393}', text: left > 0 ? `Lecture at SMIG in ${left} min` : `Lecture started ${-left} min ago · SMIG`, tone: left <= 10 ? 'urgent' : '' }
  }
  if ((s.hunger ?? 100) < 20) return { icon: '\u{1F37D}', text: 'You’re starving. Eat something', tone: 'urgent' }
  if ((s.energy ?? 100) < 15) return { icon: '\u{1F971}', text: 'You’re running on empty', tone: 'urgent' }
  if ((s.money ?? 0) < 50) return { icon: '\u{1F4B8}', text: `Almost broke: R${Math.max(0, s.money || 0)} left`, tone: 'urgent' }
  const c = run.crush
  if (c?.met && run.day <= 5 && c.beats?.[run.day] === undefined && (run.day > 1 || run.lectureResolved)) {
    return { icon: '\u{1F440}', text: `${c.nameKnown ? c.name : 'The one from the bus'} is at the Quad`, tone: 'story' }
  }
  const next = goalsLeft(run)[0]
  if (next) return { icon: '\u{1F3AF}', text: goalText(run, next), tone: '' }
  if (run.goals?.day === run.day) return { icon: '✨', text: 'All 3 goals done. Enjoy the day', tone: 'win' }
  return null
}

export function goalsCard(run) {
  return { id: `goals-${run.day}`, kind: 'goals', title: 'Today’s goals', text: '' }
}

export { crushName }
