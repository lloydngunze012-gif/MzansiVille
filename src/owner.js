// The owner's reports (owner, 12 Nov, job G): #/owner. Only the owner's account can read them: the server's
// owner_report / owner_moderate (supabase/chat.sql OWNER REPORTS) check public.is_admin() for the signed-in user;
// this file only asks. Live comes from Realtime presence (each district's rooms) and cap_status. Every report takes
// the time range (1, 7 or 30 days). What each number means: docs/owner-reports.md.
import { getClient } from './net.js'
import { PLAN, rooms } from './health.js'
import { roomCost } from './presence.js'
import { PARTS } from './city/plan.js'

export const KINDS = ['growth', 'time', 'hot', 'feedback', 'support', 'chat', 'errors', 'economy']
export const owner = { days: 7, loading: false, live: null, reports: {}, error: '', denied: false, at: null }

async function live(client) {
  const base = new URLSearchParams(location.search).get('room') || 'campus'
  const areas = [['campus', base], ...PARTS.filter((p) => p.id !== 'campus').map((p) => [p.id, `${base}.${p.id}`])]
  const counts = await Promise.all(areas.map(async ([id, name]) => {
    const list = await rooms(client, name).catch(() => [])
    return { area: id, players: list.reduce((n, r) => n + r.players, 0), rooms: list }
  }))
  const players = counts.reduce((n, c) => n + c.players, 0)
  const messages = counts.reduce((n, c) => n + c.rooms.reduce((m, r) => m + roomCost(r.players), 0), 0)
  const { data } = await client.rpc('cap_status')
  return { areas: counts, players, messages, plan: PLAN, capacity: data || null }
}

// Load everything for the range. paint(): called as parts arrive.
export async function loadOwner(days, paint) {
  owner.days = days || owner.days
  owner.loading = true
  owner.error = ''
  paint()
  const client = await getClient()
  if (!client) { owner.loading = false; owner.error = 'Not connected (no Supabase keys in this build).'; paint(); return }
  live(client).then((l) => { owner.live = l; paint() }, () => {})
  await Promise.all(KINDS.map(async (kind) => {
    const { data, error } = await client.rpc('owner_report', { p_kind: kind, p_days: owner.days })
    if (error) {
      if (/owner only/i.test(error.message || '')) owner.denied = true
      else if (/does not exist|not find the function|schema cache/i.test(error.message || '')) owner.error = 'Run supabase/chat.sql again (OWNER REPORTS).'
      owner.reports[kind] = null
    } else owner.reports[kind] = data
    paint()
  }))
  owner.loading = false
  owner.at = new Date()
  paint()
}

// The review screen: Keep (shown again, reports cleared) or Hide.
export async function moderate(kind, id, keep, paint) {
  const client = await getClient()
  if (!client) return false
  const { error } = await client.rpc('owner_moderate', { p_kind: kind, p_id: String(id), p_keep: Boolean(keep) })
  if (error) return false
  const r = owner.reports.support
  if (r) {
    const list = kind === 'post' ? r.posts : r.groups
    const i = list.findIndex((x) => String(x.id) === String(id))
    if (i >= 0) list.splice(i, 1)
  }
  paint()
  return true
}
window.mzansiOwner = () => owner
