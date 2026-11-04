// The arrow pad for phones, bottom left: four arrows round a stop button. You steer
// yourself: left and right turn you a little each tap (hold them to keep turning), down
// turns you round. Up walks you forward the way you face, and you keep walking after the
// finger lifts; tap up twice quickly and you run (and keep running). You stop with the
// middle button, by tapping yourself, tapping somewhere else, walking into something,
// or when a card opens.
const DOUBLE_MS = 350 // a second tap on up within this: run
const STEP = Math.PI / 12 // one tap on left or right: 15 degrees
const HOLD_MS = 300 // held this long: keep turning
const ARROWS = { up: '▲', left: '◀', right: '▶', down: '▼' }

export function touchDevice() {
  return (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) && !new URLSearchParams(location.search).has('nostick')
}

// onTurn(radians): turn the player by this much (left is +, as seen from above).
export function createArrows(host, { onTurn }) {
  const pad = document.createElement('div')
  pad.className = 'arrows'
  pad.setAttribute('role', 'group')
  pad.setAttribute('aria-label', 'Move: up walks, twice runs; left and right turn')
  pad.innerHTML = Object.entries(ARROWS).map(([id, icon]) => `<button type="button" class="arrow" data-dir="${id}" aria-label="${id}">${icon}</button>`).join('')
    + '<button type="button" class="arrow-stop" aria-label="Stop">■</button>'
  host.append(pad)
  let forward = null // null, 'walk' or 'run'
  let held = null // { side: 1 left / -1 right, since, id } while a turn arrow is down
  let last = { at: 0, ts: 0 }

  function show() {
    pad.dataset.going = forward || 'rest'
    for (const b of pad.querySelectorAll('.arrow')) b.classList.toggle('on', (b.dataset.dir === 'up' && Boolean(forward)) || b.dataset.dir === held?.dir)
  }
  function stop() {
    if (!forward) return
    forward = null
    show()
  }
  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const button = event.target.closest('button')
    if (!button) return
    if (button.classList.contains('arrow-stop')) { stop(); last = { at: 0, ts: 0 }; return }
    const dir = button.dataset.dir
    if (dir === 'up') {
      const now = performance.now()
      // (quick enough by either clock: a busy frame can delay one of them, never both)
      const twice = Math.min(now - last.at, event.timeStamp - last.ts) < DOUBLE_MS
      last = { at: now, ts: event.timeStamp }
      forward = twice ? 'run' : 'walk'
    } else if (dir === 'down') onTurn(Math.PI)
    else {
      const side = dir === 'left' ? 1 : -1
      onTurn(side * STEP)
      held = { side, since: performance.now(), id: event.pointerId, dir }
      button.setPointerCapture?.(event.pointerId)
    }
    show()
  })
  const release = (event) => { if (held && event.pointerId === held.id) { held = null; show() } }
  pad.addEventListener('pointerup', release)
  pad.addEventListener('pointercancel', release)
  pad.addEventListener('lostpointercapture', release)
  // (no clicks or double-tap zoom from the pad: everything happens on pointerdown)
  pad.addEventListener('click', (event) => event.stopPropagation())
  show()

  return {
    // forward: null, 'walk' or 'run'; turn: 1 (left), -1 (right) or 0, while held.
    read: () => ({ forward, turn: held && performance.now() - held.since > HOLD_MS ? held.side : 0 }),
    stop,
    show(on) { pad.hidden = !on },
  }
}
