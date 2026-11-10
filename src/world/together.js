// Meeting people (owner, 10 Nov), item 6: invite / accept / start / result, built once
// so a future hunt, gym-buddies or study-together reuses it instead of writing its own
// version. This file knows nothing about racing or piers: it just carries an invite
// over presence.js's poke channel, a 3-2-1 countdown overlay, and a small result card.
// Race to the pier (src/world/city.js) is the first caller.
import { onPoke, sendPoke } from '../presence.js'

const INVITE_MS = 20000
let pending = null // { id, kind, toId, toName, timer }: an invite we sent, waiting for their answer
const listeners = new Map() // kind -> handler(from, name, data, { accept, decline })

function fire(evt, detail) { window.dispatchEvent(new CustomEvent(`mzansi-together-${evt}`, { detail })) }

// Someone asked you to do something together (kind: 'race', later 'hunt', 'gym',
// 'study'...). handler(from, name, data, { accept, decline }) decides what happens;
// call accept() or decline(), or neither and let it time out on their side.
export function onInvite(kind, handler) { listeners.set(kind, handler) }

// You ask someone. Fires 'mzansi-together-accepted' / '-declined' / '-timeout' on this
// window once they (or the clock) answer. Only one invite out at a time.
export function sendInvite(kind, toId, toName, data = {}) {
  if (pending) return null
  const id = `${kind}-${Date.now()}-${Math.round(Math.random() * 1e4)}`
  sendPoke(toId, `invite:${kind}`, { id, ...data })
  pending = {
    id, kind, toId, toName,
    timer: setTimeout(() => { if (pending?.id === id) { pending = null; fire('timeout', { kind, toId, toName }) } }, INVITE_MS),
  }
  return id
}
export function cancelInvite() {
  if (!pending) return
  clearTimeout(pending.timer)
  pending = null
}

onPoke((payload) => {
  const { kind, from, name } = payload
  if (typeof kind !== 'string') return
  if (kind.startsWith('invite:')) {
    const real = kind.slice(7)
    const handler = listeners.get(real)
    if (!handler) return
    handler(from, name, payload, {
      accept: () => sendPoke(from, `accept:${real}`, { id: payload.id }),
      decline: () => sendPoke(from, `decline:${real}`, { id: payload.id }),
    })
    return
  }
  if (kind.startsWith('accept:')) {
    const real = kind.slice(7)
    if (pending?.kind === real && pending.toId === from && pending.id === payload.id) {
      clearTimeout(pending.timer)
      pending = null
      fire('accepted', { kind: real, withId: from, withName: name, id: payload.id })
    }
    return
  }
  if (kind.startsWith('decline:')) {
    const real = kind.slice(7)
    if (pending?.kind === real && pending.toId === from && pending.id === payload.id) {
      clearTimeout(pending.timer)
      pending = null
      fire('declined', { kind: real, withId: from, withName: name })
    }
  }
})

// ---------- the 3-2-1, and a small result card: plain DOM, over everything, works the
// same whichever 3D scene is active (it doesn't touch Three.js at all). ----------
let css = false
function style() {
  if (css) return
  css = true
  const el = document.createElement('style')
  el.textContent = `
.tg-count{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:#0006;pointer-events:none}
.tg-count b{font:800 96px Graduate,Figtree,system-ui,sans-serif;color:#f0c400;text-shadow:0 4px 18px #000a;animation:tg-pop .5s ease-out}
@keyframes tg-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.tg-count b{animation:none}}
.tg-result{position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);margin:0 auto;width:min(calc(100% - 24px),420px);box-sizing:border-box;z-index:95;background:#fffaf0;color:#1c1915;border:1.5px solid #e2d4b8;border-radius:18px;padding:16px;box-shadow:0 10px 30px #0007;text-align:center}
.tg-result h3{margin:2px 0 8px;font:800 22px Graduate,Figtree,system-ui,sans-serif}
.tg-result p{margin:0 0 12px;font-size:15px}
.tg-result .tg-row{display:flex;gap:8px;justify-content:center}
.tg-result button{min-height:44px;padding:0 18px;border-radius:22px;border:0;font:800 14px Figtree,system-ui,sans-serif;background:#22143b;color:#fff}
.tg-result button.primary{background:#f0c400;color:#1c1915}
.tg-invite{position:fixed;left:0;right:0;top:calc(env(safe-area-inset-top,0px) + 70px);margin:0 auto;width:min(calc(100% - 24px),420px);box-sizing:border-box;z-index:95;background:#22143b;color:#fff;border:1.5px solid #f0c40055;border-radius:18px;padding:14px;box-shadow:0 10px 30px #0007;text-align:center}
.tg-invite p{margin:0 0 10px;font-size:15px;font-weight:700}
.tg-invite .tg-row{display:flex;gap:8px;justify-content:center}
.tg-invite button{min-height:44px;padding:0 18px;border-radius:22px;border:0;font:800 14px Figtree,system-ui,sans-serif;background:#ffffff22;color:#fff}
.tg-invite button.primary{background:#f0c400;color:#1c1915}`
  document.head.append(el)
}
// Someone invited you: Accept / No thanks, 20 s. Letting it time out calls onDecline too.
export function inviteToast({ text, onAccept, onDecline, ms = INVITE_MS }) {
  style()
  document.querySelector('.tg-invite')?.remove()
  const el = document.createElement('div')
  el.className = 'tg-invite'
  el.setAttribute('role', 'status')
  el.innerHTML = `<p>${text}</p><div class="tg-row"><button type="button" class="primary" data-tg="accept">Accept</button><button type="button" data-tg="decline">No thanks</button></div>`
  document.body.append(el)
  let timer = 0
  const done = () => { clearTimeout(timer); el.remove() }
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tg]')?.dataset.tg
    if (act === 'accept') { done(); onAccept?.() }
    else if (act === 'decline') { done(); onDecline?.() }
  })
  timer = setTimeout(() => { done(); onDecline?.() }, ms)
  return done
}
// onDone: called once, after "GO!" has shown for a moment.
export function countdown(onDone) {
  style()
  const el = document.createElement('div')
  el.className = 'tg-count'
  el.innerHTML = '<b>3</b>'
  document.body.append(el)
  const steps = ['3', '2', '1', 'GO!']
  let i = 0
  const tick = () => {
    i += 1
    if (i >= steps.length) { el.remove(); onDone?.(); return }
    el.querySelector('b').textContent = steps[i]
    setTimeout(tick, i === steps.length - 1 ? 550 : 700)
  }
  setTimeout(tick, 700)
  return () => el.remove()
}
// Worth a screenshot: the winner, the time, Rematch?
export function resultCard({ title, lines = [], rematch, onRematch, onClose }) {
  style()
  document.querySelector('.tg-result')?.remove()
  const el = document.createElement('div')
  el.className = 'tg-result'
  el.setAttribute('role', 'status')
  el.innerHTML = `<h3>${title}</h3>${lines.map((l) => `<p>${l}</p>`).join('')}
    <div class="tg-row">${rematch ? '<button type="button" class="primary" data-tg="rematch">Rematch?</button>' : ''}<button type="button" data-tg="close">Close</button></div>`
  document.body.append(el)
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tg]')?.dataset.tg
    if (act === 'rematch') { el.remove(); onRematch?.() }
    else if (act === 'close') { el.remove(); onClose?.() }
  })
  return () => el.remove()
}
