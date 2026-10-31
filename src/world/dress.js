// Dresses the places that have a story (data/campusville/place_story.json):
// the Quad and the cafeteria for now. Props are Kenney Nature and Furniture Kit
// GLBs (CC0, public/models/props); stage, stall, signs and lights are built here.
// Returns night lights for the day/night cycle, people to animate, blockers for
// the walk grid, and the walkable spots the place sheet lists.
import * as THREE from 'three'
import STORY from '../../data/campusville/place_story.json'
import { createAvatar, gesture, poseAvatar } from './avatar3d.js'
import { lookForPerson } from './cast.js'
import { CHAIR_SEAT, makeChair } from './furniture.js'
import { ms } from '../speed.js'

const PROPS = '/models/props/'
const propCache = {}

// Kenney furniture has its origin at a corner; every prop is re-centred on x/z
// with its base on the ground, so positions here mean the middle of the thing.
function loadProp(name) {
  if (!propCache[name]) {
    propCache[name] = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(`${PROPS}${name}.glb`))
      .then((gltf) => {
        const root = new THREE.Group()
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const centre = box.getCenter(new THREE.Vector3())
        gltf.scene.position.set(-centre.x, -box.min.y, -centre.z)
        root.add(gltf.scene)
        return root
      })
  }
  return propCache[name]
}

// Seat heights at the scales used below (a seated avatar's origin goes here).
export const SEAT = { bench: 0.45, chair: 0.46 }

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })

function box(parent, w, h, d, color, x, y, z, extra) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'object' ? color : mat(color, extra))
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

// Text on a canvas, shown on a plane. glow: unlit, so it reads at night.
function sign(parent, lines, { x, y, z, rot = 0, w = 3, h = 0.8, bg = '#22143b', fg = '#f0c400', font = 64, align = 'center' }) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = Math.round((512 * h) / w)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = fg
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
  ctx.fillStyle = fg
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const size = Math.min(font, (canvas.height - 24) / lines.length)
  ctx.font = `bold ${size}px sans-serif`
  lines.forEach((text, i) => {
    ctx.font = `bold ${i === 0 && lines.length > 2 ? size * 1.15 : size}px sans-serif`
    ctx.fillText(text, align === 'left' ? 28 : canvas.width / 2, (canvas.height / (lines.length + 1)) * (i + 1), canvas.width - 40)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
  plane.position.set(x, y, z)
  plane.rotation.y = rot
  plane.name = 'sign'
  parent.add(plane)
  return plane
}

const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z)

export function dressPlaces(layout) {
  const group = new THREE.Group()
  group.name = 'dressing'
  const lights = [] // { light, base }
  const glows = [] // { material, base }
  const people = [] // { avatar, clock, every, move, next }
  const obstacles = []
  const spots = {}
  const benches = []
  const queue = {}
  const cafQueue = {}
  const srcTables = []
  const freeTables = []
  let performer = null
  const movers = [] // short straight walks for the place's own people
  function moveAvatar(avatar, x, z, speed = 1.8) {
    return new Promise((resolve) => movers.push({ avatar, x, z, speed, resolve }))
  }

  function prop(name, x, z, { rot = 0, s = 2.2, y = 0 } = {}) {
    const holder = new THREE.Group()
    holder.position.set(x, y, z)
    holder.rotation.y = rot
    group.add(holder)
    loadProp(name).then((src) => {
      const model = src.clone(true)
      model.scale.setScalar(s)
      model.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true } })
      holder.add(model)
    }).catch(() => {})
    return holder
  }

  // A park bench with a known seat (0.45 m high, 0.45 m deep), so people sit on it:
  // wooden slats on dark steel legs, a backrest behind. It faces local +z.
  function bench(x, z, rot) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = rot
    group.add(g)
    const wood = mat(0xa0703c)
    const steel = mat(0x2b2b30)
    for (let i = 0; i < 3; i++) box(g, 1.5, 0.05, 0.13, wood, 0, SEAT.bench - 0.025, -0.15 + i * 0.15)
    for (let i = 0; i < 2; i++) box(g, 1.5, 0.12, 0.04, wood, 0, 0.62 + i * 0.16, -0.25).rotation.x = -0.15
    for (const sx of [-0.66, 0.66]) {
      box(g, 0.06, SEAT.bench - 0.05, 0.4, steel, sx, (SEAT.bench - 0.05) / 2, 0)
      box(g, 0.06, 0.42, 0.06, steel, sx, 0.62, -0.25)
    }
  }

  function block(x, z, w, d) {
    obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })
  }

  // id: who this is (data/campusville/people.json); their look comes from cast.js.
  function person(id, x, z, rot, { pose = 'stand', y = 0, every = 0, move = 'interact-right' } = {}) {
    const avatar = createAvatar(lookForPerson(id))
    avatar.userData.personId = id
    avatar.position.set(x, y, z)
    avatar.rotation.y = rot
    avatar.userData.pose = pose
    group.add(avatar)
    people.push({ avatar, clock: Math.random() * 5, every, move, next: every ? Math.random() * every : 0 })
    return avatar
  }

  function lamp(x, z) {
    box(group, 0.14, 3.4, 0.14, 0x2b2b30, x, 1.7, z)
    const headMat = mat(0x3a3020, { emissive: 0xffd28a, emissiveIntensity: 0.2 })
    box(group, 0.5, 0.28, 0.5, headMat, x, 3.45, z)
    glows.push({ material: headMat, base: 2.2 })
    const light = new THREE.PointLight(0xffd29a, 0, 12, 1.6)
    light.position.set(x, 3.2, z)
    group.add(light)
    lights.push({ light, base: 26 })
    block(x, z, 0.4, 0.4)
  }

  // Bulbs hung on a sagging wire between two points (one shared glowing material).
  const bulbMat = mat(0xfff0c0, { emissive: 0xffd27a, emissiveIntensity: 0.3 })
  glows.push({ material: bulbMat, base: 2.6 })
  function stringLights(a, b, count = 14, sag = 0.7, withLight = true) {
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), bulbMat, count)
    const dummy = new THREE.Object3D()
    const wire = []
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const p = new THREE.Vector3().lerpVectors(a, b, t)
      p.y -= Math.sin(t * Math.PI) * sag
      dummy.position.copy(p)
      dummy.updateMatrix()
      bulbs.setMatrixAt(i, dummy.matrix)
      wire.push(p)
    }
    group.add(bulbs)
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, ...wire, b]), new THREE.LineBasicMaterial({ color: 0x1c1915 })))
    if (withLight) {
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.5)
      const light = new THREE.PointLight(0xffcf8a, 0, 10, 1.8)
      light.position.set(mid.x, mid.y - sag - 0.3, mid.z)
      group.add(light)
      lights.push({ light, base: 14 })
    }
  }

  const quad = layout.buildings.find((b) => b.id === 'quad')
  if (quad) dressQuad(quad.cx, quad.cz)
  const caf = layout.buildings.find((b) => b.id === 'cafeteria')
  if (caf) dressCafeteria(caf)

  function spotList(id, cx, cz) {
    spots[id] = (STORY[id]?.spots || []).map((s) => ({ ...s, x: cx + s.x, z: cz + s.z }))
  }

  function dressQuad(cx, cz) {
    const story = STORY.quad
    spotList('quad', cx, cz)
    // Paving with a ring of darker pavers.
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.06, 40), mat(0xd9c49c))
    plaza.position.set(cx, 0.03, cz)
    plaza.receiveShadow = true
    group.add(plaza)
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.3, 40), mat(0xb89c6e))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(cx, 0.065, cz)
    group.add(ring)

    // Open-mic stage on the north side (its footprint is the place's "building").
    const sz = cz - 6.5
    box(group, 5, 0.6, 3, 0x8a5a3a, cx, 0.3, sz)
    box(group, 1.6, 0.3, 0.6, 0x7a4e30, cx, 0.15, sz + 1.75)
    for (const side of [-1, 1]) box(group, 0.2, 3.6, 0.2, 0x2b2b30, cx + side * 2.4, 1.8, sz - 1.3)
    box(group, 5, 0.22, 0.22, 0x2b2b30, cx, 3.6, sz - 1.3)
    box(group, 4.6, 2.3, 0.1, 0x5b23c9, cx, 1.85, sz - 1.4)
    sign(group, [story.stage_sign], { x: cx, y: 2.75, z: sz - 1.33, w: 4.2, h: 0.7, bg: '#22143b', fg: '#f0c400' })
    stringLights(new THREE.Vector3(cx - 2.4, 3.5, sz - 1.3), new THREE.Vector3(cx + 2.4, 3.5, sz - 1.3), 12, 0.15, false)
    box(group, 0.05, 1.3, 0.05, 0x1c1915, cx, 1.25, sz + 0.9) // mic stand
    box(group, 0.12, 0.14, 0.12, 0x444444, cx, 1.95, sz + 0.9)
    prop('speaker', cx - 2.05, sz + 0.9, { y: 0.6, s: 2.4 })
    prop('speaker', cx + 2.05, sz + 0.9, { y: 0.6, s: 2.4 })
    const spot = new THREE.PointLight(0xffe0b0, 0, 9, 1.5)
    spot.position.set(cx, 3.3, sz + 1.6)
    group.add(spot)
    lights.push({ light: spot, base: 22 })
    prop('tree_palmTall', cx - 3.8, sz - 2.4, { s: 6 })
    prop('tree_palmTall', cx + 3.8, sz - 2.4, { s: 6, rot: 1.3 })
    for (const x of [-2.7, 2.7]) prop('plant_bushLarge', cx + x, sz + 1.8, { s: 2.6 })
    // Someone is always on the mic.
    performer = person('lethabo', cx + 0.5, sz + 0.5, 0, { y: 0.6, every: 5, move: 'emote-yes' })

    // Benches under the trees (north-west, between two paths) and south-west.
    for (const [angle, r] of [[208, 8.3], [222, 8.3], [146, 9.6]]) {
      const a = (angle * Math.PI) / 180
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      const rot = facing(x, z, cx, cz)
      bench(x, z, rot)
      benches.push({ x, z, rot })
      const tx = cx + Math.cos(a) * (r + 2.2)
      const tz = cz + Math.sin(a) * (r + 2.2)
      prop('tree_oak', tx, tz, { s: 4.4, rot: angle })
      prop('flower_yellowA', x + Math.sin(rot) * -0.9 + 0.7, z + Math.cos(rot) * -0.9, { s: 3 })
      block(x, z, 1.3, 1.3)
      block(tx, tz, 1.2, 1.2)
    }

    // Mam' Gugu's stall (south-west).
    const sa = (118 * Math.PI) / 180
    const stx = cx + Math.cos(sa) * 7.4
    const stz = cz + Math.sin(sa) * 7.4
    const stall = new THREE.Group()
    stall.position.set(stx, 0, stz)
    stall.rotation.y = facing(stx, stz, cx, cz)
    group.add(stall)
    box(stall, 2.6, 1, 0.9, 0x9a6a40, 0, 0.5, 0)
    for (const side of [-1, 1]) box(stall, 0.1, 2.4, 0.1, 0x2b2b30, side * 1.25, 1.2, -0.4)
    for (let i = 0; i < 6; i++) box(stall, 0.46, 0.08, 1.5, i % 2 ? 0x1f7a3a : 0xf0c400, -1.15 + i * 0.46, 2.45, 0.05)
    sign(stall, [story.stall_sign], { x: 0, y: 1.95, z: 0.5, w: 2.4, h: 0.45, bg: '#1f7a3a', fg: '#fff6e6', font: 48 })
    const stallMat = mat(0xfff0c0, { emissive: 0xffc870, emissiveIntensity: 0.2 })
    box(stall, 2.2, 0.06, 0.06, stallMat, 0, 2.38, 0.75)
    glows.push({ material: stallMat, base: 2 })
    loadProp('kitchenCoffeeMachine').then((src) => { const m = src.clone(true); m.scale.setScalar(1.8); m.position.set(0.7, 1, -0.1); stall.add(m) }).catch(() => {})
    loadProp('radio').then((src) => { const m = src.clone(true); m.scale.setScalar(2); m.position.set(-0.8, 1, -0.1); stall.add(m) }).catch(() => {})
    const vendorAt = new THREE.Vector3(0, 0, -0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), stall.rotation.y).add(stall.position)
    const vendor = person('mam_gugu', vendorAt.x, vendorAt.z, stall.rotation.y, { every: 7 })
    // The stall queue: two students waiting at the counter. They get served,
    // step aside to eat, then rejoin the back of the line.
    const up = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), stall.rotation.y)
    const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), stall.rotation.y)
    const front = { x: stx + up.x * 2.1, z: stz + up.z * 2.1 }
    const slot = (i) => ({ x: front.x + up.x * i * 1.0, z: front.z + up.z * i * 1.0 })
    const waiting = [
      person('kea', slot(0).x, slot(0).z, stall.rotation.y + Math.PI),
      person('amir', slot(1).x, slot(1).z, stall.rotation.y + Math.PI),
    ]
    const aside = []
    const pause = (t) => new Promise((r) => setTimeout(r, ms(t)))
    queue.stall = {
      front,
      slot,
      aside: { x: front.x + side.x * 3 + up.x * 1.5, z: front.z + side.z * 3 + up.z * 1.5 },
      face: stall.rotation.y + Math.PI,
      vendor,
      get people() { return waiting },
      vendorServes() { gesture(vendor, 'interact-right') },
      async serveFront() {
        const served = waiting.shift()
        if (!served) return
        gesture(vendor, 'interact-right')
        gesture(served, 'pick-up')
        await pause(700)
        const spot = { x: front.x + side.x * (3 + aside.length * 1.2) + up.x * 1.5, z: front.z + side.z * (3 + aside.length * 1.2) + up.z * 1.5 }
        aside.push(served)
        moveAvatar(served, spot.x, spot.z).then(() => gesture(served, 'emote-yes'))
        await Promise.all(waiting.map((p, i) => moveAvatar(p, slot(i).x, slot(i).z, 1.6)))
        waiting.forEach((p) => { p.rotation.y = stall.rotation.y + Math.PI })
      },
      rejoin() {
        setTimeout(() => {
          while (aside.length) {
            const p = aside.shift()
            waiting.push(p)
            const s = slot(waiting.length - 1)
            moveAvatar(p, s.x, ms(s.z)).then(() => { p.rotation.y = stall.rotation.y + Math.PI })
          }
          queue.stall.busy = false
        }, ms(6000))
      },
    }
    const sl = new THREE.PointLight(0xffcf8a, 0, 7, 1.6)
    sl.position.set(stx, 2.2, stz)
    group.add(sl)
    lights.push({ light: sl, base: 12 })
    block(stx, stz, 2.8, 2.2)

    // The one from the bus stop, with friends, by the second bench (both are built; scene.js shows yours).
    {
      const b = benches[1]
      const out = { x: Math.sin(b.rot), z: Math.cos(b.rot) }
      const side = { x: Math.cos(b.rot), z: -Math.sin(b.rot) }
      const at = (f, s) => [b.x + out.x * f + side.x * s, b.z + out.z * f + side.z * s]
      for (const id of ['amahle', 'kabelo']) {
        const [x, z] = at(1.5, 0)
        const crush = person(id, x, z, b.rot + Math.PI, { every: 7, move: 'emote-yes' })
        crush.userData.crush = true
      }
      const [fx, fz] = at(1.6, 1.0)
      person('x12', fx, fz, b.rot + Math.PI * 0.75, { every: 6 })
      const [gx, gz] = at(1.1, -1.0)
      person('x13', gx, gz, b.rot - Math.PI * 0.8, { every: 8, move: 'emote-yes' })
    }

    // SRC campaign tables (south-east): three equal tables, one per slate.
    STORY.src_slates.forEach((slate, i) => {
      const a = ((14 + i * 26) * Math.PI) / 180
      const x = cx + Math.cos(a) * 7.8
      const z = cz + Math.sin(a) * 7.8
      const t = new THREE.Group()
      t.position.set(x, 0, z)
      t.rotation.y = facing(x, z, cx, cz)
      group.add(t)
      loadProp('table').then((src) => { const m = src.clone(true); m.scale.setScalar(2.4); m.position.set(0, 0, -0.1); t.add(m) }).catch(() => {})
      for (const side of [-1, 1]) box(t, 0.08, 2.3, 0.08, 0xdddddd, side * 1.1, 1.15, -0.8)
      const [c1, c2, c3] = slate.colors
      box(t, 2.4, 0.08, 1.8, c1, 0, 2.3, -0.1)
      box(t, 2.4, 0.3, 0.05, c2, 0, 2.15, 0.8)
      sign(t, [slate.name], { x: 0, y: 1.55, z: -0.83, w: 2.1, h: 0.55, bg: c1, fg: c2 === '#ffffff' ? '#ffffff' : c2, font: 52 })
      // Campaigners stand beside their table, out from under the roof, so you see them from above.
      const back = new THREE.Vector3(1.6, 0, 0.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.rotation.y).add(t.position)
      void c3
      const campaigner = person(['bongani', 'lindiwe', 'ruan'][i], back.x, back.z, t.rotation.y, { every: 6 + i, move: i === 1 ? 'interact-left' : 'interact-right' })
      const frontAt = new THREE.Vector3(0, 0, 1.7).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.rotation.y).add(t.position)
      srcTables.push({ x, z, front: { x: frontAt.x, z: frontAt.z }, campaigner, slate })
      block(x, z, 2.4, 2)
    })

    // Notice board with posters (north-east).
    const na = (-32 * Math.PI) / 180
    const nx = cx + Math.cos(na) * 8.6
    const nz = cz + Math.sin(na) * 8.6
    const nrot = facing(nx, nz, cx, cz)
    for (const side of [-1, 1]) box(group, 0.1, 2.2, 0.1, 0x4a3426, nx + Math.cos(nrot) * side * 1.1, 1.1, nz - Math.sin(nrot) * side * 1.1)
    sign(group, story.posters, { x: nx, y: 1.55, z: nz, rot: nrot, w: 2.4, h: 1.3, bg: '#c9a66b', fg: '#22143b', font: 34, align: 'left' })
    block(nx, nz, 2.4, 0.6)

    // Lamp posts and string lights across the plaza.
    const lampAt = (deg, r = 10.6) => [cx + Math.cos((deg * Math.PI) / 180) * r, cz + Math.sin((deg * Math.PI) / 180) * r]
    const lamps = [lampAt(66), lampAt(134), lampAt(-62), lampAt(-152)]
    lamps.forEach(([x, z]) => lamp(x, z))
    stringLights(new THREE.Vector3(cx - 2.4, 3.55, sz - 1.3), new THREE.Vector3(lamps[1][0], 3.3, lamps[1][1]), 18, 0.9)
    stringLights(new THREE.Vector3(cx + 2.4, 3.55, sz - 1.3), new THREE.Vector3(lamps[0][0], 3.3, lamps[0][1]), 18, 0.9)
    for (const deg of [30, 100, 170, 250, -20]) {
      const [x, z] = lampAt(deg, 11.6)
      prop(deg % 2 ? 'plant_bush' : 'flower_redA', x, z, { s: 3 })
    }
  }

  function dressCafeteria(b) {
    const story = STORY.cafeteria
    const cx = b.cx
    const cz = b.cz
    spotList('cafeteria', cx, cz)
    const front = b.maxZ + 0.03
    // Serving window with a counter and a striped awning, right of the door.
    const glass = box(group, 3, 1.2, 0.08, mat(0x1d2a33, { emissive: 0xffc870, emissiveIntensity: 0.2 }), cx + 2.8, 1.9, front)
    glows.push({ material: glass.material, base: 1.2 })
    box(group, 3.2, 0.12, 0.55, 0xb0b0b0, cx + 2.8, 1.25, front + 0.27)
    for (let i = 0; i < 7; i++) {
      const awning = box(group, 0.48, 0.06, 1.2, i % 2 ? 0xffffff : 0xe07a3d, cx + 1.36 + i * 0.48, 2.85, front + 0.5)
      awning.rotation.x = 0.28
    }
    sign(group, story.menu, { x: cx - 2.7, y: 2.1, z: front + 0.02, w: 2.4, h: 1.7, bg: '#1d2a22', fg: '#fff6e6', font: 40, align: 'left' })
    sign(group, [story.notice], { x: cx + 2.8, y: 0.85, z: front + 0.56, w: 2.6, h: 0.32, bg: '#f0c400', fg: '#22143b', font: 40 })
    sign(group, [story.sign], { x: cx, y: b.h - 0.6, z: front + 0.02, w: 4.6, h: 0.8, bg: '#c45c22', fg: '#fff6e6' })
    const winLight = new THREE.PointLight(0xffd29a, 0, 8, 1.6)
    winLight.position.set(cx + 2.8, 2.2, front + 1.4)
    group.add(winLight)
    lights.push({ light: winLight, base: 14 })
    // The queue at the window.
    // Serving counter under the awning; Auntie Pinky behind it, the queue in front.
    box(group, 3.2, 1.05, 0.6, 0xc9c9c9, cx + 2.8, 0.52, front + 1.15)
    box(group, 3.3, 0.06, 0.7, 0x8a8a8a, cx + 2.8, 1.07, front + 1.15)
    const auntie = person('auntie_pinky', cx + 2.8, front + 0.5, 0, { every: 5 })
    cafQueue.auntie = auntie
    cafQueue.front = { x: cx + 2.8, z: front + 2.05 }
    // One straight line facing the counter, evenly spaced.
    cafQueue.slot = (i) => ({ x: cx + 2.8, z: front + 2.05 + i * 0.95 })
    cafQueue.aside = { x: cx + 2.8 - 3.2, z: front + 4.2 }
    cafQueue.face = Math.PI
    // Serve the front person (they step aside to eat), the line moves up; rejoin later.
    const cafAside = []
    cafQueue.serveFront = async () => {
      const line = cafQueue.people
      const served = line.shift()
      if (!served) return
      gesture(auntie, 'interact-right')
      gesture(served, 'pick-up')
      await new Promise((r) => setTimeout(r, ms(700)))
      cafAside.push(served)
      moveAvatar(served, cafQueue.aside.x - cafAside.length * 0.9, cafQueue.aside.z, 1.4).then(() => gesture(served, 'emote-yes'))
      await Promise.all(line.map((p, i) => moveAvatar(p, cafQueue.slot(i).x, cafQueue.slot(i).z, 1.6)))
      line.forEach((p) => { p.rotation.y = cafQueue.face })
    }
    cafQueue.rejoin = () => {
      setTimeout(() => {
        while (cafAside.length) {
          const p = cafAside.shift()
          cafQueue.people.push(p)
          const s = cafQueue.slot(cafQueue.people.length - 1)
          moveAvatar(p, s.x, s.z).then(() => { p.rotation.y = cafQueue.face })
        }
        cafQueue.busy = false
      }, ms(5000))
    }
    cafQueue.people = ['thandi', 'jordan', 'priya', 'noah'].map((id, i) => {
      const s = cafQueue.slot(i)
      return person(id, s.x, s.z, Math.PI, { every: 9 + i * 2, move: i === 0 ? 'interact-right' : 'emote-yes' })
    })
    block(cx + 2.8, front + 1.15, 3.2, 0.6)
    // Terrace on the west side: deck, tables, chairs, two people eating, lights.
    const tx = b.minX - 3
    box(group, 4.4, 0.08, 6.4, 0x9a7048, tx, 0.04, cz)
    for (const [dz, who] of [[-1.6, 'naledi'], [1.7, 'luke']]) {
      prop('table', tx, cz + dz, { s: 2.3, rot: Math.PI / 2, y: 0.08 })
      for (const [cx2, r] of [[tx - 0.95, Math.PI / 2], [tx + 0.95, -Math.PI / 2]]) {
        const c = makeChair()
        c.position.set(cx2, 0.08, cz + dz)
        c.rotation.y = r
        group.add(c)
      }
      const sitter = person(who, tx - 0.95, cz + dz, Math.PI / 2, { pose: 'sit', y: 0.08 + CHAIR_SEAT })
      // The chair opposite is free: sit there to eat (the table top is about 0.78 m up).
      // other: the sitter's chair, for a friend eating with you.
      freeTables.push({ seat: { x: tx + 0.95, z: cz + dz, rot: -Math.PI / 2, y: 0.08 + CHAIR_SEAT }, table: { x: tx + 0.25, y: 0.08 + 0.8, z: cz + dz }, sitter, other: { x: tx - 0.95, z: cz + dz, rot: Math.PI / 2, y: 0.08 + CHAIR_SEAT } })
      block(tx, cz + dz, 2.6, 1.4)
    }
    prop('pottedPlant', tx - 1.9, cz - 3, { s: 2.4 })
    prop('pottedPlant', tx + 1.9, cz + 3, { s: 2.4 })
    prop('trashcan', b.minX - 0.5, front + 0.6, { s: 1.1 })
    for (const [x, z] of [[tx - 2, cz - 3.1], [tx + 2, cz + 3.1]]) box(group, 0.1, 3.2, 0.1, 0x2b2b30, x, 1.6, z)
    stringLights(new THREE.Vector3(tx - 2, 3.1, cz - 3.1), new THREE.Vector3(tx + 2, 3.1, cz + 3.1), 16, 0.6)
    lamp(cx - 3.8, front + 3.4)
  }

  // n: 0 day, 1 night.
  let lit = null
  function applyNight(n) {
    const on = n > 0.05
    if (on !== lit) {
      lit = on
      for (const { light } of lights) light.visible = on
    }
    for (const { light, base } of lights) light.intensity = base * n
    for (const { material, base } of glows) material.emissiveIntensity = 0.15 + base * n
  }

  // Queues keep moving on their own: the front person is served and steps out to
  // eat, the line shuffles up, and later they rejoin at the back. Paused while
  // the player is in that queue (busy).
  let queueClock = 0
  async function cycleQueue(q, line, server) {
    if (!q || q.busy || q.cycling || line.length < 2) return
    q.cycling = true
    const served = line.shift()
    gesture(server, 'interact-right')
    gesture(served, 'pick-up')
    await new Promise((r) => setTimeout(r, ms(900)))
    await Promise.all([moveAvatar(served, q.aside.x, q.aside.z, 1.4), ...line.map((p, i) => moveAvatar(p, q.slot(i).x, q.slot(i).z, 1.2))])
    line.forEach((p) => { p.rotation.y = q.face })
    gesture(served, 'emote-yes')
    await new Promise((r) => setTimeout(r, ms(4000)))
    if (!q.busy) {
      const s = q.slot(line.length)
      await moveAvatar(served, s.x, s.z, 1.4)
      served.rotation.y = q.face
      line.push(served)
    } else line.push(served)
    q.cycling = false
  }

  function update(dt) {
    queueClock += dt
    if (queueClock > 6) {
      queueClock = 0
      cycleQueue(cafQueue.people ? cafQueue : null, cafQueue.people || [], cafQueue.auntie)
      if (queue.stall) cycleQueue(queue.stall, queue.stall.people, queue.stall.vendor)
    }
    const moving = new Set()
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i]
      const a = m.avatar.position
      const dx = m.x - a.x
      const dz = m.z - a.z
      const d = Math.hypot(dx, dz)
      const step = m.speed * dt
      if (d <= step) { a.x = m.x; a.z = m.z; movers.splice(i, 1); m.resolve(); continue }
      a.x += (dx / d) * step
      a.z += (dz / d) * step
      m.avatar.rotation.y = Math.atan2(dx, dz)
      moving.add(m.avatar)
    }
    for (const p of people) {
      if (p.avatar.userData.following) continue // walking with the player (scene.js)
      p.clock += dt
      if (p.every) {
        p.next -= dt
        if (p.next <= 0) { gesture(p.avatar, p.move); p.next = p.every + Math.random() * 3 }
      }
      poseAvatar(p.avatar, moving.has(p.avatar), p.clock)
    }
  }

  queue.caf = cafQueue
  return { group, obstacles, spots, benches, queue, srcTables, freeTables, get performer() { return performer }, statics: people.map((p) => p.avatar), applyNight, update }
}
