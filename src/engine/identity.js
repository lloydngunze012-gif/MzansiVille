// Identity paths (spec section 1): what you do moves you along five paths. Not
// stats to grind: a reputation the game shows back ("New kid" -> "Becoming: The
// Hustler" -> "Known as: The Hustler") and people react to.

export const PATHS = {
  scholar: { id: 'scholar', name: 'The Scholar', icon: '\u{1F4DA}' },
  socialite: { id: 'socialite', name: 'The Socialite', icon: '\u{1F389}' },
  hustler: { id: 'hustler', name: 'The Hustler', icon: '\u{1F4B0}' },
  leader: { id: 'leader', name: 'The Leader', icon: '\u{1F4E3}' },
  creative: { id: 'creative', name: 'The Creative', icon: '\u{1F3A4}' },
}

const BECOMING = 6 // points on the top path, with a clear lead
const KNOWN = 20

export function identityPoints(run) {
  if (!run.identity) {
    run.identity = { scholar: 0, socialite: 0, hustler: 0, leader: 0, creative: 0 }
    // The path you said you want gives a small head start.
    if (PATHS[run.character?.path]) run.identity[run.character.path] = 2
  }
  return run.identity
}

const LEADER = /\bSRC\b|societ|debate|volunteer|campaign|mentor/i
const CREATIVE = /open mic|music|dance|fashion|photo|content|art\b|poetry|drama|sing|perform/i

// An action pushes the paths its effects point to.
export function identityFromAction(run, action, deltas = action.deltas || {}) {
  const add = {}
  if ((deltas.grades || 0) > 0) add.scholar = 2
  if ((deltas.social || 0) > 0) add.socialite = deltas.social >= 8 ? 2 : 1
  if ((deltas.money || 0) > 0) add.hustler = 2
  if (LEADER.test(action.name || '')) add.leader = 2
  if (CREATIVE.test(action.name || '')) add.creative = 2
  return addIdentity(run, add)
}

// Returns the title change, if the title moved.
export function addIdentity(run, add) {
  const before = identityTitle(run).text
  const points = identityPoints(run)
  for (const [path, n] of Object.entries(add)) if (PATHS[path]) points[path] += n
  const after = identityTitle(run)
  return after.text !== before ? after : null
}

export function identityTitle(run) {
  const points = identityPoints(run)
  const ranked = Object.entries(points).sort((a, b) => b[1] - a[1])
  const [[top, n], [, second]] = ranked
  const path = PATHS[top]
  if (n >= KNOWN && n - second >= 8) return { level: 'known', path, text: `Known as: ${path.name}` }
  if (n >= BECOMING && n - second >= 3) return { level: 'becoming', path, text: `Becoming: ${path.name}` }
  return { level: 'new', path: null, text: 'New kid' }
}

// 0..1 along the leading path toward "Known as".
export function identityProgress(run) {
  const points = identityPoints(run)
  const top = Math.max(...Object.values(points))
  return Math.min(1, top / KNOWN)
}

export function identityCard(run, title) {
  return {
    id: `identity-${run.day}-${title.level}`,
    kind: 'identity',
    title: title.level === 'known' ? `You're known as ${title.path.name}` : `People are starting to see you as ${title.path.name}`,
    text: title.level === 'known' ? 'Students greet you by it now. Keep it, or surprise them.' : 'Who you said you would be, or someone new? Every choice counts.',
  }
}
