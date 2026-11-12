// Notifications (owner, 11 Nov): a ping on the phone when someone messages you, and the local welcome.
//   Asking: never on first load. The first time you get a reply in a DM or send a DM, our own small card first
//   ("Get a ping when someone messages you? Yes / Not now"); only Yes opens the browser's own question. Not now:
//   asked again after 3 days at most, and never more than 3 times. An iPhone that is not on the home screen gets
//   the Add to Home Screen steps first (Safari only delivers pushes to an installed web app).
//   Sending: after this phone sends a line, it asks the game's server (/api/push) to push the thread's other
//   members; who gets one is decided in Postgres (supabase/chat.sql, NOTIFICATIONS): never from a blocked player,
//   never a muted group or The Quad, at most one per thread per 10 minutes, quiet hours 23:00-07:00 SAST.
//   Tapping a push opens the game straight into that thread (?thread=<id>, public/sw.js).
//   The menu: "Notifications" opens a card with On/Off, quiet hours, hide message text, and the daily summary of
//   new students from your town.
//   The local welcome: chat_sync's `welcome` -> "Emma from Durban just enrolled at UMzansi. Show her around. Say hi".
// Words: data/campusville/notify.json (Cursor's). Automation: nothing is asked or sent unless ?push=1.
import './ui/notify.css'
import WORDS from '../data/campusville/notify.json'
import { calm, popClose, popOpen } from './launch.js'
import { isIos, isStandalone } from './install.js'
import { chatCall, linesOf, myId, onThreads, pushReady, socialReady, threadOf } from './threads.js'
import { myIdentity } from './presence.js'
import { filterText } from './engine/filter.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const fill = (line, vars) => String(line).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
const params = new URLSearchParams(location.search)
const allowed = !navigator.webdriver || params.get('push') === '1'
const KEY = 'mzansiville.notify'
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify({ ...store.get(), ...v })) } catch { /* fine */ } },
}
let api = { toast: () => {} }

// ---------- what this phone can do ----------
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
// 'on' | 'off' | 'blocked' (the browser says no) | 'ios' (an iPhone not on the home screen) | 'none' (no push here)
export function pushState() {
  if (isIos() && !isStandalone()) return 'ios'
  if (!pushSupported()) return 'none'
  if (Notification.permission === 'denied') return 'blocked'
  return Notification.permission === 'granted' && store.get().on ? 'on' : 'off'
}

let vapid = ''
async function vapidKey() {
  if (vapid) return vapid
  if (params.get('vapid')) return (vapid = params.get('vapid')) // (tests: their own key)
  try { const r = await fetch('/api/push', { cache: 'no-store' }); vapid = (await r.json()).key || '' } catch { vapid = '' }
  return vapid
}
const b64ToBytes = (s) => { const pad = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)) }
async function worker() {
  // (the built game registers public/sw.js at load; in dev with ?sw=1. Wait for it, or register it here.)
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'))
  return navigator.serviceWorker.ready.then(() => reg)
}

// Turn pushes on for this phone: the browser's question, a subscription, and the server told. { ok, why }
export async function turnOn() {
  if (isIos() && !isStandalone()) { showIosSteps(); return { ok: false, why: 'ios' } }
  if (!pushSupported()) return { ok: false, why: 'none' }
  const answer = await Notification.requestPermission()
  if (answer !== 'granted') { store.set({ on: false }); return { ok: false, why: answer === 'denied' ? 'blocked' : 'later' } }
  try {
    const key = await vapidKey()
    if (!key) return { ok: false, why: 'server' }
    const reg = await worker()
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }))
    const j = sub.toJSON()
    const res = await chatCall('chat_push_sub', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_on: true })
    if (!res.ok) return { ok: false, why: 'server' }
    store.set({ on: true, endpoint: j.endpoint })
    return { ok: true }
  } catch (e) { store.set({ error: String(e?.message || e).slice(0, 160) }); return { ok: false, why: 'server' } }
}
export async function turnOff() {
  store.set({ on: false })
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { await chatCall('chat_push_sub', { p_endpoint: sub.endpoint, p_on: false }); await sub.unsubscribe() }
  } catch { /* the server forgets it the first time a push bounces */ }
  return { ok: true }
}

// ---------- the small card, and the iPhone steps ----------
let card = null
function closeCard() { card?.remove(); card = null }
function showCard(kind, html, onClick) {
  closeCard()
  card = document.createElement('section')
  card.className = 'fm-card'
  card.dataset.fm = kind
  card.setAttribute('role', 'status')
  card.innerHTML = html
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) card.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  card.addEventListener('click', (event) => { const k = event.target.closest('[data-nt]')?.dataset.nt; if (k) onClick(k) })
  document.body.append(card)
}
function showIosSteps() {
  const w = WORDS.ios
  showCard('push-ios', `<p><b>${esc(w.title)}</b><span>${esc(w.why)}</span></p>
    <ol class="nt-steps">${w.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="fm-row"><button type="button" class="fm-yes" data-nt="ok">${esc(w.ok)}</button></div>`, () => closeCard())
}
const roomForCard = () => !card && !document.querySelector('.fm-card, .cht-wake, .cht-ask, .jt-toast, .cht-ping:not([hidden]), .sl-pop')
let wanted = false
function maybeAsk() {
  if (!allowed || !wanted || !pushReady() || !roomForCard() || !calm()) return
  const st = pushState()
  if (st === 'on' || st === 'blocked' || st === 'none') { wanted = false; return }
  const s = store.get()
  if ((s.asks || 0) >= 3 || (s.askedAt && Date.now() - s.askedAt < 3 * 86400000)) { wanted = false; return }
  wanted = false
  store.set({ asks: (s.asks || 0) + 1, askedAt: Date.now() })
  const w = WORDS.card
  showCard('push', `<p><b>${esc(w.title)}</b><span>${esc(w.why)}</span></p>
    <div class="fm-row"><button type="button" class="fm-yes" data-nt="yes">${esc(w.yes)}</button><button type="button" class="fm-no" data-nt="no">${esc(w.no)}</button></div>`, async (k) => {
    closeCard()
    if (k !== 'yes') return
    const res = await turnOn()
    if (res.ok) api.toast(WORDS.toast.on)
    else if (res.why === 'blocked') api.toast(WORDS.toast.blocked)
    else if (res.why === 'server' || res.why === 'none') api.toast(WORDS.toast.cant)
  })
}

// ---------- the menu's card ----------
export function openNotifySettings() {
  const st = pushState()
  const p = prefs
  const w = WORDS.menu
  const row = (k, label, on, disabled = false) => `<button type="button" class="nt-row" data-ntp="${k}" aria-pressed="${on}"${disabled ? ' aria-disabled="true"' : ''}><span>${esc(label)}</span><b>${on ? 'On' : 'Off'}</b></button>`
  const note = st === 'blocked' ? w.blocked : st === 'ios' ? w.ios : st === 'none' ? w.none : ''
  const pop = popOpen('notify', `<p class="lp-kicker">${esc(w.kicker)}</p><h2>${esc(w.title)}</h2>
    ${note ? `<p class="nt-note">${esc(note)}</p>` : ''}
    <div class="nt-rows">${row('on', w.on, st === 'on', st === 'blocked' || st === 'none')}
    ${row('quiet', w.quiet, p.quiet !== false, st !== 'on')}
    ${row('hide', w.hide, Boolean(p.hide), st !== 'on')}
    ${row('area', w.area, p.area !== false, st !== 'on')}</div>
    <div class="lp-two"><button class="lp-go" type="button" data-ntp="close">${esc(w.done)}</button></div>`)
  pop.dataset.kind = 'notify'
  pop.addEventListener('click', async (event) => {
    const b = event.target.closest('[data-ntp]')
    if (!b || b.getAttribute('aria-disabled') === 'true') return
    const k = b.dataset.ntp
    if (k === 'close') { popClose(); return }
    if (k === 'on') {
      if (st === 'ios') { popClose(); showIosSteps(); return }
      b.querySelector('b').textContent = '…' // (the first time, Chrome can take half a minute to reach its push service)
      const res = pushState() === 'on' ? await turnOff() : await turnOn()
      if (!res.ok && res.why === 'blocked') api.toast(WORDS.toast.blocked)
      else if (!res.ok && res.why !== 'later') api.toast(WORDS.toast.cant)
      openNotifySettings(); api.repaint?.(); return
    }
    const now = b.getAttribute('aria-pressed') === 'true'
    const res = await chatCall('chat_push_prefs', { [`p_${k}`]: !now })
    if (res.ok) setPrefs(res.data)
    openNotifySettings()
  })
}
let prefs = { quiet: true, hide: false, area: true }
function setPrefs(d) { if (d) prefs = { quiet: d.quiet !== false, hide: Boolean(d.hide), area: d.area !== false } }

// ---------- the local welcome ----------
let lastWelcome = 0
function welcome(w) {
  if (!w?.id || !w.name || !w.area) return
  if (Date.now() - lastWelcome < (WORDS.welcome.everyMinutes || 10) * 60000) return
  const name = filterText(String(w.name).split(' ')[0].slice(0, 24))
  const area = filterText(String(w.area).slice(0, 60))
  if (name.blocked || name.masked || !name.text || area.blocked || !area.text) return
  lastWelcome = Date.now()
  const them = w.gender === 'female' ? 'her' : w.gender === 'male' ? 'him' : 'them'
  const line = fill(WORDS.welcome.line, { name: name.text, area: area.text, them })
  document.querySelector('.jt-toast')?.remove()
  const el = document.createElement('div')
  el.className = 'jt-toast'
  el.dataset.kind = 'welcome'
  el.setAttribute('role', 'status')
  el.innerHTML = `<span>${esc(line)}</span><button type="button" data-jt="hi">${esc(WORDS.welcome.hi)}</button><button type="button" class="jt-x" data-jt="x" aria-label="Close">✕</button>`
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  el.addEventListener('click', (event) => {
    const k = event.target.closest('[data-jt]')?.dataset.jt
    if (!k) return
    el.remove()
    if (k === 'hi') window.dispatchEvent(new CustomEvent('mzansi-open-threads', { detail: { dm: w.id, who: { name: name.text } } }))
  })
  document.body.append(el)
  setTimeout(() => el.remove(), 10000)
}

// ---------- after a send: push the others ----------
export function pushAfterSend(threadId) {
  if (!allowed || !threadId || !pushReady()) return
  const t = threadOf(threadId)
  if (t?.quad) return
  const me = myIdentity()
  try { fetch(params.get('pushapi') || '/api/push', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: me.id, secret: me.secret, thread: threadId }) }).catch(() => {}) } catch { /* fine */ }
}

// ---------- start ----------
export function initNotify(handles) {
  api = { ...api, ...handles }
  onThreads((kind, detail) => {
    if (kind === 'welcome') welcome(detail)
    if (kind === 'push-prefs') setPrefs(detail)
    // the first reply in a DM, or the first DM you send: the moment to ask
    if (kind === 'ping' && detail?.thread?.kind === 'dm') wanted = true
    if (kind === 'sent') { pushAfterSend(detail); const t = threadOf(detail); if (t?.kind === 'dm') wanted = true }
    // (a reply that lands in the DM you have open)
    if (kind === 'lines' && threadOf(detail)?.kind === 'dm') { const last = linesOf(detail).lines.at(-1); if (last && last.sender !== myId()) wanted = true }
  })
  setInterval(maybeAsk, 1500)
  // the subscription can change behind our back (the browser renews it): keep the server's copy right
  if (allowed && pushSupported() && store.get().on) {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((sub) => {
      if (!sub) { store.set({ on: false }); return }
      const j = sub.toJSON()
      if (j.endpoint !== store.get().endpoint || !socialReady()) onThreads((k) => { if (k === 'first') chatCall('chat_push_sub', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_on: true }).then((r) => r.ok && store.set({ endpoint: j.endpoint })) })
    }).catch(() => {})
  }
}

// Tests (read only).
window.mzansiNotify = () => ({ state: pushState(), store: store.get(), card: card?.dataset.fm || '', prefs, wanted, lastWelcome })
