// Social B (owner, 11 Nov): the Feed tab and a player's Board, drawn inside the chat sheet (ui/threads.js owns the
// sheet, the tabs and the clicks' routing; this file owns what is in them).
//   The Feed: posts from the people you follow, then the day's hot posts in your district, then the named people
//   of the campus (so it is never empty); your interests on top, with Edit.
//   A Board: a player's posts, newest first, their follower count and Follow; on your own, the box to post
//   (140 characters, 3 a day). On every post: a stamp (🔥, one each), Replies (a chat thread), Report.
import { avatarSvg } from '../avatar.js'
import INTERESTS from '../../data/campusville/interests.json'
import { followerCounts, followersText, followPlayer, loadBoardOf, loadFeed, POST_MAX, postToBoard, reportPost, repliesOf, stampPost, districtNow } from '../board.js'
import { myId, myInterests, socialBReady } from '../threads.js'
import { waButton } from '../sharewa.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const DISTRICT = { campus: 'Campus', town: 'Town centre', suburbs: 'the Suburbs', beachfront: 'the Beachfront', township: 'the Township', industrial: 'Industrial' }
const faces = new Map()
function face(p, size = 36) {
  if (p.npc) return `<span class="bd-npc" aria-hidden="true">${esc(String(p.name || '?').replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase())}</span>`
  const key = `${size}|${JSON.stringify(p.look || {})}`
  if (!faces.has(key)) faces.set(key, avatarSvg(p.look || {}, '031', size))
  return faces.get(key)
}
function ago(at) {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

let feed = null // { ok, following, hot, npc, note } | null while loading
let board = null // { id, who, data } : the Board on screen
let reportFor = 0 // a post waiting for "Report?" to be confirmed

function postHtml(p) {
  const mine = p.author === myId()
  return `<li class="bd-post" data-post="${p.id}">
    <button type="button" class="bd-who" data-board="${esc(p.author)}" data-board-name="${esc(p.name)}"${p.npc ? ' data-npc="1"' : ''} aria-label="${esc(p.name)}'s Board"><span class="cht-av cht-sm">${face(p)}</span><b>${esc(p.name)}</b>${p.handle ? `<small>@${esc(p.handle)}</small>` : ''}<small class="bd-ago">${esc(p.npc ? '' : ago(p.at))}</small></button>
    <p class="bd-body">${esc(p.body)}</p>
    <div class="bd-acts">
      <button type="button" class="bd-stamp" data-stamp="${p.id}" aria-pressed="${p.mine}" aria-label="Stamp this post">\u{1F525} <span>${p.stamps}</span></button>
      <button type="button" class="bd-reply" data-replies="${p.id}">\u{1F4AC} ${p.replies ? `${p.replies} repl${p.replies === 1 ? 'y' : 'ies'}` : 'Reply'}</button>
      ${mine ? waButton('post', { post: p.body }, 'Share') : ''}
      ${mine ? '' : reportFor === p.id ? `<button type="button" class="bd-report on" data-report-post="${p.id}">Tap again to report</button>` : `<button type="button" class="bd-report" data-report-post="${p.id}" aria-label="Report this post">⚑</button>`}
    </div></li>`
}
const section = (title, posts) => (posts.length ? `<p class="cht-sub">${esc(title)}</p><ol class="bd-list">${posts.map(postHtml).join('')}</ol>` : '')

// The Feed tab's body.
export function feedHtml() {
  if (!socialBReady()) return '<p class="cht-empty">The Feed opens soon.</p>'
  const picks = myInterests().map((id) => INTERESTS.interests.find((i) => i.id === id)).filter(Boolean)
  const head = `<div class="bd-mine"><span>${picks.length ? picks.map((i) => `${i.emoji} ${esc(i.label)}`).join(' · ') : 'Pick 3 interests to find your people'}</span><button type="button" class="cht-btn sm ghost" data-ct="interests">${picks.length ? 'Edit' : 'Pick'}</button><button type="button" class="cht-btn sm" data-board="${esc(myId())}" data-board-name="You">My Board</button></div>`
  if (!feed) return `${head}<p class="cht-empty">Loading the Feed…</p>`
  if (!feed.ok) return `${head}<p class="cht-empty">${esc(feed.note || 'Couldn’t load the Feed.')}</p>`
  const shown = new Set()
  const fresh = (rows) => rows.filter((p) => !shown.has(p.id) && shown.add(p.id))
  return `${head}<div class="bd-scroll">
    ${section('People you follow', fresh(feed.following)) || '<p class="bd-hint">Follow people from their card or their Board and their posts land here.</p>'}
    ${section(`Hot in ${DISTRICT[districtNow()] || 'SunnyBay'} today`, fresh(feed.hot))}
    ${section('Around campus', fresh(feed.npc))}</div>`
}
export function refreshFeed(repaint) {
  loadFeed().then((data) => { feed = data; repaint() })
}

// A Board's whole view (header and body).
export function boardHtml() {
  if (!board) return ''
  const mine = board.id === myId()
  const d = board.data
  const name = mine ? 'Your Board' : `${board.who?.name || 'Student'}’s Board`
  const follow = mine || board.npc ? '' : `<button type="button" class="cht-btn sm${d?.following ? ' ghost' : ''}" data-follow="${esc(board.id)}" aria-pressed="${Boolean(d?.following)}">${d?.following ? 'Following ✓' : '＋ Follow'}</button>`
  const posts = d?.posts || []
  return `<header class="cht-head"><button type="button" class="cht-back" data-ct="feed" aria-label="Back to the Feed">‹</button>
      <span class="cht-av cht-sm">${face({ npc: board.npc, name: board.who?.name, look: board.who?.look })}</span>
      <span class="cht-title"><b>${esc(name)}</b><small data-bd-followers>${board.npc ? 'UMzansi' : d ? esc(followersText(d.followers)) : ''}</small></span>
      ${follow}<button type="button" class="cht-x" data-ct="close" aria-label="Close chat">✕</button></header>
    ${mine ? `<form class="bd-new" autocomplete="off"><input type="text" name="post" maxlength="${POST_MAX}" placeholder="What’s happening on campus?" aria-label="Post to your Board" enterkeyhint="send"><small class="bd-count">${POST_MAX}</small><button type="submit" class="cht-btn">Post</button></form>` : ''}
    <div class="bd-scroll">${!d ? '<p class="cht-empty">Loading…</p>' : !d.ok ? `<p class="cht-empty">${esc(d.note || 'Couldn’t load this Board.')}</p>` : posts.length ? `<ol class="bd-list">${posts.map(postHtml).join('')}</ol>` : `<p class="cht-empty">${mine ? 'Nothing on your Board yet. Say something: 3 posts a day.' : 'Nothing on this Board yet.'}</p>`}</div>`
}
export function openBoardOf(id, who, repaint) {
  board = { id, who: who || {}, npc: String(id).startsWith('npc:'), data: null }
  reportFor = 0
  loadBoardOf(id).then((data) => { if (board?.id !== id) return; board.data = data; if (data.who && !board.npc) board.who = { ...board.who, ...data.who }; repaint() })
}
export const boardOpen = () => board?.id || ''
export function closeBoard() { board = null }

const everyPost = () => [...(feed?.following || []), ...(feed?.hot || []), ...(feed?.npc || []), ...(board?.data?.posts || [])]
function patch(id, change) { for (const p of everyPost()) if (p.id === id) Object.assign(p, change) }

// A tap inside the Feed or a Board. ctx: { repaint, tell, openThread(id), showBoard(id, who) }. True if it was ours.
export function boardClick(event, ctx) {
  const stamp = event.target.closest('[data-stamp]')
  if (stamp) {
    const id = Number(stamp.dataset.stamp)
    const on = stamp.getAttribute('aria-pressed') !== 'true'
    const was = everyPost().find((p) => p.id === id)
    patch(id, { mine: on, stamps: Math.max(0, (was?.stamps || 0) + (on ? 1 : -1)) }) // (at once; the server's count follows)
    ctx.repaint()
    stampPost(id, on).then((r) => { if (r.ok) patch(id, { stamps: r.stamps }); else { patch(id, { mine: !on, stamps: was?.stamps || 0 }); ctx.tell(r.note, true) } ctx.repaint() })
    return true
  }
  const replies = event.target.closest('[data-replies]')
  if (replies) {
    repliesOf(Number(replies.dataset.replies)).then((r) => { if (r.ok) ctx.openThread(r.thread); else ctx.tell(r.note, true) })
    return true
  }
  const report = event.target.closest('[data-report-post]')
  if (report) {
    const id = Number(report.dataset.reportPost)
    if (reportFor !== id) { reportFor = id; ctx.repaint(); return true }
    reportFor = 0
    reportPost(id).then((r) => { ctx.tell(r.note, !r.ok); ctx.repaint() })
    return true
  }
  const follow = event.target.closest('[data-follow]')
  if (follow && board?.data) {
    const on = follow.getAttribute('aria-pressed') !== 'true'
    board.data.following = on
    board.data.followers = Math.max(0, board.data.followers + (on ? 1 : -1))
    ctx.repaint()
    followPlayer(follow.dataset.follow, on).then((r) => { if (r.ok) board.data.followers = r.followers; else { board.data.following = !on; ctx.tell(r.note, true) } ctx.repaint(); refreshFeed(() => {}) })
    return true
  }
  const who = event.target.closest('[data-board]')
  if (who) {
    const p = everyPost().find((x) => x.author === who.dataset.board)
    ctx.showBoard(who.dataset.board, { name: who.dataset.boardName === 'You' ? '' : who.dataset.boardName, look: p?.look, handle: p?.handle })
    return true
  }
  return false
}
// The Board's own form. True if it was ours.
export function boardSubmit(event, ctx) {
  if (!event.target.matches('.bd-new')) return false
  const input = event.target.elements.post
  postToBoard(input.value).then((r) => {
    if (!r.ok) { ctx.tell(r.note, true); return }
    if (board?.data && r.post) board.data.posts.unshift(r.post)
    ctx.tell('Posted.')
    ctx.repaint()
  })
  return true
}
export function boardInput(event) {
  if (!event.target.matches('.bd-new input')) return
  const c = event.target.closest('.bd-new').querySelector('.bd-count')
  if (c) c.textContent = String(POST_MAX - event.target.value.length)
}
// Follower counts under names that are already on screen: any [data-followers="<player id>"] in root.
export function paintFollowers(root = document) {
  const els = [...root.querySelectorAll('[data-followers]')].filter((el) => el.dataset.followers)
  if (!els.length || !socialBReady()) return
  followerCounts([...new Set(els.map((el) => el.dataset.followers))]).then(({ ids }) => {
    for (const el of els) { const n = ids[el.dataset.followers]; if (n !== undefined && el.isConnected) { el.textContent = followersText(Number(n)); el.hidden = false } }
  })
}
