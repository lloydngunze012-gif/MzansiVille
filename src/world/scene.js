import * as THREE from 'three'
import { homePlaceId } from '../engine/model.js'
import { createAvatar, poseAvatar } from './avatar3d.js'
import { createFollowCamera } from './camera.js'
import { createCampus } from './campus.js'
import { bindCampusInput } from './interact.js'
import { doorPoint } from './layout.js'
import { cellCenter, findPath, nearestOpen, pointBlocked } from './nav.js'

const WALK = 6.2
const host = document.getElementById('world')

let renderer
let scene
let camera
let rig
let input
let campus
let player
let sun
let sunTarget
let frame = 0
let visible = false
let builtId = ''
let spawnedKey = ''
let route = []
let steering = null
let walking = false
let clock = 0
let frames = 0
let fpsStamp = 0
const raycaster = new THREE.Raycaster()

function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.25)
}

function ensureRenderer() {
  if (renderer) return
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x9ecff0)
  host.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xc5e6f4, 55, 175)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 260)
  rig = createFollowCamera()

  scene.add(new THREE.HemisphereLight(0xfff6e4, 0x6ea85a, 0.9))
  const fill = new THREE.AmbientLight(0xfff1dc, 0.25)
  scene.add(fill)
  sun = new THREE.DirectionalLight(0xffe2b0, 1.25)
  sun.castShadow = true
  sun.shadow.mapSize.set(512, 512)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 80
  sun.shadow.camera.left = -28
  sun.shadow.camera.right = 28
  sun.shadow.camera.top = 28
  sun.shadow.camera.bottom = -28
  sunTarget = new THREE.Object3D()
  scene.add(sunTarget)
  sun.target = sunTarget
  scene.add(sun)

  input = bindCampusInput(renderer.domElement, {
    camera,
    cameraRig: rig,
    raycaster,
    pickables: () => (campus ? [campus.ground, campus.buildings] : []),
    onWalk: (x, z) => {
      if (!campus || !player) return
      const start = nearestOpen(campus.grid, player.position)
      const goal = nearestOpen(campus.grid, { x, z })
      route = findPath(campus.grid, start, goal)
      if (route.length) route.shift()
    },
    onStick: (x, z) => {
      route = []
      steering = { x, z }
    },
  })

  window.addEventListener('resize', resize)
}

function resize() {
  if (!renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function rebuild(district, homeId) {
  if (campus) scene.remove(campus.group)
  campus = createCampus(district, homeId)
  scene.add(campus.group)
  builtId = `${district.meta.id}|${homeId}`
}

function respawn(district, run) {
  const homeId = homePlaceId(district, run.character?.residence)
  const stamp = `${district.meta.id}|${homeId}`
  if (builtId !== stamp) rebuild(district, homeId)
  if (player) scene.remove(player)
  player = createAvatar(run.character?.avatar)
  const home = campus.layout.buildings.find((building) => building.id === homeId) || campus.layout.buildings[0]
  const open = nearestOpen(campus.grid, doorPoint(home))
  const spot = cellCenter(open.c, open.r)
  player.position.set(spot.x, 0, spot.z)
  scene.add(player)
  route = []
  spawnedKey = spawnKey(district, run)
  host.dataset.ready = '1'
}

function spawnKey(district, run) {
  const avatar = run.character?.avatar || {}
  return [district.meta.id, run.character?.residence, run.character?.name, avatar.skin, avatar.hair, avatar.outfit].join('|')
}

function tryStep(dx, dz) {
  const x = player.position.x + dx
  const z = player.position.z + dz
  if (!pointBlocked(campus.grid, x, z)) {
    player.position.x = x
    player.position.z = z
    return
  }
  if (!pointBlocked(campus.grid, x, player.position.z)) player.position.x = x
  else if (!pointBlocked(campus.grid, player.position.x, z)) player.position.z = z
}

function face(dx, dz) {
  if (dx * dx + dz * dz < 1e-5) return
  player.rotation.y = Math.atan2(dx, dz)
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (tick.last || now)) / 1000)
  tick.last = now
  steering = null
  input.stick()
  walking = false
  if (player && campus) {
    if (steering) {
      tryStep(steering.x * WALK * dt, steering.z * WALK * dt)
      face(steering.x, steering.z)
      walking = true
    } else if (route.length) {
      const next = route[0]
      const dx = next.x - player.position.x
      const dz = next.z - player.position.z
      const dist = Math.hypot(dx, dz)
      const step = WALK * dt
      if (dist <= step) {
        player.position.x = next.x
        player.position.z = next.z
        route.shift()
      } else {
        tryStep((dx / dist) * step, (dz / dist) * step)
      }
      face(dx, dz)
      walking = true
    }
    clock += dt
    poseAvatar(player, walking, clock)
    rig.apply(camera, player.position)
    sun.position.set(player.position.x + 22, 34, player.position.z + 12)
    sunTarget.position.set(player.position.x, 0, player.position.z)
    host.dataset.x = player.position.x.toFixed(1)
    host.dataset.z = player.position.z.toFixed(1)
  }
  renderer.render(scene, camera)
  frames += 1
  if (now - fpsStamp > 500) {
    host.dataset.fps = String(Math.round((frames * 1000) / (now - fpsStamp)))
    frames = 0
    fpsStamp = now
  }
}

function start() {
  if (frame) return
  fpsStamp = performance.now()
  frame = requestAnimationFrame(tick)
}

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
}

export function setVisible(on) {
  visible = on
  host.dataset.on = on ? '1' : '0'
  if (on) start()
  else stop()
}

export function showCampus(district, run) {
  if (!run) return
  ensureRenderer()
  const homeId = homePlaceId(district, run.character?.residence)
  const key = spawnKey(district, run)
  if (builtId !== `${district.meta.id}|${homeId}` || key !== spawnedKey) respawn(district, run)
  setVisible(true)
}

export function isWorldVisible() {
  return visible
}
