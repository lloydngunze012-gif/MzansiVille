// Creator icons drawn from the real 3D models (the same clothes, hair and body as
// in the game): one small offscreen renderer, one picture per look, cached in memory
// and on the phone (so the creator opens with its pictures already there).
// Outfits and bodies show the whole student; hair shows head and shoulders.
import * as THREE from 'three'
import { appearNow, createAvatar, poseAvatar } from '../world/avatar3d.js'

const W = 120
const H = 200
// The opening page's hero (src/ui/quick.js): the same full-body framing as 'body', just a bigger
// canvas (crisper at ~45% of a phone screen) with a soft ground shadow under the feet.
const SIZES = { hero: [240, 420] }
const STORE = 'mzansiville.thumbs.v5' // (v5: curvy is reshaped; v4: dreads instead of braids)
const KEEP = 60 // pictures kept on the phone
let renderer = null
let scene = null
let camera = null
let shadowTexture = null
let sizeNow = [W, H] // (only resized when it actually changes: the hero kind is the only one that differs)
const cache = new Map()
let chain = Promise.resolve()
let stored = null

function storedPictures() {
  if (stored) return stored
  try { stored = JSON.parse(localStorage.getItem(STORE) || '{}') } catch { stored = {} }
  return stored
}
function keep(key, url) {
  const all = storedPictures()
  delete all[key]
  all[key] = url
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete all[old]
  try { localStorage.setItem(STORE, JSON.stringify(all)) } catch { /* full or blocked: memory only */ }
}

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(W, H, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b4a6a, 2.4))
  const key = new THREE.DirectionalLight(0xfff2dc, 2)
  key.position.set(2, 4, 5)
  scene.add(key)
  camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50)
}

// A soft, blurred dark oval (a canvas radial gradient): under the feet, so a hero render has
// somewhere to stand instead of floating on the transparent background.
function shadowTex() {
  if (shadowTexture) return shadowTexture
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(8,4,16,.4)')
  g.addColorStop(0.7, 'rgba(8,4,16,.16)')
  g.addColorStop(1, 'rgba(8,4,16,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  shadowTexture = new THREE.CanvasTexture(c)
  return shadowTexture
}

async function render(avatar, kind) {
  if (!renderer) setup()
  const [w, h] = SIZES[kind] || [W, H]
  if (w !== sizeNow[0] || h !== sizeNow[1]) {
    sizeNow = [w, h]
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const av = createAvatar(avatar)
  await av.userData.ready
  av.rotation.y = kind === 'hero' ? 0.3 : 0.35
  av.userData.pose = 'stand'
  poseAvatar(av, false, 0.4)
  poseAvatar(av, false, 0.45)
  // (people fade in as they arrive in the world; a picture shows them solid)
  appearNow(av)
  scene.add(av)
  av.updateMatrixWorld(true)
  let ground = null
  if (kind === 'hero') {
    ground = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, 0.003, 0.06)
    scene.add(ground)
  }
  // Frame it: the whole student (feet to the top of the hair) or head and shoulders.
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const [top, bottom] = kind === 'hair' ? [1.95, 1.3] : [1.95, -0.02]
  const tall = (top - bottom) * 1.12
  const dist = Math.max(tall / 2 / half, (kind === 'hair' ? 0.55 : 0.8) / 2 / (half * camera.aspect))
  const mid = (top + bottom) / 2
  camera.position.set(0, mid + 0.05, dist)
  camera.lookAt(0, mid, 0)
  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(av)
  if (ground) scene.remove(ground)
  av.userData.disposed = true
  return url
}

// A picture already made (memory or the phone), or null.
export function thumbNow(avatar, kind) {
  return storedPictures()[`${kind}|${JSON.stringify(avatar)}`] || null
}

// One at a time (they share the renderer). wanted(): still on screen when its turn
// comes? (A look nobody on screen wants any more, the player having changed away from
// it, is skipped, not drawn.)
export function thumbFor(avatar, kind, wanted) {
  const k = `${kind}|${JSON.stringify(avatar)}`
  const done = storedPictures()[k]
  if (done) return Promise.resolve(done)
  if (!cache.has(k)) {
    const entry = { wants: [] }
    entry.job = chain.then(() => {
      if (entry.wants.length && !entry.wants.some((w) => w())) { cache.delete(k); return null }
      return render(avatar, kind).then((url) => { keep(k, url); return url })
    })
    chain = entry.job.catch(() => null)
    cache.set(k, entry)
  }
  const entry = cache.get(k)
  if (wanted) entry.wants.push(wanted)
  return entry.job
}
