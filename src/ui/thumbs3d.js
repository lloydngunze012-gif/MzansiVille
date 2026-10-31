// Creator icons drawn from the real 3D models (the same clothes, hair and body as
// in the game): one small offscreen renderer, one picture per look, cached.
// Outfits and bodies show the whole student; hair shows head and shoulders.
import * as THREE from 'three'
import { createAvatar, poseAvatar } from '../world/avatar3d.js'

const W = 120
const H = 200
let renderer = null
let scene = null
let camera = null
const cache = new Map()
let chain = Promise.resolve()

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

async function render(avatar, kind) {
  if (!renderer) setup()
  const av = createAvatar(avatar)
  await av.userData.ready
  av.rotation.y = 0.35
  av.userData.pose = 'stand'
  poseAvatar(av, false, 0.4)
  poseAvatar(av, false, 0.45)
  scene.add(av)
  av.updateMatrixWorld(true)
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
  av.userData.disposed = true
  return url
}

// One at a time (they share the renderer).
export function thumbFor(avatar, kind) {
  const k = `${kind}|${JSON.stringify(avatar)}`
  if (!cache.has(k)) {
    const job = chain.then(() => render(avatar, kind))
    chain = job.catch(() => null)
    cache.set(k, job)
  }
  return cache.get(k)
}
