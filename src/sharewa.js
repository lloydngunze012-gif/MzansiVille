// Sharing (Loops, owner 11 Nov): WhatsApp buttons (wa.me links) with the lines of docs/world-designer/words.md
// (data/campusville/share.json): on a race result, a top-10 placing, a Board post, and "Invite a friend".
// The invite link carries the player's code (?ref=<code>): when the friend finishes the quick start both get R100,
// once per friend, checked by the server (supabase/chat.sql chat_ref_code, chat_ref_claim; the inviter hears of it
// in chat_sync's refs). The code a newcomer came in with waits on the phone until the chat is up.
import SHARE from '../data/campusville/share.json'
import { PUBLIC_URL } from './config.js'
import { chatCall } from './threads.js'

export const INVITE_REWARD = Number(SHARE.reward) || 100
const GAME = `https://${PUBLIC_URL}/`
const REF_KEY = 'mzansiville.ref'
try { const r = new URLSearchParams(location.search).get('ref'); if (r && /^[0-9a-f]{6,16}$/i.test(r)) localStorage.setItem(REF_KEY, r.toLowerCase()) } catch { /* storage blocked: no invite */ }

const pick = (list) => list[Math.floor(Math.random() * list.length)] || ''
// One of the lines for kind ('won' | 'lost' | 'invite' | 'top10' | 'post'), with its link (and {post}) filled in.
export function shareText(kind, { link = GAME, post = '' } = {}) {
  return pick(SHARE[kind] || []).replace('{post}', String(post).slice(0, 140)).replace('[link]', link).trim()
}
export const waLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`
// A WhatsApp button as HTML (a real link: it opens WhatsApp, or WhatsApp Web, in a new tab).
export function waButton(kind, opts = {}, label = 'Share on WhatsApp') {
  const text = shareText(kind, opts)
  return `<a class="wa-btn" href="${waLink(text).replace(/"/g, '&quot;')}" target="_blank" rel="noopener" data-wa-kind="${kind}">${label}</a>`
}

// Your invite link (the server makes your code the first time). { ok, url, text, wa }.
export async function inviteFriendLink() {
  const res = await chatCall('chat_ref_code', {})
  if (!res.ok) return { ok: false, note: res.reason === 'soon' ? 'Invites open soon.' : 'Couldn’t make your link. Check your connection.' }
  const url = `${GAME}?ref=${encodeURIComponent(res.data.code)}`
  const text = shareText('invite', { link: url })
  return { ok: true, url, text, wa: waLink(text) }
}
// A newcomer who came in through an invite link, once the chat is up: claim it. { ok, inviter } (ok: add the reward).
export async function claimInvite() {
  let code = ''
  try { code = localStorage.getItem(REF_KEY) || '' } catch { /* fine */ }
  if (!code) return { ok: false }
  const res = await chatCall('chat_ref_claim', { p_code: code })
  // (answered either way: the code is used up; only "could not reach the server" keeps it for the next try)
  if (res.ok || ['unknown', 'self', 'old', 'done', 'limit'].includes(res.reason)) { try { localStorage.removeItem(REF_KEY) } catch { /* fine */ } }
  return res.ok ? { ok: true, inviter: String(res.data.inviter || 'A friend') } : { ok: false }
}
