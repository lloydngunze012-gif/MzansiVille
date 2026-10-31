// The other storylines (spec section 3): the roommate, the rival, money, the
// lecturer, the SRC election and home. Each has a beat on given days; a beat is a
// choice card that fires during the day (after something you do) and remembers
// your answer in run.arcs, so later beats and the Friday test can call back to it.
// Every day advances at least two arcs (the crush is the other one).

const C = (label, deltas, result, extra = {}) => ({ label, deltas, result, ...extra })
const roomie = (run) => run.bestieName || 'Your roommate'
const roomieId = (run) => String(roomie(run)).toLowerCase()

export const BEATS = [
  // Day 1
  {
    id: 'arc_roommate_1', arc: 'roommate', day: 1, phases: ['leisure', 'night'], icon: '\u{1F6CF}️', title: 'First night in res',
    text: (run) => `${roomie(run)} sits cross-legged on the bed. "So. Why this varsity? Real answer."`,
    choices: [
      C('\u{1F49B} The real answer', { social: 1 }, 'You talk until the corridor light clicks off. Something clicked on instead.', { people: { roommate: 8 }, set: { roommate: 'open' } }),
      C('\u{1F602} Make a joke of it', { social: 2 }, '"Okay, comedian." But they’re smiling.', { people: { roommate: 4 }, set: { roommate: 'jokes' } }),
      C('\u{1F3A7} "Long day. Night."', { energy: 5 }, 'Lights out. A little too quiet.', { people: { roommate: -2 }, set: { roommate: 'closed' } }),
    ],
  },
  {
    id: 'arc_home_1', arc: 'home', day: 1, phases: ['leisure', 'night'], icon: '\u{1F4DE}', title: 'Mom is calling',
    text: (run) => `"My baby! How was the first day? ${run.character?.funding === 'parents' ? 'Is the money lasting?' : 'Did you eat?'} Your uncle wants to know if you’re a doctor yet."`,
    choices: [
      C('\u{1F31F} "It was amazing, Ma."', { social: 1 }, 'She’s crying. Happy crying. She tells the whole street.', { set: { home: 'proud' } }),
      C('\u{1F62C} "Honestly? It’s a lot."', { energy: 5 }, '"You’re the first of us there. A lot is allowed." You feel lighter.', { set: { home: 'honest' } }),
      C('\u{1F4F5} Let it ring', {}, 'Three missed calls. Then a voice note. Then your aunt calls.', { set: { home: 'ignored' } }),
    ],
  },
  // Day 2
  {
    id: 'arc_money_2', arc: 'money', day: 2, phases: ['social', 'leisure', 'night'], icon: '\u{1F4B8}', title: 'Rent is due Saturday',
    text: (run) => ({
      nsfas: 'NSFAS is late again. Rent is due Saturday and your account says R0 incoming.',
      bursary: 'The bursary office emails: payment is held until they see your first test mark.',
      parents: 'Your parents are short this month. "Can you manage until the 1st, my child?"',
    }[run.character?.funding] || 'Rent is due Saturday. The money is not where it should be.'),
    choices: [
      C((run) => `\u{1F91D} Borrow R200 from ${roomie(run)}`, { money: 200 }, 'They hand it over without a word. You owe more than money now.', { people: { roommate: 2 }, set: { money: 'borrowed' } }),
      C('\u{1F4BC} Pick up extra shifts', { money: 150, energy: -10 }, 'Two extra shifts this week. Tired, but nobody owns you.', { identity: { hustler: 2 }, set: { money: 'shifts' } }),
      C('\u{1F4DE} Call home', { money: 200 }, 'Ma sends R200 and a lecture about budgeting. Worth it. Mostly.', { set: { money: 'home', home: 'asked' } }),
    ],
  },
  {
    id: 'arc_rival_2', arc: 'rival', day: 2, phases: ['lecture', 'social', 'leisure'], icon: '\u{1F624}', title: 'Thabo',
    text: () => 'Thabo from your class answers every question first, then looks at you like it’s a sport.',
    choices: [
      C('✋ Beat him to the next one', { grades: 1 }, 'You get it right. He narrows his eyes. Game on.', { identity: { scholar: 1 }, set: { rival: 'compete' } }),
      C('\u{1F4D6} "Want to study together?"', { social: 2 }, 'He blinks. "…Fine. But I pick the snacks."', { set: { rival: 'friend' } }),
      C('\u{1F644} Ignore him', {}, 'He keeps winning. You keep pretending not to care.', { set: { rival: 'ignore' } }),
    ],
  },
  // Day 3
  {
    id: 'arc_lecturer_3', arc: 'lecturer', day: 3, phases: ['lecture', 'social', 'leisure'], icon: '\u{1F468}‍\u{1F3EB}', title: 'Dr Moodley wants volunteers',
    text: () => '"I need someone to present the case study on Friday. Anyone? Anyone at all?" Silence.',
    choices: [
      C('\u{1F64B} Volunteer', { grades: 2, energy: -5 }, 'Dr Moodley nods slowly. "Finally. A pulse."', { identity: { scholar: 1, leader: 1 }, set: { lecturer: 'impressed' } }),
      C('\u{1F636} Stay very still', {}, 'Thabo volunteers. Of course he does.', { set: { lecturer: 'neutral' } }),
      C('\u{1F602} "Is there a prize?"', { social: 2 }, 'The class laughs. Dr Moodley writes your name down. Not in a good way.', { identity: { creative: 1 }, set: { lecturer: 'clash' } }),
    ],
  },
  {
    id: 'arc_roommate_3', arc: 'roommate', day: 3, phases: ['leisure', 'night'], icon: '\u{1F64F}', title: 'Can I borrow R100?',
    text: (run) => `${roomie(run)}: "Can I borrow R100 until Friday? Data ran out and my lecturer only posts notes online. I’ll pay back, I swear."`,
    choices: [
      C('\u{1F4B5} Lend R100', { money: -100 }, '"You’re the best. I mean it." They write IOU on a sticky note and put it on your mirror.', { people: { roommate: 6 }, set: { owed: 100 } }),
      C('\u{1FA99} Lend R50', { money: -50 }, '"Half is still a lot. Thank you."', { people: { roommate: 3 }, set: { owed: 50 } }),
      C('\u{1F645} "I’m broke too, sorry."', {}, '"Ja, no stress." But they go quiet for the rest of the night.', { people: { roommate: -3 } }),
    ],
  },
  // Day 4
  {
    id: 'arc_src_4', arc: 'src', day: 4, phases: ['social', 'leisure'], icon: '\u{1F5F3}️', title: 'SRC debate at the Quad',
    text: () => 'Three slates, one microphone, a lot of promises about Wi-Fi. The debate starts in ten minutes.',
    choices: [
      C('\u{1F3A4} Go and ask a hard question', { social: 3, energy: -5 }, 'You ask about transport money. All three candidates sweat. People clap for YOU.', { identity: { leader: 2 }, set: { src: 'asked' } }),
      C('\u{1F442} Listen from the back', { social: 1 }, 'You hear all three out. Now you actually know who to vote for.', { set: { src: 'listened' } }),
      C('\u{1F6B6} Skip it', {}, 'You hear about it later. Apparently there was drama.', { set: { src: 'skipped' } }),
    ],
  },
  {
    id: 'arc_roommate_4', arc: 'roommate', day: 4, phases: ['leisure', 'night'], icon: '\u{1F3B6}', title: 'Music at midnight',
    text: (run) => `${roomie(run)} is playing amapiano at midnight. Loud. Test is on Friday.`,
    choices: [
      C('\u{1F5E3}️ Talk it out', { energy: -3 }, '"Sorry! I forget you’re there when I’m stressed." Headphones go on. You both laugh.', { people: { roommate: 4 }, set: { noise: 'talked' } }),
      C('\u{1F3A7} Put your own headphones on', { energy: -5 }, 'You fall asleep to a song battle. Nobody wins.', { set: { noise: 'avoided' } }),
      C('\u{1F6A8} Complain to the RA', { energy: 5 }, 'Silence. Very, very cold silence.', { people: { roommate: -8 }, set: { noise: 'reported' } }),
    ],
  },
  // Day 5
  {
    id: 'arc_home_5', arc: 'home', day: 5, phases: ['leisure', 'night'], icon: '\u{1F4DE}', title: 'Home, after the test',
    text: (run) => `Ma calls. ${run.arcs?.home === 'ignored' ? '"Oh, NOW you answer?" ' : ''}"So? The test? Tell me everything."`,
    choices: [
      C('\u{1F60A} Tell her everything', { social: 1, energy: 5 }, 'She listens to every detail. Even the boring ones. Especially those.', { set: { home: 'close' } }),
      C('\u{1F937} "It went fine, Ma."', {}, '"Fine is not a mark." But she lets it go.'),
      C('\u{1F4B0} Ask for money', { money: 150 }, 'R150 arrives with "We are not a bank" typed in the reference.', { set: { home: 'asked' } }),
    ],
  },
]

const byId = Object.fromEntries(BEATS.map((b) => [b.id, b]))
export function beatById(id) { return byId[id] }

export function labelOf(choice, run) {
  return typeof choice.label === 'function' ? choice.label(run) : choice.label
}

// The next beat that is due now (today, this phase, not done yet).
export function dueBeat(run) {
  const done = run.arcBeats || {}
  return BEATS.find((b) => b.day === run.day && b.phases.includes(run.phase) && done[b.id] === undefined) || null
}

export function beatCard(run, beat) {
  return { id: `moment-${beat.id}`, kind: 'moment', momentId: beat.id, title: beat.title, text: beat.text(run), icon: beat.icon, choices: beat.choices.map((c) => labelOf(c, run)) }
}

// Apply the arc side of a choice: who it touched, what the arc remembers.
export function applyBeat(run, beat, choice, index) {
  run.arcBeats = { ...(run.arcBeats || {}), [beat.id]: index }
  run.arcs = { ...(run.arcs || {}), ...(choice.set || {}) }
  for (const [who, n] of Object.entries(choice.people || {})) {
    const id = who === 'roommate' ? roomieId(run) : who
    run.people = run.people || {}
    const mem = run.people[id] || { chats: 0, close: 0, mood: 0 }
    run.people[id] = { ...mem, close: Math.max(0, Math.min(100, (mem.close || 0) + n)), day: run.day }
  }
}
