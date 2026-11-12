// The "DONE" card after an activity: an icon tile, a gold eyebrow, a fun line, gains as big
// pills, costs as small muted chips, and a bounce + confetti on a big win.
// Pure functions: game.js calls resultBody() and decides when to show it.
import { formatMoney } from '../engine/format.js'

const svg = (d) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

const IC = {
  grades: svg('<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>'),
  social: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>'),
  energy: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
  hunger: svg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>'),
  money: svg('<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.4-1-1.4-1.5-3-1.5-1.7 0-3 .8-3 2s1.1 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.6 0-2.7-.5-3.1-1.6"/><path d="M12 6v2m0 8v2"/>'),
}

const TILE = {
  lecture: svg('<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>'),
  food: IC.hunger,
  gym: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>'),
  social: IC.social,
  study: IC.grades,
  sleep: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>'),
  shop: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
  work: svg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/>'),
  other: svg('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>'),
}

const EYEBROW = {
  lecture: 'Lecture done', food: 'Meal done', gym: 'Workout done', social: 'Hangout done',
  study: 'Study done', sleep: 'Sleep done', shop: 'Shopping done', work: 'Shift done', other: 'Done',
}

// {lecturer} {subject} {place} are filled in when the data has them.
const LINES = {
  lecture: [
    '“{subject} finally clicked. You even answered a question out loud.”',
    '{lecturer} said your name. Nobody saw you panic.',
    'Three pages of notes. Two of them are even readable.',
    'The projector died, {lecturer} carried on anyway. Legend.',
    'You sat near the front. Your future self says thanks.',
  ],
  food: [
    'Hot, filling and exactly what you needed.',
    'Sho, that hit the spot. Nobody gets the last bite.',
    'Full tummy, clear head. Ready for anything.',
    'The aunties at {place} do not play with portions.',
    'Lunch tastes better when you have earned it.',
  ],
  gym: [
    'Sweaty, sore and proud of it.',
    'Your legs will remember this tomorrow. Worth it.',
    'Someone at {place} nodded at you. That is respect.',
    'One more rep than last time. That is how it starts.',
  ],
  social: [
    'Good people, loud laughs. This is the campus life.',
    'You walked away with a new story and a new number.',
    'Somebody said “we should do this again”, and they meant it.',
    'Time flew. So did the jokes.',
    'Shared a laugh at {place}. Friendship loading…',
  ],
  study: [
    'The pages are turning and, mostly, so are your marks.',
    'Quiet corner, big brain. Well done.',
    'You understood the hard part. Write that down before it leaves.',
    'Highlighters everywhere. Progress looks like a mess.',
    'Your degree just got a little closer.',
  ],
  sleep: [
    'Proper rest. The world looks kinder already.',
    'Dreamed about a clean exam paper. Good sign.',
    'Out like a light. Phone on silent, finally.',
    'Fresh start loading. Go gently tomorrow.',
  ],
  shop: [
    'Bags in hand, budget still breathing.',
    'You compared prices like a pro. Mom would be proud.',
    'Fresh stock on the shelf and a smile at the till.',
    'A small spend, a small win. Mzansi style.',
  ],
  work: [
    'Shift done. The rand in your pocket is earned.',
    'Tired feet, honest money. Respect.',
    'Your manager said “not bad”. That is high praise.',
    'Another shift down. The rent can wait one more day.',
  ],
  other: [
    'That went better than expected.',
    'A small moment, a small win.',
    'Done and dusted. On to the next.',
    'Not bad at all. Keep going.',
  ],
}

const lastPick = {}
const picked = new Map()

function lineFor(type, cardId, fill) {
  if (picked.has(cardId)) return picked.get(cardId)
  const list = LINES[type] || LINES.other
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === lastPick[type]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length
  lastPick[type] = i
  const text = list[i].replace(/\{(\w+)\}/g, (_, k) => fill[k] || ({ subject: 'It', lecturer: 'The lecturer', place: 'campus' }[k]))
  picked.set(cardId, text)
  if (picked.size > 40) picked.delete(picked.keys().next().value)
  return text
}

export function typeOf(action) {
  const tags = action?.tags || []
  const id = action?.id || ''
  if (tags.includes('attend') || tags.includes('backrow')) return 'lecture'
  if (tags.includes('study') || tags.includes('exam')) return 'study'
  if (tags.includes('sleep')) return 'sleep'
  if (tags.includes('meal')) return 'food'
  if (tags.includes('gym')) return 'gym'
  if (tags.includes('shop')) return 'shop'
  if (tags.includes('job')) return 'work'
  if (tags.includes('party') || tags.includes('skip')) return 'social'
  if (/lecture|sitin|moot/.test(id)) return 'lecture'
  if (/study|read|lab|cards|report|print|notes|tut|case|library|lib_/.test(id)) return 'study'
  if (/sleep|nap|beanbag|clouds/.test(id)) return 'sleep'
  if (/meal|eat|lunch|supper|breakfast|vetkoek|muffin|noodle|toast|leftover|cook|fridge|tea|kettle|caf_|vendor|grab/.test(id)) return 'food'
  if (/gym|sport|touch|stretch|pickup|lap|ball/.test(id)) return 'gym'
  if (/spaza|airtime|shop|buy|bus_town/.test(id)) return 'shop'
  if (/chat|friends|dance|party|src|busker|couch|visitors|guard|corridor|partner|speaker/.test(id)) return 'social'
  return 'other'
}

// Gains first: grades, social, energy, fullness, money. Costs the same order, muted.
const ORDER = [['grades', 'Grades'], ['social', 'Social'], ['energy', 'Energy'], ['hunger', 'Fullness'], ['money', 'Money']]

function amount(k, v) {
  if (k === 'money') return v > 0 ? `+${formatMoney(v)}` : formatMoney(v).replace('-', '−')
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`
}

const CONFETTI = { grades: '#1f9d5a', social: '#e0409a', energy: '#f0c400', hunger: '#ff8a3d', money: '#12a3a0' }

export function isBigWin(delta, extra = false) {
  return extra || Object.values(delta || {}).some((v) => v >= 10)
}

// fill: { lecturer, subject, place }. Returns the inner HTML of the card (without the button).
// line: the card's own words (a city row's result line) instead of a random one; type: its tile, if not from the action.
// eyebrow: the kind of activity in words, when the place knows better than the type (job I: the Arcade said "Shopping done").
export function resultBody({ cardId, title, delta, action, fill = {}, esc, goalTicked = false, line = '', type: kind = '', eyebrow = '' }) {
  const type = TILE[kind] ? kind : typeOf(action)
  const big = isBigWin(delta, goalTicked)
  const gains = ORDER.filter(([k]) => delta[k] > 0)
  const costs = ORDER.filter(([k]) => delta[k] < 0)
  let n = 0
  const gainHtml = gains.map(([k, label]) => `<span class="rc-gain rc-${k}" style="--d:${120 * n++}ms">${IC[k]}<b>${label} ${amount(k, delta[k])}</b></span>`).join('')
  const costHtml = costs.map(([k, label]) => `<span class="rc-cost">${IC[k]}${label} ${amount(k, delta[k])}</span>`).join('')
  const colours = (gains.length ? gains.map(([k]) => CONFETTI[k]) : Object.values(CONFETTI))
  const confetti = big
    ? `<div class="rc-confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2
      const r = 70 + (i % 3) * 38
      return `<i style="--x:${Math.round(Math.cos(a) * r * 1.3)}px;--y:${Math.round(Math.sin(a) * r * 0.8 - 40)}px;--c:${colours[i % colours.length]};--r:${(i * 47) % 360}deg"></i>`
    }).join('')}</div>`
    : ''
  return {
    big,
    html: `${confetti}
    <header class="rc-head">
      <span class="rc-tile">${TILE[type]}</span>
      <div><p class="g-kind rc-eyebrow">${big ? 'Big win' : esc(eyebrow || EYEBROW[type])}</p><h2>${esc(title)}</h2></div>
    </header>
    <p class="rc-line">${esc(line || lineFor(type, cardId, fill))}</p>
    ${gainHtml ? `<div class="rc-gains">${gainHtml}</div>` : ''}
    ${costHtml ? `<div class="rc-costs">${costHtml}</div>` : ''}`,
  }
}
