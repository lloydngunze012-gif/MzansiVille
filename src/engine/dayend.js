// The end of a day (spec section 5, 14:00-15:00): goals done and missed, who
// you're becoming, the people who matter, and a cliffhanger text on the phone.
// The text stays in run.inbox, unanswered, as a reason to come back tomorrow.
import { goalText } from './goals.js'
import { identityTitle } from './identity.js'

// What a missed goal leads to (failing is story, not game over).
const MISSED = {
  lecture1: 'Missed lecture: Dr Moodley noticed the empty seat.',
  lecture: 'Missed lecture: one step closer to a DP warning.',
  test: 'You missed the test. Dr Moodley wants to see you on Monday.',
  crushName: 'They’re still a mystery.',
  meet2: 'Campus still feels big and strange.',
  earn50: 'The hustle waits for tomorrow.',
  study1: 'The test on Friday is one day closer.',
  social10: 'A quiet day. Nobody’s talking about you yet.',
  src: 'The SRC candidates are still waiting for your ear.',
}

export function dayReview(run) {
  const list = run.goals?.day === run.day ? run.goals.list : []
  return {
    done: list.filter((g) => g.done).map((g) => goalText(run, g)),
    missed: list.filter((g) => !g.done).map((g) => ({ text: goalText(run, g), then: MISSED[g.id] || '' })),
    title: identityTitle(run),
  }
}

const ROOMIE = (run) => run.bestieName || 'Your roommate'

// One text arrives as the day ends, from whichever story is hottest.
export function cliffhanger(run) {
  const c = run.crush
  const who = c?.nameKnown ? c.name : 'Unknown number'
  if (c?.met && c.romance !== false) {
    if (run.day === 1 && (c.sat || c.opener === 'headphones')) {
      return { from: who, text: `Hey, it’s ${c.nameKnown ? c.name : 'the one'} from the bus \u{1F44B} You left your earphones on the seat.` }
    }
    if (run.day === 2 && c.coffee) return { from: who, text: 'So about that coffee… you’re still buying, right? ☕' }
    if (run.day === 3 && c.studyDate) return { from: who, text: 'Thabo just asked to join our study session. I said I’d ask you first \u{1F440}' }
    if (run.day === 4 && c.jealous) return { from: who, text: 'Thabo asked me to the res party on Friday. Should I go? \u{1F914}' }
    if (run.day === 5 && c.asked === 'yes') return { from: who, text: 'Saturday. 7pm. Don’t be late \u{1F60A}' }
  }
  if (run.character?.funding === 'nsfas' && run.day === 2) return { from: 'NSFAS', text: 'Your allowance payment has been delayed. We apologise for the inconvenience.' }
  if (run.character?.funding === 'parents' && run.day === 3) return { from: 'Mom', text: 'Are you eating? Your father says call. We sent R200. Don’t spend it on nonsense.' }
  const roomie = run.people?.[String(ROOMIE(run)).toLowerCase()]
  if (run.day >= 2 && (!roomie || roomie.close < 10)) return { from: ROOMIE(run), text: 'We need to talk tomorrow.' }
  if (run.day === 4) return { from: 'Res group chat', text: 'PARTY FRIDAY. Block O. Bring your own cup. \u{1F389}' }
  return { from: ROOMIE(run), text: 'Tomorrow we go to the Quad early, ok? Something’s happening. Don’t ask. \u{1F92B}' }
}

// Reasons to come back, shown with "Day N starts when you're ready".
export function comeBackReasons(run) {
  const out = []
  const unread = (run.inbox || []).filter((m) => !m.read).length
  if (unread) out.push(`\u{1F4AC} ${unread} unanswered text${unread > 1 ? 's' : ''}`)
  const toFriday = 5 - run.day
  if (toFriday > 0) out.push(`\u{1F4DD} Test on Friday: ${toFriday} day${toFriday > 1 ? 's' : ''} left`)
  if (toFriday === 0) out.push('\u{1F4DD} The test is tomorrow… no wait, it was today. Results soon')
  if ((run.earned || 0) > 0) out.push(`\u{1F4B0} R${run.earned} earned so far`)
  return out
}

export function endOfDay(run) {
  const text = cliffhanger(run)
  run.inbox = [...(run.inbox || []), { ...text, day: run.day, read: false }].slice(-30)
  return { review: dayReview(run), text }
}
