// A 3D view that has died (WebGL context lost, or render throwing every frame) must
// show a "reload" card, never a frozen or blank screen. Every scene's renderer goes
// through guardRenderer(). The save is kept (it is written as you play).
//
// Every loss is reported (client_errors, kind 'gl') with what a phone fact-finder needs:
// the iOS version, the GPU, how much this renderer held and how many canvases are alive.
// A scene can pass onLost: it runs when the context has not come back after a moment, and
// returns true when it has recovered some other way (the drop-off skips to the gate).
import { reportError } from '../errors.js'

const BAD_FRAMES = 3 // renders in a row that throw before the card shows
const GRACE_MS = 2500 // the browser may restore a lost context by itself
let shown = false

// "iOS 17.4", "iPadOS 17.4", "Android 14" or '' (the UA of an iPad claims to be a Mac).
export function osOf(ua = navigator.userAgent || '') {
  const ios = /(iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/.exec(ua)
  if (ios) return `iOS ${ios[2]}.${ios[3]}`
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) { const v = /Version\/(\d+\.\d+)/.exec(ua); return `iPadOS Safari ${v ? v[1] : '?'}` }
  const and = /Android (\d+)/.exec(ua)
  return and ? `Android ${and[1]}` : ''
}

function glFacts(renderer, label) {
  const facts = { scene: label, os: osOf(), canvases: document.querySelectorAll('canvas').length, dpr: window.devicePixelRatio, screen: `${screen.width}x${screen.height}` }
  try {
    const gl = renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    facts.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''
    facts.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    facts.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
    facts.lost = gl.isContextLost()
    const { memory, render, programs } = renderer.info
    facts.geometries = memory.geometries
    facts.textures = memory.textures
    facts.programs = programs?.length
    facts.triangles = render.triangles
    facts.drawCalls = render.calls
    facts.canvasPx = `${renderer.domElement.width}x${renderer.domElement.height}`
    facts.shadows = renderer.shadowMap.enabled
  } catch { /* (facts are best effort) */ }
  return facts
}

export function showFailCard(reason, error) {
  if (shown) return
  shown = true
  try { reportError('render', error || reason, { reason, os: osOf() }) } catch { /* reporting must never throw */ }
  const card = document.createElement('div')
  card.className = 'world-fail'
  card.setAttribute('role', 'alert')
  card.innerHTML = '<p>Something went wrong.</p><button type="button" class="btn">Tap to reload</button><small>Your progress is saved.</small>'
  card.querySelector('button').addEventListener('click', () => location.reload())
  document.body.append(card)
}

export function guardRenderer(renderer, label = 'scene', { onLost } = {}) {
  const canvas = renderer.domElement
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault() // lets the browser try to restore it
    window.__ctxLost = (window.__ctxLost || 0) + 1
    try { reportError('gl', `${label}: WebGL context lost`, { event: 'contextlost', hidden: document.hidden, ...glFacts(renderer, label) }) } catch { /* */ }
    setTimeout(() => {
      let still = true
      try { still = renderer.getContext().isContextLost() } catch { /* */ }
      if (!still) return
      let handled = false
      try { handled = onLost?.() === true } catch { /* the fallback must not stop the card */ }
      if (!handled) showFailCard(`${label}: WebGL context lost`)
    }, GRACE_MS)
  })
  canvas.addEventListener('webglcontextrestored', () => {
    window.__ctxRestored = (window.__ctxRestored || 0) + 1
    try { reportError('gl', `${label}: WebGL context restored`, { event: 'contextrestored', ...glFacts(renderer, label) }) } catch { /* */ }
  })
  const draw = renderer.render.bind(renderer)
  let bad = 0
  renderer.render = (s, c) => {
    try { draw(s, c); bad = 0 } catch (error) {
      bad += 1
      if (bad === 1) { try { reportError('gl', error, { event: 'render-throw', ...glFacts(renderer, label) }) } catch { /* */ } }
      if (bad >= BAD_FRAMES) {
        let handled = false
        try { handled = onLost?.() === true } catch { /* */ }
        if (!handled) showFailCard(`${label}: render keeps failing`, error)
      }
    }
  }
}

// A scene that has stopped keeps nothing on the graphics card: iOS Safari kills a page that
// holds a whole finished scene (its shadow map, textures, buffers) while the next one loads.
// Everything goes back to the card on demand, so a scene that starts again just re-uploads.
export function releaseScene(renderer, scene) {
  try {
    scene?.traverse((o) => {
      o.geometry?.dispose?.()
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose()
        m.dispose?.()
      }
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose()
    })
    if (scene?.background?.isTexture) scene.background.dispose()
    renderer?.renderLists?.dispose?.()
    renderer?.shadowMap && (renderer.shadowMap.needsUpdate = true)
    renderer?.setSize(1, 1, false) // (the drawing buffer is the biggest single allocation)
  } catch { /* (best effort) */ }
}
