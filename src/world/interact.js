export function bindCampusInput(canvas, { camera, cameraRig, raycaster, pickables, onWalk, onStick }) {
  let pointerId = null
  let startX = 0
  let startY = 0
  let dragged = false
  let pinch = 0
  const keys = new Set()

  function ndc(event) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    }
  }

  function walkAt(event) {
    const point = ndc(event)
    raycaster.setFromCamera(point, camera)
    const hit = raycaster.intersectObjects(pickables(), true)[0]
    if (!hit) return
    onWalk(hit.point.x, hit.point.z)
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button === 1) return
    if (pointerId != null && event.pointerType !== 'touch') return
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    dragged = event.button === 2
    canvas.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
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
    if (event.pointerId !== pointerId) return
    pointerId = null
    if (!dragged && event.button !== 2) walkAt(event)
    dragged = false
  }

  function onWheel(event) {
    event.preventDefault()
    cameraRig.zoom(event.deltaY * 0.012)
  }

  function onTouchMove(event) {
    if (event.touches.length !== 2) {
      pinch = 0
      return
    }
    event.preventDefault()
    const [a, b] = event.touches
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (pinch) cameraRig.zoom((pinch - dist) * 0.04)
    pinch = dist
  }

  function onKey(event, down) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const tag = event.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (!['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return
    event.preventDefault()
    if (down) keys.add(key)
    else keys.delete(key)
  }

  function onContext(event) {
    event.preventDefault()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContext)
  canvas.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('keydown', (event) => onKey(event, true))
  window.addEventListener('keyup', (event) => onKey(event, false))
  window.addEventListener('blur', () => keys.clear())

  return {
    stick() {
      let x = 0
      let z = 0
      if (keys.has('w') || keys.has('ArrowUp')) z -= 1
      if (keys.has('s') || keys.has('ArrowDown')) z += 1
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1
      if (keys.has('d') || keys.has('ArrowRight')) x += 1
      if (!x && !z) return null
      const forward = cameraRig.flatForward()
      const right = cameraRig.flatRight()
      const len = Math.hypot(x, z) || 1
      onStick(
        (right.x * x + forward.x * -z) / len,
        (right.z * x + forward.z * -z) / len,
      )
      return true
    },
  }
}
