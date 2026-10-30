// The character creator's stage shows the real 3D student (the same model and
// colours as the morning, campus and lecture), dancing on the groove's beat.
// Loaded lazily so the menu bundle stays small; the SVG stays as the fallback.
import * as THREE from 'three'
import { BPM } from '../groove.js'
import { createAvatar, gesture, lookOf, poseAvatar } from '../world/avatar3d.js'

let renderer = null
let scene = null
let camera = null
let avatar = null
let key = ''
let frame = 0
let clock = 0
let last = 0
let nextMove = 0

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'cc-3d'
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5b4a6a, 2.2))
  const key = new THREE.DirectionalLight(0xfff2dc, 2)
  key.position.set(2, 4, 5)
  scene.add(key)
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  camera.position.set(0, 1.25, 5.4)
  camera.lookAt(0, 0.8, 0)
}

const MOVES = ['emote-yes', 'interact-right', 'interact-left', 'pick-up']

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  clock += dt
  if (avatar) {
    // A two-step on the beat: bounce every beat, sway every two, a move every two bars.
    const beat = (clock * BPM) / 60
    avatar.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.12
    avatar.rotation.y = Math.sin(beat * Math.PI / 2) * 0.45
    avatar.rotation.z = Math.sin(beat * Math.PI) * 0.06
    if (avatar.userData.rigged && beat >= nextMove) {
      gesture(avatar, MOVES[Math.floor(beat / 8) % MOVES.length])
      nextMove = Math.floor(beat / 8) * 8 + 8
    }
    poseAvatar(avatar, false, clock)
    avatar.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.12
  }
  const canvas = renderer.domElement
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) {
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Frame the whole student (about 2 m tall, 1.6 m wide with the sway) in any stage shape.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const dist = Math.max(1.05 / half, 0.68 / (half * camera.aspect)) + 0.2
    camera.position.set(0, 1.0, dist)
    camera.lookAt(0, 0.82, 0)
    camera.updateProjectionMatrix()
  }
  renderer.render(scene, camera)
}

// Called after every paint of the creator: the stage element is new each time,
// so the same canvas is moved into it.
export function showPreview(stage, look) {
  if (!stage) return
  if (!renderer) setup()
  const next = JSON.stringify(lookOf(look))
  if (next !== key) {
    if (avatar) { avatar.userData.disposed = true; scene.remove(avatar) }
    avatar = createAvatar(look)
    avatar.addEventListener('rigged', () => stage.isConnected && stage.classList.add('cc-has3d'))
    scene.add(avatar)
    key = next
    nextMove = 0
  }
  if (renderer.domElement.parentElement !== stage) stage.append(renderer.domElement)
  if (avatar.userData.rigged) stage.classList.add('cc-has3d')
  stage.dataset.look = next
  if (!frame) frame = requestAnimationFrame(tick)
}

export function hidePreview() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  renderer?.domElement.remove()
}
