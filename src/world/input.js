// Pointer and keys for the campus. On a phone you move by touching the ground: a finger
// on it starts you walking there at once, a finger held and slid along steers you, and
// letting go you walk on to where it was. A tap (a pointer up within 16 px and 420 ms of
// its pointer down; a slow frame between the two doesn't count) on a person or a
// building talks to them or goes in. Two fingers pinch to zoom; a mouse drag turns the
// camera. WASD or the arrow keys walk, Shift runs.

export function touchDevice() {
  return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

const TAP_PX = 16
const TAP_MS = 420
const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']

// onTap(ndc, clientX, clientY): a tap on the canvas. onTouch(ndc, clientX, clientY): a
// finger lands; true if that started a walk (it was on the ground). onSteer(ndc): the
// finger held and slid. live(): the world is on screen.
const STEER_MS = 120 // a held finger re-aims the walk this often
export function bindInput(canvas, { cameraRig, onTap, onTouch, onSteer, live }) {
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
    // A finger on the ground: off you go, right away (people and buildings wait for the tap).
    if (down && e.pointerType !== 'mouse') {
      down.walking = Boolean(onTouch?.(ndc(e), e.clientX, e.clientY))
      down.steered = performance.now()
    }
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
    // A finger held on the ground and slid along: the walk follows it.
    if (down?.walking && down.id === e.pointerId && performance.now() - down.steered > STEER_MS) {
      down.steered = performance.now()
      onSteer?.(ndc(e))
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
    if (p.walking) { if (e.type === 'pointerup' && Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX) onSteer?.(ndc(e)); return }
    if (e.type !== 'pointerup' || !live()) return
    // (held too long only if both clocks agree: event times and our own handlers; a busy
    // frame can delay either one, never a real tap on both)
    const held = Math.min(e.timeStamp - p.t, performance.now() - p.seen)
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_PX || held > TAP_MS) return
    onTap(ndc(e), e.clientX, e.clientY)
  }
  function ndc(e) {
    const rect = canvas.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 }
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
    // This frame's keys, in world space ({ x, z, run, mag }), or null.
    stick() {
      if (!live()) return null
      let x = 0
      let z = 0
      let run = keys.has('shift')
      if (keys.has('w') || keys.has('arrowup')) z -= 1
      if (keys.has('s') || keys.has('arrowdown')) z += 1
      if (keys.has('a') || keys.has('arrowleft')) x -= 1
      if (keys.has('d') || keys.has('arrowright')) x += 1
      if (!x && !z) return null
      const f = cameraRig.moveForward()
      const r = cameraRig.moveRight()
      const len = Math.hypot(x, z) || 1
      return { x: (r.x * x - f.x * z) / len, z: (r.z * x - f.z * z) / len, run, mag: 1 }
    },
  }
}
