import { getClient } from './net.js'
import { BLOCK } from './engine/filter.js'
import { myIdentity } from './presence.js'
import LIST from '../data/campusville/handle_blocklist.json'
import WORDS from '../data/campusville/handle_words.json'

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

// A display name (not a handle: spaces, capitals and punctuation are fine) may not contain the same
// reserved or official words as a handle — the same impersonation rule, just without the handle's own
// character-class and length limits. Used before Play on the opening page (src/ui/quick.js) and on the
// full enrol flow's "who" step (main.js).
export function nameBlocked(name) {
  const bare = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
  if (!bare) return false
  if (LIST.exact.includes(bare)) return true
  return LIST.reserved.some((w) => bare.includes(w.replace(/_/g, '')))
}

// A Soft Life handle (owner, 12 Nov, job I): never made from the player's name (a real name is mandatory, and the
// handle is what strangers see): a friendly adjective_noun with two digits from handle_words.json, e.g. sunny_kombi27.
export function randomHandle() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)]
  for (let i = 0; i < 40; i++) {
    const h = `${pick(WORDS.adjectives)}_${pick(WORDS.nouns)}`.slice(0, 18) + String(Math.floor(Math.random() * 90) + 10)
    if (checkRules(h).ok) return h
  }
  return `student_${Math.floor(Math.random() * 90000) + 10000}`.replace('student', 'sunny')
}
// Handles to offer (the name is not used: job I). Eight different ones.
export function candidates() {
  const out = new Set()
  for (let i = 0; i < 40 && out.size < 8; i++) out.add(randomHandle())
  return [...out]
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

// Three free handles (the first three if nothing can be checked). The name is not used (job I).
export async function suggestFor(name, skip = '') {
  const list = candidates().filter((h) => h !== tidyHandle(skip))
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
