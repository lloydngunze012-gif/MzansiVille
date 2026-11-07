// The creator's stage as a product shot (owner, 7 Nov): a round plinth, a clean backdrop,
// a soft key light with a fill and two rim lights, a soft contact shadow under the feet,
// and a student who turns all the way round (about 10 s a turn) while still dancing.
// Used by preview3d.js (our students) and by the Ara comparison page (tests/creator/studio.html),
// so both kinds stand under the same lights, camera and turn.
//
// The shadow is a drawn blob, not a shadow map: the creator is the first screen on a cheap
// phone, and a shadow pass would draw the student twice.
import * as THREE from 'three'

export const TURN_SECONDS = 10 // one full turn
export const HOLD_FRONT = 1.5 // seconds to hold the front after you pick something
export const RESUME_AFTER_DRAG = 2 // seconds after you let go
const DRAG_RAD_PER_PX = 0.011

function blobTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(40,26,12,0.55)')
  g.addColorStop(0.45, 'rgba(40,26,12,0.28)')
  g.addColorStop(1, 'rgba(40,26,12,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// The set: lights, plinth, shadow. The student stands at the origin, soles on y = 0.
// theme: colours from the stage's CSS (--cc-plinth, --cc-plinth-foot, --cc-ring), so the
// set matches the page around it.
export function buildStudio(theme = {}) {
  const scene = new THREE.Scene()
  // Soft key (warm, high, front right), a cool fill from the left, and two rims from
  // behind (warm left, cool right) so the edges of hair and sleeves come away from the backdrop.
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb9a98c, 1.15))
  const key = new THREE.DirectionalLight(0xfff0d6, 2.3)
  key.position.set(2.4, 3.6, 3.8)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xd5e3ff, 0.85)
  fill.position.set(-3.2, 1.6, 2.6)
  scene.add(fill)
  const rimA = new THREE.DirectionalLight(0xffe2ad, 1.9)
  rimA.position.set(-1.8, 3.0, -4.2)
  scene.add(rimA)
  const rimB = new THREE.DirectionalLight(0xc9d8ff, 1.4)
  rimB.position.set(2.8, 2.2, -3.6)
  scene.add(rimB)

  const plinth = new THREE.Group()
  plinth.name = 'plinth'
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.12, 56), new THREE.MeshStandardMaterial({ color: theme.plinth || 0xd8cbb0, roughness: 0.7 }))
  top.position.y = -0.063 // (its top face is a hair below the soles)
  plinth.add(top)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.665, 0.012, 6, 64), new THREE.MeshStandardMaterial({ color: theme.ring || 0xf0c400, roughness: 0.4, emissive: new THREE.Color(theme.ring || 0xf0c400).multiplyScalar(0.5) }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = -0.004
  plinth.add(ring)
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.72, 0.05, 56), new THREE.MeshStandardMaterial({ color: theme.foot || 0xb3a484, roughness: 0.85 }))
  foot.position.y = -0.145
  plinth.add(foot)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.52, 32), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.002
  shadow.scale.set(1, 0.8, 1)
  plinth.add(shadow)
  scene.add(plinth)

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50)
  return { scene, camera, plinth }
}

// Frame the plinth and a student with an arm up (about 2.1 m) in a stage of any shape.
export function fitStudio(camera, w, h) {
  camera.aspect = w / h
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const top = 2.12
  const bottom = -0.2
  // (head to feet fills about 78% of the stage; the raised hand of the dance is still inside)
  const dist = Math.max(((top - bottom) / 2 - 0.04) / half, 0.84 / (half * camera.aspect))
  camera.position.set(0, 1.25, dist)
  camera.lookAt(0, (top + bottom) / 2 - 0.065, 0)
  camera.updateProjectionMatrix()
}

// The turn: slow and steady; a drag by hand takes over and the turn carries on 2 s after
// you let go; a new pick (an outfit, a top) eases round to the front and holds it.
export function createTurner() {
  const turner = {
    angle: 0, // radians; 0 is the student facing the camera
    spin: 0,
    mode: 'auto', // auto | front | hold | drag | rest
    until: 0,
    now: 0,
    dragging: false,
    // A look changed: show the chest.
    focusFront() { turner.mode = 'front'; turner.spin = 0 },
    dragStart() { turner.mode = 'drag'; turner.dragging = true; turner.spin = 0 },
    dragBy(px) { if (turner.mode === 'drag') turner.angle += px * DRAG_RAD_PER_PX },
    dragEnd() { if (turner.mode === 'drag') { turner.dragging = false; turner.mode = 'rest'; turner.until = turner.now + RESUME_AFTER_DRAG } },
    update(dt) {
      turner.now += dt
      if (turner.mode === 'front') {
        const target = Math.round(turner.angle / (Math.PI * 2)) * Math.PI * 2
        turner.angle += (target - turner.angle) * (1 - Math.exp(-dt * 6))
        if (Math.abs(target - turner.angle) < 0.015) { turner.angle = target; turner.mode = 'hold'; turner.until = turner.now + HOLD_FRONT }
      } else if (turner.mode === 'hold' || turner.mode === 'rest') {
        if (turner.now >= turner.until) turner.mode = 'auto'
      } else if (turner.mode === 'auto') {
        const w = (Math.PI * 2) / TURN_SECONDS
        turner.spin += (w - turner.spin) * (1 - Math.exp(-dt * 2.5))
        turner.angle += turner.spin * dt
      }
      return turner.angle
    },
  }
  return turner
}
