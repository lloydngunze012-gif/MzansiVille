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
