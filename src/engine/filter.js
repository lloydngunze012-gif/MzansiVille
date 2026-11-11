// Lobby word filter. Runs on the phone before sending and again on every
// message we show, so older rows and other clients are masked too. The
// server trigger in supabase/schema.sql masks the same list.
//
// MASK: swearing in English, isiZulu and Afrikaans (plus common SA slang).
// Matched as whole words; entries ending in * also match as a prefix.
// BLOCK: slurs. A message containing one is not sent at all.

export const MASK = [
  // English
  'fuck*', 'fck', 'fuk*', 'phuck*', 'fcuk*', 'motherfuck*', 'shit*', 'bullshit', 'bitch*', 'asshole*', 'arsehole*', 'bastard*',
  'dick', 'dickhead', 'cunt*', 'slut*', 'whore*', 'wanker*', 'twat*', 'prick', 'pussy', 'cock', 'bollocks',
  // Afrikaans / SA slang
  'poes*', 'poephol*', 'doos', 'fok', 'fokken', 'fokkof', 'fokol', 'naai', 'naaier', 'kak', 'kakhuis',
  'moer', 'jou ma se', 'voetsek', 'drol', 'teef',
  // isiZulu / township slang
  'msunu*', 'umsunu*', 'nyoko*', 'unyoko', 'sfebe', 'isifebe', 'umthondo', 'mnqundu', 'ngquza', 'masende',
  'isidomu', 'sdomu',
]

export const BLOCK = [
  'kaffir*', 'kaffer*', 'k4ffir', 'nigger*', 'nigga*', 'coolie*', 'koelie*', 'boesman*', 'hotnot*',
  'kwerekwere', 'makwerekwere', 'grigamba', 'faggot*', 'moffie*', 'retard*',
]

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' }

function norm(word) {
  return word.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] || c).replace(/[^a-z*]/g, '').replace(/\*/g, '').replace(/(.)\1{2,}/g, '$1$1')
}

function compile(list) {
  return list.map((w) => ({ multi: w.includes(' '), prefix: w.endsWith('*'), w: w.replace('*', '') }))
}
const MASKS = compile(MASK)
const BLOCKS = compile(BLOCK)

function hits(token, list) {
  const n = norm(token)
  if (!n) return false
  return list.some((e) => !e.multi && (e.prefix ? n.startsWith(e.w) : n === e.w || n === e.w + 's'))
}

export function filterText(raw) {
  const input = String(raw ?? '').replace(/\s+/g, ' ').trim()
  const tokens = input.split(/(\s+)/)
  let blocked = false
  let masked = false
  const out = tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return tok
    if (hits(tok, BLOCKS)) { blocked = true; return '\u2022'.repeat(Math.max(3, tok.length)) }
    if (hits(tok, MASKS)) { masked = true; return tok[0] + '\u2022'.repeat(Math.max(2, tok.length - 1)) }
    return tok
  }).join('')
  let text = out
  for (const e of MASKS.filter((m) => m.multi)) {
    const re = new RegExp(`\\b${e.w.replace(/ /g, '\\s+')}\\b`, 'gi')
    text = text.replace(re, (m) => { masked = true; return m[0] + '\u2022'.repeat(m.length - 1) })
  }
  return { text, masked, blocked }
}

export function cleanText(raw) {
  return filterText(raw).text
}

export function canSend(stamps, now = Date.now()) {
  const recent = stamps.filter((t) => now - t < 10 * 60 * 1000)
  if (recent.length && now - recent[recent.length - 1] < 3000) {
    return { ok: false, reason: 'Wait a few seconds.', stamps: recent }
  }
  if (recent.length >= 30) return { ok: false, reason: '30 messages per 10 minutes.', stamps: recent }
  return { ok: true, reason: '', stamps: recent }
}

// A player's card bio: one line, 80 characters, their own words (Piece 1a). Contact
// details never go on a card: phone numbers, links (WhatsApp ones included) and social
// handles are taken out, each with the reason; a slur blocks the bio. Used on save and
// again on display. Returns { text, removed: [why...], blocked, masked }.
export const BIO_MAX = 80
export function cleanBio(raw) {
  return cleanContacts(raw, BIO_MAX, 'Social handles are taken out (your @handle has its own place on the card).')
}

// A chat message (Piece 3): one line, 120 characters. The same rules as a bio: contact
// details are taken out with the reason; a slur blocks the message (it isn't sent).
export const CHAT_MAX = 120
export function cleanChat(raw) {
  return cleanContacts(raw, CHAT_MAX, 'Social handles are taken out.')
}

function cleanContacts(raw, max, handleWhy) {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  const removed = []
  const strip = (re, why, keep = () => false) => {
    let hit = false
    text = text.replace(re, (m) => { if (keep(m)) return m; hit = true; return ' ' }).replace(/\s+/g, ' ').trim()
    if (hit && !removed.includes(why)) removed.push(why)
  }
  strip(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|whatsapp\.com)\/?\S*/gi, 'WhatsApp links are taken out.')
  strip(/(?:https?:\/\/|www\.)\S+/gi, 'Links are taken out.')
  strip(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|co\.za|org\.za|za|net|org|io|me|ly|app|gg|tv|link|xyz|info|biz|page|site|online|store|shop)\b(?:\/\S*)?/gi, 'Links are taken out.')
  strip(/\b(?:ig|insta|instagram|tiktok|tt|snap|snapchat|sc|twitter|x|fb|facebook|whatsapp|wa|telegram|discord)\s*[:=-]\s*\S+/gi, handleWhy)
  strip(/(?:^|\s)@[\w.]{2,}/g, handleWhy)
  // (seven digits or more, with spaces, dashes or brackets between: a phone number)
  strip(/\+?\d[\d\s().-]{5,}\d/g, 'Phone numbers are taken out.', (m) => m.replace(/\D/g, '').length < 7)
  if (text.length > max) text = text.slice(0, max).trim()
  const f = filterText(text)
  return { text: f.text, removed, blocked: f.blocked, masked: f.masked }
}

// A message in a chat thread (Chat sprint, 11 Nov): 300 characters, the same rules as a nearby chat line.
export const MSG_MAX = 300
export function cleanMessage(raw) {
  return cleanContacts(raw, MSG_MAX, 'Social handles are taken out.')
}
