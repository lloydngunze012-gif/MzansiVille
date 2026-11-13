// Social B (owner, 11 Nov): the Board, follow, the Feed and interests, on this phone's side.
//   Server: the SOCIAL B block of supabase/chat.sql. A post is 140 characters, 3 a day (the server's clock), through
//   the filter, no links but our own share links; one stamp per player per post; replies are a chat thread hanging
//   off the post ('p:<id>', opened with the chat's own thread view); 3 reports hide a post until it is reviewed;
//   a block hides posts both ways. Follower counts come from the server; there is no follower leaderboard.
// Until the owner has re-run chat.sql these answer "opens soon". Under automation nothing is sent unless ?chat=1.
import { filterText } from './engine/filter.js'
import { presenceArea } from './presence.js'
import { chatCall, isBlocked, sync } from './threads.js'

export const POST_MAX = 140
const WHY = {
  empty: '', long: `Keep it to ${POST_MAX} characters.`, link: 'No links on the Board (only Soft Life share links).', word: 'That word isn’t allowed here. Nothing was posted.',
  today: 'That’s your 3 posts for today. More tomorrow.', unknown: 'That post is gone.', too_many: 'That’s a lot of reports. Try again later.',
  blocked: 'You can’t follow this player.', self: '', soon: 'The Board opens soon.', offline: 'Couldn’t reach the campus. Check your connection.',
}
const note = (res) => WHY[res.reason] ?? WHY.offline
const tidy = (p) => {
  const body = filterText(String(p.body || ''))
  if (body.blocked || !body.text || (!p.npc && isBlocked(p.author))) return null
  return { ...p, id: Number(p.id), body: body.text, name: filterText(String(p.name || 'Student')).text || 'Student', stamps: Number(p.stamps) || 0, replies: Number(p.replies) || 0, mine: Boolean(p.mine), npc: Boolean(p.npc) }
}
const list = (rows) => (rows || []).map(tidy).filter(Boolean)
// The district you are in ('campus', 'town', 'beachfront'...): where a post is "hot".
export const districtNow = () => String(presenceArea() || 'campus').replace(/^campus\./, '') || 'campus'

// { ok, who, posts, followers, following, note }
export async function loadBoardOf(id) {
  const res = await chatCall('chat_board', { p_who: id })
  if (!res.ok) return { ok: false, posts: [], followers: 0, following: false, note: note(res) }
  return { ok: true, who: res.data.who || null, posts: list(res.data.posts), followers: Number(res.data.followers) || 0, following: Boolean(res.data.following) }
}
export async function postToBoard(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, note: '' }
  if (text.length > POST_MAX) return { ok: false, note: WHY.long }
  if (filterText(text).blocked) return { ok: false, note: WHY.word }
  const res = await chatCall('chat_post', { p_body: text, p_district: districtNow() })
  if (!res.ok) return { ok: false, reason: res.reason, note: note(res) }
  window.dispatchEvent(new CustomEvent('mzansi-posted')) // (main.js: counted, and later a badge)
  return { ok: true, post: tidy(res.data.post) }
}
export async function stampPost(postId, on) {
  const res = await chatCall('chat_stamp', { p_post: postId, p_on: Boolean(on) })
  return res.ok ? { ok: true, stamps: Number(res.data.stamps) || 0 } : { ok: false, note: note(res) }
}
// (job H) Your own post: gone, with its stamps and replies (it still counts for the day's three).
export async function deletePost(postId) {
  const res = await chatCall('chat_post_delete', { p_post: postId })
  return { ok: Boolean(res.ok && res.data?.ok !== false), note: res.ok ? 'Deleted.' : note(res) }
}
export async function reportPost(postId, reason = 'Reported from the Board') {
  const res = await chatCall('chat_post_report', { p_post: postId, p_reason: reason })
  return { ok: res.ok, note: res.ok ? 'Thanks. A moderator will look at it.' : note(res) }
}
// The replies to a post: the id of its thread (the chat sheet opens it like any other).
export async function repliesOf(postId) {
  const res = await chatCall('chat_post_thread', { p_post: postId })
  return res.ok ? { ok: true, thread: res.data.thread } : { ok: false, note: note(res) }
}
export async function followPlayer(id, on) {
  const res = await chatCall('chat_follow', { p_other: id, p_on: Boolean(on) })
  return res.ok ? { ok: true, followers: Number(res.data.followers) || 0 } : { ok: false, note: note(res) }
}
// Follower counts for the players on screen: { ids: { id: n }, handles: { handle: n } }.
export async function followerCounts(ids = [], handles = []) {
  if (!ids.length && !handles.length) return { ids: {}, handles: {} }
  const res = await chatCall('chat_followers', { p_ids: ids.slice(0, 60), p_handles: handles.slice(0, 60) })
  return res.ok ? { ids: res.data.ids || {}, handles: res.data.handles || {} } : { ids: {}, handles: {} }
}
export const followersText = (n) => (n === 1 ? '1 follower' : `${n > 999 ? `${(n / 1000).toFixed(1)}k` : n} followers`)
// "+N followers while you were away": asked once when the chat comes up; the server remembers what you have seen.
export async function newFollowers() {
  const res = await chatCall('chat_followers_seen', {})
  return res.ok ? Number(res.data.new) || 0 : 0
}
// { ok, following, hot, npc, note }
export async function loadFeed() {
  const res = await chatCall('chat_feed', { p_district: districtNow() })
  if (!res.ok) return { ok: false, following: [], hot: [], npc: [], note: note(res) }
  return { ok: true, following: list(res.data.following), hot: list(res.data.hot), npc: list(res.data.npc) }
}
// Your interests (at most three ids): the server puts you in their standing groups.
export async function setInterests(ids) {
  const res = await chatCall('chat_interests', { p_list: ids.slice(0, 3) })
  if (res.ok) await sync()
  return res.ok ? { ok: true, interests: res.data.interests || [] } : { ok: false, note: note(res) }
}
// Who joined today: { joined, names }.
export async function joinedToday() {
  const res = await chatCall('chat_daily', {})
  return res.ok ? { joined: Number(res.data.joined) || 0, names: (res.data.names || []).map((n) => filterText(String(n)).text).filter(Boolean) } : { joined: 0, names: [] }
}
