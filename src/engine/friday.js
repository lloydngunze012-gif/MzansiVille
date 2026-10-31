// The week (spec section 7.8): days 1 to 5 each have a goal, and the Friday test
// is the first big payoff. The mark is built from what you did all week, and the
// result card says exactly which choices paid off (or did not).

export const DAY_THEMES = {
  1: 'Survive day one',
  2: 'Find your people',
  3: 'Get ahead before Friday',
  4: 'Hold it together',
  5: 'Test day',
}

export const WEEK_GOAL = { text: 'Test on Friday: study at least twice', need: 2 }

export function weekStudied(run) {
  return run.weekStudied || 0
}

// Builds the mark and the reasons; applies it to the run once.
export function fridayTest(run) {
  if (run.fridayTest) return run.fridayTest
  const a = run.arcs || {}
  const lines = []
  const add = (n, text) => { if (n) lines.push({ n, text }) }
  const base = Math.round(30 + (run.stats.grades || 0) * 0.4)
  add(Math.min(4, weekStudied(run)) * 6, `You studied ${weekStudied(run)} time${weekStudied(run) === 1 ? '' : 's'} this week`)
  add((run.prep || 0) > 0 ? Math.min(8, Math.round(run.prep / 2)) : 0, 'You kept up with lectures')
  add(a.lecturer === 'impressed' ? 4 : a.lecturer === 'clash' ? -4 : 0, a.lecturer === 'impressed' ? 'Dr Moodley remembers you volunteered' : 'Dr Moodley remembers the "prize" joke')
  add(a.rival === 'friend' ? 3 : 0, 'Studying with Thabo: his notes are scary good')
  add(run.crush?.studyDate ? 3 : 0, `The library sessions with ${run.crush?.nameKnown ? run.crush.name : 'your study buddy'}`)
  add(run.moments?.surprise_test?.choice === 0 ? 3 : run.moments?.surprise_test?.choice === 1 ? -3 : 0, run.moments?.surprise_test?.choice === 1 ? 'You winged the surprise test' : 'You studied for the surprise test')
  add(a.noise === 'avoided' ? -2 : 0, 'The midnight music battle cost you sleep')
  add(run.hangover ? -4 : 0, 'Thursday’s party is still in your head')
  const mark = Math.max(18, Math.min(96, base + lines.reduce((t, l) => t + l.n, 0)))
  const rival = a.rival === 'compete' ? 74 : a.rival === 'friend' ? 71 : 68
  const result = {
    mark,
    base,
    lines,
    rival,
    beatRival: mark > rival,
    band: mark >= 75 ? 'distinction' : mark >= 50 ? 'pass' : 'fail',
  }
  run.fridayTest = result
  // The mark moves your grades and the Dean's List bar.
  const caps = (v) => Math.max(0, Math.min(100, v))
  run.stats.grades = caps((run.stats.grades || 0) + Math.round((mark - 50) / 4))
  // The roommate pays back what they owe, on time (if things are good between you).
  if (a.owed) {
    run.stats.money = (run.stats.money || 0) + a.owed
    result.repaid = a.owed
    run.arcs = { ...a, owed: 0, repaid: true }
  }
  return result
}

export function fridayCard(run, result) {
  const title = result.band === 'distinction' ? `${result.mark}%. Distinction!` : result.band === 'pass' ? `${result.mark}%. You passed.` : `${result.mark}%. Not this time.`
  return { id: `friday-test-${run.day}`, kind: 'test', title, text: '', test: result }
}
