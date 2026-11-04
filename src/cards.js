import { getClient } from './net.js'
import { cleanBio } from './engine/filter.js'
import { myIdentity, peerMeta } from './presence.js'

// The player card (build plan, Piece 1a): one screen, the same for you and for anyone
// who taps you. Never an age. Saved to Supabase (player_cards, through
// save_player_card, which only this phone can write: presence.js keeps its secret) and
// sent along with presence, so a card shows the moment someone is online; loaded
// cards are cached on the phone.

export const VIBES = ['Bookworm', 'Party starter', 'Gym rat', 'Creative', 'Gamer', 'Foodie', 'Chilled', 'Hustler', 'Sporty', 'Music head']
export const LOOKING = ['Study buddy', 'New friends', 'Someone to eat with', 'Gym partner', 'Crew for the hunts', 'Party people', 'A society to join', 'Just vibing']
export const CLASS_OF = 2026

const BADGES = { lectures: 'Lecture streak', graduated: 'Graduated first year', founder: 'Founder' }

// Your card, from your save (bio and tags live on run.character).
export function cardOf(run, num = myIdentity().num) {
  const c = run?.character || {}
  const badges = (run?.badges || []).map((b) => BADGES[b] || b)
  if (run?.graduated && !badges.includes(BADGES.graduated)) badges.push(BADGES.graduated)
  return {
    name: String(c.name || 'Student').slice(0, 24),
    handle: String(c.handle || '').replace(/^@/, '').slice(0, 30),
    num,
    house: c.residence || '',
    bio: cleanBio(c.bio || '').text,
    tags: { course: c.course || '', vibe: VIBES.includes(c.vibe) ? c.vibe : '', looking: LOOKING.includes(c.looking) ? c.looking : '' },
    year: run?.year || 1,
    days: run?.day || 1,
    badges,
    look: c.avatar || {},
    classOf: CLASS_OF,
  }
}

// The part of the card that rides along with presence (small: no look, sent anyway).
export function compactCard(run) {
  const { handle, bio, tags, year, days, badges } = cardOf(run)
  return { handle, bio, tags, year, days, badges }
}

// ---------- Saving your card ----------
let saveTimer = 0
let lastSaved = ''
let tableMissing = false
export function saveMyCard(run) {
  if (!run?.character || tableMissing) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const card = cardOf(run)
    const key = JSON.stringify(card)
    if (key === lastSaved) return
    const client = await getClient()
    if (!client) return
    const me = myIdentity()
    const { error } = await client.rpc('save_player_card', { p_id: me.id, p_secret: me.secret, p_card: card })
    if (!error) { lastSaved = key; return }
    // (the table isn't set up in Supabase yet: cards still travel with presence)
    if (/does not exist|not find the function|schema cache/i.test(error.message || '')) tableMissing = true
  }, 1200)
}

// ---------- Someone else's card ----------
const CACHE = 'mzansiville.cards'
const FRESH = 5 * 60 * 1000
const memory = new Map()
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE) || '{}') } catch { return {} }
}
function writeCache(id, card) {
  memory.set(id, { card, at: Date.now() })
  try {
    const all = readCache()
    all[id] = { card, at: Date.now() }
    // (the 60 most recent cards)
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 60)
    localStorage.setItem(CACHE, JSON.stringify(Object.fromEntries(keep)))
  } catch { /* storage full or blocked: memory only */ }
}

// What presence knows, as a card (name, number, house and look; bio and tags if sent).
function fromPresence(id) {
  const m = peerMeta(id)
  if (!m) return null
  const c = m.card || {}
  return {
    name: m.name, num: m.num, house: m.house, look: m.look,
    handle: c.handle || '', bio: c.bio || '', tags: c.tags || {}, year: c.year || 1, days: c.days || 1, badges: c.badges || [], classOf: CLASS_OF,
  }
}

// A player's card: at once from the cache or presence (onCard), then fresh from
// Supabase if the cached one is old. The bio is filtered again for display.
export async function loadCard(id, onCard) {
  const shown = (card) => card && onCard({ ...card, bio: cleanBio(card.bio || '').blocked ? '' : cleanBio(card.bio || '').text })
  const cached = memory.get(id) || readCache()[id]
  const live = fromPresence(id)
  const now = live ? { ...(cached?.card || {}), ...live, look: live.look || cached?.card?.look } : cached?.card
  if (now) shown(now)
  if (cached && Date.now() - cached.at < FRESH && !live) return
  if (tableMissing) { if (live) writeCache(id, live); return }
  const client = await getClient()
  if (!client) return
  const { data, error } = await client.from('player_cards').select('name,handle,num,house,bio,tags,year,days,badges,look').eq('id', id).maybeSingle()
  if (error) { if (/does not exist|schema cache/i.test(error.message || '')) tableMissing = true; if (live) writeCache(id, live); return }
  if (!data) { if (live) writeCache(id, live); return }
  // (presence is the freshest for what it carries; the table fills in the rest)
  const card = { ...data, classOf: CLASS_OF, ...(live ? { name: live.name, num: live.num, house: live.house, look: live.look } : {}) }
  writeCache(id, card)
  shown(card)
}

// ---------- Reporting a player ----------
export async function reportPlayer(id, reason, card) {
  const client = await getClient()
  if (!client) return { ok: false }
  const me = myIdentity()
  const { error } = await client.rpc('report_player', { p_reporter: me.id, p_reported: id, p_reason: reason, p_card: card || {} })
  return { ok: !error }
}
