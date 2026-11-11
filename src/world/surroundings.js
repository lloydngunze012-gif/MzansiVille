// What is around the campus, so it never floats in blue: a big ground plane, a ring
// road, a palisade fence with a gap at the main gate, a parking lot, a taxi rank
// with minibus taxis, and SunnyBay past the ring road (the city of src/world/citybuild.js, seen from afar).
// Cars and town buildings are Kenney Car Kit and City Kits (CC0).
import * as THREE from 'three'
import { signMesh } from './text.js'
import { loadModel } from './models.js'
import { buildCity } from './citybuild.js'

const FENCE_R = 103
const ROAD_IN = 106
const ROAD_OUT = 113
const GATE = { x: 0, z: 88 }

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function textPlane(text, { w = 2, h = 0.5, bg = '#22143b', fg = '#fff6e6', font = 56 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = Math.round((512 * h) / w)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = fg
  ctx.font = `bold ${Math.min(font, canvas.height * 0.62)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, canvas.height / 2 + 2, 490)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return signMesh(new THREE.PlaneGeometry(w, h), texture)
}

export function addSurroundings(parent) {
  const group = new THREE.Group()
  group.name = 'surroundings'
  parent.add(group)
  const glows = []
  const rand = mulberry32(0x5a7a)
  const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra })

  // Ground to the horizon, darker verge outside the fence.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(460, 48), mat(0x5f9446))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.6 // (under SunnyBay's own ground, below)
  ground.receiveShadow = true
  group.add(ground)

  // Ring road with lane dashes.
  const road = new THREE.Mesh(new THREE.RingGeometry(ROAD_IN, ROAD_OUT, 96), mat(0x3b3c40))
  road.rotation.x = -Math.PI / 2
  road.position.y = -0.03
  road.receiveShadow = true
  group.add(road)
  const dashCount = 110
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.02, 0.18), mat(0xf4f1e6), dashCount)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < dashCount; i++) {
    const a = (i / dashCount) * Math.PI * 2
    const r = (ROAD_IN + ROAD_OUT) / 2
    dummy.position.set(Math.cos(a) * r, -0.01, Math.sin(a) * r)
    dummy.rotation.set(0, -a + Math.PI / 2, 0)
    dummy.updateMatrix()
    dashes.setMatrixAt(i, dummy.matrix)
  }
  group.add(dashes)
  // Road from the main gate out to the ring road.
  const gateRoad = new THREE.Mesh(new THREE.BoxGeometry(8, 0.04, ROAD_IN - GATE.z), mat(0x3b3c40))
  gateRoad.position.set(GATE.x, 0, (GATE.z + ROAD_IN) / 2 + 1) // (top 0.02: 2 cm above the lawn, 2 below the paths)
  gateRoad.material.polygonOffset = true
  gateRoad.material.polygonOffsetFactor = gateRoad.material.polygonOffsetUnits = -2
  group.add(gateRoad)

  // Palisade fence: posts, two rails and bars, with a gap where the gate road passes.
  const posts = []
  const bars = []
  const rails = []
  const step = 2.5
  const count = Math.floor((Math.PI * 2 * FENCE_R) / step)
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2
    const a1 = ((i + 1) / count) * Math.PI * 2
    const p0 = [Math.cos(a0) * FENCE_R, Math.sin(a0) * FENCE_R]
    const p1 = [Math.cos(a1) * FENCE_R, Math.sin(a1) * FENCE_R]
    const gap = (p) => Math.abs(p[0] - GATE.x) < 5 && p[1] > 0
    if (gap(p0) || gap(p1)) continue
    posts.push(p0)
    rails.push([p0, p1])
    for (let k = 1; k < 5; k++) bars.push([p0[0] + ((p1[0] - p0[0]) * k) / 5, p0[1] + ((p1[1] - p0[1]) * k) / 5])
  }
  const steel = mat(0x2f3338, { roughness: 0.6, metalness: 0.4 })
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), steel, posts.length)
  posts.forEach(([x, z], i) => { dummy.position.set(x, 1.2, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); postMesh.setMatrixAt(i, dummy.matrix) })
  const barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 2.2, 0.05), steel, bars.length)
  bars.forEach(([x, z], i) => { dummy.position.set(x, 1.1, z); dummy.updateMatrix(); barMesh.setMatrixAt(i, dummy.matrix) })
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.06), steel, rails.length * 2)
  rails.forEach(([p0, p1], i) => {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    for (const [k, y] of [[0, 0.4], [1, 2.1]]) {
      dummy.position.set((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2)
      dummy.rotation.set(0, -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), 0)
      dummy.scale.set(len, 1, 1)
      dummy.updateMatrix()
      railMesh.setMatrixAt(i * 2 + k, dummy.matrix)
    }
  })
  dummy.scale.set(1, 1, 1)
  group.add(postMesh, barMesh, railMesh)

  // Street lamps along the ring road (glowing heads, no extra lights to keep phones fast).
  const lampHead = mat(0x3a3020, { emissive: 0xffd28a, emissiveIntensity: 0 })
  glows.push(lampHead)
  const lampCount = 28
  const poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 5, 0.14), steel, lampCount)
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.2, 0.4), lampHead, lampCount)
  for (let i = 0; i < lampCount; i++) {
    const a = (i / lampCount) * Math.PI * 2 + 0.05
    const r = ROAD_OUT + 0.8
    dummy.position.set(Math.cos(a) * r, 2.5, Math.sin(a) * r)
    dummy.rotation.set(0, -a, 0)
    dummy.updateMatrix()
    poles.setMatrixAt(i, dummy.matrix)
    dummy.position.set(Math.cos(a) * (r - 0.5), 5, Math.sin(a) * (r - 0.5))
    dummy.updateMatrix()
    heads.setMatrixAt(i, dummy.matrix)
  }
  group.add(poles, heads)

  function place(url, x, z, { rot = 0, s = 1, tint } = {}) {
    const holder = new THREE.Group()
    holder.position.set(x, 0, z)
    holder.rotation.y = rot
    group.add(holder)
    loadModel(url).then((src) => {
      const model = src.clone(true)
      model.scale.setScalar(s)
      if (tint) model.traverse((n) => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.multiply(new THREE.Color(tint)) } })
      holder.add(model)
    }).catch(() => {})
    return holder
  }

  // Parking lot inside the fence, west of the gate.
  const lot = { x: -24, z: 93, w: 22, d: 8 }
  const tarmac = new THREE.Mesh(new THREE.BoxGeometry(lot.w, 0.04, lot.d), mat(0x45474c))
  tarmac.position.set(lot.x, 0, lot.z)
  tarmac.material.polygonOffset = true
  tarmac.material.polygonOffsetFactor = tarmac.material.polygonOffsetUnits = -2
  tarmac.receiveShadow = true
  group.add(tarmac)
  for (let i = 0; i <= 7; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 3.6), mat(0xf4f1e6))
    line.position.set(lot.x - lot.w / 2 + 1 + i * 2.85, 0.04, lot.z - 1.8)
    group.add(line)
  }
  const parked = ['sedan', 'suv', 'hatchback-sports', 'sedan', 'truck']
  const tints = [0xffffff, 0x9fb4d0, 0xf2b0a0, 0xd8d8d8, 0xffffff]
  parked.forEach((name, i) => {
    if (i === 3) return // an empty bay
    place(`/models/cars/${name}.glb`, lot.x - lot.w / 2 + 2.425 + i * 2.85, lot.z - 1.9, { s: 1.6, tint: tints[i] })
  })
  const lotSign = textPlane('STUDENT PARKING', { w: 3.2, h: 0.55, bg: '#2c6a9a' })
  lotSign.position.set(lot.x, 2.2, lot.z + lot.d / 2 + 0.2)
  group.add(lotSign)
  const lotPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), steel)
  lotPost.position.set(lot.x, 1.1, lot.z + lot.d / 2 + 0.25)
  group.add(lotPost)

  // The Campus gate taxi stop outside the gate, beside the road into town (SunnyBay's stop "gate",
  // data/campusville/sunnybay.json): a shelter, minibus taxis with slogan stickers, a sign.
  const rank = { x: -19, z: 118 }
  const pave = new THREE.Mesh(new THREE.BoxGeometry(22, 0.05, 10), mat(0x8c8a84))
  pave.position.set(rank.x, -0.005, rank.z)
  pave.material.polygonOffset = true
  pave.material.polygonOffsetFactor = pave.material.polygonOffsetUnits = -2
  group.add(pave)
  const roofMat = mat(0xc62828)
  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 2.6), roofMat)
  shelterRoof.position.set(rank.x, 3, rank.z + 4)
  shelterRoof.castShadow = true
  group.add(shelterRoof)
  for (const x of [-6.5, -2, 2, 6.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 0.16), steel)
    post.position.set(rank.x + x, 1.5, rank.z + 4.9)
    group.add(post)
  }
  const rankSign = textPlane('TAXI · TOWN · BEACHFRONT · SUBURBS', { w: 9, h: 0.7, bg: '#f0c400', fg: '#22143b' })
  rankSign.position.set(rank.x, 3.55, rank.z + 2.7)
  group.add(rankSign)
  const slogans = ['MAMA’S PRAYER', 'EISH EXPRESS', 'SHARP SHARP']
  slogans.forEach((text, i) => {
    const x = rank.x - 6 + i * 5.3
    // Nose to the shelter, so the back window sticker faces campus.
    place('/models/cars/van.glb', x, rank.z - 0.5, { s: 1.75 })
    const sticker = textPlane(text, { w: 2, h: 0.32, bg: '#ffffff', fg: '#c62828', font: 44 })
    sticker.position.set(x, 1.75, rank.z - 0.5 - 2.45)
    sticker.rotation.y = Math.PI
    group.add(sticker)
  })

  // Past the ring road: SunnyBay (City job A). The same city the city scene shows (src/world/citybuild.js, far: houses
  // as plain blocks, no cars, signs or lamps), so what you see through the fence is where the gate leads. It replaces
  // the old ring of houses and shops that stood for "the edge of town".
  let shell = null
  let night = 0
  buildCity({ far: true }).then((city) => {
    shell = city
    city.group.position.y = -0.07 // (its ground under the campus's own ring road and gate road)
    city.group.name = 'far-city'
    group.add(city.group)
    city.applyNight(night)
  }).catch((error) => console.warn('sunnybay: the far view did not build', error))

  return {
    applyNight(n) { night = n; for (const material of glows) material.emissiveIntensity = n * 2.2; shell?.applyNight(n) },
  }
}
