// The thumbstick for phones, bottom left. Push a little: walk. Push all the way: run.
// Let go: stop. Touching it stops any walk that's under way (onPress).
const DEAD = 0.18 // a touch this close to the middle doesn't move you
export const RUN_AT = 0.92 // pushed (nearly) all the way out: run

export function touchDevice() {
  return (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) && !new URLSearchParams(location.search).has('nostick')
}

export function createStick(host, { onPress } = {}) {
  const base = document.createElement('div')
  base.className = 'stick'
  base.innerHTML = '<div class="stick-knob"></div>'
  base.setAttribute('aria-label', 'Move: push to walk, push all the way to run')
  host.append(base)
  const knob = base.firstElementChild
  let id = null
  let value = null

  function aim(event) {
    const r = base.getBoundingClientRect()
    const radius = r.width / 2
    let x = (event.clientX - (r.left + radius)) / radius
    let y = (event.clientY - (r.top + radius)) / radius
    const m = Math.hypot(x, y)
    if (m > 1) { x /= m; y /= m }
    const k = Math.min(1, m)
    knob.style.transform = `translate(${x * radius * 0.6}px, ${y * radius * 0.6}px)`
    value = k < DEAD ? null : { x, y, m: k }
    base.dataset.push = value ? (k >= RUN_AT ? 'run' : 'walk') : 'rest'
  }
  function release() {
    id = null
    value = null
    knob.style.transform = ''
    base.dataset.push = 'rest'
    base.classList.remove('held')
  }
  base.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    id = event.pointerId
    base.setPointerCapture?.(id)
    base.classList.add('held')
    onPress?.()
    aim(event)
  })
  base.addEventListener('pointermove', (event) => { if (event.pointerId === id) aim(event) })
  base.addEventListener('pointerup', (event) => { if (event.pointerId === id) release() })
  base.addEventListener('pointercancel', (event) => { if (event.pointerId === id) release() })
  base.addEventListener('lostpointercapture', (event) => { if (event.pointerId === id) release() })
  base.dataset.push = 'rest'

  return {
    // Screen-space push (x right, y down, m 0-1), or null when it's at rest.
    read: () => value,
    show(on) { base.hidden = !on },
    release,
  }
}
