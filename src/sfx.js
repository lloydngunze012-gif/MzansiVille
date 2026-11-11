// Game feedback sounds (owner, 8 Nov): the game must answer you, so every action closes a loop:
// you do something -> you SEE it move and HEAR it -> you get a reward or a cost -> the next thing
// is offered. All synthesised (no files): a pop when a card or choice appears, a bright rising
// chime when a score goes up, a soft falling one when it goes down, a tick as the mouse moves over
// a choice and a confirm when you pick it. They play through audio.js, so mute and the screen-off
// pause apply to them too.
import { synth } from './audio.js'

function tone(ctx, out, { f0, f1 = f0, t = 0, dur = 0.14, type = 'sine', vol = 0.12 }) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  const at = ctx.currentTime + t
  o.type = type
  o.frequency.setValueAtTime(f0, at)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(out)
  o.start(at)
  o.stop(at + dur + 0.03)
}

const SOUNDS = {
  pop: (c, o) => { tone(c, o, { f0: 380, f1: 880, dur: 0.1, vol: 0.14 }); tone(c, o, { f0: 1320, t: 0.07, dur: 0.08, vol: 0.05, type: 'triangle' }) },
  up: (c, o) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, o, { f0: f, t: i * 0.075, dur: 0.22, type: 'triangle', vol: 0.11 })) },
  down: (c, o) => { [440, 349.23, 261.63].forEach((f, i) => tone(c, o, { f0: f, f1: f * 0.97, t: i * 0.09, dur: 0.2, type: 'sine', vol: 0.11 })) },
  hover: (c, o) => tone(c, o, { f0: 1500, f1: 1900, dur: 0.04, vol: 0.035, type: 'triangle' }),
  // (Chat sprint: a new message in a thread that is not open; two short bright notes, like a phone)
  ping: (c, o) => { tone(c, o, { f0: 1174.66, dur: 0.09, vol: 0.13 }); tone(c, o, { f0: 1567.98, t: 0.08, dur: 0.16, vol: 0.13 }) },
  choose: (c, o) => { tone(c, o, { f0: 660, dur: 0.07, vol: 0.12, type: 'triangle' }); tone(c, o, { f0: 990, t: 0.06, dur: 0.12, vol: 0.12, type: 'triangle' }) },
}
const lastAt = {}
export function play(name, gap = 90) {
  const now = performance.now()
  if (now - (lastAt[name] || 0) < gap) return
  lastAt[name] = now
  synth(SOUNDS[name])
}

// Score: call with the run's stats after every paint; a rise plays the chime, a fall the soft one.
let prev = null
export function watchStats(stats) {
  if (!stats) { prev = null; return }
  const now = {}
  for (const [k, v] of Object.entries(stats)) if (typeof v === 'number') now[k] = v
  if (prev) {
    let up = 0
    let down = 0
    for (const k of Object.keys(now)) {
      const d = now[k] - (prev[k] ?? now[k])
      if (d > 0) up += d
      else if (d < 0) down -= d
    }
    if (up || down) play(up >= down ? 'up' : 'down', 250)
  }
  prev = now
}

// Pop-ups: a dialog, a result card, a talk card, a choice bar or a toast appearing.
const POP = '[role="dialog"], .g-result, .g-talk, .mm-bar, .g-toast, .pc-sheet-wrap.on, .g-menu'
let wired = false
export function wireSfx() {
  if (wired) return
  wired = true
  // A pop only when a card with new content shows: a repaint of the same card stays silent.
  let seen = new Set()
  let queued = false
  const scan = () => {
    queued = false
    const now = new Set()
    let fresh = false
    for (const n of document.querySelectorAll(POP)) {
      if (n.closest('[hidden]') || n.hidden) continue
      const key = n.className + '|' + (n.textContent || '').slice(0, 60)
      now.add(key)
      if (!seen.has(key)) fresh = true
    }
    seen = now
    if (fresh) play('pop', 200)
  }
  new MutationObserver(() => { if (!queued) { queued = true; setTimeout(scan, 30) } })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] })
  // A mouse moving over a choice: a tick (touch has no hover); picking one: a confirm.
  const CHOICE = '.mm-choice, .g-talk-reply, .g-talk-act, .g-talk-item'
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return
    const b = e.target.closest?.(CHOICE)
    if (b && !b.contains(e.relatedTarget)) play('hover', 60)
  }, true)
  document.addEventListener('pointerdown', (e) => { if (e.target.closest?.(CHOICE)) play('choose', 80) }, true)
}
