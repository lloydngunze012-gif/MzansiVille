// Conversations lead to doing (owner list, item 3): every talk card offers what
// you can do with this person, never a dead end. Vendors sell (menus.js),
// lecturers give a consultation, students sit with you, study with you or swap
// numbers (your phone keeps them: run.contacts), eat with you (the caf queue,
// one table) or walk with you.
import { MENUS } from '../menus.js'
import { LECTURERS } from '../venues.js'

const NO_ACTIONS = new Set(['bongani', 'lindiwe', 'ruan', 'lethabo'])

export function isContact(run, id) {
  return (run.contacts || []).some((c) => c.id === id)
}

export function talkActions(run, id) {
  if (MENUS[id]) return [{ kind: 'order', label: '\u{1F6D2} I’d like to order', note: 'See what she’s selling' }]
  if (LECTURERS[id]) {
    const done = run.consulted?.[run.day]
    return done ? [] : [{ kind: 'consult', label: '\u{1F4D6} “Can I ask about chapter one?”', note: '+3 Grades · 20 min' }]
  }
  if (NO_ACTIONS.has(id)) return []
  const crush = run.crush?.id === id
  if (crush && !run.crush.nameKnown) return []
  const out = []
  const today = run.together?.[run.day] || {}
  if (!today[`eat:${id}`]) out.push({ kind: 'eat', label: '\u{1F37D} “Let’s get something to eat”', note: 'Caf queue together · 30 min' })
  if (run.phase !== 'night' && !today[`study:${id}`]) out.push({ kind: 'study', label: '\u{1F4DA} “Let’s study”', note: '+Grades · +Social · 45 min' })
  if (!today[id]) out.push({ kind: 'sit', label: '\u{1FA91} Sit with them', note: '+Social · closer · 30 min' })
  if (!today[`walk:${id}`]) out.push({ kind: 'walk', label: '\u{1F6B6} “Walk with me”', note: 'Walk there together · 10 min' })
  if (!isContact(run, id)) out.push({ kind: 'swap', label: '\u{1F4F1} Swap numbers', note: 'They go in your phone' })
  return out
}

// Stats change, kept in range; money can go down to what you have.
export function applyFx(run, fx) {
  const caps = { energy: run.energyCap || 100, hunger: 100, grades: 100, social: 100 }
  for (const [k, d] of Object.entries(fx || {})) {
    run.stats[k] = k === 'money' ? (run.stats.money || 0) + d : Math.max(0, Math.min(caps[k] ?? 100, (run.stats[k] || 0) + d))
  }
}

export function closer(run, id, n) {
  run.people = run.people || {}
  const mem = run.people[id] || { chats: 0, close: 0, mood: 0 }
  run.people[id] = { ...mem, close: Math.max(0, Math.min(100, (mem.close || 0) + n)), day: run.day }
  if (run.crush?.id === id) run.crush.closeness = (run.crush.closeness || 0) + Math.round(n / 4)
}

export function markTogether(run, key) {
  run.together = { ...(run.together || {}), [run.day]: { ...(run.together?.[run.day] || {}), [key]: true } }
}

export function addContact(run, id, name) {
  if (isContact(run, id)) return false
  run.contacts = [...(run.contacts || []), { id, name, day: run.day }]
  return true
}
