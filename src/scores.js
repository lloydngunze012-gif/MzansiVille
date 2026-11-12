// The weekly leaderboard and the activity log, on this phone's side (owner, 9 Nov).
//   Rules:   data/campusville/leaderboard.json -> engine/scores.js (the same rules Supabase checks)
//   Counting: note() counts a finished activity in the save (run.counts, run.finished) and queues it (run.outbox)
//   Sending: flush() posts the queue to Supabase one by one through record_activity (never raw table writes: the
//            function checks who you are and your daily limits). A failed send stays queued and goes next time.
//   Reading: loadBoard(board) -> score_board, loadBadges() -> my_badges.
// Until the "Launch block" in supabase/schema.sql has been run, the functions do not exist: the queue keeps
// (300 entries) and the board says it is not open yet. Under automation nothing is sent unless ?scores=1.
import LB from '../data/campusville/leaderboard.json'
import { badgeLabel, categoryOf, countActivity, resetText, scoreRules, sastWeek } from './engine/scores.js'
import { getClient } from './net.js'
import { myIdentity } from './presence.js'

export const BOARDS = LB.boards
export const CONFIG = LB
const live = () => !navigator.webdriver || new URLSearchParams(location.search).get('scores') === '1'

let rulesCache = null
let rulesFor = null
// City job B: the rows of SunnyBay's places score too. They arrive when the city is first loaded (main.js hands
// them over: src/city/places.js cityActivities), so the rows' data stays out of the first download.
let extra = []
export function addActivities(list) { extra = list || []; rulesCache = null }
export function rules(district) {
  if (rulesCache && rulesFor === district.activities) return rulesCache
  rulesFor = district.activities
  rulesCache = scoreRules(extra.length ? district.activities.concat(extra) : district.activities, LB)
  return rulesCache
}

// Count a finished activity (an action of the district, or one of the pseudo ones: talk_chat, friend_add, hangout...).
// Returns { board, points } when it scored.
export function note(district, run, id, place = '', category = '') {
  const r = rules(district)
  const action = district.activities.find((a) => a.id === id) || extra.find((a) => a.id === id)
  const cat = category || r[id]?.board || (action ? categoryOf(action, r) : 'social')
  const hit = countActivity(run, { id, place: place || action?.placeId || '', cat }, r, LB)
  for (const fn of listeners) fn({ id, place, cat, hit, action })
  return hit
}
const listeners = new Set()
// Something was counted: fn({ id, place, cat, hit }).
export function onNote(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// ---------- Sending ----------
let flushing = false
let missing = false // the function is not in Supabase yet (the Launch block has not been run)
let flushTimer = 0
export function flush(run, character = run?.character) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => send(run, character), 1500)
}
async function send(run, character) {
  if (flushing || missing || !run?.outbox?.length || !live()) return
  flushing = true
  try {
    const client = await getClient()
    if (!client) return
    const me = myIdentity()
    const profile = { p_name: String(character?.name || '').slice(0, 24), p_handle: String(character?.handle || '').slice(0, 20), p_house: String(character?.residence || '').slice(0, 40) }
    while (run.outbox.length) {
      const e = run.outbox[0]
      const { data, error } = await client.rpc('record_activity', { p_id: me.id, p_secret: me.secret, p_event: e.e, p_activity: e.id, p_place: e.p, p_category: e.c, p_client_at: e.at, ...profile })
      if (error) {
        if (/does not exist|not find the function|schema cache/i.test(error.message || '')) missing = true
        // (anything else: the network or a busy server; the queue keeps and goes next time)
        return
      }
      run.outbox.shift()
      if (data && data.ok === false && data.reason === 'too_many') run.outbox.length = 0
    }
  } catch { /* offline: next time */ } finally { flushing = false }
}
export function sqlMissing() { return missing }

// ---------- Reading ----------
// { ok, board, week, resetsIn (text), top: [{ rank, name, handle, house, points }], you: { rank, points } | null, error }
export async function loadBoard(board, run) {
  const week = sastWeek()
  const mine = run?.scores?.week === week ? run.scores.points?.[board] || 0 : 0
  const fallback = { ok: false, board, week, resetsIn: resetText(), top: [], you: mine ? { rank: 0, points: mine } : null, error: '' }
  if (!live()) return { ...fallback, error: 'offline' }
  try {
    const client = await getClient()
    if (!client) return { ...fallback, error: 'offline' }
    const { data, error } = await client.rpc('score_board', { p_board: board, p_id: myIdentity().id })
    if (error) {
      if (/does not exist|not find the function|schema cache/i.test(error.message || '')) { missing = true; return { ...fallback, error: 'soon' } }
      return { ...fallback, error: 'offline' }
    }
    return { ok: true, board, week: data.week || week, resetsIn: resetText(), top: data.top || [], you: data.you || null, error: '' }
  } catch { return { ...fallback, error: 'offline' } }
}

// The lasting badges won in weeks gone by (a list of "Week 1 Top 3, Sport").
export async function loadBadges() {
  if (!live() || missing) return []
  try {
    const client = await getClient()
    if (!client) return []
    const { data, error } = await client.rpc('my_badges', { p_id: myIdentity().id })
    if (error) return []
    return (data || []).map((b) => badgeLabel(b.week, b.board, LB)).filter(Boolean)
  } catch { return [] }
}
