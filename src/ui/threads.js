// The Chat sheet and the ping (Chat sprint, owner 11 Nov). One sheet on the page itself (not inside a scene), so
// it works on campus, in the Caf, in SunnyBay and inside its places.
//   The list: a row per thread (avatar, name, last message, time, unread badge), newest first; "Here now" on top
//   is everyone this phone can see, one tap to message them.
//   A thread: bubbles (yours right, theirs left with name and avatar), times, the pinned topic of a group on top,
//   one input with Send. Long-press a message of theirs: Report or Block.
// It is a bottom sheet of at most 70% of the screen and never a dialog (no role="dialog": scene.js paused() and the
// city only stop you for dialogs), so you keep walking with it open; taps on the world above it still walk.
// The ping: a short ding (sfx.js, so the sound switch applies) and a banner at the top with the sender and the
// first words; tapping it opens the thread. Never for the thread that is on screen.
import './threads.css'
import { avatarSvg } from '../avatar.js'
import { MSG_MAX } from '../engine/filter.js'
import { peerList } from '../presence.js'
import { newFollowers } from '../board.js'
import { boardClick, boardHtml, boardInput, boardOpen, boardSubmit, closeBoard, feedHtml, openBoardOf, refreshFeed } from './board.js'
import { isUp as curtainUp } from '../curtain.js'
import { play } from '../sfx.js'
import INTERESTS from '../../data/campusville/interests.json'
import { canType, typing, typingIn, reportGroup, setGroupOpen, socialCReady, addFriend, addToGroup, answerAsk, groupAsks, removeMember, renameGroup, clearInvite, joinByCode, waitingInvite, blockInChat, chatStatus, closeThread, createGroup, dmWith, friendList, groupMembers, groupUnread, inviteLink, isBlocked, isFriend, leaveGroup, linesOf, muteThread, myId, onThreads, openThread, openThreadId, removeFriend, reportLine, sendLine, setTopic, socialReady, sync, threadList, threadOf, unreadTotal } from '../threads.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const first = (name) => String(name || 'Student').split(' ')[0]
const faces = new Map()
function face(look, size = 40) {
  const key = `${size}|${JSON.stringify(look || {})}`
  if (!faces.has(key)) faces.set(key, avatarSvg(look || {}, '031', size))
  return faces.get(key)
}
const GROUP_FACE = '<span class="cht-group" aria-hidden="true">\u{1F465}</span>'
function clock(at) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === now.toDateString()) return time
  if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
const timeOf = (at) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) }

let sheet = null
let banner = null
let view = '' // '' (closed) | 'list' | a thread id
let note = ''
let noteBad = false
let acts = null // the long-press menu: { line, sender, name, body }
let pingFor = ''
let pingTimer = 0
let sending = false
let mark = () => {}
let guardUntil = 0
// Social A (owner, 11 Nov): the list has two tabs (Chats, Friends) and a "New group" row; a group's header opens
// its page (members, the pinned topic, add people, invite by WhatsApp, mute, leave); a player's card can ask to
// add them to one of your groups (the picker).
let tab = 'chats' // 'chats' | 'friends' | 'feed' (Social B: ui/board.js draws it; view 'board' is a player's Board)
let making = false // the "New group" row is open
let panel = '' // in a thread: '' | 'info' | 'add'
let members = null // the open group's members (null: loading)
let invite = null // { wa, url, text } once the server has given the link
let leaving = false
let kickFor = '' // (the creator tapped Remove on this member: a second tap does it)
let opening = false // (Social C: the creator is choosing the interest for an Open group)
let reporting = false // (a member tapped Report on the group: a second tap does it)
let pickFor = null // { id, who }: choose one of your groups to add this player to

export function mountThreads() {
  if (sheet) return
  document.body.insertAdjacentHTML('beforeend', '<section class="cht-sheet" aria-label="Chat" hidden></section><button type="button" class="cht-ping" hidden></button>')
  sheet = document.body.querySelector('.cht-sheet')
  banner = document.body.querySelector('.cht-ping')
  sheet.addEventListener('click', onClick)
  sheet.addEventListener('submit', onSubmit)
  sheet.addEventListener('input', boardInput)
  // (Chat V2: "typing…": threads.js sends at most one signal every 3 s, and only in DMs and small groups)
  sheet.addEventListener('input', (event) => { if (event.target.matches('.cht-form input') && event.target.value.trim() && view && view !== 'list' && view !== 'board') typing(view) })
  sheet.addEventListener('input', (event) => { if (event.target.matches('.cht-form input')) { const c = sheet.querySelector('.cht-count'); if (c) c.textContent = event.target.value.length > MSG_MAX - 60 ? `${event.target.value.length}/${MSG_MAX}` : '' } })
  // (taps in the sheet never reach the world under it)
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) sheet.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) banner.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  wirePress()
  banner.addEventListener('click', () => { const id = pingFor; hidePing(); if (id) openChat(id) })
  // The phone's keyboard: the sheet rides up above it and never grows past what is left of the screen.
  const vv = window.visualViewport
  const lift = () => {
    // (only a real keyboard counts: 80 px or more of the screen gone, at normal zoom; anything else, such as a
    // pinch or a passing resize, leaves the sheet as it is)
    const gone = vv && Math.abs((vv.scale || 1) - 1) < 0.01 ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
    const kb = gone >= 80 && vv.height >= 200 ? gone : 0
    sheet.style.bottom = `${kb}px`
    if (kb) sheet.style.setProperty('--cht-room', `${Math.round(vv.height - 56)}px`)
    else sheet.style.removeProperty('--cht-room')
  }
  mark = () => requestAnimationFrame(() => {
    // (where the sheet's top edge is: the scenes move their picture up to keep you in view above it)
    if (view && !sheet.hidden) document.body.dataset.chatTop = String(Math.round(sheet.getBoundingClientRect().top))
    else delete document.body.dataset.chatTop
  })
  vv?.addEventListener('resize', () => mark())
  window.addEventListener('resize', () => mark())
  vv?.addEventListener('resize', lift)
  vv?.addEventListener('scroll', lift)
  lift()

  onThreads((kind, detail) => {
    if (kind === 'ping') { ping(detail); return }
    if (kind === 'typing') { if (detail === view) paintTyping(); return }
    // (follow-ups) what became of an ask you sent: "added" or "can't right now", nothing more
    if (kind === 'answers') { for (const a of detail) window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: a.added ? `${first(a.name)} was added to ${a.group}.` : `${first(a.name)} can’t right now.` } })); return }
    if (kind === 'refs') { window.dispatchEvent(new CustomEvent('mzansi-invite-paid', { detail: { names: detail } })); return }
    if (kind === 'list') paintAsk()
    if (kind === 'first') {
      // (came in through an invite link: straight into the group, now that the quick start is behind them)
      // (Social B: "+N followers while you were away")
      newFollowers().then((n) => { if (n > 0) window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: `+${n} follower${n === 1 ? '' : 's'} while you were away` } })) })
      const code = waitingInvite()
      if (code && socialReady()) { joinByCode(code).then((r) => { if (r.ok || ['unknown', 'full', 'blocked', 'removed'].includes(r.reason)) clearInvite(); if (r.ok) openChat(r.thread); else if (r.reason === 'full') { openChat(); tell('That group is full (40 members).', true) } else if (r.reason === 'removed') { openChat(); tell('You can’t join this group.', true) } }); return }
      wakeUp()
      return
    }
    paintBadges()
    if (!view) return
    if (kind === 'list') {
      // (the thread on screen was closed for you: a block)
      if (view !== 'list' && detail?.gone?.includes(view)) { show('list'); return }
      if (view === 'list') { if (!sheet.querySelector('.cht-new input:focus')) paintList() }
      else if (view === 'board') { /* (a Board repaints itself) */ }
      else if (panel) { if (!sheet.querySelector('.cht-info input:focus')) paintInfo() }
      else paintHead()
    }
    if (kind === 'lines' && detail === view) paintLines()
  })
  // The chat button in the top bar and the menu (main.js), a ping, a player's card.
  window.addEventListener('mzansi-open-threads', (event) => {
    const d = event.detail || {}
    if (d.dm) openDm(d.dm, d.who)
    else if (d.board) { mountThreads(); hidePing(); tab = 'feed'; openBoardOf(d.board, d.who || {}, repaintBoard); show('board') }
    else if (d.feed) { tab = 'feed'; openChat() }
    else if (d.addTo) { pickFor = { id: d.addTo, who: d.who || {} }; tab = 'chats'; openChat() }
    else if (d.friends) { tab = 'friends'; openChat() }
    else openChat(d.thread || '')
  })
  paintBadges()
}

// Open the sheet: on the list, or straight on a thread.
export function openChat(threadId = '') {
  mountThreads()
  // (the nearby-chat panel shares the bottom of the screen: it steps aside)
  document.querySelector('.chat-panel:not([hidden]) .chat-x')?.click()
  hidePing()
  show(threadId && threadOf(threadId) ? threadId : 'list')
  if (chatStatus() !== 'ready') sync()
}
export async function openDm(otherId, who = {}) {
  mountThreads()
  const res = await dmWith(otherId, who)
  if (!res.ok) { openChat(); tell(res.note, true); return }
  openChat(res.thread)
}
export function closeChat() {
  if (!view) return
  view = ''
  acts = null
  pickFor = null
  closeThread()
  sheet.hidden = true
  sheet.querySelector('input')?.blur()
  document.body.removeAttribute('data-chat')
  mark()
}
export const chatOpen = () => Boolean(view)

function show(next) {
  view = next
  acts = null
  note = ''
  panel = ''
  members = null
  invite = null
  leaving = false
  making = false
  if (next !== 'list') pickFor = null
  sheet.hidden = false
  sheet.dataset.view = next === 'list' && tab !== 'feed' ? 'list' : 'thread'
  document.body.dataset.chat = '1'
  if (next !== 'board') closeBoard()
  if (next === 'list') { closeThread(); paintList(); if (tab === 'feed') refreshFeed(repaintBoard) }
  else if (next === 'board') { closeThread(); paintBoard() }
  else { paintThread(); openThread(next) }
  mark()
}
function tell(text, bad = false) {
  note = text || ''
  noteBad = bad
  const el = sheet.querySelector('.cht-note')
  if (el) { el.textContent = note; el.classList.toggle('bad', bad); el.hidden = !note }
}

// ---------- The Feed and a Board (Social B) ----------
function paintBoard() {
  sheet.innerHTML = `${boardHtml()}<p class="cht-note${noteBad ? ' bad' : ''}" role="status"${note ? '' : ' hidden'}>${esc(note)}</p>`
  mark()
}
// (after a stamp, a follow, a post, or when what was asked for has arrived)
function repaintBoard() {
  if (view === 'board') { if (!sheet.querySelector('.bd-new input:focus')) paintBoard() } else if (view === 'list' && tab === 'feed') paintList()
}
const boardCtx = {
  repaint: repaintBoard,
  tell: (text, bad) => tell(text, bad),
  openThread: (id) => show(id),
  showBoard: (id, who) => { openBoardOf(id, who, repaintBoard); show('board') },
}

// ---------- The list ----------
const dot = (on) => `<i class="cht-dot${on ? ' on' : ''}" aria-label="${on ? 'online' : 'offline'}"></i>`
function paintList() {
  const status = chatStatus()
  const all = threadList()
  const here = peerList().filter((p) => !isBlocked(p.id)).slice(0, 12)
  const pals = friendList()
  const online = pals.filter((f) => f.mutual && f.online).length
  const row = (t) => {
    const last = t.last
    const who = !last ? '' : last.sender === myId() ? 'You: ' : t.kind === 'group' ? `${first(last.name)}: ` : ''
    // (Chat V2: what each row is, in plain words. The Quad always reads its hot topic; an interest's standing group
    // says "Interest group" under its name; a group a player made says "Group".)
    const kind = t.quad ? '' : String(t.id).startsWith('i:') ? 'Interest group' : t.kind === 'group' ? 'Group' : ''
    const text = t.quad && t.topic ? `\u{1F525} Hot topic: ${t.topic}` : last ? `${who}${last.body}` : t.kind === 'group' && t.topic ? `\u{1F4CC} ${t.topic}` : 'Say howzit'
    return `<li><button type="button" class="cht-row${t.unread && !t.muted ? ' unread' : ''}" data-thread="${esc(t.id)}" data-kind="${t.quad ? 'quad' : kind ? (kind === 'Group' ? 'group' : 'interest') : 'dm'}">
      <span class="cht-av">${t.kind === 'group' ? GROUP_FACE : face(t.peer?.look)}</span>
      <span class="cht-mid"><b>${esc(t.name)}${t.muted ? ' <span class="cht-muted" aria-label="muted">\u{1F515}</span>' : ''}</b>${kind ? `<small class="cht-kind">${kind}</small>` : ''}<span class="cht-last">${esc(text)}</span></span>
      <span class="cht-side"><small>${esc(last ? clock(last.at) : '')}</small>${t.unread && !t.muted ? `<small class="cht-badge" aria-label="${t.unread} unread">${t.unread > 99 ? '99+' : t.unread}</small>` : ''}</span>
    </button></li>`
  }
  const empty = status === 'soon' ? 'Chat opens soon. Check back in a bit.'
    : status === 'offline' ? 'Can’t reach the chat right now. Check your connection.'
      : status === 'ready' ? 'No chats yet. Tap someone under “Here now” to message them.' : 'Loading your chats…'
  let body
  if (tab === 'feed' && !pickFor) {
    body = feedHtml()
  } else if (pickFor) {
    // a player's card asked: which of your groups?
    const mine = all.filter((t) => t.kind === 'group' && !t.quad)
    body = `<p class="cht-sub">Add ${esc(first(pickFor.who.name))} to which group?</p>
      ${mine.length ? `<ol class="cht-list">${mine.map((t) => `<li><button type="button" class="cht-row" data-pick="${esc(t.id)}"><span class="cht-av">${GROUP_FACE}</span><span class="cht-mid"><b>${esc(t.name)}</b><span class="cht-last">${t.members || 1} of 40 members</span></span><span class="cht-side"><small class="cht-add">Add</small></span></button></li>`).join('')}</ol>` : '<p class="cht-empty">You have no groups yet. Make one first: “New group”.</p>'}
      <p class="cht-rowbtns"><button type="button" class="cht-btn" data-ct="new">＋ New group</button><button type="button" class="cht-btn ghost" data-ct="pick-x">Cancel</button></p>`
  } else if (tab === 'friends') {
    const strangers = here.filter((p) => !isFriend(p.id))
    body = `${pals.length ? `<ol class="cht-list cht-friends">${pals.map((f) => `<li class="cht-friend" data-friend="${esc(f.id)}">
        <span class="cht-av cht-sm">${face(f.look, 36)}</span>
        <span class="cht-mid"><b>${esc(f.name)} ${f.mutual && f.online !== undefined ? dot(f.online) : ''}</b><span class="cht-last">${f.spot ? 'Sharing where they are today' : f.mutual && f.online ? 'Online now' : f.handle ? `@${esc(f.handle)}` : f.mutual ? 'Not on right now' : 'On your list'}</span></span>
        ${f.spot ? `<button type="button" class="cht-btn sm" data-goto="${esc(f.id)}">Go to</button>` : ''}
        <button type="button" class="cht-btn sm${f.spot ? ' ghost' : ''}" data-dm="${esc(f.id)}">Message</button>
        <button type="button" class="cht-btn sm ghost" data-unfriend="${esc(f.id)}" aria-label="Remove ${esc(f.name)} from your friends">✕</button>
      </li>`).join('')}</ol>` : `<p class="cht-empty">${socialReady() ? 'No friends yet. Add someone who is here now, or from their card.' : 'Friends open soon.'}</p>`}
      ${strangers.length ? `<div class="cht-here"><small>Here now: add a friend</small><div class="cht-here-row">${strangers.map((p) => `<button type="button" class="cht-person" data-befriend="${esc(p.id)}" aria-label="Add ${esc(p.name)} as a friend"><span class="cht-av cht-sm">${face(p.look, 36)}</span><small>＋ ${esc(first(p.name))}</small></button>`).join('')}</div></div>` : ''}`
  } else {
    body = `${here.length ? `<div class="cht-here"><small>Here now</small><div class="cht-here-row">${here.map((p) => `<button type="button" class="cht-person" data-dm="${esc(p.id)}" aria-label="Message ${esc(p.name)}"><span class="cht-av cht-sm">${face(p.look, 36)}</span><small>${esc(first(p.name))}</small></button>`).join('')}</div></div>` : ''}
    ${making ? `<form class="cht-new" autocomplete="off"><input type="text" name="group" maxlength="40" placeholder="Group name" aria-label="Group name" enterkeyhint="done"><button type="submit" class="cht-btn">Create</button><button type="button" class="cht-btn ghost" data-ct="new-x" aria-label="Cancel">✕</button></form>` : ''}
    ${all.length ? `<ol class="cht-list">${all.map(row).join('')}</ol>` : `<p class="cht-empty">${esc(empty)}</p>`}`
  }
  sheet.innerHTML = `<header class="cht-head"><b class="cht-h">${pickFor ? 'Add to a group' : 'Chats'}</b>${pickFor || making ? '' : '<button type="button" class="cht-btn sm" data-ct="new">＋ Group</button>'}<button type="button" class="cht-x" data-ct="close" aria-label="Close chat">✕</button></header>
    ${pickFor ? '' : `<div class="cht-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab === 'chats'}" data-tab="chats">Chats</button><button type="button" role="tab" aria-selected="${tab === 'friends'}" data-tab="friends">Friends${online ? ` <small>${online} online</small>` : ''}</button><button type="button" role="tab" aria-selected="${tab === 'feed'}" data-tab="feed">Feed</button></div>`}
    ${body}
    <p class="cht-note${noteBad ? ' bad' : ''}" role="status"${note ? '' : ' hidden'}>${esc(note)}</p>`
  if (making) sheet.querySelector('.cht-new input')?.focus({ preventScroll: true })
  mark()
}

// ---------- A thread ----------
// Loops: a group's flame (days running with 3 or more members active), in its header.
const flameHtml = (t) => (Number(t?.flame) > 0 ? `<span class="cht-flame" title="Days running with 3 or more of you active" aria-label="${t.flame} day group streak">\u{1F525} ${t.flame}</span>` : '')
function headHtml(t) {
  // (a DM: "online" for a friend both ways who is on right now, as the server says; a group: how many are in it)
  const pal = t?.kind === 'dm' ? friendList().find((f) => f.id === t.peer?.id) : null
  const on = Boolean(pal?.mutual && pal.online)
  const sub = !t ? '' : t.kind === 'group' ? `${t.members || 1} member${t.members === 1 ? '' : 's'}` : on ? 'online' : t.peer?.handle ? `@${t.peer.handle}` : 'Direct message'
  return `<button type="button" class="cht-back" data-ct="back" aria-label="Back to chats">‹</button>
    <span class="cht-av cht-sm">${!t || t.kind === 'group' ? GROUP_FACE : face(t.peer?.look, 36)}</span>
    ${t?.kind === 'group' && !t.quad ? `<button type="button" class="cht-title cht-open" data-ct="info" aria-label="${esc(t.name)}: members and settings"><b>${esc(t.name)} ›</b><small>${esc(sub)}${t.muted ? ' · muted' : ''}</small></button>${flameHtml(t)}` : `<span class="cht-title"><b>${esc(t?.name || 'Chat')}</b><small${on ? ' class="cht-on"' : ''}>${esc(sub)}</small></span>`}
    ${t?.kind === 'dm' && t.peer?.id ? `<button type="button" class="cht-btn sm" data-ct="walk" data-walk-id="${esc(t.peer.id)}" data-walk-name="${esc(t.peer.name || 'Student')}" aria-label="Walk with me">\u{1F6B6} Walk</button>` : ''}
    <button type="button" class="cht-x" data-ct="close" aria-label="Close chat">✕</button>`
}
function paintThread() {
  const t = threadOf(view)
  sheet.innerHTML = `<header class="cht-head">${headHtml(t)}</header>
    <p class="cht-pin"${t?.kind === 'group' && t.topic ? '' : ' hidden'}><span aria-hidden="true">\u{1F4CC}</span><span class="cht-topic">${esc(t?.topic || '')}</span></p>
    <ol class="cht-lines" aria-live="polite"></ol>
    <p class="cht-typing" role="status" hidden></p>
    <div class="cht-acts" hidden></div>
    <form class="cht-form" autocomplete="off">
      <span class="cht-bar"><input type="text" name="msg" maxlength="${MSG_MAX}" placeholder="Message" enterkeyhint="send" aria-label="Message"><small class="cht-count"></small></span>
      <button type="submit" class="cht-send" aria-label="Send"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" fill="currentColor"/></svg></button>
    </form>
    <p class="cht-note" role="status" hidden></p>`
  paintLines(true)
  paintTyping()
}
// "Bonga is typing…" under the messages (DMs, and groups of up to eight).
function paintTyping() {
  const el = sheet?.querySelector('.cht-typing')
  if (!el) return
  const t = threadOf(view)
  const who = t && canType(t) ? typingIn(view) : ''
  el.hidden = !who
  el.textContent = who ? (t.kind === 'dm' ? 'typing…' : `${who} is typing…`) : ''
}

// A group's page: who is in it, the pinned topic (its creator changes it), add people, invite by WhatsApp, mute, leave.
function paintInfo() {
  const t = threadOf(view)
  if (!t) { show('list'); return }
  const mine = t.creator === myId()
  const inIt = new Set((members || []).map((m) => m.id))
  const can = [...friendList(), ...peerList().filter((p) => !isFriend(p.id) && !isBlocked(p.id))].filter((p) => !inIt.has(p.id))
  const person = (m, extra = '') => `<li class="cht-friend"><span class="cht-av cht-sm">${face(m.look, 36)}</span><span class="cht-mid"><b>${esc(m.name)} ${m.online === undefined ? '' : dot(m.online)}</b><span class="cht-last">${m.creator ? 'Made the group' : m.handle ? `@${esc(m.handle)}` : ''}</span></span>${extra}</li>`
  const main = panel === 'add'
    ? `<p class="cht-sub">Add people to ${esc(t.name)} (${t.members || 1} of 40)</p>
      ${can.length ? `<ol class="cht-list cht-friends">${can.map((p) => person(p, `<button type="button" class="cht-btn sm" data-add="${esc(p.id)}">Add</button>`)).join('')}</ol>` : '<p class="cht-empty">Nobody to add yet: your friends and the people here now show up in this list.</p>'}
      <p class="cht-rowbtns"><button type="button" class="cht-btn ghost" data-ct="info">Done</button></p>`
    : `${mine ? `<form class="cht-topicform cht-renameform" autocomplete="off"><label><small>Group name</small><input type="text" name="gname" maxlength="40" value="${esc(t.name)}" enterkeyhint="done"></label><button type="submit" class="cht-btn sm">Rename</button></form>` : ''}
      <form class="cht-topicform" autocomplete="off"><label><small>Pinned topic</small>${mine ? `<input type="text" name="topic" maxlength="120" value="${esc(t.topic || '')}" placeholder="What is this group talking about?" enterkeyhint="done">` : `<span class="cht-topicro">${esc(t.topic || 'Nothing pinned yet.')}</span>`}</label>${mine ? '<button type="submit" class="cht-btn sm">Pin</button>' : ''}</form>
      ${socialCReady() && mine ? `<div class="cht-openrow" data-listed="${t.listed ? '1' : '0'}"><p class="cht-sub">Who can find this group</p>
        <p class="cht-rowbtns"><button type="button" class="cht-btn${t.listed ? ' ghost' : ''}" data-ct="private">Private${t.listed ? '' : ' ✓'}</button><button type="button" class="cht-btn${t.listed ? '' : ' ghost'}" data-ct="open">${t.listed ? `Open: ${esc(INTERESTS.interests.find((i) => i.id === t.tag)?.label || t.tag || '')} ✓` : 'Open'}</button></p>
        ${opening ? `<p class="cht-sub">Open groups are suggested to players who picked this interest</p><p class="cht-tags">${INTERESTS.interests.map((i) => `<button type="button" class="cht-btn sm ghost" data-tag="${esc(i.id)}">${esc(i.emoji)} ${esc(i.label)}</button>`).join('')}</p>` : ''}</div>` : ''}
      <p class="cht-rowbtns">
        <button type="button" class="cht-btn" data-ct="add">＋ Add people</button>
        ${invite ? `<a class="cht-btn wa" href="${esc(invite.wa)}" target="_blank" rel="noopener" data-wa>Open WhatsApp ›</a>` : '<button type="button" class="cht-btn wa" data-ct="invite">Invite by WhatsApp</button>'}
      </p>
      ${invite ? `<p class="cht-link"><span>${esc(invite.url)}</span><button type="button" class="cht-btn sm ghost" data-ct="copy">Copy link</button></p>` : ''}
      <p class="cht-sub">${members ? `${members.length} of 40 members` : 'Loading members…'}</p>
      <ol class="cht-list cht-friends">${(members || []).map((m) => person(m, m.id === myId() ? '<small class="cht-you">You</small>' : `<button type="button" class="cht-btn sm ghost" data-dm="${esc(m.id)}">Message</button>${mine ? `<button type="button" class="cht-btn sm ghost bad" data-kick="${esc(m.id)}">${kickFor === m.id ? 'Tap again' : 'Remove'}</button>` : ''}`)).join('')}</ol>
      <p class="cht-rowbtns">
        <button type="button" class="cht-btn ghost" data-ct="mute" aria-pressed="${Boolean(t.muted)}">${t.muted ? '\u{1F514} Unmute' : '\u{1F515} Mute'}</button>
        <button type="button" class="cht-btn ghost bad" data-ct="leave">${leaving ? 'Tap again to leave' : 'Leave group'}</button>
        ${socialCReady() && !mine ? `<button type="button" class="cht-btn ghost bad" data-ct="report-group">${reporting ? 'Tap again to report' : '⚑ Report name or topic'}</button>` : ''}
      </p>`
  sheet.innerHTML = `<header class="cht-head"><button type="button" class="cht-back" data-ct="${panel === 'add' ? 'info' : 'thread'}" aria-label="Back">‹</button>
      <span class="cht-av cht-sm">${GROUP_FACE}</span><span class="cht-title"><b>${esc(t.name)}</b><small>${t.members || 1} member${t.members === 1 ? '' : 's'}</small></span>
      <button type="button" class="cht-x" data-ct="close" aria-label="Close chat">✕</button></header>
    <div class="cht-info">${main}</div>
    <p class="cht-note${noteBad ? ' bad' : ''}" role="status"${note ? '' : ' hidden'}>${esc(note)}</p>`
  mark()
}
function openInfo(next = 'info') {
  panel = next
  leaving = false
  kickFor = ''
  opening = false
  reporting = false
  paintInfo()
  const id = view
  groupMembers(id).then((list) => { if (view === id && panel) { members = list; if (!sheet.querySelector('.cht-info input:focus')) paintInfo() } })
}
function paintHead() {
  const t = threadOf(view)
  const head = sheet.querySelector('.cht-head')
  if (!t || !head || view === 'list') return
  head.innerHTML = headHtml(t)
  const pin = sheet.querySelector('.cht-pin')
  if (pin) { pin.hidden = !(t.kind === 'group' && t.topic); pin.querySelector('.cht-topic').textContent = t.topic || '' }
}
function paintLines(jump = false) {
  const box = sheet.querySelector('.cht-lines')
  if (!box) return
  const t = threadOf(view)
  const { lines, people } = linesOf(view)
  const me = myId()
  const nearEnd = jump || box.scrollHeight - box.scrollTop - box.clientHeight < 80
  let prev = ''
  box.innerHTML = lines.length ? lines.map((l) => {
    const mine = l.sender === me
    const lead = l.sender !== prev
    prev = l.sender
    if (mine) return `<li class="me${lead ? ' lead' : ''}"><div class="cht-bub"><span class="cht-text">${esc(l.body)}</span><small class="cht-time">${esc(timeOf(l.at))}</small></div></li>`
    const p = people[l.sender] || (t?.peer?.id === l.sender ? t.peer : {})
    const name = p.name || 'Student'
    const who = t?.kind === 'group' ? ` data-dm="${esc(l.sender)}" aria-label="Message ${esc(name)}"` : ' tabindex="-1"'
    return `<li class="them${lead ? ' lead' : ''}">${lead && t?.kind === 'group' ? `<button type="button" class="cht-who"${who}><span class="cht-av cht-xs">${face(p.look, 30)}</span></button>` : t?.kind === 'group' ? '<span class="cht-gap"></span>' : ''}
      <div class="cht-col"><div class="cht-bub" data-line="${l.id}" data-sender="${esc(l.sender)}" data-name="${esc(name)}">${lead && t?.kind === 'group' ? `<small class="cht-name">${esc(name)}</small>` : ''}<span class="cht-text">${esc(l.body)}</span><small class="cht-time">${esc(timeOf(l.at))}</small></div></div></li>`
  }).join('') : `<li class="cht-none"><span>${t?.kind === 'group' ? 'Nobody has said anything yet. Start it off!' : `Say howzit to ${esc(first(t?.name))}.`}</span></li>`
  paintTyping()
  if (nearEnd) box.scrollTop = box.scrollHeight
}
function paintActs() {
  const el = sheet.querySelector('.cht-acts')
  if (!el) return
  el.hidden = !acts
  if (!acts) { el.innerHTML = ''; return }
  el.innerHTML = `<p>“${esc(acts.body.length > 70 ? `${acts.body.slice(0, 70)}…` : acts.body)}” <small>${esc(first(acts.name))}</small></p>
    <button type="button" class="bad" data-ct="report">⚑ Report</button>
    <button type="button" class="bad" data-ct="block">\u{1F6AB} Block ${esc(first(acts.name))}</button>
    <button type="button" data-ct="acts-x">Cancel</button>`
}

// Long-press one of their messages (or right-click it on a computer): Report or Block.
function wirePress() {
  let timer = 0
  let at = null
  // (the finger that opened the menu is still down, and the menu may have opened under it: its buttons take no
  // tap until that finger is up and a moment has passed, so lifting it can never report or block by accident)
  const cancel = () => { clearTimeout(timer); timer = 0; at = null; if (guardUntil === Infinity) guardUntil = performance.now() + 350 }
  const menu = (bub, held) => {
    acts = { line: Number(bub.dataset.line), sender: bub.dataset.sender, name: bub.dataset.name, body: bub.querySelector('.cht-text')?.textContent || '' }
    guardUntil = held ? Infinity : performance.now() + 350
    paintActs()
  }
  sheet.addEventListener('pointerdown', (event) => {
    const bub = event.target.closest?.('.them .cht-bub[data-line]')
    cancel()
    if (!bub) return
    at = { x: event.clientX, y: event.clientY }
    timer = setTimeout(() => { timer = 0; menu(bub, true) }, 500)
  })
  sheet.addEventListener('pointermove', (event) => { if (at && Math.hypot(event.clientX - at.x, event.clientY - at.y) > 10) cancel() })
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) sheet.addEventListener(type, cancel)
  sheet.addEventListener('scroll', cancel, true)
  sheet.addEventListener('contextmenu', (event) => {
    const bub = event.target.closest?.('.them .cht-bub[data-line]')
    if (!bub) return
    event.preventDefault()
    if (acts && guardUntil === Infinity) return // (a held finger already opened it)
    cancel()
    menu(bub, false)
  })
}

function onClick(event) {
  event.stopPropagation()
  const ct = event.target.closest('[data-ct]')?.dataset.ct
  if (ct === 'close') { closeChat(); return }
  if (ct === 'back') { show('list'); return }
  const tabBtn = event.target.closest('[data-tab]')
  if (tabBtn) { tab = tabBtn.dataset.tab; making = false; note = ''; show('list'); return }
  if (ct === 'feed') { tab = 'feed'; show('list'); return }
  if (ct === 'interests') { window.dispatchEvent(new CustomEvent('mzansi-interests')); return }
  if ((view === 'board' || (view === 'list' && tab === 'feed')) && boardClick(event, boardCtx)) return
  if (ct === 'new') {
    if (!socialReady()) { tell('Groups open soon.', true); return }
    tab = 'chats'; making = true; const keep = pickFor; pickFor = null; paintList(); pickFor = keep; return
  }
  if (ct === 'new-x') { making = false; paintList(); return }
  if (ct === 'pick-x') { pickFor = null; paintList(); return }
  if (ct === 'thread') { const id = view; panel = ''; paintThread(); openThread(id); mark(); return }
  if (ct === 'info') { openInfo('info'); return }
  if (ct === 'add') { openInfo('add'); return }
  if (ct === 'walk') { const b = event.target.closest('[data-walk-id]'); window.dispatchEvent(new CustomEvent('mzansi-walk-ask', { detail: { id: b.dataset.walkId, name: b.dataset.walkName } })); return }
  // Social C: "Go to" a friend who shares; a group Open or Private; report a group's name or topic.
  const goto = event.target.closest('[data-goto]')
  if (goto) { const id = goto.dataset.goto; closeChat(); window.dispatchEvent(new CustomEvent('mzansi-find-go', { detail: { id } })); return }
  if (ct === 'open') { opening = !opening; paintInfo(); return }
  if (ct === 'private') { opening = false; setGroupOpen(view, false).then((r) => { tell(r.ok ? 'Private: only people you add or invite.' : r.note, !r.ok); if (panel) paintInfo() }); return }
  const tag = event.target.closest('[data-tag]')
  if (tag && panel) { opening = false; setGroupOpen(view, true, tag.dataset.tag).then((r) => { tell(r.ok ? 'Open: players who like this can be offered it.' : r.note, !r.ok); if (panel) paintInfo() }); return }
  if (ct === 'report-group') {
    if (!reporting) { reporting = true; paintInfo(); return }
    reporting = false
    reportGroup(view, 'name or topic').then((r) => { tell(r.ok ? 'Reported. Thank you.' : r.note || 'Couldn’t report that right now.', !r.ok); if (panel) paintInfo() })
    return
  }
  if (ct === 'mute') { const t = threadOf(view); muteThread(view, !t?.muted).then((r) => { if (!r.ok) tell(r.note, true); else if (panel) paintInfo() }); return }
  if (ct === 'leave') {
    if (!leaving) { leaving = true; paintInfo(); return }
    const id = view
    leaveGroup(id).then((r) => { if (r.ok) { if (view === id) show('list'); tell('You left the group.') } else tell(r.note, true) })
    return
  }
  if (ct === 'invite') {
    inviteLink(view).then((r) => { if (!r.ok) { tell(r.note, true); return } invite = r; if (panel) paintInfo() })
    return
  }
  if (ct === 'copy' && invite) { navigator.clipboard?.writeText(invite.url).then(() => tell('Link copied.'), () => tell(invite.url)); return }
  const kick = event.target.closest('[data-kick]')
  if (kick) {
    const id = kick.dataset.kick
    if (kickFor !== id) { kickFor = id; paintInfo(); return }
    kickFor = ''
    removeMember(view, id).then((r) => { tell(r.ok ? 'Removed. The link won’t let them back in.' : r.note, !r.ok); if (r.ok) openInfo('info') })
    return
  }
  const adder = event.target.closest('[data-add]')
  if (adder) {
    const id = adder.dataset.add
    adder.disabled = true
    addToGroup(view, id).then((r) => { tell(r.ok ? (r.added ? 'Added.' : 'Asked. They get a card to join.') : r.note, !r.ok); if (r.ok && r.added) openInfo('add') })
    return
  }
  const pick = event.target.closest('[data-pick]')
  if (pick && pickFor) {
    const { id, who } = pickFor
    const thread = pick.dataset.pick
    addToGroup(thread, id).then((r) => { if (r.ok) { pickFor = null; show(thread); tell(r.added ? `${first(who.name)} is in the group.` : `Asked ${first(who.name)}. They get a card to join.`) } else tell(r.note, true) })
    return
  }
  const befriend = event.target.closest('[data-befriend]')
  if (befriend) {
    const id = befriend.dataset.befriend
    const who = peerList().find((p) => p.id === id) || {}
    window.dispatchEvent(new CustomEvent('mzansi-friend-add', { detail: { id, who } }))
    addFriend(id, who).then((r) => { if (!r.ok && r.reason !== 'unknown') tell(r.note || 'Couldn’t add them.', true) })
    return
  }
  const unfriend = event.target.closest('[data-unfriend]')
  if (unfriend) {
    const id = unfriend.dataset.unfriend
    window.dispatchEvent(new CustomEvent('mzansi-friend-remove', { detail: { id } }))
    removeFriend(id)
    return
  }
  if (event.target.closest('.cht-acts') && performance.now() < guardUntil) return
  if (ct === 'acts-x') { acts = null; paintActs(); return }
  if (ct === 'report' && acts) {
    const a = acts
    acts = null
    paintActs()
    tell('Thanks. A moderator will look at it.')
    reportLine(a.line).then((ok) => { if (!ok) window.dispatchEvent(new CustomEvent('mzansi-chat-report', { detail: { id: a.sender, message: a.body } })) })
    return
  }
  if (ct === 'block' && acts) {
    const a = acts
    acts = null
    paintActs()
    // (main.js blocks them everywhere: their body, bubbles and card too; it calls blockInChat)
    tell(`Blocked. You won’t see ${first(a.name)} any more.`)
    if (window.dispatchEvent(new CustomEvent('mzansi-chat-block', { detail: { id: a.sender, name: a.name }, cancelable: true }))) blockInChat(a.sender)
    return
  }
  const row = event.target.closest('[data-thread]')
  if (row) { show(row.dataset.thread); return }
  const dm = event.target.closest('[data-dm]')
  if (dm) {
    const id = dm.dataset.dm
    const known = peerList().find((p) => p.id === id) || friendList().find((f) => f.id === id) || (members || []).find((m) => m.id === id) || linesOf(view).people[id] || {}
    openDm(id, known)
  }
}
async function onSubmit(event) {
  event.preventDefault()
  if (boardSubmit(event, boardCtx)) return
  if (event.target.matches('.cht-new')) {
    const name = event.target.elements.group.value
    const res = await createGroup(name)
    if (!res.ok) { tell(res.note, true); return }
    making = false
    const adding = pickFor
    pickFor = null
    if (adding) { const r = await addToGroup(res.thread, adding.id); show(res.thread); tell(r.ok ? (r.added ? `${first(adding.who.name)} is in the group.` : `Asked ${first(adding.who.name)}. They get a card to join.`) : r.note, !r.ok); return }
    show(res.thread)
    openInfo('add')
    return
  }
  if (event.target.matches('.cht-renameform')) {
    const res = await renameGroup(view, event.target.elements.gname?.value || '')
    tell(res.ok ? 'Renamed.' : res.note, !res.ok)
    if (res.ok) paintInfo()
    return
  }
  if (event.target.matches('.cht-topicform')) {
    const res = await setTopic(view, event.target.elements.topic?.value || '')
    tell(res.ok ? 'Pinned.' : res.note, !res.ok)
    return
  }
  const input = sheet.querySelector('.cht-form input')
  if (!input || sending || view === 'list' || !view) return
  const text = input.value
  if (!text.trim()) return
  sending = true
  const id = view
  const res = await sendLine(id, text)
  sending = false
  if (view !== id) return
  if (res.ok) {
    input.value = ''
    const c = sheet.querySelector('.cht-count')
    if (c) c.textContent = ''
    paintLines(true)
  }
  tell(res.note, !res.ok || Boolean(res.note))
}

// ---------- The ping ----------
function ping({ thread, line }) {
  if (!thread || !line || thread.id === openThreadId() || isBlocked(line.sender)) return
  mountThreads()
  pingFor = thread.id
  const group = thread.kind === 'group'
  const words = line.body.length > 64 ? `${line.body.slice(0, 64)}…` : line.body
  banner.innerHTML = `<span class="cht-av cht-sm">${group ? GROUP_FACE : face(thread.peer?.look, 36)}</span>
    <span class="cht-ping-t"><b>${esc(group ? `${first(line.name)} · ${thread.name}` : thread.name)}</b><span>${esc(words)}</span></span><i class="cht-ping-go" aria-hidden="true">›</i>`
  // (Chat V2: it drops in just below the top bar, so the bar and its count stay in view; with no bar, at the top)
  const bar = document.querySelector('#app .g-hud.tb')
  const under = bar && bar.getBoundingClientRect().height > 0 ? Math.round(bar.getBoundingClientRect().bottom) : 0
  banner.style.top = under ? `${under}px` : ''
  banner.dataset.under = under ? 'bar' : 'top'
  // (one short buzz, where the phone allows it: never on a muted phone setting of ours)
  try { if (localStorage.getItem('mzansiville.sound') !== 'off') navigator.vibrate?.(60) } catch { /* not allowed here */ }
  banner.setAttribute('aria-label', `New message from ${group ? first(line.name) : thread.name}: ${words}. Open the chat`)
  banner.hidden = false
  banner.classList.remove('in')
  void banner.offsetWidth
  banner.classList.add('in')
  banner.dataset.n = String((Number(banner.dataset.n) || 0) + 1)
  play('ping', 400)
  clearTimeout(pingTimer)
  pingTimer = setTimeout(hidePing, 5000)
}
function hidePing() {
  clearTimeout(pingTimer)
  pingFor = ''
  if (banner) banner.hidden = true
}

// An ask (follow-ups): "[Name] wants to add you to [Group]. Join / No thanks." One card at a time; the next ask
// shows once this one is answered. Nobody is in a group until they tap Join.
function paintAsk() {
  const a = groupAsks()[0]
  const shown = document.querySelector('.cht-ask')
  if (!a) { shown?.remove(); return }
  if (shown) { if (Number(shown.dataset.ask) === a.id) return; shown.remove() }
  const el = document.createElement('div')
  el.className = 'cht-ask'
  el.dataset.ask = String(a.id)
  el.setAttribute('role', 'status')
  el.innerHTML = `<p><b>${esc(first(a.from))}</b> wants to add you to <b>${esc(a.group)}</b>.</p><div class="cht-ask-row"><button type="button" class="cht-btn" data-ask="join">Join</button><button type="button" class="cht-btn ghost" data-ask="no">No thanks</button></div>`
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  el.addEventListener('click', (event) => {
    const k = event.target.closest('[data-ask]')?.dataset.ask
    if (!k) return
    el.remove()
    answerAsk(a.id, k === 'join').then((r) => {
      if (k !== 'join') return
      if (r.ok && r.thread) openChat(r.thread)
      else window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: r.reason === 'full' ? 'That group is full (40 members).' : 'That invite has gone.' } }))
    })
  })
  document.body.append(el)
}

// Wake-up (Social A): on the first open of the day, if your groups have unread messages, one small card:
// "Your groups said N things". Tapping it opens the chat. Once a day per phone.
function wakeUp(tries = 0) {
  // (not over the loading curtain: once the place is on screen)
  if (curtainUp() && tries < 60) { setTimeout(() => wakeUp(tries + 1), 500); return }
  const n = groupUnread()
  const day = new Date().toDateString()
  let seen = ''
  try { seen = localStorage.getItem('mzansiville.wake') || '' } catch { /* fine */ }
  if (!n || seen === day || view) return
  try { localStorage.setItem('mzansiville.wake', day) } catch { /* fine */ }
  document.querySelector('.cht-wake')?.remove()
  const el = document.createElement('div')
  el.className = 'cht-wake'
  el.setAttribute('role', 'status')
  el.innerHTML = `<button type="button" class="cht-wake-go"><span aria-hidden="true">\u{1F4AC}</span><span><b>Your groups said ${n} thing${n === 1 ? '' : 's'}</b><small>Tap to catch up</small></span></button><button type="button" class="cht-wake-x" aria-label="Close">✕</button>`
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  el.querySelector('.cht-wake-go').addEventListener('click', () => { el.remove(); tab = 'chats'; openChat() })
  el.querySelector('.cht-wake-x').addEventListener('click', () => el.remove())
  document.body.append(el)
}

// The unread count on the top bar's chat button and in the menu ([data-chat-unread]).
export function paintBadges() {
  const n = unreadTotal()
  for (const el of document.querySelectorAll('[data-chat-unread]')) {
    el.textContent = n ? (n > 99 ? '99+' : String(n)) : ''
    el.hidden = !n
    // (Chat V2: it pulses while there is something unread and the chat is shut; opening the chat stills it)
    el.classList.toggle('pulse', Boolean(n) && !view)
  }
}
