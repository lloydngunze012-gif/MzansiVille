// The arrow pad for phones, bottom left: four arrows round a stop button. Tap (or hold)
// an arrow and you walk that way, and keep walking after you lift your finger; tap it
// twice quickly and you run. You stop with the middle button, by tapping yourself,
// tapping somewhere else, walking into something, or when a card opens.
const DOUBLE_MS = 350 // a second tap on the same arrow within this: run
const ARROWS = { up: [0, -1, '▲'], left: [-1, 0, '◀'], right: [1, 0, '▶'], down: [0, 1, '▼'] }

export function touchDevice() {
  return (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) && !new URLSearchParams(location.search).has('nostick')
}

export function createArrows(host) {
  const pad = document.createElement('div')
  pad.className = 'arrows'
  pad.setAttribute('role', 'group')
  pad.setAttribute('aria-label', 'Move: tap an arrow to walk, tap twice to run')
  pad.innerHTML = Object.entries(ARROWS).map(([id, [, , icon]]) => `<button type="button" class="arrow" data-dir="${id}" aria-label="${id}">${icon}</button>`).join('')
    + '<button type="button" class="arrow-stop" aria-label="Stop">■</button>'
  host.append(pad)
  let active = null // { id, x, y, run }
  let last = { id: null, at: 0, ts: 0 }

  function show() {
    pad.dataset.going = active ? (active.run ? 'run' : 'walk') : 'rest'
    for (const b of pad.querySelectorAll('.arrow')) b.classList.toggle('on', b.dataset.dir === active?.id)
  }
  function stop() {
    if (!active) return
    active = null
    show()
  }
  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const button = event.target.closest('button')
    if (!button) return
    if (button.classList.contains('arrow-stop')) { stop(); last = { id: null, at: 0, ts: 0 }; return }
    const id = button.dataset.dir
    const now = performance.now()
    // (quick enough by either clock: a busy frame can delay one of them, never both)
    const run = last.id === id && Math.min(now - last.at, event.timeStamp - last.ts) < DOUBLE_MS
    last = { id, at: now, ts: event.timeStamp }
    active = { id, x: ARROWS[id][0], y: ARROWS[id][1], run }
    show()
  })
  // (no clicks or double-tap zoom from the pad: everything happens on pointerdown)
  pad.addEventListener('click', (event) => event.stopPropagation())
  show()

  return {
    // The push this frame (x right, y down, m 1, run), or null when you're not walking.
    read: () => active && { x: active.x, y: active.y, m: 1, run: active.run },
    stop,
    show(on) { pad.hidden = !on },
  }
}
