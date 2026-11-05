import * as THREE from 'three'
import { BUBBLE_MS, HEAR } from '../chat.js'

// Speech bubbles over the speaker's head (Piece 3). HTML over the 3D view, so they read
// at phone size at any distance; within 15 m of your player only; one per speaker (a
// new line replaces the last); gone 8 s after it was said, fading out at the end.

const FADE_IN = 150
const FADE_OUT = 600
const LIFT = 0.62 // metres above the head: over the name tag
const LOW = 0.24 // close up (a two-shot), when over the tag is off the top: just over the head
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

export function createBubbles(host) {
  const layer = document.createElement('div')
  layer.className = 'bubbles'
  host.append(layer)
  const live = new Map() // speaker -> { el, start, text, name }
  const at = new THREE.Vector3()

  function show(speaker, name, text, mine = false) {
    let b = live.get(speaker)
    if (!b) {
      const el = document.createElement('div')
      el.className = `bubble${mine ? ' mine' : ''}`
      el.dataset.speaker = speaker
      layer.append(el)
      b = { el }
      live.set(speaker, b)
    }
    b.start = performance.now()
    b.text = text
    b.name = name
    b.el.innerHTML = `<b>${esc(name)}</b><span>${esc(text)}</span>`
  }

  function hide(speaker) {
    const b = live.get(speaker)
    if (!b) return
    b.el.remove()
    live.delete(speaker)
  }

  // Every frame: place each bubble over its speaker's head on screen. headOf(speaker):
  // a world point (the head's centre) or null (not drawn here); me: your player's spot.
  function frame(camera, headOf, me, top) {
    const now = performance.now()
    const w = host.clientWidth
    const h = host.clientHeight
    for (const [speaker, b] of live) {
      const age = now - b.start
      if (age > BUBBLE_MS) { hide(speaker); continue }
      const head = headOf(speaker)
      const far = !head || Math.hypot(head.x - me.x, head.z - me.z) > HEAR
      if (!far) at.set(head.x, head.y + LIFT, head.z).project(camera)
      if (far || at.z > 1 || at.z < -1) { b.el.style.visibility = 'hidden'; b.shown = false; continue }
      const bw = b.el.offsetWidth
      const bh = b.el.offsetHeight
      // (no room over the tag, up close: the bubble sits just over their head instead)
      if ((-at.y * 0.5 + 0.5) * h < top + bh + 4) {
        at.set(head.x, head.y + LOW, head.z).project(camera)
      }
      const x = Math.min(w - bw / 2 - 6, Math.max(bw / 2 + 6, (at.x * 0.5 + 0.5) * w))
      // (anchored by its tail, under the HUD at the highest)
      const y = Math.min(h - 8, Math.max(top + bh + 4, (-at.y * 0.5 + 0.5) * h))
      b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      b.el.style.opacity = String(age < FADE_IN ? age / FADE_IN : age > BUBBLE_MS - FADE_OUT ? Math.max(0, (BUBBLE_MS - age) / FADE_OUT) : 1)
      b.el.style.visibility = 'visible'
      b.shown = true
    }
  }

  // Tests (read only): the bubbles up now, where, and how readable.
  function report() {
    return [...live.entries()].map(([speaker, b]) => {
      const r = b.el.getBoundingClientRect()
      return { speaker, name: b.name, text: b.text, age: Math.round(performance.now() - b.start), shown: Boolean(b.shown), opacity: +Number(b.el.style.opacity || 0).toFixed(2), font: parseFloat(getComputedStyle(b.el.querySelector('span')).fontSize), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
    })
  }

  function clear() { for (const id of [...live.keys()]) hide(id) }

  return { show, hide, frame, report, clear }
}
