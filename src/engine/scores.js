// Weekly leaderboard rules and counting (owner, 9 Nov). Pure: no browser, no network, so the game, the
// sim checks and the SQL generator (scripts/scores-sql.mjs) all read the same rules.
//   data/campusville/leaderboard.json -> scoreRules(activities, config) -> { activityId: { board, points, limit } }
// Every finished activity is counted for the player (countActivity: run.counts, run.finished, run.outbox);
// the ones with a rule also score, up to their daily limit. Supabase checks the same limits (record_activity).

const SAST = 2 * 3600 * 1000 // UTC+2, no daylight saving
const DAY = 24 * 3600 * 1000

// The SAST calendar day of a moment, 'YYYY-MM-DD'.
export function sastDay(now = Date.now()) {
  return new Date(Number(now) + SAST).toISOString().slice(0, 10)
}
// The Monday (SAST) the week of this moment started on, 'YYYY-MM-DD'.
export function sastWeek(now = Date.now()) {
  const shifted = new Date(Number(now) + SAST)
  const back = (shifted.getUTCDay() + 6) % 7
  return new Date(shifted.getTime() - back * DAY).toISOString().slice(0, 10)
}
// Milliseconds until the next Monday 00:00 SAST (the board resets).
export function resetIn(now = Date.now()) {
  const start = Date.parse(`${sastWeek(now)}T00:00:00Z`) - SAST
  return start + 7 * DAY - Number(now)
}
// "2d 4h", "5h 10m", "12m": how long until the reset.
export function resetText(now = Date.now()) {
  const ms = Math.max(0, resetIn(now))
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${Math.max(1, m)}m`
}
// Which week number a Monday is (week 1 = config.firstBadgeWeek), or 0 before that.
export function weekNumber(weekStart, config) {
  const first = Date.parse(`${config.firstBadgeWeek}T00:00:00Z`)
  const w = Date.parse(`${weekStart}T00:00:00Z`)
  if (!Number.isFinite(w) || w < first) return 0
  return Math.round((w - first) / (7 * DAY)) + 1
}

// What each board is called, for a badge ("Week 1 Top 3, Sport").
export function badgeLabel(week, board, config) {
  const n = weekNumber(week, config)
  const label = config.boards.find((b) => b.id === board)?.label || board
  return n ? `Week ${n} Top 3, ${label}` : ''
}

// The scoring rules: one per activity that scores (and the pseudo ones). Sorted by id.
export function scoreRules(activities, config) {
  const rules = {}
  const sportIds = (config.sportIds || []).map((p) => new RegExp(`^${p}$`))
  const sportPlaces = new Set(config.sportPlaces || [])
  const d = config.defaults
  for (const a of activities) {
    const g = a.deltas?.grades || 0
    const s = a.deltas?.social || 0
    let rule = null
    // (it has to take a slot of your day: a free glance at a board is not an activity worth points)
    if ((a.slots || 0) < 1) { /* no rule from the defaults */ } else if (sportPlaces.has(a.placeId) || sportIds.some((r) => r.test(a.id)) || (a.tags || []).includes('gym')) rule = { board: 'sport', points: d.sport.points, limit: d.sport.limit }
    else if (g >= d.academics.minGrades || (a.tags || []).some((t) => ['study', 'attend', 'exam'].includes(t))) rule = { board: 'academics', points: d.academics.points, limit: d.academics.limit }
    else if (s >= d.social.minSocial) rule = { board: 'social', points: d.social.points, limit: d.social.limit }
    const over = config.overrides?.[a.id]
    if (over) rule = over.board === null ? null : { ...(rule || {}), ...over }
    if (rule && rule.board) rules[a.id] = { board: rule.board, points: rule.points, limit: rule.limit }
  }
  // (activities that are not in activities.csv: jobs from jobs.json that are only overrides)
  for (const [id, over] of Object.entries(config.overrides || {})) {
    if (over.board && !rules[id] && over.points && over.limit) rules[id] = { board: over.board, points: over.points, limit: over.limit }
  }
  for (const [id, p] of Object.entries(config.pseudo || {})) rules[id] = { board: p.board, points: p.points, limit: p.limit }
  return Object.fromEntries(Object.entries(rules).sort(([a], [b]) => (a < b ? -1 : 1)))
}

// What an activity counts as, for the colours and mood later: a board if it scores, else what it was.
export function categoryOf(action, rules) {
  const hit = rules?.[action?.id]
  if (hit) return hit.board
  const d = action?.deltas || {}
  const tags = action?.tags || []
  if (tags.includes('job') || d.money > 0) return 'work'
  if (tags.includes('meal') || d.hunger >= 15) return 'food'
  if (tags.includes('sleep') || d.energy >= 5) return 'rest'
  return 'other'
}

// ---------- Counting (the save) ----------
const KEEP_FINISHED = 400 // compact lines kept in the save; the counts are never trimmed
const KEEP_OUTBOX = 300 // waiting for Supabase

// Count one finished activity for this player. entry: { id, place, cat }. Returns { points, board } if it scored.
// run.counts: totals by activity, place, category and SAST day (never trimmed: colours and mood read them).
// run.finished: [id, place, cat, 'YYYY-MM-DD'] lines, the last 400.
// run.scores: this SAST day's use of each limit and this week's points per board (what the game shows
//   until Supabase answers; the server is the truth).
// run.outbox: waiting to be sent to Supabase (src/scores.js flush).
export function countActivity(run, entry, rules, config, now = Date.now()) {
  if (!run || !entry?.id) return null
  const day = sastDay(now)
  const week = sastWeek(now)
  const c = (run.counts ||= { total: 0, activity: {}, place: {}, category: {}, day: {} })
  const cat = entry.cat || 'other'
  const place = entry.place || ''
  c.total += 1
  c.activity[entry.id] = (c.activity[entry.id] || 0) + 1
  if (place) c.place[place] = (c.place[place] || 0) + 1
  c.category[cat] = (c.category[cat] || 0) + 1
  c.day[day] = (c.day[day] || 0) + 1
  const keys = Object.keys(c.day)
  if (keys.length > 60) for (const k of keys.sort().slice(0, keys.length - 60)) delete c.day[k]
  const f = (run.finished ||= [])
  f.push([entry.id, place, cat, day])
  if (f.length > KEEP_FINISHED) f.splice(0, f.length - KEEP_FINISHED)
  // scoring
  const s = (run.scores ||= { week, day, used: {}, points: { academics: 0, social: 0, sport: 0 } })
  if (s.week !== week) { s.week = week; s.points = { academics: 0, social: 0, sport: 0 } }
  if (s.day !== day) { s.day = day; s.used = {} }
  const rule = rules?.[entry.id]
  let scored = null
  if (rule && (s.used[entry.id] || 0) < rule.limit) {
    s.used[entry.id] = (s.used[entry.id] || 0) + 1
    s.points[rule.board] = (s.points[rule.board] || 0) + rule.points
    scored = { board: rule.board, points: rule.points }
  }
  const ob = (run.outbox ||= [])
  ob.push({ e: `${Math.floor(now).toString(36)}${Math.random().toString(36).slice(2, 8)}`, id: entry.id, p: place, c: cat, at: new Date(now).toISOString() })
  if (ob.length > KEEP_OUTBOX) ob.splice(0, ob.length - KEEP_OUTBOX)
  return scored
}

// Has this limit been used up today (for the game's own use)?
export function limitLeft(run, id, rules, now = Date.now()) {
  const rule = rules?.[id]
  if (!rule) return 0
  const s = run?.scores
  const used = s && s.day === sastDay(now) ? s.used[id] || 0 : 0
  return Math.max(0, rule.limit - used)
}
