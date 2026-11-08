// Day 1: leaving home. You wake in your bedroom at your family home, look out at the
// street, go down to breakfast with your parent and sibling, take your bags and get in
// the car. Playable like campus (tap to walk, swipe to look, Top / Sims / Eye), not a
// cutscene. The style of home (suburban house, township street house) comes from the
// student's "From" answer (data/campusville/homes.json). Its own chunk, and its models
// (public/models/home/, Draco) load only here, so only day 1 pays for them.
import * as THREE from 'three'
import HOMES from '../../data/campusville/homes.json'
import { loop as soundLoop, sfx } from '../audio.js'
import { genderOf } from '../avatar.js'
import { fromKey } from '../from.js'
import { appearNow, createAvatar, layDown, warmLook, measureBody, poseAvatar } from './avatar3d.js'
import { createCameraRig } from './camera.js'
import { createPlayer } from './player.js'
import { bindInput } from './input.js'
import { loadModel } from './models.js'
import { SPEED as FAST } from '../speed.js'
import { smooth } from '../smooth.js'
import * as curtain from '../curtain.js'

export function homeStyleId(character) {
  const id = HOMES.from[fromKey(character?.from, HOMES.from)] || HOMES.default
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('home')
  return HOMES.styles[q] ? q : id
}

const UP = 2.68 // the upstairs floor (the kit's stairs climb exactly this)
const SEAT_Y = 0.48 // the kit chair's seat top (0.24 x FURN)
// The kitchen chairs (x, z, facing: the way you face sitting in it). The kit's chair faces +z.
const CHAIRS = {
  me: { x: -1.45, z: 1.1, rot: Math.PI }, // south of the table, facing it
  sibling: { x: -1.45, z: -0.7, rot: 0 }, // north of it, straight across from you (Eye view looks at them)
  parent: { x: -3.05, z: 0.2, rot: Math.PI / 2 }, // at the west end
}
const FURN = 2 // Kenney furniture kit: one unit is half a metre
const STREET_Z = 11 // middle of the road in front of the house
const ROAD_W = 7
const WAKE = 6 * 60 + 30
const DRIVE_MIN = 70 // home to the Main Gate, under the fade
const AUTO_TALK = typeof location !== 'undefined' && new URLSearchParams(location.search).get('talk') === 'auto'

let opts = null
let style = null
let styleId = ''
let host, renderer, scene, camera, rig, mover, input, sun
let uiRoot = null
let running = false
let frame = 0
let last = 0
let clock = 0
let tasks = []
let player, parent, sibling, neighbour, dog, car
const parkedCars = [] // (the cars along the far kerb: x, z, length, width)
const walkers = []
let level = 1 // 1 upstairs, 0 downstairs, -1 outside
let override = null // a fixed camera shot (the window, the drive)
let upstairs, downstairs, shell, marker, plate, bags, hose
let tapTargets = []
let stepTarget = null
let dogMixer = null
const dogClips = {}
let dogClip = ''
let frameCount = 0
const occluders = [] // trees and the like: see-through too when they hide you
const ray = new THREE.Raycaster()
const v = new THREE.Vector3()

// ---------- tiny task runner (like the morning) ----------
function task(update) { return new Promise((resolve) => tasks.push({ update, resolve })) }
const wait = (s) => { let t = 0; return task((dt) => (t += dt) >= s) }
function tween(s, fn, ease = (x) => x * x * (3 - 2 * x)) {
  let t = 0
  return task((dt) => { t = Math.min(s, t + dt); fn(ease(t / s)); return t >= s })
}
function setStep(name) { host.dataset.step = name }
function fmt(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}` }
function fill(text, vars = {}) {
  const all = { neighbour: style.neighbour.name, dog: style.dog.name, call: style.parent.call, sibling: style.sibling.name, ...vars }
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in all ? String(all[k]) : m))
}
const L = (key, vars) => fill(style.lines[key], vars)
function addMinutes(n, seconds = 0.6) {
  const run = opts.run
  const from = run.minutes
  return tween(seconds, (k) => { const now = Math.round(from + n * k); if (now !== run.minutes) { run.minutes = now; opts.onUpdate() } }, (x) => x)
}
function changeStats(delta) {
  const run = opts.run
  const caps = { money: 1e9, energy: run.energyCap || 100, hunger: 100, grades: 100, social: 100 }
  for (const [k, d] of Object.entries(delta)) run.stats[k] = Math.max(0, Math.min(caps[k], (run.stats[k] || 0) + d))
  const words = { money: (d) => `+R${d}`, energy: (d) => `+${d} Energy`, hunger: (d) => `+${d} Fullness`, social: (d) => `+${d} Social` }
  const node = uiq('.mm-float')
  node.innerHTML = Object.entries(delta).filter(([, d]) => d).map(([k, d]) => `<span class="up">${words[k]?.(d) || ''}</span>`).join(' ')
  node.hidden = false
  node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop')
  setTimeout(() => { node.hidden = true }, 1800)
  opts.onUpdate()
}

// ---------- UI (the morning's classes: bubbles, a choice bar, a fade) ----------
const uiq = (sel) => uiRoot.querySelector(sel)
function ui() {
  if (uiRoot) return
  document.body.insertAdjacentHTML('beforeend', `<div class="mm-ui" id="home-ui">
    <p class="mm-float" hidden></p>
    <p class="mm-bubble" hidden></p>
    <div class="mm-bar" hidden></div>
    <div class="mm-fade" hidden><p></p></div>
  </div>`)
  uiRoot = document.getElementById('home-ui')
}
function closeBar() {
  const bar = uiq('.mm-bar')
  bar.querySelectorAll('button').forEach((b) => { b.disabled = true; b.onclick = null })
  bar.hidden = true
  bar.innerHTML = ''
}
function choices(title, list) {
  return new Promise((resolve) => {
    const bar = uiq('.mm-bar')
    bar.innerHTML = `<p class="mm-q">${title}</p>` + list.map((c, i) => `<button type="button" class="mm-go mm-choice" data-mm="choice" data-i="${i}">${c}</button>`).join('')
    bar.hidden = false
    bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { closeBar(); resolve(Number(b.dataset.i)) } })
  })
}
let speaker = null
function bubble(text, who) {
  const node = uiq('.mm-bubble')
  if (!text) { node.hidden = true; speaker = null; return }
  node.textContent = ''
  const name = who === parent ? style.parent.call : who === sibling ? style.sibling.name : who === neighbour ? style.neighbour.name : ''
  if (name) { const b = document.createElement('b'); b.className = 'mm-name'; b.textContent = name; node.append(b) }
  node.append(document.createTextNode(text))
  node.dataset.who = who === player ? 'player' : 'other'
  speaker = who || player
  node.hidden = false
}
function tapNext(node) {
  node?.classList.add('tap')
  return new Promise((resolve) => {
    const since = performance.now()
    const done = () => { node?.classList.remove('tap'); window.removeEventListener('pointerup', onTap, true); resolve() }
    const onTap = (e) => { if (e.target.closest?.('button') || performance.now() - since < 250) return; done() }
    if (AUTO_TALK) { setTimeout(done, 700); return }
    window.addEventListener('pointerup', onTap, true)
  })
}
async function talk(text, who) { bubble(text, who); await tapNext(uiq('.mm-bubble')); bubble('') }
async function fadeOut(text) {
  const f = uiq('.mm-fade')
  f.querySelector('p').textContent = text
  f.hidden = false
  f.style.opacity = 0
  host.dataset.fade = '1'
  await tween(0.4, (k) => { f.style.opacity = k })
}
async function fadeIn() {
  const f = uiq('.mm-fade')
  await tween(0.4, (k) => { f.style.opacity = 1 - k })
  f.hidden = true
  host.dataset.fade = '0'
}
async function underFade(text, during) { await fadeOut(text); try { await during?.() } finally { await fadeIn() } }
function pinTo(node, obj, y) {
  if (!node || node.hidden || !obj) return
  v.set(obj.position.x, obj.position.y + y, obj.position.z).project(camera)
  const bar = document.querySelector('.g-goal') || document.querySelector('.g-hud')
  const floor = (bar ? bar.getBoundingClientRect().bottom : 200) + 10
  const half = node.offsetWidth / 2 + 8
  node.style.left = `${Math.max(half, Math.min(window.innerWidth - half, (v.x * 0.5 + 0.5) * window.innerWidth))}px`
  node.style.top = `${Math.max(floor + node.offsetHeight, Math.min(window.innerHeight - 220, (-v.y * 0.5 + 0.5) * window.innerHeight))}px`
}

// ---------- models: three kit files, Draco ----------
const KITS = { suburb: '/models/home/suburb-kit.glb', furniture: '/models/home/furniture-kit.glb', town: '/models/home/town-kit.glb' }
let gltfLoader = null
async function loader() {
  if (gltfLoader) return gltfLoader
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')])
  gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/').setDecoderConfig({ type: 'wasm' }))
  return gltfLoader
}
const kits = {}
function kit(name) {
  kits[name] ||= loader().then((l) => l.loadAsync(KITS[name])).then((gltf) => {
    // Keyed by the node's name in the file: three.js renames duplicates ("chair" is also a
    // part inside chairDesk, so the kit's own chair loaded as "chair_1" and never appeared).
    const parts = {}
    const nodes = gltf.parser.json.nodes || []
    for (const child of gltf.scene.children) {
      const ref = gltf.parser.associations.get(child)
      parts[(ref?.nodes !== undefined && nodes[ref.nodes]?.name) || child.name] = child
    }
    return parts
  })
  return kits[name]
}
// A copy of one model, centred on x/z with its base on y = 0. fit: [w, h, d] metres
// (stretched to it), or scale: a number. matFn swaps materials (recolouring).
function piece(parts, name, { fit, scale = 1, matFn } = {}) {
  const root = new THREE.Group()
  const src = parts?.[name]
  if (!src) { console.warn('home: no model', name); return root }
  const inner = src.clone(true)
  inner.position.set(0, 0, 0)
  inner.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(inner)
  const size = box.getSize(new THREE.Vector3())
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(-c.x, -box.min.y, -c.z)
  inner.traverse((n) => {
    if (!n.isMesh) return
    n.castShadow = true
    n.receiveShadow = true
    if (matFn) n.material = Array.isArray(n.material) ? n.material.map(matFn) : matFn(n.material)
  })
  root.add(inner)
  if (fit) root.scale.set(fit[0] / size.x, fit[1] / size.y, fit[2] / size.z)
  else root.scale.setScalar(scale)
  root.userData.size = size.clone().multiply(root.scale)
  return root
}

// Kenney's suburban kit paints from one colour map: roofs (green) and fences (orange)
// are recoloured to the style's palette by repainting those swatches.
const ROOF_SWATCHES = [[0, 128, 64, 128]]
const FENCE_SWATCHES = [[256, 256, 64, 128]]
const mapCache = new Map()
function repaint(material, swaps) {
  const key = material.uuid + JSON.stringify(swaps)
  if (mapCache.has(key)) return mapCache.get(key)
  const img = material.map?.image
  if (!img) return material
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const g = canvas.getContext('2d')
  g.drawImage(img, 0, 0)
  for (const [rect, hex] of swaps) {
    const [x, y, w, h] = rect.map((n) => Math.round((n / 512) * img.width))
    const data = g.getImageData(x, y, w, h)
    const want = new THREE.Color(hex)
    let avg = 0
    for (let i = 0; i < data.data.length; i += 4) avg += data.data[i] + data.data[i + 1] + data.data[i + 2]
    avg /= data.data.length / 4
    for (let i = 0; i < data.data.length; i += 4) {
      const l = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / (avg || 1)
      data.data[i] = Math.min(255, want.r * 255 * l)
      data.data[i + 1] = Math.min(255, want.g * 255 * l)
      data.data[i + 2] = Math.min(255, want.b * 255 * l)
    }
    g.putImageData(data, x, y)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.flipY = material.map.flipY
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = material.map.magFilter
  tex.minFilter = material.map.minFilter
  const m = material.clone()
  m.map = tex
  mapCache.set(key, m)
  return m
}
// Quaternius buildings: each material by name, painted from the style's palette.
function townMats(paint, roof) {
  const c = style.colours
  const base = { Main: paint, Bricks: c.wall, Light: '#f3e6c8', Dark: '#5a554e', White: c.trim || '#f6f2ea', Wood: '#8a5a3a', DarkWood: '#5a3a26', Glass: '#9cc8de', RoofBricks: roof, Black: '#2f2f2f', DarkBrown: '#4a3020' }
  const made = {}
  return (m) => {
    const hex = base[m.name]
    if (!hex) return m
    made[m.name] ||= new THREE.MeshStandardMaterial({ name: m.name, color: hex, roughness: m.name === 'Glass' ? 0.25 : 0.85, metalness: m.name === 'RoofBricks' ? 0.15 : 0 })
    return made[m.name]
  }
}
const tinted = new Map()
function tint(hex) {
  return (m) => {
    const key = m.uuid + hex
    if (!tinted.has(key)) { const t = m.clone(); t.color = new THREE.Color(hex); tinted.set(key, t) }
    return tinted.get(key)
  }
}

// ---------- the world ----------
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }) }
function plane(w, d, color, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color))
  m.rotation.x = -Math.PI / 2
  m.position.set(x, y, z)
  m.receiveShadow = true
  parent.add(m)
  return m
}
function place(obj, x, y, z, rot = 0, parent = scene) { obj.position.set(x, y, z); obj.rotation.y = rot; parent.add(obj); return obj }

// Solid boxes per level, for walking (minX, maxX, minZ, maxZ).
const solids = { 0: [], 1: [], '-1': [] }
const bounds = {
  1: { minX: -3.7, maxX: 3.7, minZ: -2.7, maxZ: 2.7 },
  0: { minX: -3.7, maxX: 3.75, minZ: -2.7, maxZ: 2.7 },
  '-1': { minX: -8, maxX: 9, minZ: 3.4, maxZ: 8.2 },
}
function solid(lv, x, z, w, d) { solids[lv].push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }) }
const BODY = 0.28
function blockedAt(x, z) {
  const b = bounds[level]
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true
  return solids[level].some((s) => x > s.minX - BODY && x < s.maxX + BODY && z > s.minZ - BODY && z < s.maxZ + BODY)
}
// A route around furniture (grid A*, 0.25 m), ending exactly at (tx, tz).
function route(tx, tz) {
  const C = 0.25
  const ci = (n) => Math.round(n / C)
  const key = (i, j) => `${i},${j}`
  const [si, sj, gi, gj] = [ci(player.position.x), ci(player.position.z), ci(tx), ci(tz)]
  const open = [[si, sj]]
  const g = new Map([[key(si, sj), 0]])
  const came = new Map()
  const h = (i, j) => Math.hypot(i - gi, j - gj)
  for (let guard = 0; open.length && guard < 5000; guard++) {
    open.sort((a, b) => g.get(key(...a)) + h(...a) - (g.get(key(...b)) + h(...b)))
    const [i, j] = open.shift()
    if (i === gi && j === gj) {
      const out = []
      for (let k = key(i, j); k; k = came.get(k)) { const [a, b] = k.split(',').map(Number); out.unshift({ x: a * C, z: b * C }) }
      out[out.length - 1] = { x: tx, z: tz }
      return out.slice(1).filter((p, n, all) => n === all.length - 1 || n % 2 === 1)
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [ni, nj] = [i + di, j + dj]
      if (!(ni === gi && nj === gj) && blockedAt(ni * C, nj * C)) continue
      const cost = g.get(key(i, j)) + Math.hypot(di, dj)
      if (cost < (g.get(key(ni, nj)) ?? Infinity)) { g.set(key(ni, nj), cost); came.set(key(ni, nj), key(i, j)); open.push([ni, nj]) }
    }
  }
  return [{ x: tx, z: tz }]
}
function walkTo(x, z, near = 0.18) {
  return new Promise((resolve) => mover.walkTo(route(x, z), { near, done: resolve }))
}

// The house: two floors from the furniture kit's walls, floors and stairs; the outside
// shell (a kit house) shows only while you're outside.
function wallRun(group, kind, x, y, z, rot, wallMat) {
  const w = piece(furn, kind, { scale: FURN, matFn: wallMat })
  return place(w, x, y, z, rot, group)
}
let furn = null
function buildHouse(furnParts, homeParts) {
  furn = furnParts
  const I = style.interior
  const wallDown = tint(I.wall)
  const wallUp = tint(I.wallUp)
  downstairs = new THREE.Group()
  downstairs.name = 'downstairs'
  upstairs = new THREE.Group()
  upstairs.name = 'upstairs'
  scene.add(downstairs, upstairs)
  for (const [group, y, wm, front] of [[downstairs, 0, wallDown, ['wallWindow', 'wallWindow', 'wall', 'wallDoorway']], [upstairs, UP, wallUp, ['wallWindow', 'wallWindow', 'wall', 'wallWindow']]]) {
    front.forEach((kind, i) => wallRun(group, kind, -3 + i * 2, y, 3, 0, wm))
    ;['wallWindow', 'wall', 'wall', 'wall'].forEach((kind, i) => wallRun(group, kind, -3 + i * 2, y, -3, Math.PI, wm))
    ;[-2, 0, 2].forEach((z, i) => wallRun(group, i === 1 ? 'wallWindow' : 'wall', -4, y, z, Math.PI / 2, wm))
    ;[-2, 0, 2].forEach((z) => wallRun(group, 'wall', 4, y, z, -Math.PI / 2, wm))
  }
  // floors (the upstairs one leaves the stairwell open)
  plane(8, 6, I.floor, 0, 0.01, 0, downstairs)
  for (let x = -3; x <= 3; x += 2) for (let z = -2; z <= 2; z += 2) {
    if (z === -2 && x > 0) continue
    place(piece(furn, 'floorFull', { fit: [2, 0.1, 2], matFn: tint(I.floorUp) }), x, UP - 0.1, z, 0, upstairs)
  }
  // stairs along the back wall, climbing to the east
  const stairs = place(piece(furn, 'stairs', { scale: FURN }), 2.0, 0, -2.2, 0, downstairs)
  stairs.name = 'stairs'
  solid(0, 2.0, -2.2, 3.7, 1.6)
  solid(1, 2.0, -2.0, 4.0, 2.0) // the stairwell, from above
  // --- downstairs: kitchen, table, lounge, the bags by the door
  const k = (name, x, z, rot = 0, y = 0, opt = {}) => place(piece(furn, name, { scale: FURN, ...opt }), x, y, z, rot, downstairs)
  ;[['kitchenFridge', -3.5], ['kitchenStove', -2.64], ['kitchenSink', -1.78], ['kitchenCabinetDrawer', -0.92]].forEach(([n, x]) => k(n, x, -2.55))
  k('kitchenCabinetUpper', -2.64, -2.75, 0, 1.55)
  k('kitchenCabinetUpper', -1.78, -2.75, 0, 1.55)
  k('toaster', -0.95, -2.5, 0, 0.9)
  solid(0, -2.2, -2.55, 3.5, 0.95)
  k('table', -1.9, 0.2, 0)
  solid(0, -1.9, 0.2, 1.7, 0.95)
  for (const c of Object.values(CHAIRS)) k('chair', c.x, c.z, c.rot)
  k('loungeSofa', 1.0, 2.45, Math.PI)
  solid(0, 1.0, 2.45, 2.0, 0.9)
  k('tableCoffee', 1.0, 1.35, 0)
  solid(0, 1.0, 1.35, 1.3, 0.8)
  k('cabinetTelevision', 1.0, -1.15, 0)
  k('televisionModern', 1.0, -1.15, 0, 0.62)
  k('rugRectangle', -1.9, 0.2, 0, 0.005)
  k('pottedPlant', -3.55, 2.5)
  k('coatRackStanding', 3.6, 2.45)
  k('rugDoormat', 3.0, 2.6, 0, 0.005)
  // your bags: a suitcase and a backpack, packed, by the door
  bags = new THREE.Group()
  const suitcase = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.68, 0.26), mat(0x2b4f8f, { roughness: 0.5 }))
  suitcase.position.y = 0.38
  suitcase.castShadow = true
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), mat(0x1c1915))
  handle.position.y = 0.73
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), mat(0xc0392b, { roughness: 0.8 }))
  pack.position.set(0.42, 0.21, 0.05)
  pack.castShadow = true
  bags.add(suitcase, handle, pack)
  bags.name = 'bags'
  place(bags, 2.55, 0, 2.45, 0, downstairs)
  // breakfast (on the table, appears when you sit)
  plate = new THREE.Group()
  plate.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.03, 18), mat(0xf6f2ea)))
  style.breakfast.plate.forEach((hex, i) => {
    const bit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(hex))
    bit.scale.set(1.2, 0.5, 1)
    bit.position.set(Math.cos(i * 2.1) * 0.06, 0.03, Math.sin(i * 2.1) * 0.06)
    plate.add(bit)
  })
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), mat(I.accent))
  mug.position.set(0.22, 0.05, -0.05)
  plate.add(mug)
  plate.position.set(-1.55, 0.68, 0.55)
  plate.visible = false
  downstairs.add(plate)
  // --- upstairs: your room, half packed
  const u = (name, x, z, rot = 0, y = UP, opt = {}) => place(piece(furn, name, { scale: FURN, ...opt }), x, y, z, rot, upstairs)
  u('bedSingle', -3.2, -1.65, 0, UP, { matFn: (m) => (/carpet/i.test(m.name) ? tint(I.bedCover)(m) : m) })
  solid(1, -3.2, -1.65, 1.25, 2.35)
  u('cabinetBedDrawer', -2.25, -2.7)
  u('desk', -3.55, 1.5, Math.PI / 2)
  u('chairDesk', -2.9, 1.5, -Math.PI / 2)
  solid(1, -3.4, 1.5, 1.0, 1.6)
  u('bookcaseOpenLow', 1.2, 2.65, Math.PI)
  u('rugRound', -1.2, 0.3, 0, UP + 0.005)
  u('cardboardBoxClosed', 0.3, 2.4, 0.4)
  u('cardboardBoxClosed', 0.75, 2.5, -0.2)
  solid(1, 0.6, 2.45, 1.2, 0.7)
  u('lampRoundFloor', -3.6, -0.3)
  // the outside of the house (hidden while you're inside)
  shell = buildingOf(homeParts, style.home, style.homeSize, 0)
  place(shell, 0, 0, 0, 0)
  shell.name = 'shell'
}

function buildingOf(parts, name, size, i) {
  const c = style.colours
  const roof = c.roof[i % c.roof.length]
  if (style.kit === 'town') {
    const paint = c.paint[(i * 3 + 1) % c.paint.length]
    return piece(parts, name, { fit: size, matFn: townMats(paint, roof) })
  }
  return piece(parts, name, { fit: size, matFn: (m) => repaint(m, [...ROOF_SWATCHES.map((r) => [r, roof]), ...FENCE_SWATCHES.map((r) => [r, c.fence])]) })
}

async function buildStreet(homeParts, suburbParts) {
  const c = style.colours
  const S = style.spacing
  const depth = style.plotDepth
  // ground, road, verges, pavements: to the fog in every direction
  plane(400, 400, c.grass, 0, -0.02, 0)
  plane(400, ROAD_W, c.road, 0, 0, STREET_Z)
  plane(ROAD_W, 400, c.road, S * 3.5, 0.016, STREET_Z)
  for (let x = -120; x < 120; x += 4) plane(1.8, 0.14, '#f2efe6', x, 0.032, STREET_Z)
  for (const z of [STREET_Z - ROAD_W / 2 - 0.9, STREET_Z + ROAD_W / 2 + 0.9]) plane(400, 1.8, c.verge, 0, 0.008, z)
  plane(1.8, 400, c.verge, S * 3.5 - ROAD_W / 2 - 0.9, 0.024, 0)
  plane(1.8, 400, c.verge, S * 3.5 + ROAD_W / 2 + 0.9, 0.024, 0)
  // houses: your row, the row across the road, and the rows behind (rooftops over walls)
  let n = 1
  const rows = [
    { z: 0, rot: 0, xs: [-3, -2, -1, 1, 2, 3, -4, 4].map((k) => k * S) },
    { z: STREET_Z * 2, rot: Math.PI, xs: [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, -4.5, 4.5].map((k) => k * S) },
    { z: -depth - 3, rot: Math.PI, xs: [-3, -2, -1, 0, 1, 2, 3].map((k) => k * S + S / 2) },
    { z: STREET_Z * 2 + depth + 3, rot: 0, xs: [-3, -2, -1, 0, 1, 2, 3].map((k) => k * S) },
  ]
  for (const row of rows) for (const x of row.xs) {
    if (Math.abs(x - S * 3.5) < S * 0.6) continue // the cross street
    const name = style.neighbours[n % style.neighbours.length]
    const b = buildingOf(homeParts, name, style.neighbourSize, n)
    place(b, x, 0, row.z, row.rot)
    if (name === '1story_sign' && style.street.spaza) {
      b.add(signBoard(style.street.spaza, row.rot))
    }
    n += 1
  }
  // boundary fences or palisades along the plot fronts, with a gap for each gate
  const fenceName = style.street.boundary === 'palisade' ? 'fence' : 'fence-1x3'
  const fenceMat = (m) => repaint(m, FENCE_SWATCHES.map((r) => [r, c.fence]))
  // Each fence runs in pieces of about 3 m between its gaps: your own gate (the path and the drive,
  // so the car and you pass), each neighbour's driveway, and the cross street. A piece next to a gap is
  // sized to end at it, so no piece ever stands across a gate. The pieces in your yard are solid.
  const crossGap = [S * 3.5 - ROAD_W - 1.5, S * 3.5 + ROAD_W + 1.5]
  const gaps = (near) => [crossGap, ...(near ? [[2.0, 7.9], ...[-4, -3, -2, -1, 1, 2, 3, 4].map((k) => [4.8 + S * k, 7.9 + S * k])] : [])].sort((p, q) => p[0] - q[0])
  for (const [z, rot, near] of [[STREET_Z - ROAD_W / 2 - 2.0, 0, true], [STREET_Z + ROAD_W / 2 + 2.0, Math.PI, false]]) {
    let from = -60
    for (const [g0, g1] of [...gaps(near), [60, 60]]) {
      const len = g0 - from
      if (len > 0.5) {
        const n = Math.max(1, Math.round(len / 3))
        const w = len / n
        for (let i = 0; i < n; i++) {
          const f = piece(suburbParts, fenceName, { fit: [w, style.street.boundary === 'palisade' ? 1.8 : 1.2, 0.25], matFn: fenceMat })
          const cx = from + w * (i + 0.5)
          place(f, cx, 0, z, rot)
          if (near && cx > -9 && cx < 10) solid(-1, cx, z, w, 0.3)
        }
      }
      from = Math.max(from, g1)
    }
  }
  // your yard: the driveway and the path to the door
  for (let z = 3.4; z < STREET_Z - ROAD_W / 2; z += 2.2) place(piece(suburbParts, 'driveway-long', { fit: [3, 0.02, 2.2] }), 5.5, 0.006, z + 1.1)
  for (let z = 3.6; z < 7.6; z += 1) place(piece(suburbParts, 'path-stones-short', { fit: [0.9, 0.02, 1] }), 3, 0.006, z)
  for (const [x, z] of [[-5.5, 4.6], [-2.5, 4.4], [8.5, 4.4]]) { place(piece(suburbParts, 'planter', { fit: [1.6, 0.7, 1.2] }), x, 0, z); solid(-1, x, z, 1.6, 1.2) }
  // trees and bushes (Kenney Nature Kit, already in the game)
  const treeFiles = ['/models/props/tree_oak.glb', '/models/props/tree_default.glb']
  const trees = await Promise.all(treeFiles.map((u) => loadModel(u).catch(() => null)))
  const rand = mulberry(styleId === 'township' ? 7 : 3)
  for (let i = 0; i < style.street.trees; i++) {
    const t = trees[i % trees.length]
    if (!t) continue
    const side = i % 2 ? 1 : -1
    const x = -50 + rand() * 100
    const z = side > 0 ? STREET_Z + ROAD_W / 2 + 3.6 + rand() * 2 : STREET_Z - ROAD_W / 2 - 3.4 - rand() * 1.5
    if (Math.abs(x - 5.5) < 3 || Math.abs(x - 3) < 1.5 || Math.abs(x - S * 3.5) < ROAD_W) continue
    const tree = t.clone()
    tree.scale.setScalar(3.6 + rand() * 1.6)
    place(tree, x, 0, z, rand() * 6)
    occluders.push(tree)
  }
  // street lamps, and a township's high mast light
  const pole = mat(style.street.lamp, { roughness: 0.6, metalness: 0.4 })
  for (let x = -54; x < 60; x += 18) {
    if (Math.abs(x - S * 3.5) < ROAD_W) continue // (the cross street and the way out stay clear)
    for (const z of [STREET_Z - ROAD_W / 2 - 1.2, STREET_Z + ROAD_W / 2 + 1.2]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 8), pole)
      p.position.set(x + (z > STREET_Z ? 9 : 0), 3, z)
      p.castShadow = true
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.4), pole)
      arm.position.set(0, 2.95, z > STREET_Z ? -0.7 : 0.7)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), mat(0xfff3c4, { emissive: 0x332a10 }))
      head.position.set(0, 2.85, z > STREET_Z ? -1.35 : 1.35)
      p.add(arm, head)
      scene.add(p)
    }
  }
  if (style.street.mast) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 26, 10), pole)
    mast.position.set(-S * 1.5, 13, STREET_Z + ROAD_W / 2 + 4)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 6, 18), pole)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 13
    mast.add(ring)
    for (let i = 0; i < 6; i++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), mat(0xfff3c4, { emissive: 0x332a10 }))
      lamp.position.set(Math.cos(i) * 1.2, 12.8, Math.sin(i) * 1.2)
      mast.add(lamp)
    }
    mast.castShadow = true
    scene.add(mast)
  }
  // parked cars (Kenney Car Kit, already in the game): all on the far kerb, nose to the traffic, well
  // clear of the lane the family car drives (the near lane, STREET_Z - 1.75). Each is solid (solid -1
  // boxes), so nothing walks or drives through one.
  const parked = style.street.parked
  for (const [i, [x, z, rot]] of [[-S * 1.2, STREET_Z + 2.3, -Math.PI / 2], [S * 1.8, STREET_Z + 2.3, Math.PI / 2], [-S * 2.6, STREET_Z + 2.3, Math.PI / 2], [S * 2.4, STREET_Z + 2.3, -Math.PI / 2]].entries()) {
    const m = await loadModel(`/models/cars/${parked[i % parked.length]}.glb`).catch(() => null)
    if (m) {
      const p = m.clone(); p.scale.setScalar(1.9); place(p, x, 0, z, rot); p.name = 'parked-car'
      parkedCars.push({ x, z, w: 4.6, d: 2.1 })
    }
  }
  // the family car in the driveway, nose to the street
  const fam = await loadModel(`/models/cars/${style.street.familyCar}.glb`).catch(() => null)
  car = new THREE.Group()
  if (fam) {
    const body = fam.clone()
    body.scale.setScalar(1.9)
    body.traverse((m) => { if (m.isMesh && m.material?.map) { m.material = m.material.clone(); m.material.color = new THREE.Color(style.street.familyCarColour) } })
    car.add(body)
  }
  car.name = 'family-car'
  place(car, 5.5, 0, 4.8, 0)
  solid(-1, 5.5, 4.8, 2.1, 4.6) // the family car in the drive is solid too (you get in from its left)
}

function signBoard(text, rot) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#c0392b'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#fff6e6'
  g.font = 'bold 64px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 256, 66, 490)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: t }))
  sign.position.set(0, 3.2, 3.9)
  void rot
  return sign
}

function mulberry(seed) {
  let a = seed
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// ---------- people and the dog ----------
function familyLook(who, me = opts.run.character?.avatar || {}) {
  const gender = who.role === 'mom' || who.role === 'sister' ? 'female' : 'male'
  return { gender, skin: me.skin, skinColor: me.skinColor, hairColor: me.hairColor, hair: gender === 'female' ? (who.role === 'mom' ? 'curls' : 'crop') : 'crop', outfit: gender === 'male' && !['hoodie', 'shirt', 'jacket', 'organt'].includes(who.outfit) ? 'shirt' : who.outfit, topColor: who.top, bottomColor: who.bottom, body: me.body }
}
function person(look) {
  const a = createAvatar(look)
  a.userData.pose = 'stand'
  scene.add(a)
  return a
}
async function buildPeople() {
  parent = person(familyLook(style.parent))
  parent.position.set(-2.64, 0, -1.7)
  parent.rotation.y = Math.PI
  sibling = person(familyLook(style.sibling))
  sibling.scale.setScalar(0.86)
  seat(sibling, CHAIRS.sibling) // (at the table already when you come down)
  neighbour = person(style.neighbour.look)
  neighbour.position.set(-style.spacing + 2.5, 0, 5.6)
  neighbour.rotation.y = Math.PI * 0.75
  // the hose and a fan of water
  hose = new THREE.Group()
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), mat(0x2f8f3a))
  pipe.rotation.x = Math.PI / 2.6
  pipe.position.set(0.25, 1.0, 0.25)
  hose.add(pipe)
  for (let i = 0; i < 14; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.8 }))
    drop.userData.t = i / 14
    hose.add(drop)
  }
  neighbour.add(hose)
  // a few people going about their morning on the pavements
  const rand = mulberry(11)
  const looks = ['male-a', 'female-d', 'male-d', 'female-f', 'male-f']
  for (let i = 0; i < 4; i++) {
    const a = person({ model: looks[i % looks.length], skin: ['brown', 'deep', 'amber', 'ebony'][i % 4], outfit: ['hoodie', 'shirt', 'jacket', 'dress'][i % 4] })
    const z = i % 2 ? STREET_Z + ROAD_W / 2 + 0.9 : STREET_Z - ROAD_W / 2 - 0.9
    const x0 = -40 + rand() * 80
    a.position.set(x0, 0, z)
    walkers.push({ a, z, dir: i % 2 ? 1 : -1, speed: 1.1 + rand() * 0.5 })
  }
  // two neighbours chatting at a gate across the road
  for (const [i, x] of [[0, -style.spacing * 0.5 - 0.5], [1, -style.spacing * 0.5 + 0.5]]) {
    const a = person({ model: i ? 'male-d' : 'female-b', skin: i ? 'ebony' : 'brown', outfit: i ? 'jacket' : 'skirt' })
    a.position.set(x, 0, STREET_Z + ROAD_W / 2 + 1.0)
    a.rotation.y = i ? -Math.PI / 2 : Math.PI / 2
  }
  // the dog (Quaternius Shiba Inu, Draco)
  const l = await loader()
  const gltf = await l.loadAsync('/models/home/dog.glb').catch(() => null)
  dog = new THREE.Group()
  dog.name = 'dog'
  if (gltf) {
    const model = gltf.scene
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const s = 0.75 / Math.max(size.x, size.z)
    model.scale.setScalar(s)
    model.position.y = -box.min.y * s
    model.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false } })
    dog.add(model)
    dogMixer = new THREE.AnimationMixer(model)
    for (const clip of gltf.animations) dogClips[clip.name.split('|').pop()] = dogMixer.clipAction(clip)
    playDog('Idle')
  }
  dog.position.set(-1.5, 0, 5.2)
  scene.add(dog)
}
function playDog(name) {
  if (dogClip === name || !dogClips[name]) return
  dogClips[dogClip]?.fadeOut(0.25)
  dogClips[name].reset().fadeIn(0.25).play()
  dogClip = name
}
// The dog: wanders the yard; once you're outside it trots after you.
const dogGoal = new THREE.Vector3(-1.5, 0, 5.2)
let dogRest = 0
function updateDog(dt) {
  if (!dog) return
  if (level === -1 && player.visible) {
    const back = player.rotation.y + Math.PI
    dogGoal.set(player.position.x + Math.sin(back) * 1.1 + 0.6, 0, player.position.z + Math.cos(back) * 1.1)
  } else if ((dogRest -= dt) < 0) {
    dogRest = 2 + Math.random() * 3
    dogGoal.set(-6 + Math.random() * 9, 0, 3.9 + Math.random() * 2.2)
  }
  const dx = dogGoal.x - dog.position.x
  const dz = dogGoal.z - dog.position.z
  const d = Math.hypot(dx, dz)
  if (d > 0.25) {
    const speed = d > 3 ? 3.2 : 1.3
    const step = Math.min(d, speed * dt)
    dog.position.x += (dx / d) * step
    dog.position.z += (dz / d) * step
    const want = Math.atan2(dx, dz)
    dog.rotation.y += Math.atan2(Math.sin(want - dog.rotation.y), Math.cos(want - dog.rotation.y)) * Math.min(1, dt * 8)
    playDog(speed > 2 ? 'Gallop' : 'Walk')
  } else playDog('Idle')
  dogMixer?.update(dt)
}

// ---------- levels, the tap, the camera ----------
function setLevel(n) {
  level = n
  host.dataset.level = String(n)
  rig.setDistance?.('sims', n === -1 ? 22 : 12)
  rig.setDistance?.('top', n === -1 ? 40 : 26)
  upstairs.visible = n === 1 || n === -1
  downstairs.visible = true
  shell.visible = n === -1
  // (outside, the inside is hidden under the shell)
  if (n === -1) { upstairs.visible = false; downstairs.visible = false }
}
function levelY() { return level === 1 ? UP : 0 }
function onTap(ndc) {
  if (override || !running || player?.userData.scripted) return
  ray.setFromCamera(ndc, camera)
  if (tapTargets.length) {
    const hit = ray.intersectObjects(tapTargets, true)[0]
    if (hit && stepTarget) { walkTo(stepTarget.x, stepTarget.z, 0.3); return }
  }
  const self = ray.intersectObject(player, true)[0]
  if (self) { mover.stop(); return }
  const y = levelY()
  const t = ray.ray.origin.y > y && ray.ray.direction.y < 0 ? (y - ray.ray.origin.y) / ray.ray.direction.y : -1
  if (t <= 0) return
  const p = ray.ray.at(t, new THREE.Vector3())
  if (blockedAt(p.x, p.z)) {
    // (a tap on furniture: the nearest open spot beside it)
    for (let r = 0.25; r < 1.5; r += 0.25) for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos(a * Math.PI / 4) * r
      const z = p.z + Math.sin(a * Math.PI / 4) * r
      if (!blockedAt(x, z)) { smooth.tap(); walkTo(x, z); return }
    }
    return
  }
  smooth.tap()
  walkTo(p.x, p.z)
}

// A step: a gold ring where to go and one button. Walk there however you like (tap the
// ground, tap the thing, or the button walks you); the step is done when you arrive.
function goTo(label, x, z, radius = 0.7, objects = []) {
  return new Promise((resolve) => {
    stepTarget = { x, z }
    tapTargets = objects
    marker.visible = true
    marker.position.set(x, levelY() + 0.03, z)
    const bar = uiq('.mm-bar')
    bar.innerHTML = `<button type="button" class="mm-go" data-mm="go">${label}</button>`
    bar.hidden = false
    bar.querySelector('button').onclick = () => { walkTo(x, z, 0.2) }
    const check = task(() => !running || Math.hypot(player.position.x - x, player.position.z - z) < radius)
    check.then(() => { stepTarget = null; tapTargets = []; marker.visible = false; closeBar(); mover.stop(); resolve() })
  })
}

const shot = { pos: new THREE.Vector3(), look: new THREE.Vector3(), from: new THREE.Vector3(), fromLook: new THREE.Vector3(), t: 1 }
function setOverride(pos, look) {
  shot.from.copy(camera.position)
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  shot.fromLook.copy(camera.position).addScaledVector(dir, 5)
  shot.pos.copy(pos)
  shot.look.copy(look)
  shot.t = 0
  override = true
}
function clearOverride() { override = null; mover.stop() }

// ---------- the frame ----------
function build() {
  host = document.createElement('div')
  host.id = 'home3d'
  document.body.prepend(host)
  ui()
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.25))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  host.prepend(renderer.domElement)
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 260)
  window.addEventListener('resize', () => {
    if (!renderer) return
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
  rig = createCameraRig()
  mover = createPlayer({ blocked: (x, z) => blockedAt(x, z), onWalk: (e) => (e.type === 'start' ? smooth.walkStart() : smooth.walkEnd(e.how, e.left, e.x, e.z)) })
  input = bindInput(renderer.domElement, { cameraRig: rig, onTap, live: () => running && !override })
  window.addEventListener('mzansi-cam', (e) => { if (running) rig.setMode(e.detail) })
}

function freshScene() {
  scene = new THREE.Scene()
  scene.name = 'home'
  const c = style.colours
  scene.background = new THREE.Color(c.sky)
  scene.fog = new THREE.Fog(c.fog, 45, 150)
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6b7a4a, 1.05))
  sun = new THREE.DirectionalLight(0xffe2b8, 2.3)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 })
  sun.shadow.bias = -0.0005
  scene.add(sun, sun.target)
  marker = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 10, 36), new THREE.MeshBasicMaterial({ color: 0xf0c400 }))
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  scene.add(marker)
  walkers.length = 0
  occluders.length = 0
  tasks = []
  for (const k of Object.keys(solids)) solids[k] = []
  parkedCars.length = 0
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const real = (now - (last || now)) / 1000
  const dt = Math.min(0.05, real) * FAST
  last = now
  clock += dt
  tasks = tasks.filter((t) => { if (t.update(dt)) { t.resolve(); return false } return true })
  if (!scene || !player) return
  if (!override && !player.userData.scripted) {
    const s = input.stick()
    if (s) mover.setStick(s.x, s.z, s.run, s.mag)
    else mover.setStick(0, 0)
  }
  if (!player.userData.scripted) mover.update(dt)
  if (mover.moving) smooth.moved() // (a ground tap's tap-to-move ends on the first frame you walk)
  if (!player.userData.scripted) player.position.y = levelY()
  const stepping = mover.moving || Boolean(player.userData.walkingScript)
  soundLoop('footsteps', stepping && player.visible)
  poseAvatar(player, stepping, clock)
  for (const a of [parent, sibling, neighbour]) if (a) poseAvatar(a, Boolean(a.userData.walking), clock)
  for (const w of walkers) {
    w.a.position.x += w.dir * w.speed * dt
    if (Math.abs(w.a.position.x) > 50) w.dir *= -1
    w.a.rotation.y = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2
    poseAvatar(w.a, true, clock)
  }
  if (hose) for (const d of hose.children) if (d.userData.t !== undefined) {
    d.userData.t = (d.userData.t + dt * 0.9) % 1
    const t = d.userData.t
    d.position.set(0.3 + t * 0.4, 1.0 + t * 0.7 - t * t * 1.6, 0.35 + t * 1.3)
  }
  updateDog(dt)
  if (marker.visible) marker.scale.setScalar(1 + Math.sin(clock * 5) * 0.12)
  // camera: the shot, or the player's own camera (lifted to the floor you're on)
  if (override) {
    shot.t = Math.min(1, shot.t + dt / 0.6)
    const k = shot.t * shot.t * (3 - 2 * shot.t)
    camera.position.lerpVectors(shot.from, shot.pos, k)
    v.lerpVectors(shot.fromLook, shot.look, k)
    camera.lookAt(v)
  } else {
    rig.apply(camera, player.position, dt, null)
    camera.position.y += levelY()
    // (Eye view sitting down: your eyes are lower than standing)
    if (rig.mode === 'eye' && player.userData.pose === 'sit') camera.position.y -= 0.3
  }
  // Eye view looks out of your eyes: your own head is hidden.
  for (const part of player.userData.headParts || []) part.visible = rig.mode !== 'eye' || Boolean(override)
  if (frameCount++ % 3 === 0) seeThrough()
  const focus = override && car?.userData.driving ? car.position : player.position
  sun.position.set(focus.x + 24, 30, focus.z + 14)
  sun.target.position.set(focus.x, 0, focus.z)
  pinTo(uiq('.mm-float'), player, 2.2)
  pinTo(uiq('.mm-bubble'), speaker || player, (speaker || player) === sibling ? 1.75 : 2.05)
  host.dataset.px = player.position.x.toFixed(2)
  host.dataset.pz = player.position.z.toFixed(2)
  host.dataset.py = player.position.y.toFixed(2)
  host.dataset.cam = rig.mode
  host.dataset.clock = fmt(opts.run.minutes)
  renderer.render(scene, camera)
  smooth.frame(now, 'home', `home:${styleId}`)
}

// (for the curtain) the see-through walls' transparent shaders, compiled before the first frame
// the player sees rather than the first time a wall fades.
function warmSeeThrough() {
  const swapped = []
  for (const group of [downstairs, upstairs, shell, ...occluders]) {
    group?.traverse((m) => {
      if (!m.isMesh) return
      const see = (x) => { const c = x.clone(); c.transparent = true; c.opacity = 0.18; c.depthWrite = false; return c }
      swapped.push([m, m.material])
      m.material = Array.isArray(m.material) ? m.material.map(see) : see(m.material)
    })
  }
  return () => {
    for (const [m, was] of swapped) {
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) x.dispose?.()
      m.material = was
    }
  }
}

// Walls between the camera and you turn see-through (the Sims cutaway).
const seeRay = new THREE.Raycaster()
const faded = new Map()
function seeThrough() {
  const hits = new Set()
  if (!override && rig.mode !== 'eye') {
    for (const y of [1.6, 0.9]) {
      const to = new THREE.Vector3(player.position.x, player.position.y + y, player.position.z)
      const dir = to.clone().sub(camera.position)
      seeRay.set(camera.position, dir.clone().normalize())
      seeRay.far = dir.length() - 0.3
      for (const group of [downstairs, upstairs, shell, ...occluders]) {
        if (!group?.visible) continue
        for (const hit of seeRay.intersectObject(group, true)) if (hit.object.isMesh) hits.add(hit.object)
      }
    }
  }
  for (const m of hits) {
    if (!faded.has(m)) {
      m.userData.solidMat = m.material
      const see = (x) => { const c = x.clone(); c.transparent = true; c.opacity = 0.18; c.depthWrite = false; return c }
      m.material = Array.isArray(m.material) ? m.material.map(see) : see(m.material)
    }
    faded.set(m, 10)
  }
  for (const [m, left] of faded) {
    if (hits.has(m)) continue
    if (left > 1) { faded.set(m, left - 1); continue }
    m.material = m.userData.solidMat
    faded.delete(m)
  }
}

// ---------- the scripted morning, played ----------
async function play() {
  const run = opts.run
  run.minutes = WAKE
  opts.onUpdate()
  setStep('wake')
  setLevel(1)
  // in bed, on your back, head on the pillow
  player.userData.scripted = true
  layDown(player, 0)
  player.position.set(-3.2, UP + 0.6, -2.0)
  rig.turnBehind(0.35) // facing the room and the window, the camera behind you
  await wait(0.6)
  await talk(L('wake'), player)
  // sit up, swing the legs over, stand
  await tween(1.0, (k) => { layDown(player, (Math.PI / 2) * k, 1 - k); player.position.set(-3.2 + 0.5 * k, UP + 0.6 - 0.05 * k, -2.0 + 0.3 * k) })
  player.rotation.set(0, Math.PI / 2, 0)
  player.userData.pose = 'sit'
  player.userData.seatFloor = UP
  await wait(0.4)
  player.userData.pose = 'stand'
  player.userData.seatFloor = undefined
  player.userData.recline = 1
  await tween(0.4, (k) => { player.position.y = UP + 0.55 * (1 - k); player.position.x = -2.7 + k * 0.45 })
  player.userData.scripted = false
  player.position.set(-2.2, UP, -1.6)
  mover.attach(player)
  await addMinutes(3)
  // 1. the window: the street outside
  setStep('window')
  await goTo('\u{1FA9F} Look out of the window', -1, 2.3, 0.6)
  player.rotation.y = 0
  // your eyes at the glass (you are not in your own shot): the yard, the dog, the street
  player.visible = false
  setOverride(new THREE.Vector3(-1, UP + 1.5, 2.45), new THREE.Vector3(-4, 0.6, STREET_Z + 3))
  host.dataset.window = '1'
  await wait(0.8)
  await talk(L('window'), null)
  clearOverride()
  player.visible = true
  // 2. downstairs
  setStep('stairs')
  await goTo('\u{1FA9C} Go downstairs', 3.2, -0.6, 0.55)
  await descend()
  setStep('kitchen')
  await talk(L('downstairs'), player)
  // 3. breakfast with your parent and sibling
  setStep('breakfast')
  await goTo(`\u{1F373} Sit down for breakfast`, CHAIRS.me.x + 0.55, CHAIRS.me.z + 0.05, 0.35)
  await sitAtTable()
  plate.visible = true
  host.dataset.plate = '1'
  await talk(L('parentHello'), parent)
  await talk(L('embarrass'), parent)
  await talk(L('embarrassReply'), player)
  await talk(L('sibling'), sibling)
  const replies = style.replies.map((r) => ({ ...r, label: fill(r.label) }))
  const pick = await choices(fill('{sibling} wants your room.'), replies.map((r) => r.label))
  host.dataset.reply = replies[pick].id
  await talk(replies[pick].label, player)
  await talk(fill(replies[pick].answer), sibling)
  await Promise.all([addMinutes(12, 1.2), wait(0.8)])
  plate.visible = false
  changeStats({ hunger: style.breakfast.fullness, energy: style.breakfast.energy })
  run.home = { style: styleId, sibling: replies[pick].id, siblingName: style.sibling.name, call: style.parent.call, dog: style.dog.name, pocket: style.pocket, parentLook: familyLook(style.parent) }
  await Promise.all([standUp(player), standUp(parent)])
  player.userData.scripted = false
  mover.attach(player)
  // 4. the bags by the door
  setStep('bags')
  await goTo('\u{1F9F3} Grab your bags', 2.6, 1.85, 0.55, [bags])
  bags.parent.remove(bags)
  bags.position.set(0.32, 0, -0.05)
  bags.scale.setScalar(0.9)
  player.add(bags)
  host.dataset.bags = '1'
  await talk(L('bags'), player)
  // parent heads out to the car first
  parent.userData.walking = true
  const from = { x: parent.position.x, z: parent.position.z }
  const toCar = tween(2.2, (k) => { parent.position.set(from.x + (3.15 - from.x) * k, 0, from.z + (2.6 - from.z) * k); face(parent, 3.2, 2.7) }, (x) => x)
  toCar.then(() => { parent.visible = false; parent.userData.walking = false })
  // 5. out of the front door: the yard, the dog, the car
  setStep('door')
  await goTo('\u{1F6AA} Out the front door', 3.0, 2.4, 0.5)
  sfx('door')
  await underFade('', async () => {
    setLevel(-1)
    player.position.set(3.0, 0, 4.0)
    player.rotation.y = 0
    parent.visible = true
    parent.position.set(4.3, 0, 4.4)
    face(parent, 3, 4)
    dog.position.set(1.5, 0, 5.2)
    sibling.visible = false
    rig.turnBehind(Math.PI * 1.12) // from the street side: the house, the yard, the car
    await wait(0.2)
  })
  setStep('yard')
  await talk(L('car'), parent)
  await goTo('\u{1F697} Get in the car', 3.7, 5.4, 0.6, [car])
  // 6. the drive: a fixed path, never yours to steer; a fade, then UMzansi's Main Gate
  setStep('drive')
  await drive()
  opts.onDone({ arrived: run.minutes, style: styleId })
}

function face(who, x, z) { who.rotation.y = Math.atan2(x - who.position.x, z - who.position.z) }

async function descend() {
  // along the top landing, then down the kit stairs (they climb to the east)
  player.userData.scripted = true
  mover.stop()
  const path = [[3.5, -1.0, UP], [3.6, -2.2, UP], [0.4, -2.2, 0], [-0.2, -1.4, 0]]
  let from = { x: player.position.x, z: player.position.z, y: UP }
  for (const [x, z, y] of path) {
    const d = Math.hypot(x - from.x, z - from.z)
    const f = { ...from }
    face(player, x, z)
    player.userData.walkingScript = true
    await tween(Math.max(0.2, d / 1.6), (k) => {
      player.position.set(f.x + (x - f.x) * k, f.y + (y - f.y) * k, f.z + (z - f.z) * k)
      if (player.position.y < 1.4 && level === 1) setLevel(0)
    }, (k) => k)
    from = { x, z, y }
  }
  player.userData.walkingScript = false
  player.userData.scripted = false
  setLevel(0)
  mover.attach(player)
}

// On a chair: the body at the seat top, facing the way the chair faces, feet on the floor
// (avatar3d fits the hips to the seat and lowers them from where they stood, if close).
function seat(who, c) {
  who.position.set(c.x, SEAT_Y, c.z)
  who.rotation.y = c.rot
  who.userData.seatFloor = 0
  who.userData.pose = 'sit'
}
async function sitAtTable() {
  player.userData.scripted = true
  mover.stop()
  // your parent comes over from the stove and sits at the end of the table with you
  parent.userData.walking = true
  const start = { x: parent.position.x, z: parent.position.z }
  const beside = { x: CHAIRS.parent.x - 0.2, z: CHAIRS.parent.z - 0.55 }
  const over = tween(1.2, (k) => { parent.position.set(start.x + (beside.x - start.x) * k, 0, start.z + (beside.z - start.z) * k); face(parent, beside.x, beside.z + 1) }, (x) => x)
  seat(player, CHAIRS.me)
  rig.turnBehind(CHAIRS.me.rot) // (the camera comes round with you: Eye looks across the table)
  await over
  parent.userData.walking = false
  await wait(0.05)
  seat(parent, CHAIRS.parent)
  await wait(0.05) // (the sit-down starts on the next frame)
  await task(() => !player.userData.sitMove && !parent.userData.sitMove)
  host.dataset.seated = '1'
}
// Up from the chair: the rise plays (avatar3d), then they stand in front of the seat.
async function standUp(who) {
  who.userData.pose = 'stand'
  await wait(0.05)
  await task(() => !who.userData.sitMove)
  who.userData.seatFloor = undefined
}

// The way out: down the drive, onto the near lane, along to the cross street and away.
function driveCurve() {
  const S = style.spacing
  const lane = STREET_Z - 1.75 // drive on the left
  const pts = [[5.5, 4.8], [5.5, 8.2], [7.5, lane], [S * 3.5 - 4, lane], [S * 3.5 - 1.75, lane + 3], [S * 3.5 - 1.75, 60]]
  return new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.2)
}

async function drive() {
  player.visible = false
  parent.visible = false
  dog.position.set(4, 0, 4)
  car.userData.driving = true
  soundLoop('bus_engine', true)
  const curve = driveCurve()
  const len = curve.getLength()
  const chase = () => {
    const back = new THREE.Vector3(-Math.sin(car.rotation.y), 0, -Math.cos(car.rotation.y))
    return [car.position.clone().addScaledVector(back, 8).setY(4.2), car.position.clone().addScaledVector(back, -6).setY(1.2)]
  }
  setOverride(...chase())
  host.dataset.driving = '1'
  bubble(L('drive'), null)
  let d = 0
  await task((dt) => {
    d = Math.min(len, d + dt * Math.min(9, 2 + d * 0.8))
    const k = d / len
    const p = curve.getPointAt(k)
    const ahead = curve.getPointAt(Math.min(1, k + 0.01))
    car.position.copy(p)
    car.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z)
    const [cp, cl] = chase()
    shot.pos.lerp(cp, Math.min(1, dt * 3))
    shot.look.lerp(cl, Math.min(1, dt * 4))
    return k >= 0.62
  })
  bubble('')
  await fadeOut('\u{1F697} Off to UMzansi…')
  await addMinutes(DRIVE_MIN, 1.6)
  soundLoop('bus_engine', false)
  car.userData.driving = false
}

// ---------- start / stop ----------
// While you are still in the creator: fetch the three kits (the style from your answer so far)
// so the home scene has them by the time it starts.
export function preloadHome(character) {
  try {
    const st = HOMES.styles[homeStyleId(character)]
    for (const name of ['furniture', st.kit, 'suburb']) kit(name).catch(() => { delete kits[name] })
    // the cast's model files too (family, neighbours, the people on the pavements)
    const me = character?.avatar || {}
    for (const who of [st.parent, st.sibling]) warmLook(familyLook(who, me))
    warmLook(st.neighbour.look)
    for (const [m, o] of [['male-a', 'hoodie'], ['female-d', 'shirt'], ['male-d', 'jacket'], ['female-f', 'dress'], ['female-b', 'skirt']]) warmLook({ model: m, outfit: o })
  } catch { /* (it loads at the start instead) */ }
}

let starting = false
let stopMark = 0
export async function startHome(options) {
  opts = options
  if (starting) return
  if (!running) {
    // (the curtain is fully up before the scene appears behind it)
    const mark = stopMark
    starting = true
    try { await curtain.cover('Waking up at home…') } finally { starting = false }
    if (mark !== stopMark) return
  }
  styleId = homeStyleId(opts.run.character)
  style = HOMES.styles[styleId]
  if (!renderer) build()
  host.hidden = false
  uiRoot.hidden = false
  host.dataset.on = '1'
  host.dataset.style = styleId
  if (running) return
  running = true
  host.dataset.ready = '0'
  for (const n of uiRoot.querySelectorAll('.mm-bar,.mm-bubble,.mm-float,.mm-fade')) n.hidden = true
  freshScene()
  if (!frame) frame = requestAnimationFrame(tick)
  try {
    const [furnParts, homeParts, suburbParts] = await Promise.all([kit('furniture'), kit(style.kit), kit('suburb')])
    if (!running) return
    buildHouse(furnParts, homeParts)
    await buildStreet(homeParts, suburbParts)
    player = createAvatar(opts.run.character?.avatar)
    player.userData.isPlayer = true
    player.userData.pose = 'stand'
    scene.add(player)
    host.dataset.look = JSON.stringify(player.userData.look)
    await buildPeople()
    if (!running) return
    host.dataset.ready = '1'
    // Everyone's model is in and fully there (no fade-in, no late transparent shader) before the lift.
    await curtain.awaitPeople(scene, appearNow, 8000)
    await curtain.settle(renderer, scene, camera, warmSeeThrough)
    curtain.lift()
    await play()
  } catch (e) {
    console.error(e)
    curtain.lift()
  } finally {
    running = false
  }
}

export function stopHome() {
  stopMark++
  running = false
  for (const name of ['footsteps', 'bus_engine']) soundLoop(name, false)
  tasks.forEach((t) => t.resolve())
  tasks = []
  override = null
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (host) { host.hidden = true; host.dataset.on = '0'; uiRoot.hidden = true }
  player = null
}

// Tests (read only): where everyone is and what is on screen.
if (typeof window !== 'undefined') {
  // Breakfast: each of you on your chair? (seat height, off the chair's middle, facing,
  // trousers on the seat and soles on the floor from avatar3d's measure, tipped over)
  // (tests, read only) what stands in the way of the family car's drive: every solid thing in the scene
  // (houses, trees, lamps, parked cars) whose footprint meets the car's swept footprint.
  window.mzansiHomeClear = () => {
    if (!scene || !car) return null
    const curve = driveCurve()
    const len = curve.getLength()
    const hits = new Map()
    const rect = (p, yaw) => { const c = Math.cos(yaw); const sn = Math.sin(yaw); const out = []; for (const [a, b] of [[-1.05, -2.3], [1.05, -2.3], [1.05, 2.3], [-1.05, 2.3]]) out.push([p.x + a * c + b * sn, p.z - a * sn + b * c]); return out }
    scene.updateMatrixWorld(true)
    const things = []
    for (const child of scene.children) {
      if (child === car || child.isLight || child === marker) continue
      const box = new THREE.Box3().setFromObject(child)
      const size = box.getSize(new THREE.Vector3())
      if (!isFinite(size.x) || size.y < 0.5 || size.x > 60 || size.z > 60) continue // (ground, road, verges)
      const inner = []
      child.traverse((o) => { if (o.name && inner.length < 4 && o !== child) inner.push(o.name) })
      things.push({ name: child.name || `${child.type}(${inner.join(',')})`, box })
    }
    for (let d = 0; d <= len; d += 0.4) {
      const p = curve.getPointAt(d / len)
      const ahead = curve.getPointAt(Math.min(1, d / len + 0.01))
      const corners = rect(p, Math.atan2(ahead.x - p.x, ahead.z - p.z))
      const minX = Math.min(...corners.map((q) => q[0])); const maxX = Math.max(...corners.map((q) => q[0]))
      const minZ = Math.min(...corners.map((q) => q[1])); const maxZ = Math.max(...corners.map((q) => q[1]))
      for (const t of things) if (t.box.min.x < maxX && t.box.max.x > minX && t.box.min.z < maxZ && t.box.max.z > minZ && t.box.min.y < 2.2) hits.set(`${t.name}@${t.box.min.x.toFixed(1)},${t.box.min.z.toFixed(1)}`, { name: t.name, at: [+p.x.toFixed(1), +p.z.toFixed(1)], box: [t.box.min.x, t.box.min.z, t.box.max.x, t.box.max.z].map((n) => +n.toFixed(1)) })
    }
    return [...hits.values()]
  }
  window.mzansiHomeSeats = () => {
    if (!player || !parent || !sibling) return null
    const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a))
    const out = {}
    for (const [who, a, c] of [['player', player, CHAIRS.me], ['sibling', sibling, CHAIRS.sibling], ['parent', parent, CHAIRS.parent]]) {
      const m = measureBody(a)
      out[who] = { pose: a.userData.pose, seatY: +a.position.y.toFixed(3), offChair: +Math.hypot(a.position.x - c.x, a.position.z - c.z).toFixed(3), facingOff: +wrapA(a.rotation.y - c.rot).toFixed(3), seatGap: m.seatGap ?? null, footGap: m.footGap ?? null, tilt: +Math.hypot(a.rotation.x, a.rotation.z).toFixed(3), moving: Boolean(a.userData.sitMove) }
    }
    return out
  }
  window.mzansiHome = () => (scene ? { style: styleId, level, step: host?.dataset.step, player: player && [player.position.x, player.position.y, player.position.z].map((n) => +n.toFixed(2)), dog: dog && [dog.position.x, dog.position.z].map((n) => +n.toFixed(2)), cam: rig?.mode, meshes: (() => { let n = 0; scene.traverse((o) => { if (o.isMesh && o.visible) n++ }); return n })() } : null)
}
