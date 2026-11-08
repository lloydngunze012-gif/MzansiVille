// The Caf: its own scene (Caf job 1, the shell). Tapping the Caf door on campus plays the plum
// curtain, the campus is hidden behind it and this room is built; the exit door (or the Leave
// button) puts you back at the campus Caf door. Spec: docs/world-designer/caf-world.md.
//
// The room is one hall seen from the front-right like the other cutaway rooms: the back wall
// (four counters) and the left wall (windows) are full height, the front and right walls are
// low so the camera sees in. Props come from the one Polyfork kit (public/models/caf/caf-kit.glb,
// 52.8 KB, Draco): tables, stools and parasols are InstancedMesh (one draw call each, however
// many), the architecture is merged per material. No people, menus or ordering yet (jobs 2 and 3).
//
// Debug: ?caflight=day|evening|load picks the light; ?cafdebug=1 shows a light switch and the
// frame stats; window.mzansiCaf (read-mostly) is for tests: info(), zones, teleport(), light().
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { loop as soundLoop } from '../audio.js'
import { SPEED as FAST } from '../speed.js'
import { smooth } from '../smooth.js'
import * as curtain from '../curtain.js'
import { appearNow, createAvatar, poseAvatar } from './avatar3d.js'
import { createCameraRig } from './camera.js'
import { bindInput } from './input.js'
import { createPlayer } from './player.js'

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const DEBUG = Q.get('cafdebug') === '1'

// ---------- the palette (caf-world.md) ----------
const C = {
  honey: '#b9824f', honeyDark: '#9a6a3c', honeyLight: '#d6a96e', walnut: '#6b4428', cream: '#f3e9d2', wall: '#f0e4cb',
  plum: '#2f1a5c', gold: '#d9a632', steel: '#a7a19a', teal: '#2a8c8c', floorA: '#ecdcb8', floorB: '#e0cba0', lane: '#fbf5e4',
}

// ---------- the room (metres; x right, z toward the camera/front, the back wall at -Z) ----------
const X0 = -8, X1 = 8, Z0 = -5.5, Z1 = 5.5 // the hall
const WALL_H = 3.8
const LOW_H = 1.0
const DOOR = { x: 0, w: 1.8 } // main door, front centre
const SIDE = { z: 0.5, w: 1.8 } // side door on the right wall, to the patio
const PATIO = { x0: 8, x1: 12.4, z0: -2.2, z1: 3.4 }
// the four counters, left to right (kit prop, centre x, label)
const COUNTERS = [
  { id: 'hot', prop: 'servery-counter', x: -5.8, label: 'HOT MEALS' },
  { id: 'indian', prop: 'servery-counter', x: -3.4, label: 'INDIAN KITCHEN' },
  { id: 'grill', prop: 'cafe-counter', x: -1.0, label: 'GRILL' },
  { id: 'coffee', prop: 'campus-coffee-kiosk', x: 2.0, label: 'COFFEE' },
]
export const ZONES = {
  counters: { x: -2.2, z: -3.4, label: 'the four counters' },
  queue: { x: -2.2, z: -2.3, label: 'the queue lane' },
  windowBar: { x: -6.7, z: 1.0, label: 'the window bar' },
  longTable: { x: -0.6, z: 1.0, label: 'the long table' },
  smallTables: { x: 4.3, z: 1.6, label: 'the small tables' },
  openSeating: { x: -3.5, z: 3.4, label: 'open seating' },
  mainDoor: { x: 0, z: 5.1, label: 'the main door' },
  regulars: { x: 2.4, z: 4.7, label: 'the Regulars board' },
  sideDoor: { x: 7.7, z: SIDE.z, label: 'the side door' },
  patio: { x: 10.2, z: 0.6, label: 'the patio' },
}
// where the patio and the indoor tables stand (cafe-table-set), the open seating, the stools
const TABLE_SETS = [[3.7, 0.3], [3.7, 2.6], [5.8, 3.5], [-4.6, 3.4], [-2.6, 3.4], [2.4, 3.9], [10.1, -0.6], [10.1, 2.2]]
const LONG_TABLES = [[-1.8, 1.0], [0.7, 1.0]]
const STOOLS = [-0.6, 0.2, 1.0, 1.8, 2.6].map((z) => [-6.75, z])
const PARASOLS = [[10.1, -0.6], [10.1, 2.2]]

// ---------- state ----------
let opts = null
let host, uiRoot, renderer, scene, camera, rig, mover, input
let player = null
let running = false
let frame = 0
let last = 0
let clock = 0
let ready = false
let enteredAt = 0
let frameCount = 0
let lightName = 'day'
let shot = null // (tests) a fixed camera: { pos, look }
let barsBottom = 0 // px: bottom of the game's top bar plus the Leave / camera row
let shiftY = 0
let lastMode = null
let rig3 = null // lights and things that change with the light state
const ray = new THREE.Raycaster()
const v3 = new THREE.Vector3()
const solids = []

// ---------- models ----------
let gltfLoader = null
async function loader() {
  if (gltfLoader) return gltfLoader
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')])
  gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/').setDecoderConfig({ type: 'wasm' }))
  return gltfLoader
}
let kitPromise = null
// Each prop: its geometry and material, and the matrix that puts it centred on x/z with its
// base on y = 0 (the mesh's own transform included), so an instance is placement x base.
function loadKit() {
  kitPromise ||= loader().then((l) => l.loadAsync('/models/caf/caf-kit.glb')).then((gltf) => {
    gltf.scene.updateMatrixWorld(true)
    const props = {}
    for (const holder of gltf.scene.children) {
      let mesh = null
      holder.traverse((o) => { if (o.isMesh && !mesh) mesh = o })
      if (!mesh) continue
      const box = new THREE.Box3().setFromObject(holder)
      const centre = box.getCenter(new THREE.Vector3())
      const base = new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z).multiply(mesh.matrixWorld)
      props[holder.name] = { geometry: mesh.geometry, material: mesh.material, base, size: box.getSize(new THREE.Vector3()) }
    }
    return props
  })
  kitPromise.catch(() => { kitPromise = null })
  return kitPromise
}
export function preloadCaf() { loadKit().catch(() => {}) }

// ---------- building ----------
const mats = {}
function mat(key, extra = {}) { return (mats[key] ||= new THREE.MeshStandardMaterial({ color: C[key] || key, roughness: 0.85, metalness: 0, ...extra })) }

// Boxes are collected per material and merged: a whole hall of walls is a handful of draws.
function makeBuilder() {
  const parts = {}
  return {
    box(key, w, h, d, x, y, z, rotY = 0) {
      const g = new THREE.BoxGeometry(w, h, d)
      if (rotY) g.rotateY(rotY)
      g.translate(x, y, z)
      g.deleteAttribute('uv')
      ;(parts[key] ||= []).push(g)
    },
    finish(target) {
      for (const [key, list] of Object.entries(parts)) {
        const mesh = new THREE.Mesh(mergeGeometries(list), mat(key))
        mesh.name = `caf-${key}`
        target.add(mesh)
        list.forEach((g) => g.dispose())
      }
    },
  }
}

function sol(x, z, w, d) { solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }) }

function floorTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = C.floorA; g.fillRect(0, 0, 64, 64)
  g.fillStyle = C.floorB; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.NearestFilter
  return t
}

// A plum menu board with gold lettering; the second line shows in load-shedding.
function boardTexture(label, sub) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 160
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.userData.draw = (subText) => {
    const g = c.getContext('2d')
    g.fillStyle = C.plum; g.fillRect(0, 0, 512, 160)
    g.strokeStyle = C.gold; g.lineWidth = 6; g.strokeRect(10, 10, 492, 140)
    g.fillStyle = C.gold; g.textAlign = 'center'; g.textBaseline = 'middle'
    const size = label.length > 8 ? 54 : 70
    g.font = `800 ${size}px Graduate, Figtree, system-ui, sans-serif`
    g.fillText(label, 256, subText ? 62 : 82)
    if (subText) { g.fillStyle = C.cream; g.font = '700 30px Figtree, system-ui, sans-serif'; g.fillText(subText, 256, 122) }
    t.needsUpdate = true
  }
  t.userData.draw(sub)
  return t
}

async function buildRoom() {
  const props = await loadKit()
  const group = new THREE.Group()
  group.name = 'caf'
  scene.add(group)
  const B = makeBuilder()
  solids.length = 0

  // floor: one checker slab, the patio deck, a walnut border
  const ftex = floorTexture()
  ftex.repeat.set((X1 - X0) / 1.2, (Z1 - Z0) / 1.2)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.12, Z1 - Z0), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.9 }))
  floor.position.set(0, -0.06, 0)
  floor.name = 'caf-floor'
  group.add(floor)
  B.box('honeyLight', PATIO.x1 - PATIO.x0 + 0.6, 0.12, PATIO.z1 - PATIO.z0 + 0.4, (PATIO.x0 + PATIO.x1) / 2 - 0.1, -0.06, (PATIO.z0 + PATIO.z1) / 2) // patio deck
  B.box('walnut', X1 - X0 + 0.4, 0.1, 0.2, 0, -0.05, Z1 + 0.1) // a step along the front

  // back wall: cream above a honey panel, a gold rail, a walnut skirting
  const wallH = (len, x, z, rot) => {
    const rl = (dx, dy, dz, key, y) => { const sx = rot ? dz : dx; const sz = rot ? dx : dz; B.box(key, sx, dy, sz, x, y, z) }
    rl(len, WALL_H, 0.2, 'wall', WALL_H / 2)
    rl(len, 1.0, 0.26, 'honey', 0.5)
    rl(len, 0.06, 0.3, 'gold', 1.03)
    rl(len, 0.12, 0.3, 'walnut', 0.06)
  }
  wallH(X1 - X0, 0, Z0 - 0.1, false)
  // left wall (windows): the same, running along z
  B.box('wall', 0.2, WALL_H, Z1 - Z0 + 0.2, X0 - 0.1, WALL_H / 2, 0)
  B.box('honey', 0.26, 1.0, Z1 - Z0 + 0.2, X0 - 0.1, 0.5, 0)
  B.box('gold', 0.3, 0.06, Z1 - Z0 + 0.2, X0 - 0.1, 1.03, 0)
  B.box('walnut', 0.3, 0.12, Z1 - Z0 + 0.2, X0 - 0.1, 0.06, 0)
  // front and right walls: low (the cutaway), with the doorways
  const low = (key, w, h, d, x, y, z) => B.box(key, w, h, d, x, y, z)
  const frontL = (X0 - (DOOR.x - DOOR.w / 2))
  low('wall', Math.abs(frontL), LOW_H, 0.2, (X0 + DOOR.x - DOOR.w / 2) / 2, LOW_H / 2, Z1 + 0.1)
  low('wall', X1 - (DOOR.x + DOOR.w / 2), LOW_H, 0.2, (X1 + DOOR.x + DOOR.w / 2) / 2, LOW_H / 2, Z1 + 0.1)
  low('walnut', Math.abs(frontL), 0.08, 0.3, (X0 + DOOR.x - DOOR.w / 2) / 2, LOW_H + 0.04, Z1 + 0.1)
  low('walnut', X1 - (DOOR.x + DOOR.w / 2), 0.08, 0.3, (X1 + DOOR.x + DOOR.w / 2) / 2, LOW_H + 0.04, Z1 + 0.1)
  const rA = SIDE.z - SIDE.w / 2
  const rB = SIDE.z + SIDE.w / 2
  low('wall', rA - Z0, LOW_H, 0.2, X1 + 0.1, LOW_H / 2, (Z0 + rA) / 2)
  low('wall', Z1 - rB, LOW_H, 0.2, X1 + 0.1, LOW_H / 2, (rB + Z1) / 2)
  low('walnut', rA - Z0, 0.08, 0.3, X1 + 0.1, LOW_H + 0.04, (Z0 + rA) / 2)
  low('walnut', Z1 - rB, 0.08, 0.3, X1 + 0.1, LOW_H + 0.04, (rB + Z1) / 2)

  // doors: walnut frames (posts + lintel), a honey leaf standing open, a gold plate on each
  const frame = (x, z, alongX) => {
    const w = alongX ? DOOR.w : SIDE.w
    const pst = (dx, dz) => B.box('walnut', 0.16, 2.3, 0.16, x + dx, 1.15, z + dz)
    if (alongX) { pst(-w / 2, 0); pst(w / 2, 0); B.box('walnut', w + 0.16, 0.16, 0.2, x, 2.34, z); B.box('gold', w * 0.5, 0.12, 0.06, x, 2.62, z + 0.04) }
    else { pst(0, -w / 2); pst(0, w / 2); B.box('walnut', 0.2, 0.16, w + 0.16, x, 2.34, z); B.box('gold', 0.06, 0.12, w * 0.5, x - 0.04, 2.62, z) }
  }
  frame(DOOR.x, Z1 + 0.1, true)
  frame(X1 + 0.1, SIDE.z, false)
  B.box('honey', 0.06, 2.1, DOOR.w * 0.5, DOOR.x + DOOR.w / 2 - 0.12, 1.05, Z1 - 0.52, 0) // main door leaf, ajar against the jamb
  B.box('honey', SIDE.w * 0.5, 2.1, 0.06, X1 - 0.5, 1.05, SIDE.z + SIDE.w / 2 - 0.1) // side door leaf, open into the room

  // the window bar along the left wall: a honey top on a walnut panel, 5 stools (kit)
  B.box('honey', 0.55, 0.07, 6.6, X0 + 0.45, 1.03, 1.0)
  B.box('walnut', 0.12, 1.0, 6.4, X0 + 0.28, 0.5, 1.0)
  sol(X0 + 0.5, 1.0, 0.6, 6.6)

  // the queue lane: a lighter cream strip with gold edge lines and gold rope posts on both sides
  // (the front side is roped between the posts; the counter side stays open to step up to a counter)
  B.box('lane', 10.6, 0.02, 0.9, -2.2, 0.01, -2.3)
  B.box('gold', 10.6, 0.022, 0.05, -2.2, 0.011, -2.3 - 0.475)
  B.box('gold', 10.6, 0.022, 0.05, -2.2, 0.011, -2.3 + 0.475)
  for (let i = 0; i < 8; i++) {
    const px = -7.1 + i * 1.4
    for (const pz of [-2.3 - 0.55, -2.3 + 0.55]) {
      B.box('gold', 0.09, 0.92, 0.09, px, 0.46, pz) // post
      B.box('gold', 0.2, 0.05, 0.2, px, 0.025, pz) // foot
      B.box('gold', 0.14, 0.1, 0.14, px, 0.97, pz) // cap
    }
    if (i < 7) B.box('plum', 1.4 - 0.12, 0.05, 0.05, px + 0.7, 0.8, -2.3 + 0.55) // rope on the front side
  }
  // the ordering spot in front of each counter: a gold mat
  for (const c of COUNTERS) B.box('gold', 1.6, 0.02, 0.5, c.x, 0.012, c.prop === 'campus-coffee-kiosk' ? -2.55 : -3.75)

  // a walnut skirting and a gold rail for the regulars board posts
  const regulars = new THREE.Group()
  regulars.position.set(2.4, 0, 4.75)
  regulars.rotation.y = -0.45
  group.add(regulars)
  for (const dx of [-0.5, 0.5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07), mat('walnut')); leg.position.set(dx, 0.75, 0); regulars.add(leg) }
  const regTex = boardTexture('REGULARS', '')
  regTex.userData.draw('')
  {
    const c = regTex.image.getContext('2d')
    c.fillStyle = C.gold; c.fillRect(0, 100, 512, 4)
    c.fillStyle = C.cream; c.font = '600 22px Figtree, system-ui, sans-serif'
    for (let i = 0; i < 3; i++) { c.fillRect(70, 112 + i * 14, 372, 1) }
    regTex.needsUpdate = true
  }
  const regBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshBasicMaterial({ map: regTex, toneMapped: false }))
  regBoard.position.set(0, 1.35, 0.045)
  const regBack = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.86, 0.06), mat('walnut'))
  regBack.position.set(0, 1.35, 0)
  regulars.add(regBack, regBoard)
  sol(2.4, 4.75, 1.3, 0.4)

  // the patio: four poles, the long fence, and string lights between the poles (bulbs instanced below)
  const POLES = [[PATIO.x0 + 0.35, PATIO.z0 + 0.3], [PATIO.x1 - 0.1, PATIO.z0 + 0.3], [PATIO.x1 - 0.1, PATIO.z1 - 0.3], [PATIO.x0 + 0.35, PATIO.z1 - 0.3]]
  for (const [px, pz] of POLES) B.box('walnut', 0.1, 2.9, 0.1, px, 1.45, pz)
  B.box('walnut', 0.08, 0.7, PATIO.z1 - PATIO.z0, PATIO.x1 + 0.2, 0.35, (PATIO.z0 + PATIO.z1) / 2)

  // the kit's props -------------------------------------------------------------
  const inst = (name, list) => {
    const p = props[name]
    if (!p) return null
    const im = new THREE.InstancedMesh(p.geometry, p.material, list.length)
    const m = new THREE.Matrix4()
    const rot = new THREE.Matrix4()
    list.forEach(([x, z, ry = 0, y = 0], i) => {
      rot.makeRotationY(ry)
      m.makeTranslation(x, y, z).multiply(rot).multiply(p.base)
      im.setMatrixAt(i, m)
    })
    im.instanceMatrix.needsUpdate = true
    im.frustumCulled = false
    im.name = `caf-${name}`
    group.add(im)
    return im
  }
  const place = (c) => (c.prop === 'campus-coffee-kiosk' ? [c.x, Z0 + props[c.prop].size.z / 2 + 0.05, 0] : [c.x, Z0 + props[c.prop].size.z / 2 + 0.05, 0])
  inst('servery-counter', COUNTERS.filter((c) => c.prop === 'servery-counter').map(place))
  inst('cafe-counter', COUNTERS.filter((c) => c.prop === 'cafe-counter').map(place))
  inst('campus-coffee-kiosk', COUNTERS.filter((c) => c.prop === 'campus-coffee-kiosk').map(place))
  for (const c of COUNTERS) { const s = props[c.prop].size; sol(c.x, Z0 + s.z / 2 + 0.05, s.x + 0.1, s.z + 0.1) }
  inst('folding-dining-table', LONG_TABLES.map(([x, z]) => [x, z, 0]))
  for (const [x, z] of LONG_TABLES) sol(x, z, 2.4, 1.4)
  inst('cafe-table-set', TABLE_SETS.map(([x, z], i) => [x, z, i % 2 ? 0.4 : -0.3]))
  for (const [x, z] of TABLE_SETS.slice(0, 6)) sol(x, z, 1.65, 1.2)
  inst('bar-stool', STOOLS.map(([x, z]) => [x, z, 0]))
  for (const [x, z] of STOOLS) sol(x, z, 0.5, 0.5)
  inst('cafe-parasol', PARASOLS.map(([x, z]) => [x, z, 0]))

  // menu boards: plum, gold lettering, above each counter
  const boards = []
  for (const c of COUNTERS) {
    const tex = boardTexture(c.label, '')
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.69), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    b.position.set(c.x, 3.05, Z0 + 0.02)
    b.name = `caf-board-${c.id}`
    group.add(b)
    boards.push({ tex, mesh: b })
  }

  // windows on the left wall: bright panes, walnut frames
  const paneGeo = new THREE.PlaneGeometry(1.7, 1.3)
  const panes = new THREE.InstancedMesh(paneGeo, new THREE.MeshBasicMaterial({ color: '#fff7dc', toneMapped: false }), 3)
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.46, 1.86), mat('walnut'), 3)
  const m4 = new THREE.Matrix4()
  const r4 = new THREE.Matrix4().makeRotationY(Math.PI / 2)
  ;[-3.1, 0.1, 3.3].forEach((z, i) => {
    m4.makeTranslation(X0 + 0.075, 2.2, z).multiply(r4)
    panes.setMatrixAt(i, m4)
    m4.makeTranslation(X0 + 0.01, 2.2, z)
    frames.setMatrixAt(i, m4)
  })
  panes.frustumCulled = frames.frustumCulled = false
  group.add(frames, panes)

  // string lights over the patio: a wire and 12 bulbs along each of the three open sides
  const bulbs = []
  const wire = []
  for (const [start, end] of [[POLES[0], POLES[1]], [POLES[1], POLES[2]], [POLES[2], POLES[3]]]) {
    const at = (t) => [start[0] + (end[0] - start[0]) * t, 2.8 - Math.sin(t * Math.PI) * 0.32, start[1] + (end[1] - start[1]) * t]
    for (let i = 0; i < 12; i++) {
      wire.push(...at(i / 12), ...at((i + 1) / 12))
      if (i > 0) bulbs.push(at(i / 12))
    }
  }
  const wireGeo = new THREE.BufferGeometry()
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3))
  const wireLines = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: '#3a2a22' }))
  wireLines.frustumCulled = false
  group.add(wireLines)
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#2a2230', toneMapped: false })
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), bulbMat, bulbs.length)
  bulbs.forEach(([bx, by, bz], i) => { m4.makeTranslation(bx, by, bz); bulbMesh.setMatrixAt(i, m4) })
  bulbMesh.frustumCulled = false
  group.add(bulbMesh)
  // the emergency strip (load-shedding): one bar on the back wall under the boards
  const stripMat = new THREE.MeshBasicMaterial({ color: '#3a2a2a', toneMapped: false })
  const strip = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 0.06), stripMat)
  strip.position.set(-2, 3.55, Z0 + 0.06)
  group.add(strip)

  B.finish(group)
  rig3 = { group, boards, bulbMat, stripMat, panes: panes.material }
  return group
}

// ---------- lighting: one directional light plus ambient (+ the emergency light) ----------
const LIGHTS = {
  day: { bg: '#2a1750', hemi: ['#fff3de', '#c9b48c', 1.4], sun: ['#ffe6bd', 2.3, [-6, 12, 14]], emer: 0, bulbs: false, window: '#fff7dc', fog: '#2a1750', sub: '' },
  evening: { bg: '#170b2e', hemi: ['#ffcf99', '#5a4636', 0.75], sun: ['#ff9a4d', 0.9, [-12, 5, 12]], emer: 0, bulbs: true, window: '#ff9e5a', fog: '#170b2e', sub: '' },
  load: { bg: '#0d0818', hemi: ['#8c8fb0', '#2a2a36', 0.2], sun: ['#7a86b8', 0, [-6, 12, 14]], emer: 1, bulbs: false, window: '#252a40', fog: '#0d0818', sub: 'COLD FOOD ONLY' },
}
let hemi, sun, emer
export const LIGHT_NAMES = Object.keys(LIGHTS)

function lightFromGame() {
  const q = Q.get('caflight')
  if (LIGHTS[q]) return q
  if (opts?.run?.loadShedding) return 'load'
  const m = opts?.run?.minutes ?? 12 * 60
  return m >= 17.5 * 60 || m < 6 * 60 ? 'evening' : 'day'
}

export function setLight(name) {
  const L = LIGHTS[name]
  if (!L || !scene) return false
  lightName = name
  scene.background = new THREE.Color(L.bg)
  hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2]
  sun.color.set(L.sun[0]); sun.intensity = L.sun[1]; sun.position.set(...L.sun[2])
  emer.intensity = L.emer ? 6 : 0
  if (rig3) {
    rig3.bulbMat.color.set(L.bulbs ? '#ffd27a' : '#2a2230')
    rig3.stripMat.color.set(L.emer ? '#ff6a50' : '#3a2a2a')
    rig3.panes.color.set(L.window)
    for (const b of rig3.boards) b.tex.userData.draw(L.sub)
  }
  uiRoot?.querySelectorAll('[data-light]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === name)))
  if (host) host.dataset.light = name
  return true
}

// ---------- the camera: frame the room, not just the player ----------
// Top fits the whole hall, squared to the screen (yaw 0). Sims follows you but never looks past
// the walls (the floor fills the screen, no empty plum under the front wall), and the picture is
// pushed down so nothing important sits under the top bar and the Leave / camera row.
const TAN_V = Math.tan((52 / 2) * Math.PI / 180)
const SOFT_Z = Z1 - 6.3 // past this the camera follows you at a third of the way (the front stays in frame, the signs stay clear of the bars)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
function measureBars() {
  const hud = document.querySelector('.g-hud')
  const hb = hud && hud.getClientRects().length ? hud.getBoundingClientRect().bottom : 0
  if (uiRoot) uiRoot.style.setProperty('--caf-top', `${Math.round(hb || 56)}px`)
  barsBottom = (hb || 56) + 8 + 44
}
function fitCamera() {
  if (!rig) return
  measureBars()
  const w = window.innerWidth
  const h = window.innerHeight
  const free = Math.max(0.5, (h - barsBottom) / h)
  const distW = ((X1 - X0) / 2 + 0.4) / (TAN_V * (w / h))
  const distH = ((Z1 - Z0) / 2 + 1.0) / (TAN_V * free)
  rig.setDistance('top', Math.max(distW, distH))
  rig.setDistance('sims', 13)
}
function frameCamera(dt) {
  const mode = rig.mode
  if (mode !== lastMode) {
    if (mode === 'top') rig.yaw = 0
    else if (mode === 'sims' && (lastMode === 'top' || lastMode === null)) rig.yaw = 0.6
    lastMode = mode
  }
  const p = player.position
  let target = p
  if (mode === 'top') target = { x: (X0 + X1) / 2, y: 0, z: (Z0 + Z1) / 2 }
  else if (mode === 'sims') target = { x: Math.max(p.x, X0 + 2.8), y: 0, z: Math.max(Z0 + 2.2, p.z <= SOFT_Z ? p.z : SOFT_Z + (p.z - SOFT_Z) * 0.4) }
  rig.apply(camera, target, dt, null)
  const want = mode === 'eye' ? 0 : Math.round(barsBottom * (mode === 'top' ? 0.5 : 1.1))
  if (want !== shiftY) {
    shiftY = want
    const W = window.innerWidth, H = window.innerHeight
    if (want) camera.setViewOffset(W, H, 0, -want, W, H)
    else camera.clearViewOffset()
  }
}

// ---------- walking ----------
const BODY = 0.28
const inHall = (x, z) => x > X0 + 0.3 && x < X1 - 0.3 && z > Z0 + 0.3 && z < Z1 + 0.35
const inDoorway = (x, z) => x >= X1 - 0.5 && x <= PATIO.x0 + 0.5 && Math.abs(z - SIDE.z) < SIDE.w / 2 - 0.3
const inPatio = (x, z) => x > PATIO.x0 + 0.4 && x < PATIO.x1 - 0.3 && z > PATIO.z0 + 0.3 && z < PATIO.z1 - 0.3
function blockedAt(x, z) {
  if (!(inHall(x, z) || inDoorway(x, z) || inPatio(x, z))) return true
  return solids.some((s) => x > s.minX - BODY && x < s.maxX + BODY && z > s.minZ - BODY && z < s.maxZ + BODY)
}
function route(tx, tz) {
  const S = 0.25
  const ci = (n) => Math.round(n / S)
  const key = (i, j) => `${i},${j}`
  const [si, sj, gi, gj] = [ci(player.position.x), ci(player.position.z), ci(tx), ci(tz)]
  const open = [[si, sj]]
  const g = new Map([[key(si, sj), 0]])
  const came = new Map()
  const h = (i, j) => Math.hypot(i - gi, j - gj)
  for (let guard = 0; open.length && guard < 6000; guard++) {
    open.sort((a, b) => g.get(key(...a)) + h(...a) - (g.get(key(...b)) + h(...b)))
    const [i, j] = open.shift()
    if (i === gi && j === gj) {
      const out = []
      for (let k = key(i, j); k; k = came.get(k)) { const [a, b] = k.split(',').map(Number); out.unshift({ x: a * S, z: b * S }) }
      out[out.length - 1] = { x: tx, z: tz }
      return out.slice(1).filter((p, n, all) => n === all.length - 1 || n % 2 === 1)
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [ni, nj] = [i + di, j + dj]
      if (!(ni === gi && nj === gj) && blockedAt(ni * S, nj * S)) continue
      const cost = g.get(key(i, j)) + Math.hypot(di, dj)
      if (cost < (g.get(key(ni, nj)) ?? Infinity)) { g.set(key(ni, nj), cost); came.set(key(ni, nj), key(i, j)); open.push([ni, nj]) }
    }
  }
  return [{ x: tx, z: tz }]
}
function walkTo(x, z, near = 0.18) { mover.walkTo(route(x, z), { near, done: () => {} }) }

function onTap(ndc) {
  if (!running || !player || !ready) return
  ray.setFromCamera(ndc, camera)
  if (ray.intersectObject(player, true)[0]) { mover.stop(); return }
  if (ray.ray.origin.y <= 0 || ray.ray.direction.y >= 0) return
  const t = -ray.ray.origin.y / ray.ray.direction.y
  const p = ray.ray.at(t, v3)
  // a tap on or past the main door walks you out of it
  if (Math.abs(p.x - DOOR.x) < DOOR.w / 2 && p.z > Z1 - 0.8) { smooth.tap(); walkTo(DOOR.x, Z1 + 0.25, 0.1); return }
  if (blockedAt(p.x, p.z)) {
    for (let r = 0.25; r < 1.6; r += 0.25) for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos(a * Math.PI / 4) * r
      const z = p.z + Math.sin(a * Math.PI / 4) * r
      if (!blockedAt(x, z)) { smooth.tap(); walkTo(x, z); return }
    }
    return
  }
  smooth.tap()
  walkTo(p.x, p.z)
}

// ---------- UI: Leave, the camera, and (debug) the light switch ----------
function ui() {
  if (uiRoot) return
  const style = document.createElement('style')
  style.textContent = `
#caf3d{position:fixed;inset:0;z-index:0;touch-action:none;background:#2a1750}
#caf3d[hidden]{display:none}
#caf3d canvas{display:block;width:100%;height:100%}
body[data-caf="1"] #app{visibility:hidden;pointer-events:none}
body[data-caf="1"] #app .g-hud{visibility:visible;pointer-events:none}
.caf-ui{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:Figtree,system-ui,sans-serif}
.caf-ui[hidden]{display:none}
.caf-ui button{pointer-events:auto;font:800 14px Figtree,system-ui,sans-serif;border:0;cursor:pointer;min-height:44px}
.caf-out{position:absolute;left:12px;top:calc(var(--caf-top,64px) + 8px);padding:0 16px;border-radius:22px;background:#2f1a5c;color:#f0c400;box-shadow:0 4px 14px #0006}
.caf-title{position:absolute;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 18px);max-width:calc(100% - 200px);margin:0;color:#fff;font:800 15px Graduate,Figtree,system-ui,sans-serif;text-shadow:0 1px 6px #000a;text-align:center;pointer-events:none}
.caf-cams{position:absolute;right:12px;top:calc(var(--caf-top,64px) + 8px);display:flex;gap:4px}
.caf-cams button{padding:0 11px;border-radius:22px;background:#0009;color:#fff}
.caf-cams button[aria-pressed="true"]{background:#f0c400;color:#1c1915}
.caf-debug{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);display:flex;gap:6px;align-items:center;background:#0009;border-radius:24px;padding:4px}
.caf-debug button{padding:0 14px;border-radius:20px;background:#fff2;color:#fff}
.caf-debug button[aria-pressed="true"]{background:#d9a632;color:#1c1915}
.caf-debug span{color:#fff;font-size:12px;padding:0 8px}`
  document.head.append(style)
  document.body.insertAdjacentHTML('beforeend', `<div class="caf-ui" id="caf-ui" hidden>
    <button class="caf-out" type="button" data-caf-out>Leave the Caf</button>
    <div class="caf-cams">${['top', 'sims', 'eye'].map((m) => `<button type="button" data-cam="${m}" aria-pressed="false">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    ${DEBUG ? `<div class="caf-debug"><span data-stats></span>${LIGHT_NAMES.map((n) => `<button type="button" data-light="${n}" aria-pressed="false">${n === 'load' ? 'Load-shedding' : n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div>` : ''}
  </div>`)
  uiRoot = document.getElementById('caf-ui')
  uiRoot.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.cafOut !== undefined) leave()
    else if (b.dataset.cam) { rig.setMode(b.dataset.cam); uiRoot.querySelectorAll('[data-cam]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cam === b.dataset.cam))); window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: b.dataset.cam })) }
    else if (b.dataset.light) setLight(b.dataset.light)
  })
}

function build() {
  host = document.createElement('div')
  host.id = 'caf3d'
  document.body.prepend(host)
  ui()
  renderer = new THREE.WebGLRenderer({ antialias: window.innerWidth >= 700 })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.25))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.prepend(renderer.domElement)
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 120)
  window.addEventListener('resize', () => {
    if (!renderer) return
    camera.aspect = window.innerWidth / window.innerHeight
    shiftY = -1 // (re-apply the view offset)
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    fitCamera()
  })
  rig = createCameraRig()
  fitCamera()
  mover = createPlayer({ blocked: (x, z) => blockedAt(x, z), onWalk: (e) => (e.type === 'start' ? smooth.walkStart() : smooth.walkEnd(e.how, e.left, e.x, e.z)) })
  input = bindInput(renderer.domElement, { cameraRig: rig, onTap, live: () => running && ready })
  window.addEventListener('mzansi-cam', (e) => { if (running && e.detail !== rig.mode) rig.setMode(e.detail) })
}

function freshScene() {
  scene = new THREE.Scene()
  scene.name = 'caf'
  hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1)
  sun = new THREE.DirectionalLight('#ffffff', 1)
  sun.target.position.set(0, 0, 0)
  emer = new THREE.PointLight('#ff7a60', 0, 22, 1.6)
  emer.position.set(-2, 3.3, -3.5)
  scene.add(hemi, sun, sun.target, emer)
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000) * FAST
  last = now
  clock += dt
  if (!scene || !player) return
  const s = input.stick()
  if (s) mover.setStick(s.x, s.z, s.run, s.mag)
  else mover.setStick(0, 0)
  mover.update(dt)
  if (mover.moving) smooth.moved()
  const stepping = mover.moving
  soundLoop('footsteps', stepping && player.visible)
  poseAvatar(player, stepping, clock)
  if (shot) { camera.position.set(...shot.pos); camera.lookAt(...shot.look) } else frameCamera(dt)
  if (frameCount % 30 === 0) { const b = barsBottom; measureBars(); if (b !== barsBottom) fitCamera() }
  for (const part of player.userData.headParts || []) part.visible = rig.mode !== 'eye'
  // out of the main door: back to campus
  if (ready && performance.now() - enteredAt > 900 && player.position.z > Z1 - 0.1 && Math.abs(player.position.x - DOOR.x) < DOOR.w / 2) leave()
  host.dataset.px = player.position.x.toFixed(2)
  host.dataset.pz = player.position.z.toFixed(2)
  host.dataset.cam = rig.mode
  renderer.render(scene, camera)
  if (DEBUG && frameCount % 15 === 0) {
    const st = uiRoot.querySelector('[data-stats]')
    if (st) st.textContent = `${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles / 1000)}k tris`
  }
  frameCount++
  smooth.frame(now, 'caf', 'caf')
}

// ---------- start / leave ----------
let starting = false
let stopMark = 0
function leave() {
  if (!running) return
  const done = opts?.onExit
  done?.()
}

export async function startCaf(options) {
  opts = options
  if (starting) return
  if (!running) {
    const mark = stopMark
    starting = true
    try { await curtain.cover('Into the Caf…') } finally { starting = false }
    if (mark !== stopMark) return
  }
  if (!renderer) build()
  host.hidden = false
  uiRoot.hidden = false
  host.dataset.on = '1'
  if (running) return
  running = true
  ready = false
  host.dataset.ready = '0'
  freshScene()
  lastMode = null
  shiftY = -1
  fitCamera()
  uiRoot.querySelectorAll('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === rig.mode)))
  try {
    await buildRoom()
    if (!running) return
    player = createAvatar(opts.run?.character?.avatar)
    player.userData.isPlayer = true
    player.userData.pose = 'stand'
    player.position.set(DOOR.x, 0, Z1 - 1.1)
    player.rotation.y = Math.PI // facing the counters
    scene.add(player)
    mover.stop()
    setLight(lightFromGame())
    host.dataset.look = JSON.stringify(player.userData.look)
    if (!frame) frame = requestAnimationFrame(tick)
    frameCamera(1)
    await curtain.awaitPeople(scene, appearNow, 8000)
    await curtain.settle(renderer, scene, camera)
    ready = true
    enteredAt = performance.now()
    host.dataset.ready = '1'
    curtain.lift()
  } catch (e) {
    console.error(e)
    curtain.lift()
    ready = true
  }
}

export function stopCaf() {
  stopMark++
  running = false
  ready = false
  soundLoop('footsteps', false)
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  mover?.stop()
  input?.clearKeys?.()
  if (host) { host.hidden = true; host.dataset.on = '0' }
  if (uiRoot) uiRoot.hidden = true
  if (scene) {
    scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material && !Array.isArray(o.material)) o.material.map?.dispose?.() })
    scene = null
  }
  rig3 = null
  shot = null
  player = null
}

// Tests and screenshots (read-mostly).
if (typeof window !== 'undefined') {
  window.mzansiCaf = {
    ZONES,
    LIGHT_NAMES,
    light: (name) => setLight(name),
    teleport: (x, z) => { if (!player) return false; mover.stop(); player.position.set(x, 0, z); frameCamera(1); return true },
    info() {
      if (!scene || !player) return null
      renderer.info.reset()
      renderer.render(scene, camera)
      return { ready, light: lightName, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, player: [player.position.x, player.position.z], cam: rig.mode }
    },
    // where a zone's anchor lands on screen, and whether a wall/prop is in front of it
    project(name) {
      const z = ZONES[name]
      if (!z || !camera) return null
      const p = new THREE.Vector3(z.x, 1.0, z.z)
      const q = p.clone().project(camera)
      const dir = p.clone().sub(camera.position)
      const dist = dir.length()
      ray.set(camera.position, dir.normalize())
      ray.far = dist - 0.3
      const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object !== player && !player.getObjectById?.(h.object.id) && h.object.visible)
      ray.far = Infinity
      return { x: q.x, y: q.y, behind: q.z > 1, onScreen: q.x > -1 && q.x < 1 && q.y > -1 && q.y < 1 && q.z < 1, blockers: [...new Set(hits.map((h) => h.object.name || h.object.type))] }
    },
    // (tests) how much of the picture below the bars is room (floor, walls, props) and not bare background
    coverage() {
      if (!scene || !camera) return null
      const W = window.innerWidth, H = window.innerHeight
      let hit = 0, n = 0
      for (let gy = 0; gy < 24; gy++) for (let gx = 0; gx < 12; gx++) {
        const px = ((gx + 0.5) / 12) * W
        const py = barsBottom + ((gy + 0.5) / 24) * (H - barsBottom)
        ray.setFromCamera(new THREE.Vector2((px / W) * 2 - 1, -(py / H) * 2 + 1), camera)
        n++
        if (ray.intersectObjects(scene.children, true).some((h) => h.object !== player && !player.getObjectById?.(h.object.id))) hit++
      }
      return { covered: hit / n, barsBottom }
    },
    // (tests) a world point on the screen, in CSS px
    px(x, y, z) {
      const q = new THREE.Vector3(x, y, z).project(camera)
      return { x: (q.x * 0.5 + 0.5) * window.innerWidth, y: (-q.y * 0.5 + 0.5) * window.innerHeight, behind: q.z > 1 }
    },
    hall: { X0, X1, Z0, Z1 },
    counterX: (id) => COUNTERS.find((c) => c.id === id)?.x,
    bars: () => ({ barsBottom, W: window.innerWidth, H: window.innerHeight }),
    shot: (pos, look) => { shot = pos ? { pos, look } : null },
    leave: () => leave(),
  }
}
