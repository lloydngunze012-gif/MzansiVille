// Day 1 morning slice: wake in the O Block room, noodles at the kettle, walk to the
// bus stop, ride the bus to campus. Loaded lazily (own chunk) from main.js.
import * as THREE from 'three'
import { createAvatar, poseAvatar } from './avatar3d.js'

const WAKE = 7 * 60
const BUS_FIRST = 7 * 60 + 45
const BUS_EVERY = 15
const RIDE = 15
const ON_TIME_BY = 8 * 60 + 45
const LECTURE = 9 * 60
const SPEED = 2.4

let host, renderer, scene, camera, player, roommate, kettle, steamGroup, bowl, packet, door, bus, busDoor, marker, sign
let opts = null
let running = false
let frame = 0
let last = 0
let clock = 0
let tasks = []
let camTarget = new THREE.Vector3()
let camOffset = new THREE.Vector3(0, 6.5, 7.5)
let camLook = new THREE.Vector3()
let walking = { player: false, roommate: false }
let tapHandler = null
let tapTargets = []
let idle = 0
let idleOn = false
let step = ''
const ray = new THREE.Raycaster()
const v = new THREE.Vector3()

function fmt(m) {
  const h = Math.floor(m / 60)
  const mm = Math.round(m % 60)
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// ---------- tiny task runner ----------
function task(update) {
  return new Promise((resolve) => tasks.push({ update, resolve }))
}
const wait = (s) => { let t = 0; return task((dt) => (t += dt) >= s) }
function tween(s, fn, ease = (x) => x * x * (3 - 2 * x)) {
  let t = 0
  return task((dt) => { t = Math.min(s, t + dt); fn(ease(t / s)); return t >= s })
}
function walk(who, pts, speed = SPEED) {
  const key = who === player ? 'player' : 'roommate'
  const path = pts.map(([x, z]) => new THREE.Vector3(x, 0, z))
  walking[key] = true
  return task((dt) => {
    let left = speed * dt
    while (left > 0 && path.length) {
      const to = path[0]
      const d = Math.hypot(to.x - who.position.x, to.z - who.position.z)
      if (d <= left) { who.position.x = to.x; who.position.z = to.z; path.shift(); left -= d; continue }
      const k = left / d
      const dx = (to.x - who.position.x) * k
      const dz = (to.z - who.position.z) * k
      who.position.x += dx
      who.position.z += dz
      who.rotation.y = Math.atan2(dx, dz)
      left = 0
    }
    if (!path.length) { walking[key] = false; return true }
    return false
  })
}
function face(who, x, z) { who.rotation.y = Math.atan2(x - who.position.x, z - who.position.z) }

// ---------- clock + stats ----------
function addMinutes(n, seconds = 0.8) {
  const run = opts.run
  const from = run.minutes
  let shown = from
  return tween(seconds, (k) => {
    const now = Math.round(from + n * k)
    if (now !== shown) { shown = now; run.minutes = now; opts.onUpdate() }
  }, (x) => x)
}
function changeStats(delta) {
  const run = opts.run
  const caps = { money: 1e9, energy: run.energyCap || 100, hunger: 100, grades: 100, social: 100 }
  for (const [k, d] of Object.entries(delta)) run.stats[k] = Math.max(0, Math.min(caps[k], (run.stats[k] || 0) + d))
  const words = { money: (d) => `${d > 0 ? '+' : '-'}R${Math.abs(d)}`, energy: (d) => `${d > 0 ? '+' : ''}${d} Energy`, hunger: (d) => `${d > 0 ? '+' : ''}${d} Fullness`, grades: (d) => `${d > 0 ? '+' : ''}${d} Grades`, social: (d) => `${d > 0 ? '+' : ''}${d} Social` }
  const parts = Object.entries(delta).filter(([, d]) => d).map(([k, d]) => `<span class="${d > 0 ? 'up' : 'down'}">${words[k](d)}</span>`)
  const node = uiq('.mm-float')
  node.innerHTML = parts.join(' ')
  node.hidden = false
  node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop')
  setTimeout(() => { node.hidden = true }, 1800)
  opts.onUpdate()
}

// ---------- UI in the host ----------
let uiRoot = null
const uiq = (sel) => uiRoot.querySelector(sel)
function ui() {
  if (uiRoot) return
  document.body.insertAdjacentHTML('beforeend', `<div class="mm-ui" id="morning-ui">
    <p class="mm-float" hidden></p>
    <p class="mm-bubble" hidden></p>
    <p class="mm-sign" hidden></p>
    <div class="mm-bar" hidden></div>
    <div class="mm-card" hidden></div>
  </div>`)
  uiRoot = document.getElementById('morning-ui')
}
function prompt(label, onTap) {
  const bar = uiq('.mm-bar')
  if (!label) { bar.hidden = true; bar.innerHTML = ''; return }
  bar.innerHTML = `<button type="button" class="mm-go" data-mm="go">${label}</button>`
  bar.hidden = false
  bar.querySelector('button').onclick = () => onTap()
}
function choices(title, list) {
  return new Promise((resolve) => {
    const bar = uiq('.mm-bar')
    bar.innerHTML = `<p class="mm-q">${title}</p>` + list.map((c, i) => `<button type="button" class="mm-go mm-choice" data-mm="choice" data-i="${i}">${c.label}<small>${c.note}</small></button>`).join('')
    bar.hidden = false
    bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { bar.hidden = true; resolve(Number(b.dataset.i)) } })
  })
}
function bubble(text, who) {
  const node = uiq('.mm-bubble')
  if (!text) { node.hidden = true; node.dataset.who = ''; return }
  node.textContent = text
  node.dataset.who = who === roommate ? 'roommate' : 'player'
  node.hidden = false
}
function pinTo(node, obj, y) {
  if (!node || node.hidden || !obj) return
  v.set(obj.position.x, y, obj.position.z).project(camera)
  node.style.left = `${Math.max(80, Math.min(window.innerWidth - 80, (v.x * 0.5 + 0.5) * window.innerWidth))}px`
  node.style.top = `${Math.max(250, (-v.y * 0.5 + 0.5) * window.innerHeight)}px`
}

// Wait for the player to tap the 3D target (or the big button).
function tapOn(objects, label, where) {
  return new Promise((resolve) => {
    tapTargets = objects
    marker.visible = true
    marker.position.set(where[0], 0.03, where[1])
    idleOn = true
    const go = () => { tapHandler = null; tapTargets = []; marker.visible = false; idleOn = false; prompt(''); resolve() }
    tapHandler = go
    prompt(label, go)
  })
}

// ---------- props ----------
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }) }
function box(w, h, d, color, x, y, z, parent = scene, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra))
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}
function textTexture(lines, bg = '#2a1846', fg = '#f0c400', w = 512, h = 256) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  g.fillStyle = bg; g.fillRect(0, 0, w, h)
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
  lines.forEach((line, i) => { g.font = `bold ${i ? 44 : 60}px system-ui, sans-serif`; g.fillText(line, w / 2, h / (lines.length + 1) * (i + 1)) })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(0xb5774a))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  // walls: back (with window), left, right (with door). Front left open like a dollhouse.
  box(6, 3, 0.15, 0xf3e3c6, 0, 1.5, -3).material.side = THREE.DoubleSide
  box(0.15, 3, 6, 0xeedcbc, -3, 1.5, 0)
  box(0.15, 3, 3.6, 0xeedcbc, 3, 1.5, -1.2)
  box(0.15, 3, 1.2, 0xeedcbc, 3, 1.5, 2.4)
  box(0.15, 0.9, 1.2, 0xeedcbc, 3, 2.55, 1.2)
  // window with golden light
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ color: 0xffd08a }))
  glass.position.set(0, 1.9, -2.91)
  scene.add(glass)
  box(1.95, 0.08, 0.1, 0x5b3a22, 0, 1.33, -2.88)
  box(1.95, 0.08, 0.1, 0x5b3a22, 0, 2.47, -2.88)
  box(0.06, 1.1, 0.1, 0x5b3a22, 0, 1.9, -2.88)
  // beds
  for (const [x, cover] of [[-2.1, 0x6b3fa0], [2.1, 0x2f7a5a]]) {
    box(1.1, 0.4, 2.1, 0x7a4b2a, x, 0.2, -1.7)
    box(1.0, 0.16, 2.0, cover, x, 0.48, -1.7)
    box(0.8, 0.14, 0.4, 0xfaf4e8, x, 0.6, -2.45)
  }
  // desk + chair + lamp
  box(1.4, 0.08, 0.7, 0x8c5a33, -2.2, 0.78, 1.5)
  for (const [dx, dz] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) box(0.06, 0.78, 0.06, 0x6a4024, -2.2 + dx, 0.39, 1.5 + dz)
  box(0.5, 0.06, 0.5, 0x3d2a5c, -1.3, 0.48, 1.5)
  box(0.3, 0.2, 0.05, 0x1c1915, -2.4, 0.95, 1.3) // book
  const lamp = new THREE.PointLight(0xffc27a, 6, 5, 2)
  lamp.position.set(-2.6, 1.4, 1.4)
  scene.add(lamp)
  box(0.08, 0.5, 0.08, 0xf0c400, -2.6, 1.07, 1.4)
  // counter shelf with kettle and noodles
  box(1.4, 0.9, 0.55, 0x8c5a33, 1.2, 0.45, -2.6)
  box(1.4, 0.06, 0.6, 0xd9c7a5, 1.2, 0.93, -2.6)
  kettle = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.3, 14), mat(0xe8e4dc, { metalness: 0.3, roughness: 0.35 }))
  body.position.y = 0.15
  kettle.add(body)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.18, 8), body.material)
  spout.position.set(0.18, 0.2, 0); spout.rotation.z = -0.9
  kettle.add(spout)
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x552222 }))
  light.position.set(0, 0.06, 0.18); light.name = 'led'
  kettle.add(light)
  kettle.position.set(0.9, 0.96, -2.55)
  kettle.userData.tap = true
  scene.add(kettle)
  packet = box(0.22, 0.05, 0.16, 0xe2412f, 1.55, 0.99, -2.55)
  bowl = new THREE.Group()
  bowl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.1, 14), mat(0xf4efe6)))
  const noodles = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 14), mat(0xf2c35b))
  noodles.position.y = 0.04
  bowl.add(noodles)
  bowl.visible = false
  scene.add(bowl)
  steamGroup = new THREE.Group()
  for (let i = 0; i < 10; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }))
    puff.userData.t = i / 10
    steamGroup.add(puff)
  }
  steamGroup.visible = false
  scene.add(steamGroup)
  // rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), mat(0xf0c400))
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.2)
  scene.add(rug)
  // door on a hinge at x=3, z=0.6..1.8
  door = new THREE.Group()
  door.position.set(3, 0, 0.6)
  const leaf = box(0.08, 2.1, 1.2, 0x6b3fa0, 0, 1.05, 0.6, door)
  leaf.userData.tap = true
  box(0.05, 0.05, 0.12, 0xf0c400, -0.06, 1.0, 1.05, door)
  scene.add(door)
}

function buildOutside() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 50), mat(0x7eae62))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(30, -0.01, 8)
  ground.receiveShadow = true
  scene.add(ground)
  // res block shell around the room (outer walls) + corridor/yard path
  box(10, 3.2, 0.3, 0xc9b28a, -2, 1.6, -3.3)
  box(0.3, 3.2, 7, 0xc9b28a, -3.3, 1.6, 0)
  const path = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), mat(0xd8c49a))
  path.rotation.x = -Math.PI / 2; path.position.set(9.5, 0.005, 1.2)
  scene.add(path)
  const path2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6), mat(0xd8c49a))
  path2.rotation.x = -Math.PI / 2; path2.position.set(16, 0.006, 3.6)
  scene.add(path2)
  // block label
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: textTexture(['O Block']) }))
  lab.position.set(4.5, 2.6, -3.1)
  scene.add(lab)
  // road
  const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 4), mat(0x4a4a52))
  road.rotation.x = -Math.PI / 2; road.position.set(30, 0.01, 8)
  scene.add(road)
  for (let x = -38; x < 100; x += 4) box(1.8, 0.01, 0.14, 0xf6f0e0, x, 0.02, 8)
  // trees
  for (const [x, z] of [[7, -2], [11, -1.5], [20, 2], [26, 3], [36, 3.5], [48, 3], [58, 3.2], [24, 13], [40, 12.5], [55, 13], [8, 12]]) {
    box(0.25, 1.2, 0.25, 0x6a4024, x, 0.6, z)
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), mat(0x3f7a3a))
    top.position.set(x, 1.8, z); top.castShadow = true
    scene.add(top)
  }
  // bus stop with shelter + sign
  box(2.6, 0.08, 1.2, 0x2a1846, 16, 2.4, 5.4)
  box(0.1, 2.4, 0.1, 0x2a1846, 14.8, 1.2, 5.0)
  box(0.1, 2.4, 0.1, 0x2a1846, 17.2, 1.2, 5.0)
  box(2.2, 0.1, 0.4, 0x8c5a33, 16, 0.5, 4.9)
  const stop = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['BUS', 'Westville Campus']) }))
  stop.position.set(16, 2.9, 5.45)
  scene.add(stop)
  sign = stop
  // campus gate at the far end
  box(0.6, 4, 0.6, 0xd9c7a5, 66, 2, 4.2)
  box(0.6, 4, 0.6, 0xd9c7a5, 74, 2, 4.2)
  box(8.6, 0.8, 0.6, 0x2a1846, 70, 4.2, 4.2)
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), new THREE.MeshBasicMaterial({ map: textTexture(['Campus Gate'], '#2a1846', '#f0c400', 512, 96) }))
  gate.position.set(70, 4.2, 4.52)
  scene.add(gate)
  box(12, 2.6, 6, 0xb9a3d6, 70, 1.3, -1.5)
  // bus
  bus = new THREE.Group()
  box(7, 2.2, 2.3, 0x4b2a7a, 0, 1.45, 0, bus)
  box(7.02, 0.25, 2.32, 0xf0c400, 0, 0.9, 0, bus)
  for (let i = 0; i < 5; i++) box(1.0, 0.7, 2.34, 0xbfe3f5, -2.6 + i * 1.25, 1.95, 0, bus, { roughness: 0.2, metalness: 0.2 })
  busDoor = box(0.9, 1.6, 0.06, 0x1d1236, 2.4, 1.15, -1.17, bus)
  for (const x of [-2.4, 2.2]) for (const z of [-1.1, 1.1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), mat(0x1c1915))
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z)
    bus.add(w)
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.4), new THREE.MeshBasicMaterial({ map: textTexture(['Westville'], '#1d1236', '#f0c400', 512, 110) }))
  plate.position.set(3.52, 2.25, 0); plate.rotation.y = Math.PI / 2
  bus.add(plate)
  bus.position.set(-40, 0, 7.4)
  bus.userData.tap = true
  scene.add(bus)
  // tap marker
  marker = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf0c400 }))
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  scene.add(marker)
}

function build() {
  host = document.createElement('div')
  host.id = 'morning3d'
  document.body.prepend(host)
  ui()
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  host.prepend(renderer.domElement)
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4c58e)
  scene.fog = new THREE.Fog(0xf4c58e, 30, 90)
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200)
  scene.add(new THREE.HemisphereLight(0xffe7c4, 0x6a4a3a, 0.75))
  const sun = new THREE.DirectionalLight(0xffb36b, 2.2)
  sun.position.set(-6, 9, -14)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 })
  scene.add(sun)
  scene.add(sun.target)
  scene.userData.sun = sun
  const glow = new THREE.PointLight(0xffb86e, 8, 7, 2)
  glow.position.set(0, 1.9, -2.4)
  scene.add(glow)
  buildRoom()
  buildOutside()
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!tapHandler) return
    const r = renderer.domElement.getBoundingClientRect()
    ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera)
    const hits = ray.intersectObjects([...tapTargets, marker], true)
    if (hits.length) tapHandler()
  })
}

function setStep(name) {
  step = name
  host.dataset.step = name
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  clock += dt
  tasks = tasks.filter((t) => { if (t.update(dt)) { t.resolve(); return false } return true })
  if (idleOn && opts) {
    idle += dt
    if (idle > 2.5) { idle = 0; opts.run.minutes += 1; opts.onUpdate() } // dawdling costs time
  }
  for (const [who, key] of [[player, 'player'], [roommate, 'roommate']]) {
    if (who && who.userData.pose === 'stand') poseAvatar(who, walking[key], clock)
  }
  if (marker.visible) marker.scale.setScalar(1 + Math.sin(clock * 5) * 0.12)
  if (steamGroup.visible) {
    for (const p of steamGroup.children) {
      p.userData.t = (p.userData.t + dt * 0.6) % 1
      p.position.set(Math.sin(p.userData.t * 9 + p.id) * 0.05, p.userData.t * 0.7, Math.cos(p.userData.t * 7) * 0.05)
      p.material.opacity = 0.7 * (1 - p.userData.t)
      p.scale.setScalar(0.6 + p.userData.t * 1.4)
    }
  }
  // camera follows its target smoothly
  const want = v.copy(camTarget).add(camOffset)
  camera.position.lerp(want, 1 - Math.exp(-dt * 3))
  camLook.lerp(camTarget, 1 - Math.exp(-dt * 4))
  camera.lookAt(camLook)
  const sun = scene.userData.sun
  sun.target.position.copy(camTarget)
  sun.position.set(camTarget.x - 6, 9, camTarget.z - 14)
  pinTo(uiq('.mm-float'), player.visible ? player : bus, 2.2)
  const b = uiq('.mm-bubble')
  pinTo(b, b.dataset.who === 'roommate' ? roommate : player, 2.1)
  host.dataset.px = player.position.x.toFixed(2)
  host.dataset.pz = player.position.z.toFixed(2)
  host.dataset.busx = bus.position.x.toFixed(2)
  host.dataset.door = door.rotation.y.toFixed(2)
  host.dataset.clock = fmt(opts.run.minutes)
  renderer.render(scene, camera)
}

function follow(obj, offset) {
  if (offset) camOffset.set(...offset)
  const t = task(() => { camTarget.set(obj.position.x, 0.8, obj.position.z); return !running || obj.userData.followEnd })
  obj.userData.followEnd = false
  return t
}
function stopFollow(obj) { obj.userData.followEnd = true }

// ---------- the scripted morning ----------
async function play() {
  const run = opts.run
  const roomieTakes = opts.forceRoommate || Math.random() < 0.35
  host.dataset.roommate = roomieTakes ? '1' : '0'
  // 1. wake in bed
  setStep('wake')
  player.userData.pose = 'lie'
  player.position.set(-2.1, 0.62, -1.1)
  player.rotation.set(-Math.PI / 2, 0, 0)
  camTarget.set(-2.1, 0.6, -1.6)
  camOffset.set(1.2, 2.6, 3.6)
  camera.position.set(-1.4, 2.1, 0.8)
  camLook.copy(camTarget)
  roommate.position.set(2.1, 0, -0.4)
  face(roommate, 0, 0)
  bubble('07:00. Alarm. Day one.', player)
  await wait(1.0)
  // sit up, then swing out of bed
  await tween(0.8, (k) => { player.rotation.x = -Math.PI / 2 * (1 - k); player.position.y = 0.62 + k * 0.1 })
  await tween(0.7, (k) => { player.position.x = -2.1 + k * 0.85; player.position.y = 0.72 * (1 - k); player.rotation.y = k * Math.PI / 2 })
  player.position.y = 0
  player.userData.pose = 'stand'
  bubble('')
  await addMinutes(2, 0.5)
  camOffset.set(0, 5.2, 6.2)
  follow(player)
  // 2. kettle
  setStep('kettle')
  await tapOn([kettle], '\u2615 Make noodles at the kettle', [0.9, -2.0])
  setStep('kettle-walk')
  if (roomieTakes) {
    // roommate gets there first
    walk(roommate, [[1.9, -1.2], [1.55, -2.1]], 2.6)
    await walk(player, [[-0.6, -0.9], [0.6, -1.7]])
    face(player, 0.9, -2.55)
    setStep('roommate')
    face(roommate, 1.55, -2.55)
    await tween(0.5, (k) => { packet.position.set(1.55, 0.99 + k * 0.4, -2.55 + k * 0.4) })
    packet.visible = false
    face(roommate, player.position.x, player.position.z)
    bubble('Sorry! Last packet \u{1F605} I\u2019ll buy more later.', roommate)
    await wait(2.2)
    bubble('')
    walk(roommate, [[2.1, -0.4]], 1.8)
    const pick = await choices('No noodles left. What now?', [
      { label: '\u{1F6D2} Tuck shop noodles', note: 'R12 \u00b7 +25 Fullness \u00b7 costs 10 min' },
      { label: '\u{1F6AB} Skip breakfast', note: '\u221210 Fullness \u00b7 \u22125 Energy \u00b7 no time' },
    ])
    host.dataset.choice = pick ? 'skip' : 'tuck'
    if (pick === 0) {
      setStep('tuckshop')
      await walk(player, [[2.4, 1.2]])
      await tween(0.6, (k) => { door.rotation.y = -k * 1.4 })
      await walk(player, [[3.6, 1.2]])
      player.visible = false
      await addMinutes(10, 1.4)
      player.visible = true
      bowl.visible = true
      await walk(player, [[2.4, 1.2]])
      await tween(0.5, (k) => { door.rotation.y = -1.4 * (1 - k) })
      await eat()
      changeStats({ money: -12, hunger: 25 })
    } else {
      setStep('skip')
      bubble('Fine. I\u2019ll survive till lunch\u2026', player)
      await wait(1.6)
      bubble('')
      changeStats({ hunger: -10, energy: -5 })
    }
  } else {
    await walk(player, [[-0.6, -0.9], [0.6, -1.9]])
    face(player, 0.9, -2.55)
    setStep('noodles')
    kettle.getObjectByName('led').material.color.set(0xff5533)
    steamGroup.visible = true
    steamGroup.position.set(1.08, 1.28, -2.55)
    await tween(0.4, (k) => { kettle.position.y = 0.96 + Math.sin(k * Math.PI * 6) * 0.01 })
    await addMinutes(4, 1.2)
    await tween(0.3, (k) => { packet.position.set(1.55 - k * 0.6, 0.99 + k * 0.2, -2.55 + k * 0.5) })
    packet.visible = false
    await addMinutes(6, 1.0)
    kettle.getObjectByName('led').material.color.set(0x552222)
    await eat()
    changeStats({ hunger: 35, energy: 5 })
  }
  // 3. out the door
  setStep('door')
  await tapOn([door], '\u{1F6AA} Head out to the bus stop', [2.4, 1.2])
  setStep('exit')
  await walk(player, [[2.4, 1.2]])
  await tween(0.6, (k) => { door.rotation.y = -1.4 * Math.max(k, Math.abs(door.rotation.y) / 1.4) })
  camOffset.set(0, 6, 7)
  await walk(player, [[3.8, 1.2], [5.5, 1.2]])
  setStep('to-stop')
  await tapOn([sign], '\u{1F68F} Walk to the bus stop', [16, 4.6])
  setStep('walk-stop')
  const walkStart = run.minutes
  await Promise.all([walk(player, [[9, 1.2], [15.4, 1.6], [15.6, 4.6]], 3.6), addMinutes(5, 3.2)])
  face(player, 16, 8)
  void walkStart
  // 4. bus
  setStep('stop')
  const next = Math.max(BUS_FIRST, BUS_FIRST + Math.ceil((run.minutes - BUS_FIRST) / BUS_EVERY) * BUS_EVERY)
  const missed = run.minutes > BUS_FIRST && next > BUS_FIRST
  const signNode = uiq('.mm-sign')
  signNode.hidden = false
  const showSign = () => {
    const left = Math.max(0, next - run.minutes)
    signNode.innerHTML = `${missed ? `<em>Missed the ${fmt(next - BUS_EVERY)}.</em> ` : ''}Next bus <b>${fmt(next)}</b> \u00b7 in ${left} min`
  }
  showSign()
  host.dataset.nextbus = fmt(next)
  camOffset.set(-6, 4.5, 8)
  await wait(0.8)
  const waitMin = next - run.minutes
  // clock runs forward while the bus drives in
  setStep('bus-arriving')
  await Promise.all([
    (async () => { const from = run.minutes; await tween(Math.max(1.2, Math.min(4, waitMin * 0.15)), (k) => { const m = Math.round(from + waitMin * k); if (m !== run.minutes) { run.minutes = m; showSign(); opts.onUpdate() } }, (x) => x) })(),
    (async () => { bus.position.x = -40; camTarget.set(8, 0.8, 6); await wait(Math.max(0, Math.min(4, waitMin * 0.15) - 2.4)); stopFollow(player); follow(bus, [-4, 5, 10]); await tween(2.4, (k) => { bus.position.x = -40 + 54 * (1 - (1 - k) * (1 - k)) }, (x) => x) })(),
  ])
  run.minutes = next
  opts.onUpdate()
  signNode.hidden = true
  await tween(0.5, (k) => { busDoor.position.x = 2.4 - k * 0.95 })
  setStep('board')
  stopFollow(bus)
  follow(player, [-3, 4.5, 7])
  await tapOn([bus], '\u{1F68C} Get on the bus', [15.4, 6.2])
  setStep('boarding')
  await walk(player, [[15.4, 6.2]])
  await tween(0.4, (k) => { player.scale.setScalar(1 - k * 0.9) })
  player.visible = false
  player.scale.setScalar(1)
  await tween(0.4, (k) => { busDoor.position.x = 1.45 + k * 0.95 })
  // 5. ride
  setStep('riding')
  stopFollow(player)
  follow(bus, [-5, 4, 9])
  const from = run.minutes
  await tween(3.2, (k) => {
    bus.position.x = 14 + 56 * k
    const m = Math.round(from + RIDE * k)
    if (m !== run.minutes) { run.minutes = m; opts.onUpdate() }
  })
  await tween(0.5, (k) => { busDoor.position.x = 2.4 - k * 0.95 })
  // 6. step off at the gate
  setStep('arrive')
  player.position.set(bus.position.x + 1.5, 0, 6.2)
  player.visible = true
  stopFollow(bus)
  follow(player, [0, 5, 8])
  await walk(player, [[71.5, 5.0]])
  face(player, 70, 0)
  const arrived = run.minutes
  const onTime = arrived <= ON_TIME_BY
  if (!onTime) changeStats({ grades: -2 })
  setStep('done')
  host.dataset.ontime = onTime ? '1' : '0'
  const card = uiq('.mm-card')
  card.innerHTML = `<p class="mm-kind">${onTime ? 'On time' : 'Running late'}</p>
    <h2>${onTime ? 'You made it to campus' : 'You made it\u2026 just'}</h2>
    <p class="mm-times"><span>Arrived <b>${fmt(arrived)}</b></span><span>Lecture <b>${fmt(LECTURE)}</b></span></p>
    <p>${onTime ? `${LECTURE - arrived} minutes to find your venue and a seat.` : 'You slip in after it started. \u22122 Grades.'}</p>
    <button type="button" class="mm-go" data-mm="continue">Continue to the lecture \u203a</button>`
  card.hidden = false
  await new Promise((resolve) => { card.querySelector('button').onclick = resolve })
  card.hidden = true
  opts.onDone({ arrived, onTime })
}

async function eat() {
  setStep('eating')
  bowl.visible = true
  steamGroup.visible = true
  const follower = task(() => {
    bowl.position.set(player.position.x + Math.sin(player.rotation.y) * 0.35, 1.0, player.position.z + Math.cos(player.rotation.y) * 0.35)
    steamGroup.position.copy(bowl.position)
    return !bowl.visible
  })
  bubble('Mmm\u2026 2-minute noodles.', player)
  await tween(2.0, (k) => { player.userData.bob.position.y = 0.78 + Math.sin(k * Math.PI * 6) * 0.03 })
  bubble('')
  bowl.visible = false
  steamGroup.visible = false
  await follower
}

export function startMorning(options) {
  opts = options
  if (!renderer) build()
  host.hidden = false
  uiRoot.hidden = false
  host.dataset.on = '1'
  if (running) return
  running = true
  tasks = []
  if (player) scene.remove(player)
  if (roommate) scene.remove(roommate)
  player = createAvatar(opts.run.character?.avatar)
  player.userData.pose = 'stand'
  scene.add(player)
  roommate = createAvatar({ skin: 'deep', hair: 'curls', outfit: 'jacket' })
  roommate.userData.pose = 'stand'
  scene.add(roommate)
  packet.visible = true
  packet.position.set(1.55, 0.99, -2.55)
  door.rotation.y = 0
  bus.position.x = -40
  busDoor.position.x = 2.4
  for (const n of uiRoot.querySelectorAll('.mm-bar,.mm-card,.mm-sign,.mm-bubble,.mm-float')) n.hidden = true
  last = 0
  if (!frame) frame = requestAnimationFrame(tick)
  play().catch((e) => { console.error(e) }).finally(() => { running = false })
}

export function stopMorning() {
  running = false
  tasks.forEach((t) => t.resolve())
  tasks = []
  tapHandler = null
  idleOn = false
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (host) { host.hidden = true; host.dataset.on = '0'; uiRoot.hidden = true }
}
