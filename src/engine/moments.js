// Random daily moments (spec section 4): one or two surprises a day keep every
// day different. Each asks for a choice; some nudge an arc (the crush, identity).
// A moment can only come once a week; run.moments remembers what you chose.
import { addIdentity } from './identity.js'

const C = (label, deltas, result, extra = {}) => ({ label, deltas, result, ...extra })

const PAST = { quiet: 'the quiet one', clown: 'the class clown', sporty: 'the sporty one', invisible: 'the one nobody noticed' }

export const MOMENTS = [
  {
    id: 'crush_queue', icon: '\u{1F440}', title: 'Same queue, same person',
    when: (run) => run.crush?.met && ['social', 'leisure'].includes(run.phase) && run.day <= 5,
    text: (run) => `${run.crush.nameKnown ? run.crush.name : 'The one from the bus'} is two people ahead of you in the caf queue.`,
    choices: [
      C('\u{1F44B} Wave', { social: 1 }, 'They wave back. With the tray. Almost drop it. Worth it.', { crush: 2 }),
      C('\u{1F648} Pretend you didn’t see', {}, 'You study the menu board like it’s exam material.'),
      C('\u{1F3C3} Cut in to say hi', { social: -1 }, 'The queue boos. They laugh. Mixed reviews.', { crush: 1 }),
    ],
  },
  {
    id: 'loadshedding', icon: '\u{1F56F}️', title: 'Load shedding: stage 4',
    when: (run) => run.phase !== 'wake',
    text: () => 'Everything goes dark. Somewhere, a generator coughs to life.',
    choices: [
      C('\u{1F526} Study by phone torch', { grades: 2, energy: -5 }, 'Your phone dies at 3%. The notes did not.', { identity: { scholar: 1 } }),
      C('\u{1F333} Go to the Quad (it has a generator)', { social: 3 }, 'Half of campus had the same idea. Instant party.', { identity: { socialite: 1 } }),
      C('\u{1F634} Nap until it’s back', { energy: 10 }, 'Best two hours of your week.'),
    ],
  },
  {
    id: 'taxi_strike', icon: '\u{1F695}', title: 'Taxi strike',
    when: (run) => ['wake', 'transit'].includes(run.phase) && run.day > 1,
    text: () => 'No taxis today. The group chat is chaos.',
    choices: [
      C('\u{1F6B6} Walk it', { energy: -10, hunger: -5 }, 'Your legs file a formal complaint.'),
      C('\u{1F4F1} Pay for an Uber', { money: -80 }, 'R80 gone. But you arrive fresh and slightly smug.'),
      C('\u{1F6CC} Skip the morning', { energy: 5, grades: -2 }, 'Your duvet wins. Your marks notice.'),
    ],
  },
  {
    id: 'free_food', icon: '\u{1F355}', title: 'Free food!',
    when: (run) => ['social', 'leisure'].includes(run.phase),
    text: () => 'The Engineering society is giving out free pizza. There’s a talk attached. There’s always a talk attached.',
    choices: [
      C('\u{1F355} Grab a plate and go', { hunger: 25, social: 1 }, 'Two slices. One for now, one for "later" (now).'),
      C('\u{1F399}️ Stay for the talk too', { hunger: 20, social: 3 }, 'You ask a question. People nod. Someone takes your number.', { identity: { leader: 1 } }),
      C('\u{1F6B6} Walk past', {}, 'Strong. Hungry, but strong.'),
    ],
  },
  {
    id: 'fire_alarm', icon: '\u{1F6A8}', title: 'Fire alarm at 2am',
    when: (run) => run.phase === 'night',
    text: () => 'The whole res shuffles outside in pyjamas. Someone burned toast. Again.',
    choices: [
      C('\u{1F9E3} Go out, make friends', { energy: -10, social: 3 }, 'You meet half your floor in their sleepwear. Bonds are formed.', { identity: { socialite: 1 } }),
      C('\u{1F6CF}️ Hide under the duvet', { energy: -5 }, 'The RA knocks. You pretend to be a pillow.'),
      C('\u{1F4F9} Film it for the group chat', { energy: -10, social: 4 }, 'Your video gets 200 views by sunrise.', { identity: { creative: 1 } }),
    ],
  },
  {
    id: 'lecture_cancelled', icon: '\u{1F4CC}', title: 'Lecture cancelled',
    when: (run) => run.phase === 'lecture' && run.day > 1 && !run.lectureResolved,
    text: () => 'A note on the door: "Lecture cancelled. Read chapter 4."',
    choices: [
      C('\u{1F634} Sleep in', { energy: 15 }, 'Chapter 4 can wait. Your pillow cannot.', { set: { lectureResolved: true } }),
      C('\u{1F4DA} Library: read chapter 4', { grades: 3 }, 'You might be the only one who read it. Advantage.', { set: { lectureResolved: true }, identity: { scholar: 1 } }),
      C('\u{1F333} Quad: free morning!', { social: 4 }, 'The Quad at 9am belongs to the bold.', { set: { lectureResolved: true }, identity: { socialite: 1 } }),
    ],
  },
  {
    id: 'surprise_test', icon: '\u{1F4DD}', title: 'Surprise test tomorrow',
    when: (run) => ['lecture', 'social'].includes(run.phase) && run.day <= 4,
    text: () => 'Dr Moodley smiles. That’s never good. "Short test tomorrow. Ten minutes."',
    choices: [
      C('\u{1F4D6} Study tonight', { grades: 3, energy: -10 }, 'Highlighters out. Snacks out. Phone face down.', { identity: { scholar: 1 } }),
      C('\u{1F937} Wing it', {}, 'Confidence is a strategy. Sometimes.'),
      C('\u{1F465} Start a study group', { grades: 2, social: 2 }, 'Five people, three snacks, one actually studying. It counts.', { identity: { leader: 1 } }),
    ],
  },
  {
    id: 'party_invite', icon: '\u{1F389}', title: 'Res group chat: PARTY',
    when: (run) => ['leisure', 'night'].includes(run.phase),
    text: () => '"Block O tonight. Bring your own cup. Don’t tell the RA." 47 people are typing.',
    choices: [
      C('\u{1F57A} Go all night', { social: 6, energy: -15 }, 'You dance to every amapiano track ever made.', { identity: { socialite: 2 }, set: { hangover: true } }),
      C('⏱️ Go for one hour', { social: 3, energy: -5 }, 'You leave at the perfect moment. Legendary.'),
      C('\u{1F3E0} Stay in', { energy: 5 }, 'You hear the bass through two walls. Peaceful, in a way.'),
    ],
  },
  {
    id: 'rain', icon: '\u{1F327}️', title: 'Rain. No umbrella.',
    when: (run) => ['transit', 'social', 'leisure'].includes(run.phase),
    text: () => 'Durban rain: sideways, warm and instant.',
    choices: [
      C('\u{1F3C3} Run for it', { energy: -5 }, 'You arrive soaked and somehow proud.'),
      C('☂️ Share a stranger’s umbrella', { social: 3 }, 'Ten metres of very close small talk. New contact saved.'),
      C('⏳ Wait it out', { hunger: -5 }, 'You watch the rain from the library steps. Very cinematic.'),
    ],
  },
  {
    id: 'old_school', icon: '\u{1F3EB}', title: 'Someone from your old school',
    when: (run) => run.day > 1,
    text: (run) => `"No ways! Weren’t you ${PAST[run.character?.past] || 'the quiet one'} in matric?" Someone who knew the old you.`,
    choices: [
      C('✨ "Not anymore."', { social: 2 }, 'They look at you twice. The new you is working.', { identity: 'path' }),
      C('\u{1F917} Catch up properly', { social: 3 }, 'Old jokes, new campus. It feels good to be known.'),
      C('\u{1F575}️ Avoid them', {}, 'You hide behind a pillar. Smooth. Very smooth.'),
    ],
  },
]

const byId = Object.fromEntries(MOMENTS.map((m) => [m.id, m]))

export function momentCard(run, moment) {
  return { id: `moment-${moment.id}-${run.day}`, kind: 'moment', momentId: moment.id, title: moment.title, text: moment.text(run), icon: moment.icon, choices: moment.choices.map((c) => c.label) }
}

// After something happens, maybe a moment: up to two a day, each once a week.
export function rollMoment(run, rng = Math.random, force = false) {
  run.moments = run.moments || {}
  const today = run.momentsToday?.day === run.day ? run.momentsToday : (run.momentsToday = { day: run.day, n: 0 })
  if (today.n >= 2 || run.queue?.some((card) => card.kind === 'moment')) return null
  if (!force && rng() > 0.3) return null
  const week = Math.floor((run.day - 1) / 7)
  const pool = MOMENTS.filter((m) => run.moments[m.id]?.week !== week && m.when(run))
  if (!pool.length) return null
  const moment = pool[Math.floor(rng() * pool.length)]
  today.n += 1
  run.moments[moment.id] = { week, day: run.day, choice: null }
  const card = momentCard(run, moment)
  run.queue = [...(run.queue || []), card]
  return card
}

export function chooseMoment(run, momentId, index) {
  const moment = byId[momentId]
  const choice = moment?.choices[index]
  if (!choice) return null
  const caps = { energy: run.energyCap || 100, hunger: 100, grades: 100, social: 100 }
  for (const [k, d] of Object.entries(choice.deltas)) run.stats[k] = k === 'money' ? (run.stats.money || 0) + d : Math.max(0, Math.min(caps[k] ?? 100, (run.stats[k] || 0) + d))
  if (choice.crush && run.crush) run.crush.closeness = (run.crush.closeness || 0) + choice.crush
  if (choice.set) Object.assign(run, choice.set)
  const identity = choice.identity === 'path' ? { [run.character?.path || 'socialite']: 2 } : choice.identity
  const titled = identity ? addIdentity(run, identity) : null
  run.moments = run.moments || {}
  run.moments[momentId] = { ...(run.moments[momentId] || {}), choice: index }
  run.queue = (run.queue || []).filter((card) => card.momentId !== momentId)
  run.queue.unshift({ id: `moment-result-${momentId}-${run.day}`, kind: 'result', title: moment.title, text: choice.result })
  return { choice, titled }
}
