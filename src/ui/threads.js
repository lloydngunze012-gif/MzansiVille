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
import { play } from '../sfx.js'
import { blockInChat, chatStatus, closeThread, dmWith, isBlocked, linesOf, myId, onThreads, openThread, openThreadId, reportLine, sendLine, sync, threadList, threadOf, unreadTotal } from '../threads.js'

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

export function mountThreads() {
  if (sheet) return
  document.body.insertAdjacentHTML('beforeend', '<section class="cht-sheet" aria-label="Chat" hidden></section><button type="button" class="cht-ping" hidden></button>')
  sheet = document.body.querySelector('.cht-sheet')
  banner = document.body.querySelector('.cht-ping')
  sheet.addEventListener('click', onClick)
  sheet.addEventListener('submit', onSubmit)
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
    paintBadges()
    if (!view) return
    if (kind === 'list') {
      // (the thread on screen was closed for you: a block)
      if (view !== 'list' && detail?.gone?.includes(view)) { show('list'); return }
      if (view === 'list') paintList()
      else paintHead()
    }
    if (kind === 'lines' && detail === view) paintLines()
  })
  // The chat button in the top bar and the menu (main.js), a ping, a player's card.
  window.addEventListener('mzansi-open-threads', (event) => {
    const d = event.detail || {}
    if (d.dm) openDm(d.dm, d.who)
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
  sheet.hidden = false
  sheet.dataset.view = next === 'list' ? 'list' : 'thread'
  document.body.dataset.chat = '1'
  if (next === 'list') { closeThread(); paintList() } else { paintThread(); openThread(next) }
  mark()
}
function tell(text, bad = false) {
  note = text || ''
  noteBad = bad
  const el = sheet.querySelector('.cht-note')
  if (el) { el.textContent = note; el.classList.toggle('bad', bad); el.hidden = !note }
}

// ---------- The list ----------
function paintList() {
  const status = chatStatus()
  const list = threadList()
  const here = peerList().filter((p) => !isBlocked(p.id)).slice(0, 12)
  const row = (t) => {
    const last = t.last
    const who = !last ? '' : last.sender === myId() ? 'You: ' : t.kind === 'group' ? `${first(last.name)}: ` : ''
    const text = last ? `${who}${last.body}` : t.kind === 'group' && t.topic ? `\u{1F4CC} ${t.topic}` : 'Say howzit'
    return `<li><button type="button" class="cht-row${t.unread ? ' unread' : ''}" data-thread="${esc(t.id)}">
      <span class="cht-av">${t.kind === 'group' ? GROUP_FACE : face(t.peer?.look)}</span>
      <span class="cht-mid"><b>${esc(t.name)}</b><span class="cht-last">${esc(text)}</span></span>
      <span class="cht-side"><small>${esc(last ? clock(last.at) : '')}</small>${t.unread ? `<small class="cht-badge" aria-label="${t.unread} unread">${t.unread > 99 ? '99+' : t.unread}</small>` : ''}</span>
    </button></li>`
  }
  const empty = status === 'soon' ? 'Chat opens soon. Check back in a bit.'
    : status === 'offline' ? 'Can’t reach the chat right now. Check your connection.'
      : status === 'ready' ? 'No chats yet. Tap someone under “Here now” to message them.' : 'Loading your chats…'
  sheet.innerHTML = `<header class="cht-head"><b class="cht-h">Chats</b><button type="button" class="cht-x" data-ct="close" aria-label="Close chat">✕</button></header>
    ${here.length ? `<div class="cht-here"><small>Here now</small><div class="cht-here-row">${here.map((p) => `<button type="button" class="cht-person" data-dm="${esc(p.id)}" aria-label="Message ${esc(p.name)}"><span class="cht-av cht-sm">${face(p.look, 36)}</span><small>${esc(first(p.name))}</small></button>`).join('')}</div></div>` : ''}
    ${list.length ? `<ol class="cht-list">${list.map(row).join('')}</ol>` : `<p class="cht-empty">${esc(empty)}</p>`}
    <p class="cht-note${noteBad ? ' bad' : ''}" role="status"${note ? '' : ' hidden'}>${esc(note)}</p>`
  mark()
}

// ---------- A thread ----------
function headHtml(t) {
  const sub = !t ? '' : t.kind === 'group' ? `${t.members || 1} member${t.members === 1 ? '' : 's'}` : t.peer?.handle ? `@${t.peer.handle}` : 'Direct message'
  return `<button type="button" class="cht-back" data-ct="back" aria-label="Back to chats">‹</button>
    <span class="cht-av cht-sm">${!t || t.kind === 'group' ? GROUP_FACE : face(t.peer?.look, 36)}</span>
    <span class="cht-title"><b>${esc(t?.name || 'Chat')}</b><small>${esc(sub)}</small></span>
    <button type="button" class="cht-x" data-ct="close" aria-label="Close chat">✕</button>`
}
function paintThread() {
  const t = threadOf(view)
  sheet.innerHTML = `<header class="cht-head">${headHtml(t)}</header>
    <p class="cht-pin"${t?.kind === 'group' && t.topic ? '' : ' hidden'}><span aria-hidden="true">\u{1F4CC}</span><span class="cht-topic">${esc(t?.topic || '')}</span></p>
    <ol class="cht-lines" aria-live="polite"></ol>
    <div class="cht-acts" hidden></div>
    <form class="cht-form" autocomplete="off">
      <input type="text" name="msg" maxlength="${MSG_MAX}" placeholder="Message" enterkeyhint="send" aria-label="Message">
      <small class="cht-count"></small>
      <button type="submit">Send</button>
    </form>
    <p class="cht-note" role="status" hidden></p>`
  paintLines(true)
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
    return `<li class="them${lead ? ' lead' : ''}">${lead ? `<button type="button" class="cht-who"${who}><span class="cht-av cht-xs">${face(p.look, 30)}</span></button>` : '<span class="cht-gap"></span>'}
      <div class="cht-col">${lead ? `<small class="cht-name">${esc(name)}</small>` : ''}<div class="cht-bub" data-line="${l.id}" data-sender="${esc(l.sender)}" data-name="${esc(name)}"><span class="cht-text">${esc(l.body)}</span><small class="cht-time">${esc(timeOf(l.at))}</small></div></div></li>`
  }).join('') : `<li class="cht-none">${t?.kind === 'group' ? 'Nobody has said anything yet. Start it off!' : `Say howzit to ${esc(first(t?.name))}.`}</li>`
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
    const known = peerList().find((p) => p.id === id) || linesOf(view).people[id] || {}
    openDm(id, known)
  }
}
async function onSubmit(event) {
  event.preventDefault()
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
    <span class="cht-ping-t"><b>${esc(group ? `${first(line.name)} · ${thread.name}` : thread.name)}</b><span>${esc(words)}</span></span>`
  banner.setAttribute('aria-label', `New message from ${group ? first(line.name) : thread.name}: ${words}. Open the chat`)
  banner.hidden = false
  banner.classList.remove('in')
  void banner.offsetWidth
  banner.classList.add('in')
  banner.dataset.n = String((Number(banner.dataset.n) || 0) + 1)
  play('ping', 400)
  clearTimeout(pingTimer)
  pingTimer = setTimeout(hidePing, 4500)
}
function hidePing() {
  clearTimeout(pingTimer)
  pingFor = ''
  if (banner) banner.hidden = true
}

// The unread count on the top bar's chat button and in the menu ([data-chat-unread]).
export function paintBadges() {
  const n = unreadTotal()
  for (const el of document.querySelectorAll('[data-chat-unread]')) {
    el.textContent = n ? (n > 99 ? '99+' : String(n)) : ''
    el.hidden = !n
  }
}
