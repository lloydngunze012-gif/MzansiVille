// Test harness (not shipped): the creator's studio (src/ui/studio.js) with either one of our
// students (src/world/avatar3d.js) or an Ara student (ara.js) on the plinth, same lights, camera,
// turn and dance. window.studioPage.show({ kind, ... }), .angle(a), .frames(seconds).
import * as THREE from 'three'
import { createAvatar, poseAvatar } from '/src/world/avatar3d.js'
import { buildStudio, createTurner, fitStudio } from '/src/ui/studio.js'
import { loadAra, ual } from './ara.js'

const stage = document.getElementById('stage')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
stage.append(renderer.domElement)
const { scene, camera } = buildStudio()
const turner = createTurner()
let current = null // { group, update(dt, t, angle) }
let clock = 0
let last = 0
const frames = []
const resize = () => {
  const w = stage.clientWidth
  const h = stage.clientHeight
  renderer.setSize(w, h, false)
  fitStudio(camera, w, h)
}
resize()
function tick(now) {
  requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  frames.push(now - (last || now))
  last = now
  clock += dt
  const angle = turner.update(dt)
  if (current) current.update(dt, clock, angle)
  renderer.render(scene, camera)
}
requestAnimationFrame(tick)

window.studioPage = {
  turner,
  async show(spec) {
    if (current) { scene.remove(current.group); current = null }
    if (spec.kind === 'ours') {
      const av = createAvatar({ ...spec.look, studio: true })
      await av.userData.ready
      av.userData.pose = spec.pose || 'dance'
      scene.add(av)
      current = { group: av, update: (dt, t, angle) => { av.rotation.y = angle; poseAvatar(av, false, t) } }
      return { ok: true }
    }
    const ara = await loadAra(spec.url, spec.opts || {})
    scene.add(ara.group)
    current = { group: ara.group, update: (dt, t, angle) => { ara.group.rotation.y = angle; ara.mixer.update(dt) } }
    return ara.info
  },
  // (the game's clip library, loaded ahead so a timing run measures the student's own files)
  prepare() { return ual().then(() => true) },
  // What is on the GPU for what is showing: decoded texture bytes (w x h x 4 x 4/3 for mips), geometry, triangles.
  stats() {
    const seen = new Set()
    let bytes = 0
    let count = 0
    scene.traverse((n) => {
      if (!n.isMesh) return
      for (const m of [].concat(n.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        const t = m[k]
        if (!t || seen.has(t)) continue
        seen.add(t)
        const im = t.image
        if (im?.width) { bytes += im.width * im.height * 4 * (4 / 3); count += 1 }
      }
    })
    renderer.render(scene, camera)
    return { textures: count, textureMB: +(bytes / 1048576).toFixed(1), geometries: renderer.info.memory.geometries, triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls }
  },
  setAngle(a) { turner.angle = a; turner.mode = 'rest'; turner.until = turner.now + 1e9 },
  resume() { turner.mode = 'auto' },
  // frame times over a number of seconds
  measure(seconds) { return new Promise((resolve) => { frames.length = 0; setTimeout(() => { const ft = frames.filter((v) => v < 1000 && v > 0).sort((a, b) => a - b); const med = ft[ft.length >> 1]; const p90 = ft[Math.min(ft.length - 1, Math.ceil(ft.length * 0.9) - 1)]; resolve({ frames: ft.length, medianMs: +med.toFixed(2), p90Ms: +p90.toFixed(2), fpsTypical: Math.round(1000 / med), fpsWorst10: Math.round(1000 / p90), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, memory: renderer.info.memory }) }, seconds * 1000) }) },
}
window.studioReady = true

// Drag to turn by hand, as in the creator (src/ui/preview3d.js).
let from = null
stage.addEventListener('pointerdown', (e) => { from = e.clientX; turner.dragStart() })
window.addEventListener('pointermove', (e) => { if (from === null) return; turner.dragBy(e.clientX - from); from = e.clientX })
const up = () => { if (from === null) return; from = null; turner.dragEnd() }
window.addEventListener('pointerup', up)
window.addEventListener('pointercancel', up)
stage.style.touchAction = 'pan-y'
