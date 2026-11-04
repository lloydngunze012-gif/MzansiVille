// Pointer and keys for the campus, after the softlife prototype. A tap is a pointer up
// within 16 px and 420 ms of its pointer down (a slow frame between the two doesn't
// count), nothing else. Touch never drags the camera (two fingers pinch to
// zoom); a mouse drag turns it. WASD or arrows walk, Shift runs; the phone thumbstick
// (stick.js) walks or runs by how far it's pushed.
import { RUN_AT } from './stick.js'

const TAP_PX = 16
const TAP_MS = 420
const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']

// onTap(ndc, clientX, clientY): a tap on the canvas. live(): the world is on screen.
export function bindInput(canvas, { cameraRig, pad, onTap, live }) {
  const keys = new Set()
  const fingers = new Map()
  let down = null
  let pinch = 0
  // (the page never pans or zooms under a finger: every touch reaches us as pointers)
  canvas.style.touchAction = 'none'

  canvas.addEventListener('pointerdown', (e) => {
    if (!live() || (e.pointerType === 'mouse' && e.button !== 0)) return
    if (e.isPrimary) fingers.clear()
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // (a second finger makes it a pinch, never a tap)
    down = fingers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, seen: performance.now(), lx: e.clientX, ly: e.clientY } : null
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) cameraRig.zoom((pinch - dist) * 0.04)
      pinch = dist
      return
    }
    // A mouse drag turns the camera; a finger never does.
    if (e.pointerType === 'mouse' && down?.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_PX) {
      cameraRig.drag(e.clientX - down.lx, e.clientY - down.ly)
      down.lx = e.clientX
      down.ly = e.clientY
    }
  })
  const up = (e) => {
    fingers.delete(e.pointerId)
    if (fingers.size < 2) pinch = 0
    const p = down
    if (!p || p.id !== e.pointerId) return
    down = null
    if (e.type !== 'pointerup' || !live()) return
    // (held too long only if both clocks agree: event times and our own handlers; a busy
    // frame can delay either one, never a real tap on both)
    const held = Math.min(e.timeStamp - p.t, performance.now() - p.seen)
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX || held > TAP_MS) return
    const rect = canvas.getBoundingClientRect()
    onTap({ x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 }, e.clientX, e.clientY)
  }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('wheel', (e) => { if (live()) { e.preventDefault(); cameraRig.zoom(e.deltaY * 0.012) } }, { passive: false })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })

  const typing = (e) => {
    const t = e.target
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName) || t?.isContentEditable || Boolean(t?.closest?.('.sheet, .glass-card, .map-overlay, .onboard, .summary-panel'))
  }
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase()
    if (!live() || e.metaKey || e.ctrlKey || e.altKey || typing(e) || !MOVE.includes(k)) return
    e.preventDefault()
    keys.add(k)
  })
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
  window.addEventListener('blur', () => keys.clear())

  return {
    clearKeys() { keys.clear() },
    // This frame's push, in world space ({ x, z, run, mag }), or null.
    stick() {
      if (!live()) return null
      let x = 0
      let z = 0
      let run = keys.has('shift')
      let mag = 1 // how far the stick is pushed (keys: all the way)
      const push = pad?.read()
      if (push) {
        x = push.x
        z = push.y
        mag = push.m
        run = push.m >= RUN_AT
      } else {
        if (keys.has('w') || keys.has('arrowup')) z -= 1
        if (keys.has('s') || keys.has('arrowdown')) z += 1
        if (keys.has('a') || keys.has('arrowleft')) x -= 1
        if (keys.has('d') || keys.has('arrowright')) x += 1
      }
      if (!x && !z) return null
      const f = cameraRig.moveForward()
      const r = cameraRig.moveRight()
      const len = Math.hypot(x, z) || 1
      return { x: (r.x * x - f.x * z) / len, z: (r.z * x - f.z * z) / len, run, mag }
    },
  }
}
