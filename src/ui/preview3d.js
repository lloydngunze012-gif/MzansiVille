// The character creator's stage shows the real 3D student (the same model and
// colours as the morning, campus and lecture), dancing on the groove's beat.
// Loaded lazily so the menu bundle stays small; the SVG stays as the fallback.
import * as THREE from 'three'
import { createAvatar, lookOf, poseAvatar } from '../world/avatar3d.js'
import { buildStudio, createTurner, fitStudio } from './studio.js'

// The stage is a small studio (studio.js): plinth, soft lights, a student who turns all the
// way round while dancing; drag to turn by hand.
let renderer = null
let scene = null
let camera = null
let avatar = null
let key = ''
let frame = 0
let clock = 0
let last = 0
const turner = createTurner()

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'cc-3d'
  const studio = buildStudio()
  scene = studio.scene
  camera = studio.camera
  fitStudio(camera, 1, 1)
  // Drag across the stage to turn the student by hand (the stage is a new element after
  // every paint, so the listeners sit on the document).
  let from = null
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('.cc-stage') || e.target.closest('button')) return
    from = e.clientX
    turner.dragStart()
  })
  window.addEventListener('pointermove', (e) => {
    if (from === null) return
    turner.dragBy(e.clientX - from)
    from = e.clientX
  })
  const up = () => { if (from === null) return; from = null; turner.dragEnd() }
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

// (read only, for tests and the report: where the turn is)
window.mzansiStudio = () => ({ angle: turner.angle, mode: turner.mode, spin: turner.spin, now: turner.now, pose: avatar?.userData.pose || '', rigged: Boolean(avatar?.userData.rigged) })

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  clock += dt
  const angle = turner.update(dt)
  if (avatar) {
    // The dance clip on the groove's beat, turning all the way round.
    avatar.userData.pose = 'dance'
    avatar.rotation.y = angle
    poseAvatar(avatar, false, clock)
  }
  const canvas = renderer.domElement
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
    renderer.setSize(w, h, false)
    fitStudio(camera, w, h)
  }
  renderer.render(scene, camera)
}

// Called after every paint of the creator: the stage element is new each time,
// so the same canvas is moved into it.
export function showPreview(stage, look) {
  if (!stage) return
  // (no 3D here: the flat drawing is the preview)
  if (!renderer) { try { setup() } catch { stage.classList.add('cc-no3d'); return } }
  const next = JSON.stringify(lookOf({ ...look, studio: true }))
  if (next !== key) {
    // (a pick: show the front, so the chest print and the neckline read)
    if (key) turner.focusFront()
    // The new look loads beside the old one, which stays until the new one is in
    // (no empty stage, no flash of anything else between outfits).
    const old = avatar
    avatar = createAvatar({ ...look, studio: true })
    const fresh = avatar
    fresh.addEventListener('rigged', () => {
      if (old && old !== avatar) { old.userData.disposed = true; scene.remove(old) }
      if (fresh === avatar) document.querySelectorAll('.cc-stage').forEach((s) => s.classList.add('cc-has3d'))
    })
    if (old && !old.userData.rigged) { old.userData.disposed = true; scene.remove(old) }
    scene.add(avatar)
    key = next
  }
  if (renderer.domElement.parentElement !== stage) stage.append(renderer.domElement)
  if (avatar.userData.rigged || scene.children.some((c) => c !== avatar && c.userData?.rigged && !c.userData.disposed)) stage.classList.add('cc-has3d')
  stage.dataset.look = next
  if (!frame) frame = requestAnimationFrame(tick)
}

// Resolves once the student on the stage is showing (or failed to load).
export function ready() {
  return avatar?.userData.ready || Promise.resolve()
}

export function hidePreview() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  renderer?.domElement.remove()
}
