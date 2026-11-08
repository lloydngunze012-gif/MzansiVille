// The plum curtain: covers the screen while a 3D scene is built, its shaders compiled and its
// first frames drawn, then fades away (400 ms). Bare ground never shows, and the creator, the
// home scene and the campus always change through it, never a hard cut.
//   cover(text, { instant })  -> promise, resolves once the screen is fully plum
//   lift()                    -> fades out (does nothing if it isn't up)
//   settle(renderer, scene, camera) -> compiles every shader, then waits for two drawn frames
const SHOW_MS = 250
const HIDE_MS = 400
const SAFETY_MS = 45000 // (a curtain that is never lifted would be worse than a bare frame)

let node = null
let state = 'down' // down | up | lifting
let timer = 0
let safety = 0
let opaque = Promise.resolve() // (resolves when the screen is fully plum)

function build() {
  if (node) return node
  const style = document.createElement('style')
  style.textContent = `
.mz-curtain{position:fixed;inset:0;z-index:10000;background:#2f1a5c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;opacity:0;pointer-events:none;transition:opacity ${SHOW_MS}ms ease}
.mz-curtain[hidden]{display:none}
.mz-curtain img{width:84px;height:84px;border-radius:20px;box-shadow:0 8px 28px #0006}
.mz-curtain p{margin:0;color:#f0c400;font:800 17px system-ui,sans-serif;letter-spacing:.2px;text-align:center;padding:0 24px}
@media (prefers-reduced-motion:reduce){.mz-curtain{transition-duration:1ms}}`
  document.head.append(style)
  node = document.createElement('div')
  node.className = 'mz-curtain'
  node.hidden = true
  node.setAttribute('aria-hidden', 'true')
  node.innerHTML = '<img src="/icons/icon-192.png" alt=""><p></p>'
  document.body.append(node)
  return node
}

export function isUp() { return state !== 'down' }

export function cover(text = 'Arriving at UMzansi…', { instant = false } = {}) {
  const n = build()
  clearTimeout(safety)
  safety = setTimeout(() => lift(), SAFETY_MS)
  n.querySelector('p').textContent = text
  if (state === 'up') return opaque // (a fade-in in progress: the same promise)
  clearTimeout(timer) // (a lift in progress is cancelled)
  n.hidden = false
  n.style.pointerEvents = 'auto'
  if (instant) {
    n.style.transition = 'none'
    n.style.opacity = '1'
    void n.offsetWidth
    n.style.transition = ''
    state = 'up'
    opaque = Promise.resolve()
    return opaque
  }
  state = 'up'
  n.style.opacity = '0'
  void n.offsetWidth
  n.style.opacity = '1'
  opaque = new Promise((resolve) => { timer = setTimeout(resolve, SHOW_MS + 30) })
  return opaque
}

export function lift() {
  if (state === 'down') return
  clearTimeout(safety)
  clearTimeout(timer)
  const n = node
  state = 'lifting'
  n.style.pointerEvents = 'none'
  n.style.transition = `opacity ${HIDE_MS}ms ease`
  n.style.opacity = '0'
  timer = setTimeout(() => { n.hidden = true; n.style.transition = ''; state = 'down' }, HIDE_MS + 30)
}

const frames = (n) => new Promise((resolve) => { const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step) })

// compileAsync only walks what is visible, so rooms and floors that are hidden right now are shown
// for the compile (lights stay as they are: their count is part of every shader), then hidden again.
// warm(): optional, returns an undo function (e.g. home's see-through walls, which are
// transparent copies of the wall materials).
export async function settle(renderer, scene, camera, warm) {
  const hidden = []
  scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true } })
  let undo = null
  try { undo = warm?.() } catch { /* (a shader still compiles on first use) */ }
  try { await renderer.compileAsync(scene, camera) } catch { /* (the first draw compiles what is left) */ }
  try { undo?.() } catch { /* ignore */ }
  for (const o of hidden) o.visible = false
  await frames(2)
}

// Everyone in the scene has their model in and is fully there (no fade-in, no late transparent
// shader compile after the lift). Waits at most `ms` for slow connections; a person who is
// late simply fades in as before.
export async function awaitPeople(scene, appearNow, ms = 4000) {
  const people = []
  scene.traverse((o) => { if (o.userData?.ready && typeof o.userData.ready.then === 'function') people.push(o) })
  await Promise.race([Promise.all(people.map((o) => o.userData.ready)), new Promise((r) => setTimeout(r, ms))])
  for (const o of people) appearNow(o)
}
