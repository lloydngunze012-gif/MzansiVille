import { getClient } from './net.js'
import { BLOCK } from './engine/filter.js'
import { myIdentity } from './presence.js'
import LIST from '../data/campusville/handle_blocklist.json'

// @handles (owner, 6 Nov). Chosen in enrolment step 2, shown under the name on the card,
// in chat bubbles and on the leaderboard. 3 to 20 characters: lowercase letters, numbers
// and underscores. No slurs, no impersonation (data/campusville/handle_blocklist.json).
// Unique: checked and claimed in Supabase (player_handles, through handles_taken and
// claim_handle: the "Handles" block in supabase/schema.sql). Changeable once every 30
// days (the server holds the date; the card holds it too). Until that SQL is run, or
// under automation (tests never claim real handles without ?handles=1), a handle is
// "unchecked": allowed, and claimed later.

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/
export const CHANGE_DAYS = 30
const SLURS = BLOCK.map((w) => w.replace('*', '').toLowerCase())
const online = () => !navigator.webdriver || new URLSearchParams(location.search).get('handles') === '1'

// What the player typed, as a handle: lowercase, no @, spaces to underscores.
export function tidyHandle(raw) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '_')
}

// The rules a handle must pass on this phone: { ok, why }.
export function checkRules(handle) {
  const h = tidyHandle(handle)
  if (h.length < 3) return { ok: false, why: 'Handles need at least 3 characters.' }
  if (h.length > 20) return { ok: false, why: 'Handles are 20 characters at most.' }
  if (!HANDLE_RE.test(h)) return { ok: false, why: 'Lowercase letters, numbers and underscores only.' }
  const bare = h.replace(/_/g, '')
  if (SLURS.some((w) => w && bare.includes(w))) return { ok: false, why: 'Pick another handle.' }
  if (LIST.exact.includes(h) || LIST.reserved.some((w) => bare.includes(w.replace(/_/g, '')))) return { ok: false, why: 'That handle looks official. Pick another.' }
  return { ok: true, why: '' }
}

// Handles to offer from a name: the name, with an underscore, a number, the year...
export function candidates(name) {
  const words = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  const full = words.join('_') || 'student'
  const first = words[0] || 'student'
  const n = (k) => String(Math.floor(Math.random() * k))
  // (each one fits in 20: the name is cut only to make room for what's added)
  const fit = (stem, tail = '') => `${stem.slice(0, 20 - tail.length)}${tail}`
  const list = [fit(full), fit(first, '_26'), fit(full, String(Number(n(90)) + 10)), fit(first, `_${Number(n(900)) + 100}`), fit(`the_${first}`), fit(first, `_${(words[1] || 'za').slice(0, 4)}`), fit(first, String(Number(n(9000)) + 1000)), fit(full, '_x')]
  return [...new Set(list.map(tidyHandle))].filter((h) => checkRules(h).ok)
}

// Which of these handles someone else already has: a Set, or null (not checked).
async function taken(handles) {
  if (!online()) return null
  const client = await getClient()
  if (!client) return null
  const { data, error } = await client.rpc('handles_taken', { p_handles: handles, p_id: myIdentity().id })
  if (error) return null
  return new Set(data || [])
}

// Is this handle free? 'free' | 'taken' | 'unchecked'.
export async function handleStatus(handle) {
  const t = await taken([tidyHandle(handle)])
  if (!t) return 'unchecked'
  return t.has(tidyHandle(handle)) ? 'taken' : 'free'
}

// Three free handles made from the name (the first three if nothing can be checked).
export async function suggestFor(name, skip = '') {
  const list = candidates(name).filter((h) => h !== tidyHandle(skip))
  const t = await taken(list)
  return list.filter((h) => !t || !t.has(h)).slice(0, 3)
}

// Claim it (yours from now on): 'ok' | 'taken' | 'cooldown' | 'invalid' | 'unchecked'.
export async function claimHandle(handle) {
  if (!checkRules(handle).ok) return 'invalid'
  if (!online()) return 'unchecked'
  const client = await getClient()
  if (!client) return 'unchecked'
  const me = myIdentity()
  const { data, error } = await client.rpc('claim_handle', { p_id: me.id, p_secret: me.secret, p_handle: tidyHandle(handle) })
  if (error) return 'unchecked'
  return data || 'unchecked'
}

// When this card's handle can change again (null: now).
export function nextChange(character, now = Date.now()) {
  const at = character?.handleChangedAt ? new Date(character.handleChangedAt).getTime() : 0
  const next = at + CHANGE_DAYS * 864e5
  return at && next > now ? new Date(next) : null
}
