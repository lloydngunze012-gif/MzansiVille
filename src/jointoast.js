// Join toasts (Social A, owner 11 Nov): "{name} from {province} just joined", shown to the players in the same
// district (a presence room is one district), with "Say hi" opening a DM with the newcomer.
//   The newcomer: a quick-start player, the first time they stand in a room with the chat up. The server lets a
//   player announce themselves once, ever (chat_joined in supabase/chat.sql); the save remembers it too.
//   A viewer: at most one toast every 2 minutes (data/campusville/join_toasts.json), never from someone blocked,
//   the name filtered. The lines are Cursor's (docs/world-designer/social.md).
// Under automation nothing is announced unless ?chat=1 (threads.js: the same switch as the chat).
import './ui/walk.css'
import DATA from '../data/campusville/join_toasts.json'
import { filterText } from './engine/filter.js'
import { connected, onJoined, sendJoined } from './presence.js'
import { mayAnnounce, onThreads, socialReady } from './threads.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
// (automation: silent unless ?toast=1, like the other switches)
const params = new URLSearchParams(location.search)
const allowed = !navigator.webdriver || params.get('toast') === '1'
const GAP = Math.max(0.05, Number(params.get('toastgap')) || DATA.everyMinutes || 2) * 60000
let lastShown = 0
let started = false
let timer = 0
let asking = false

function show(p) {
  const now = Date.now()
  if (now - lastShown < GAP) return
  const name = filterText(String(p.n || 'Someone').split(' ')[0].slice(0, 24))
  const from = filterText(String(p.p || '').slice(0, 40))
  if (name.blocked || name.masked || !name.text || from.blocked || from.masked || !from.text) return
  lastShown = now
  const line = DATA.lines[Math.floor(Math.random() * DATA.lines.length)].replace('{name}', name.text).replace('{province}', from.text)
  document.querySelector('.jt-toast')?.remove()
  const el = document.createElement('div')
  el.className = 'jt-toast'
  el.setAttribute('role', 'status')
  el.innerHTML = `<span>${esc(line)}</span><button type="button" data-jt="hi">Say hi</button><button type="button" class="jt-x" data-jt="x" aria-label="Close">✕</button>`
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  el.addEventListener('click', (event) => {
    const k = event.target.closest('[data-jt]')?.dataset.jt
    if (!k) return
    el.remove()
    if (k === 'hi') window.dispatchEvent(new CustomEvent('mzansi-open-threads', { detail: { dm: p.i, who: { name: name.text, handle: p.h || '' } } }))
  })
  document.body.append(el)
  clearTimeout(timer)
  timer = setTimeout(() => el.remove(), 8000)
}

// run: the save's run (run.quick: came in through the quick start; run.joinSaid: already announced);
// label: where they are from; said(): remember it in the save.
export function startJoinToasts({ run, label, said }) {
  if (!allowed) return
  if (!started) { started = true; onJoined(show) }
  if (!run?.quick || run.joinSaid || asking) return
  asking = true
  // (once the chat is up and this phone is in a room: ask the server, then tell the room)
  let tries = 0
  const go = async () => {
    tries += 1
    if (run.joinSaid) { asking = false; return }
    if (!socialReady() || !connected()) { if (tries < 40) setTimeout(go, 1500); else asking = false; return }
    const ok = await mayAnnounce(run.character?.town || '') // (Notifications: with a town, the local welcome too)
    asking = false
    said()
    if (ok) sendJoined(label)
  }
  onThreads((kind) => { if (kind === 'first') go() })
  if (socialReady()) go()
}

// Tests (read only).
window.mzansiJoinToast = () => ({ last: lastShown, text: document.querySelector('.jt-toast span')?.textContent || '' })
