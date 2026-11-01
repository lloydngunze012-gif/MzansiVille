import { RUN_AT } from './stick.js'

// pad: the phone thumbstick (stick.js); onSelf(x, y): a tap on the player (stop).
export function bindCampusInput(canvas, { camera, cameraRig, raycaster, pickables, onGround, onBuilding, onPerson, onVendor, onStick, onSelf, worldOn, blocked, pad }) {
  let pointerId = null
  let startX = 0
  let startY = 0
  let dragged = false
  let pinch = 0
  let pinching = false
  const pointers = new Set()
  const keys = new Set()

  function live() {
    return worldOn() && !blocked()
  }

  function ndc(event) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    }
  }

  function walkAt(event) {
    if (blocked()) return
    // Tapping yourself: stop where you are.
    if (onSelf?.(event.clientX, event.clientY)) { window.mzansiLastTap = { kind: 'self' }; return }
    const point = ndc(event)
    raycaster.setFromCamera(point, camera)
    const lists = pickables()
    // People first: tapping anyone starts a conversation.
    const person = onPerson && raycaster.intersectObjects(lists.people || [], true).find((hit) => hit.object.name === 'hit')
    if (person) {
      let node = person.object
      while (node && !node.userData?.personId) node = node.parent
      if (node) { window.mzansiLastTap = { kind: 'person', id: node.userData.personId }; onPerson(node); return }
    }
    // A vendor's stall or counter: join her queue (as if you had tapped her).
    const stall = onVendor && raycaster.intersectObjects(lists.vendors || [], true)[0]
    if (stall) {
      let node = stall.object
      while (node && !node.userData?.vendor) node = node.parent
      if (node) { window.mzansiLastTap = { kind: 'vendor', id: node.userData.vendor }; onVendor(node.userData.vendor); return }
    }
    const buildings = raycaster.intersectObjects(lists.buildings || [], true)[0]
    const ground = raycaster.intersectObjects(lists.ground || [], true)[0]
    if (buildings && (!ground || buildings.distance <= ground.distance + 0.05)) {
      let node = buildings.object
      while (node && !node.userData?.placeId) node = node.parent
      if (node?.userData?.placeId) {
        window.mzansiLastTap = { kind: 'building', id: node.userData.placeId }
        onBuilding(node.userData.placeId, buildings.point)
        return
      }
    }
    if (ground) { window.mzansiLastTap = { kind: 'ground', x: ground.point.x, z: ground.point.z }; onGround(ground.point.x, ground.point.z) }
  }

  function onPointerDown(event) {
    if (!worldOn()) return
    if (event.pointerType === 'mouse' && event.button === 1) return
    // A first finger down means no other finger is: forget any lost to a missed pointerup
    // (one stale pointer would turn every later tap into a pinch and swallow it).
    if (event.isPrimary) { pointers.clear(); pinching = false }
    pointers.add(event.pointerId)
    if (pointers.size > 1) {
      pinching = true
      dragged = true
      return
    }
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    dragged = event.button === 2
    canvas.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return
    if (pinching || pointers.size > 1) return
    if (event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!dragged && Math.hypot(dx, dy) > 12) dragged = true
    if (!dragged) return
    cameraRig.drag(dx, dy)
    startX = event.clientX
    startY = event.clientY
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId)
    if (pointers.size === 0) pinching = false
    if (event.pointerId !== pointerId) return
    pointerId = null
    if (worldOn() && !pinching && !dragged && event.button !== 2) walkAt(event)
    dragged = false
  }

  function onWheel(event) {
    if (!worldOn()) return
    event.preventDefault()
    cameraRig.zoom(event.deltaY * 0.012)
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2) {
      pinch = 0
      return
    }
    pinching = true
    dragged = true
    event.preventDefault()
    const [a, b] = event.touches
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (pinch) cameraRig.zoom((pinch - dist) * 0.04)
    pinch = dist
  }

  function typing(event) {
    const tag = event.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (event.target?.isContentEditable) return true
    const panel = event.target?.closest?.('.sheet, .glass-card, .map-overlay, .onboard, .summary-panel')
    return Boolean(panel)
  }

  function onKey(event, down) {
    if (!worldOn()) {
      if (!down) keys.clear()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (typing(event)) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const move = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']
    if (!move.includes(key)) return
    if (blocked()) return
    event.preventDefault()
    if (down) keys.add(key)
    else keys.delete(key)
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', (event) => event.preventDefault())
  canvas.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('keydown', (event) => onKey(event, true))
  window.addEventListener('keyup', (event) => onKey(event, false))
  window.addEventListener('blur', () => keys.clear())

  return {
    clearKeys() { keys.clear() },
    stick() {
      if (!live()) return null
      let x = 0
      let z = 0
      // Shift (or the stick pushed all the way) runs.
      let run = keys.has('Shift')
      const push = pad?.read()
      if (push) {
        x = push.x
        z = push.y
        run = push.m >= RUN_AT
      } else {
        if (keys.has('w') || keys.has('ArrowUp')) z -= 1
        if (keys.has('s') || keys.has('ArrowDown')) z += 1
        if (keys.has('a') || keys.has('ArrowLeft')) x -= 1
        if (keys.has('d') || keys.has('ArrowRight')) x += 1
      }
      if (!x && !z) return null
      const forward = cameraRig.moveForward()
      const right = cameraRig.moveRight()
      const len = Math.hypot(x, z) || 1
      onStick(
        (right.x * x + forward.x * -z) / len,
        (right.z * x + forward.z * -z) / len,
        run,
      )
      return true
    },
  }
}
