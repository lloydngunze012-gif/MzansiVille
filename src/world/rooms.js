// Small cutaway interiors for scenes that happen inside a building: a res bedroom,
// a kitchen, a classroom, the library, a lab and a lounge. Built far outside the
// campus (the camera cuts there), with two walls so the camera sees in from the
// open corner. Each returns anchors: where to stand, sit, lie and look.
import * as THREE from 'three'
import { loadModel } from './models.js'

export const ROOM = { x: 0, z: -300 }
const W = 9
const D = 8

const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })

export function buildRoom(kind) {
  const group = new THREE.Group()
  group.name = 'room'
  group.position.set(ROOM.x, 0, ROOM.z)
  const at = (x, z) => ({ x: ROOM.x + x, z: ROOM.z + z })
  const box = (w, h, d, color, x, y, z, extra) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra))
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
    return m
  }
  const prop = (name, x, z, { s = 2.2, rot = 0, y = 0, kit = 'props' } = {}) => {
    const holder = new THREE.Group()
    holder.position.set(x, y, z)
    holder.rotation.y = rot
    group.add(holder)
    loadModel(`/models/${kit}/${name}.glb`).then((src) => { const m = src.clone(true); m.scale.setScalar(s); holder.add(m) }).catch(() => {})
    return holder
  }
  const walls = { bedroom: [0xe8d6b8, 0x9a7048], kitchen: [0xf2efe6, 0xb8b0a0], classroom: [0xf6ecd8, 0xa07e58], library: [0xdfe6ee, 0x6b4a33], lab: [0xeef4f2, 0xc9d0d4], lounge: [0xf0dcc8, 0x8a6a4a] }[kind] || [0xeeeeee, 0x999999]
  box(W, 0.1, D, walls[1], 0, -0.05, 0)
  box(W, 3.2, 0.2, walls[0], 0, 1.6, -D / 2)
  box(0.2, 3.2, D, walls[0], -W / 2, 1.6, 0)
  // Warm room light, always on (rooms are lit day and night).
  const light = new THREE.PointLight(0xfff0d8, 14, 16, 1.4)
  light.position.set(0, 3.1, 0)
  group.add(light)
  const window = box(1.6, 1.1, 0.08, 0x9ecff0, 1.8, 1.9, -D / 2 + 0.12, { emissive: 0x9ecff0, emissiveIntensity: 0.25 })
  window.name = 'window'
  const anchors = { door: at(3.6, 3.2), look: at(0, -1) }

  if (kind === 'bedroom' || kind === 'lounge') {
    if (kind === 'bedroom') {
      box(1.2, 0.45, 2.3, 0x6b4a33, -3.6, 0.22, -2.6)
      box(1.1, 0.18, 2.2, 0xf4f1e6, -3.6, 0.54, -2.6)
      box(1.1, 0.12, 0.7, 0x1d7fb8, -3.6, 0.65, -1.95)
      box(0.5, 0.14, 0.4, 0xffffff, -3.6, 0.7, -3.45)
      box(1.2, 0.45, 2.3, 0x6b4a33, 0.6, 0.22, -2.6)
      box(1.1, 0.18, 2.2, 0xf4f1e6, 0.6, 0.54, -2.6)
      box(1.1, 0.12, 0.7, 0xd9534f, 0.6, 0.65, -1.95)
      box(1.6, 0.06, 0.7, 0x9a6a40, 3.2, 0.9, -3.4)
      prop('chair', 3.2, -2.7, { rot: Math.PI })
      box(0.45, 0.6, 0.45, 0x3a3020, 3.8, 1.2, -3.5, { emissive: 0xffd28a, emissiveIntensity: 0.6 })
      box(2, 1.1, 0.05, 0x7b3fe4, -1.4, 2.1, -D / 2 + 0.12)
      anchors.bed = { ...at(-3.6, -2.7), rot: Math.PI / 2, y: 0.6, lieY: 0.64 }
      anchors.sit = { ...at(-3.05, -2.2), rot: Math.PI / 2, y: 0.55 }
      anchors.desk = { ...at(3.2, -2.7), rot: Math.PI, y: 0.46 }
      anchors.bag = at(1.8, 1.2)
      box(0.5, 0.5, 0.3, 0x2b3a55, 1.8, 0.25, 1.2)
    } else {
      box(3.2, 0.5, 1, 0x7b3fe4, -1.5, 0.25, -3)
      box(3.2, 0.8, 0.3, 0x6a2fd0, -1.5, 0.75, -3.45)
      box(1.4, 0.45, 0.8, 0x9a6a40, -1.5, 0.22, -1.6)
      box(2.4, 1.4, 0.1, 0x1c1915, 2.6, 1.6, -D / 2 + 0.15)
      anchors.sit = { ...at(-1.5, -3.05), rot: 0, y: 0.55 }
      anchors.look = at(2.6, -3)
    }
  }
  if (kind === 'kitchen') {
    box(5, 0.95, 0.8, 0xc9c9c9, -1.5, 0.47, -3.4)
    box(5, 0.06, 0.85, 0x8a8a8a, -1.5, 0.97, -3.4)
    box(0.9, 0.06, 0.6, 0x2b2b30, -2.6, 1.02, -3.4)
    prop('kitchenFridge', 2, -3.5, { s: 2.2 })
    prop('kitchenCoffeeMachine', -0.4, -3.45, { s: 1.6, y: 1 })
    box(1.6, 0.06, 1, 0x9a6a40, -1, 0.75, 0.4)
    prop('chair', -1.9, 0.4, { rot: Math.PI / 2 })
    prop('chair', -0.1, 0.4, { rot: -Math.PI / 2 })
    box(0.8, 0.9, 0.7, 0xf4f4f4, -3.9, 0.45, 1.6)
    box(0.5, 0.5, 0.05, 0x2b3a55, -3.9, 0.55, 1.95)
    anchors.stove = { ...at(-2.6, -2.6), rot: Math.PI }
    anchors.kettle = { ...at(-0.4, -2.6), rot: Math.PI }
    anchors.fridge = { ...at(2, -2.4), rot: Math.PI }
    anchors.sit = { ...at(-1.9, 0.4), rot: Math.PI / 2, y: 0.46 }
    anchors.sit2 = { ...at(-0.1, 0.4), rot: -Math.PI / 2, y: 0.46 }
    anchors.table = at(-1, 0.4)
    anchors.washer = { ...at(-3.1, 1.6), rot: -Math.PI / 2 }
  }
  if (kind === 'classroom') {
    box(5, 1.8, 0.06, 0x1f3d2b, -0.5, 1.9, -D / 2 + 0.14)
    box(1, 1, 0.6, 0x5a3c28, 2.6, 0.5, -2.8)
    anchors.lecturer = { ...at(2.6, -3.4), rot: 0 }
    anchors.board = at(-0.5, -3.9)
    const seats = []
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const x = -3 + c * 1.6
        const z = -0.8 + r * 1.6
        box(1.1, 0.06, 0.5, 0xb88a5a, x, 0.75, z - 0.45)
        prop('chair', x, z, { rot: Math.PI })
        seats.push({ ...at(x, z), rot: Math.PI, y: 0.46 })
      }
    }
    anchors.seats = seats
    anchors.seat = seats[5]
    anchors.backSeat = seats[11]
  }
  if (kind === 'library') {
    for (const x of [-3.6, -1.4, 0.8]) {
      box(1.8, 2.4, 0.5, 0x6b4a33, x, 1.2, -3.6)
      for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) box(0.18, 0.4, 0.3, [0xc62828, 0x1e5bb8, 0x1f7a3a, 0xf0c400, 0x7b3fe4][(j + k + Math.round(x)) % 5], x - 0.7 + j * 0.27, 0.45 + k * 0.55, -3.45)
    }
    box(2.4, 0.06, 1.2, 0x9a6a40, 0.4, 0.75, 0.4)
    prop('chair', -0.4, 1.2, { rot: Math.PI })
    prop('chair', 1.2, 1.2, { rot: Math.PI })
    prop('chair', 0.4, -0.45, { rot: 0 })
    box(0.4, 0.5, 0.4, 0x3a3020, 1.4, 1.0, 0.2, { emissive: 0xffd28a, emissiveIntensity: 0.7 })
    box(0.7, 1.1, 0.6, 0xd8d8d8, 3.6, 0.55, -3.3)
    anchors.desk = { ...at(-0.4, 1.2), rot: Math.PI, y: 0.46 }
    anchors.desk2 = { ...at(1.2, 1.2), rot: Math.PI, y: 0.46 }
    anchors.desk3 = { ...at(0.4, -0.45), rot: 0, y: 0.46 }
    anchors.printer = { ...at(3.6, -2.5), rot: Math.PI }
    anchors.look = at(0.4, 0.4)
  }
  if (kind === 'lab') {
    for (const z of [-2.8, 0.2]) {
      box(5, 0.95, 0.9, 0xeeeeee, -1, 0.47, z)
      box(5, 0.06, 0.95, 0x2b2b30, -1, 0.97, z)
    }
    box(0.4, 0.4, 0.4, 0x1d7fb8, -2.4, 1.2, -2.8, { emissive: 0x1d7fb8, emissiveIntensity: 0.3 })
    box(0.3, 0.5, 0.3, 0x7bd0a0, -0.4, 1.25, 0.2, { transparent: true, opacity: 0.8 })
    box(0.9, 0.06, 0.6, 0x1c1915, 1.4, 1.03, -2.8)
    // A teaching skeleton on a stand.
    const bone = 0xf4f1e6
    box(0.08, 1.7, 0.08, 0x8a8f96, 3.6, 0.85, -2.6)
    box(0.34, 0.36, 0.3, bone, 3.6, 1.95, -2.6)
    box(0.5, 0.7, 0.18, bone, 3.6, 1.45, -2.6)
    for (const s of [-1, 1]) { box(0.08, 0.7, 0.08, bone, 3.6 + s * 0.32, 1.35, -2.6); box(0.09, 0.8, 0.09, bone, 3.6 + s * 0.12, 0.55, -2.6) }
    anchors.bench = { ...at(-1, -2), rot: Math.PI }
    anchors.bench2 = { ...at(-1, 1), rot: Math.PI }
    anchors.laptop = { ...at(1.4, -2), rot: Math.PI }
    anchors.skeleton = { ...at(3.6, -1.6), rot: Math.PI }
    anchors.look = at(-1, -2.8)
  }
  return { group, kind, anchors, at }
}
