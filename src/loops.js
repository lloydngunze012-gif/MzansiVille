// Loops (owner, 11 Nov): the things that bring a player back tomorrow. Words: docs/world-designer/words.md.
//   Daily specials  - the Caf's 21 specials go round by game day (data/campusville/specials.json): on the Caf's
//                     menu board, first on Mama Liz's menu, and in the Daily.
//   Pre-order       - at Night, order tomorrow's special for R5 off; next day "Your biryani is ready" when you
//                     open the game; collect it from Mama Liz (free: it is paid). Not collected that day, it goes.
//   Streak          - one finished activity a day (the player's own calendar day in SAST) keeps it; one free freeze
//                     a week covers a single missed day; 7 days is the milestone (the badge Seven Strong).
//   Badges          - the starter badges of words.md whose features exist (data/campusville/badges.json says which
//                     are "coming"), and follower milestones at 10, 50, 100 and 500.
// This file holds the rules; main.js calls it where things happen and shows the toasts.
import BADGES from '../data/campusville/badges.json' with { type: 'json' }
import SPECIALS from '../data/campusville/specials.json' with { type: 'json' }

// ---------- Daily specials ----------
// The Caf's special for a game day (day 1 is a Monday; three weeks, going round).
export function specialFor(day = 1) { return SPECIALS.specials[(Math.max(1, Number(day) || 1) - 1) % SPECIALS.specials.length] }
// The dish without "Friday special: " in front.
export const dishOf = (special) => String(special.dish).replace(/^Friday special:\s*/i, '')
// What the special does when eaten: a proper plate (more than the R30 pap), dearer plates a little more.
export const specialFx = (special) => ({ hunger: Math.min(60, 38 + Math.round(special.price / 5)), social: 1 })
// The line under HOT MEALS on the Caf's board.
export const boardLine = (day) => { const s = specialFor(day); return `TODAY: ${dishOf(s).toUpperCase()} R${s.price}` }

// Mama Liz's menu for today: the special first, and above it your pre-order when it is waiting. menu: MENUS.mama_liz.
export function dressMenu(menu, run) {
  if (!menu || !run) return
  menu.items = menu.items.filter((i) => i.id !== 'special' && i.id !== 'collect')
  const s = specialFor(run.day)
  menu.items.unshift({ id: 'special', name: `Today’s special: ${dishOf(s)}`, icon: '⭐', price: s.price, fx: specialFx(s) })
  const p = preorderDue(run)
  if (p) menu.items.unshift({ id: 'collect', name: `Collect your ${p.dish} (paid)`, icon: '\u{1F9FE}', price: 0, fx: p.fx })
}

// ---------- Order tonight, collect tomorrow ----------
export const PREORDER_OFF = 5
// What can be ordered tonight: { dish, price (after R5 off), full } or null (not Night, or already ordered).
export function preorderOffer(run) {
  if (!run || run.phase !== 'night' || run.preorder?.day === run.day + 1) return null
  const s = specialFor(run.day + 1)
  return { dish: dishOf(s), full: s.price, price: Math.max(0, s.price - PREORDER_OFF), says: s.says }
}
// Pay now, eat tomorrow. { ok, text }.
export function placePreorder(run) {
  const offer = preorderOffer(run)
  if (!offer) return { ok: false, text: 'The Caf takes orders for tomorrow at Night.' }
  if ((run.stats.money || 0) < offer.price) return { ok: false, text: `Tomorrow’s ${offer.dish} is R${offer.price} tonight. You have R${Math.round(run.stats.money || 0)}.` }
  run.stats.money -= offer.price
  run.preorder = { day: run.day + 1, dish: offer.dish, price: offer.price, fx: specialFx(specialFor(run.day + 1)) }
  return { ok: true, text: `Ordered: ${offer.dish} for tomorrow, R${offer.price} (R${PREORDER_OFF} off). Collect it at the Caf.` }
}
// Today's paid plate, still to collect; or null.
export function preorderDue(run) { const p = run?.preorder; return p && p.day === run.day && !p.collected ? p : null }
// Once a day, when the game opens: "Your biryani is ready". Returns the line, or ''. Yesterday's uncollected plate goes.
export function preorderNews(run) {
  const p = run?.preorder
  if (!p) return ''
  if (p.day < run.day) { delete run.preorder; return p.collected ? '' : `Your ${p.dish} from yesterday went to someone hungry. Order again tonight.` }
  if (p.day === run.day && !p.collected && !p.told) { p.told = true; return `Your ${p.dish.toLowerCase()} is ready. Collect it from Mama Liz at the Caf.` }
  return ''
}
export function collectPreorder(run) { if (run?.preorder) run.preorder.collected = true }

// ---------- Streak ----------
const sastDate = (d = new Date()) => new Date(d.getTime() + 2 * 3600000).toISOString().slice(0, 10)
const dayNo = (date) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86400000)
// The week a freeze belongs to (Monday to Sunday, SAST), as its Monday's day number.
const weekOf = (date) => { const n = dayNo(date); return n - ((n + 3) % 7) } // (1 Jan 1970 was a Thursday)
export const STREAK_GOAL = 7
// A finished activity. Returns { n, grew, froze, milestone } (grew: today was not counted yet).
export function noteActive(run, now = new Date()) {
  const today = sastDate(now)
  const s = (run.streak ||= { n: 0, last: '', best: 0, freezeWeek: -1 })
  if (s.last === today) return { n: s.n, grew: false, froze: false, milestone: false }
  const gap = s.last ? dayNo(today) - dayNo(s.last) : 0
  let froze = false
  if (!s.last || gap > 2 || gap < 1) s.n = 1
  else if (gap === 1) s.n += 1
  else if (s.freezeWeek !== weekOf(today)) { s.freezeWeek = weekOf(today); s.n += 1; froze = true } // (one missed day, covered by this week's free freeze)
  else s.n = 1
  s.last = today
  s.best = Math.max(s.best || 0, s.n)
  return { n: s.n, grew: true, froze, milestone: s.n === STREAK_GOAL }
}
// The streak as it stands now (0 once it has lapsed): { n, best, alive, today (done today), freeze (still free this week) }.
export function streakNow(run, now = new Date()) {
  const today = sastDate(now)
  const s = run?.streak || { n: 0, last: '', best: 0, freezeWeek: -1 }
  const gap = s.last ? dayNo(today) - dayNo(s.last) : 99
  const freeze = s.freezeWeek !== weekOf(today)
  const alive = gap <= 1 || (gap === 2 && freeze)
  return { n: alive ? s.n : 0, best: s.best || 0, alive, today: gap === 0, freeze }
}

// ---------- Badges ----------
export const BADGE_LIST = BADGES.badges
export const badgeOf = (id) => BADGE_LIST.find((b) => b.id === id) || null
export const badgeName = (id) => badgeOf(id)?.name || ''
// Give a badge once. Returns the badge when it is new, else null. (A "coming" badge is never given.)
export function award(run, id) {
  const b = badgeOf(id)
  if (!run || !b || b.status === 'coming' || (run.badges || []).includes(id)) return null
  run.badges = [...(run.badges || []), id]
  return b
}
// A finished activity (scores.js onNote: { id, place, cat }) and what else is true of the run: the badges it earns.
export function badgesFor(run, { id = '', place = '', cat = '' } = {}) {
  const out = []
  if (cat === 'work') out.push('gig_rookie')
  if (cat === 'food' && place === 'cafeteria') out.push('caf_ticket')
  if (cat === 'study' && place === 'library') out.push('library_quiet')
  if (id === 'friend_add') out.push('plus_one')
  if (id === 'hangout' && run.at === 'quad') out.push('bench_mate')
  return out
}
// What the run's state has earned, whatever just happened.
export function standingBadges(run, { followers = 0 } = {}) {
  const out = []
  if (run.resMorningDone) out.push('kettle_on')
  if (Object.keys(run.waveCounts || {}).length >= 5) out.push('five_waves')
  if ((run.partsSeen || []).length >= 6) out.push('district_hopper')
  if ((run.streak?.best || 0) >= STREAK_GOAL) out.push('seven_strong')
  for (const n of [10, 50, 100, 500]) if (followers >= n) out.push(`followers_${n}`)
  return out
}
// The profile's list: every badge with its state: 'earned' | 'open' | 'coming'.
export function badgeBoard(run) {
  const have = new Set(run?.badges || [])
  return BADGE_LIST.map((b) => ({ ...b, state: have.has(b.id) ? 'earned' : b.status === 'coming' ? 'coming' : 'open' }))
}
