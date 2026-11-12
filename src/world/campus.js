import { createFloor } from './floor.js'
import { collidersOf } from './colliders.js'
import * as THREE from 'three'
import { buildingLayout } from './layout.js'
import { buildGrid } from './nav.js'
import { dressPlaces } from './dress.js'
import { applyBuildingNight, buildSpecial, dressGrocer, setWindowBuilder, upgradeBuilding } from './buildings.js'
import { addSurroundings } from './surroundings.js'
import { signMesh } from './text.js'
import { loadGlb, modelManifest, modelUrl } from './models.js'

const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xe4d2b0, roughness: 1 })
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x74b254, roughness: 1 })
// Windows: most glow warm at night, a few stay dark (applyNight sets the glow).
const litWindow = new THREE.MeshStandardMaterial({ color: 0x2a3442, emissive: 0xffc870, emissiveIntensity: 0.05, roughness: 0.4 })
const darkWindow = new THREE.MeshStandardMaterial({ color: 0x26303c, roughness: 0.4 })
const windowGeo = new THREE.BoxGeometry(0.7, 0.8, 0.06)
setWindowBuilder((group, building, out) => addWindows(group, building, out))

function addWindows(group, building, out = 0.03) {
  const floors = Math.max(1, Math.floor((building.h - 0.6) / 2.2))
  const across = Math.max(1, Math.floor((building.w - 1.4) / 1.6))
  const spots = []
  for (const side of [1, -1]) {
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < across; i++) {
        const x = -((across - 1) * 1.6) / 2 + i * 1.6
        if (side === 1 && f === 0 && Math.abs(x) < 1.2) continue // the door
        spots.push([x, 1.6 + f * 2.2, side * (building.d / 2 + out)])
      }
    }
  }
  const lit = spots.filter((_, i) => (i * 7 + building.w) % 10 >= 3)
  const dark = spots.filter((_, i) => (i * 7 + building.w) % 10 < 3)
  const dummy = new THREE.Object3D()
  for (const [list, material] of [[lit, litWindow], [dark, darkWindow]]) {
    if (!list.length) continue
    const mesh = new THREE.InstancedMesh(windowGeo, material, list.length)
    list.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix) })
    group.add(mesh)
  }
}

function shortName(name) {
  const cleaned = name.replace(' Lecture Venue', '').replace(/^The /, '').replace(/^Main /, '').replace(' (bus home)', '')
  return cleaned.length > 16 ? `${cleaned.slice(0, 15)}…` : cleaned
}

function badgeSprite() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f0c400'
  ctx.beginPath()
  ctx.arc(32, 32, 28, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c1915'
  ctx.font = '700 42px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('!', 32, 36)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }))
  sprite.scale.set(1.35, 1.35, 1)
  sprite.raycast = () => {}
  return sprite
}

function labelSprite(text, home) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  // The map's plum pill (gold for your own house).
  ctx.fillStyle = home ? 'rgba(240,196,0,0.95)' : 'rgba(47,26,92,0.92)'
  ctx.beginPath()
  ctx.roundRect(4, 6, 312, 60, 30)
  ctx.fill()
  ctx.strokeStyle = home ? 'rgba(28,25,21,0.35)' : 'rgba(240,196,0,0.6)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = home ? '#1c1915' : '#ffffff'
  ctx.font = '700 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 160, 38)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // Depth-tested: a building in front hides the name (it never shows through walls).
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }))
  sprite.scale.set(4.6, 1.04, 1)
  sprite.raycast = () => {}
  sprite.name = 'label'
  return sprite
}

const labelAt = new THREE.Vector3()
const labelEdge = new THREE.Vector3()
const camRight = new THREE.Vector3()
const playerAt = new THREE.Vector3()

// Name tags: only for buildings near the player or the destination, and never one
// that would run off the screen edge (a close tag gets wide). Fade the rest out.
const LABEL_NEAR = 26
export function fitLabels(buildings, camera, dt, focus = null) {
  camRight.setFromMatrixColumn(camera.matrixWorld, 0)
  if (focus) playerAt.set(focus.x, 1.2, focus.z).project(camera)
  for (const group of buildings.children) {
    const near = !focus || group.userData.placeId === focus.dest || Math.hypot(group.position.x - focus.x, group.position.z - focus.z) < LABEL_NEAR
    for (const label of group.children) {
      if (label.name !== 'label') continue
      label.getWorldPosition(labelAt)
      labelEdge.copy(labelAt).addScaledVector(camRight, label.scale.x / 2)
      labelAt.project(camera)
      labelEdge.project(camera)
      const half = Math.abs(labelEdge.x - labelAt.x)
      // Close to the player (on screen, over or beside them, or within 6 m): the name fades out.
      const aspect = camera.aspect || 0.5
      const onPlayer = focus && playerAt.z < 1 && Math.abs(playerAt.x - labelAt.x) < half + 0.12 && Math.abs(playerAt.y - labelAt.y) < 0.3 + (half * 0.23) / aspect
      const closeBy = focus && Math.hypot(label.getWorldPosition(labelEdge).x - focus.x, labelEdge.z - focus.z) < 6
      const fits = near && !onPlayer && !closeBy && labelAt.z < 1 && labelAt.x - half > -0.98 && labelAt.x + half < 0.98 && half < 0.6
      const material = label.material
      material.opacity += ((fits ? 1 : 0) - material.opacity) * Math.min(1, dt * 10)
      label.visible = material.opacity > 0.02
    }
  }
}

function ribbon(a, b, floor) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < 0.2) return null
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 3.8), pathMaterial)
  mesh.position.set((a.x + b.x) / 2, 0.01, (a.z + b.z) / 2) // (top at 0.04: the ground layers keep 2 cm between them: lawn 0, gate road and tarmac .02, paths .04, plaza .06, its ring .085)
  mesh.rotation.y = Math.atan2(-dz, dx)
  mesh.receiveShadow = true
  floor.box(mesh.position.x, mesh.position.z, len / 2, 1.9, mesh.rotation.y, 0.04)
  return mesh
}

function buildingMesh(building, home) {
  const group = new THREE.Group()
  group.position.set(building.x, 0, building.z)
  group.rotation.y = building.facing || 0 // its front (door, sign, banners) faces into campus
  group.userData.placeId = building.id
  // An open place (the Quad) is dressed in dress.js; it has no walls, roof or door here.
  // The sports hall, bus station and gate are built by hand in buildings.js.
  const special = buildSpecial(group, building)
  if (!building.open && !special) {
    const wall = new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.86 })
    const roofMat = new THREE.MeshStandardMaterial({ color: building.roof, roughness: 0.8 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(building.w, building.h, building.d), wall)
    body.position.y = building.h / 2
    body.castShadow = true
    body.receiveShadow = true
    body.name = 'body'
    group.add(body)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(building.w + 0.5, 0.5, building.d + 0.5), roofMat)
    roof.position.y = building.h + 0.22
    roof.castShadow = true
    roof.name = 'roof'
    group.add(roof)
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.15, 0.16),
      new THREE.MeshStandardMaterial({ color: building.house ? building.house.main : home ? 0xf0c400 : 0x3a2a22, roughness: 0.7, ...(building.house ? { emissive: building.house.main, emissiveIntensity: 0.18 } : {}) }),
    )
    // The door swings on a hinge as you arrive (scene.js opens it).
    const hinge = new THREE.Group()
    hinge.position.set(-0.62, 0, building.d / 2 + 0.1)
    hinge.name = 'door-pivot'
    door.position.set(0.62, 1.08, 0)
    door.name = 'door'
    hinge.add(door)
    group.add(hinge)
    if (!upgradeBuilding(group, building)) addWindows(group, building)
    if (building.id === 'greenway') dressGrocer(group, building)
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf0c400, emissive: 0xf0c400, emissiveIntensity: 0.9, roughness: 0.4 }),
  )
  // (the Quad's stage step has a student sitting on it, middle front: the glowing ball
  // goes to the side of the stage, clear of heads)
  beacon.position.set(building.id === 'quad' ? building.w / 2 + 0.9 : 0, 1.35, building.d / 2 + 0.55)
  beacon.name = 'beacon'
  beacon.visible = false
  group.add(beacon)
  const badge = badgeSprite()
  badge.position.set(building.w * 0.28, building.h + 1.15, -building.d * 0.28)
  badge.name = 'badge'
  badge.visible = false
  group.add(badge)
  const label = labelSprite(shortName(building.name), home)
  const LABEL_Y = { sports_centre: 8, gate: 7, greenway: 6 }
  label.position.y = building.open ? 4.8 : LABEL_Y[building.id] || Math.min(building.h + 1.3, 5.6)
  group.add(label)
  return group
}

function distToSegment(x, z, a, b) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz || 1
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
}

function addTrees(parent, layout) {
  const rand = mulberry32(0xc0ffee)
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 0.7, 5)
  const crownGeo = new THREE.ConeGeometry(1.05, 2.1, 6)
  const spots = []
  for (let i = 0; i < 80 && spots.length < 32; i += 1) {
    const x = (rand() - 0.5) * 180
    const z = (rand() - 0.5) * 180
    const blocked = layout.buildings.some((building) => (
      x > building.minX - 2.2 && x < building.maxX + 2.2 && z > building.minZ - 2.2 && z < building.maxZ + 2.2
    )) || (layout.plazas || []).some((p) => Math.hypot(x - p.x, z - p.z) < p.r)
    const onPath = layout.paths.some((path) => path.some((point, index) => (
      index && distToSegment(x, z, path[index - 1], point) < 3.4
    )))
    if (blocked || onPath) continue
    spots.push({ x, z })
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 }), spots.length)
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.85 }), spots.length)
  trunks.castShadow = true
  crowns.castShadow = true
  const dummy = new THREE.Object3D()
  spots.forEach((spot, index) => {
    dummy.position.set(spot.x, 0.35, spot.z)
    dummy.scale.setScalar(0.85 + rand() * 0.5)
    dummy.updateMatrix()
    trunks.setMatrixAt(index, dummy.matrix)
    dummy.position.y = 1.7
    dummy.updateMatrix()
    crowns.setMatrixAt(index, dummy.matrix)
  })
  parent.add(trunks, crowns)
}

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

// Job I (owner: the gate said "nothing to do", and nothing on campus said SunnyBay was out there): yellow
// fingerposts on the way to the Main Gate, by the Quad and just inside the gate. Each stands clear of every building.
function addSignposts(group, layout) {
  const gate = layout.buildings.find((b) => b.id === 'gate')
  if (!gate) return
  const gx = gate.minX + gate.w / 2
  const clear = (x, z) => !layout.buildings.some((b) => x > b.minX - 1.2 && x < b.minX + b.w + 1.2 && z > b.minZ - 1.2 && z < b.minZ + b.d + 1.2)
  const spots = [[gx + 4, gate.minZ - 5], [4.5, 16]]
  for (const [x0, z] of spots) {
    let x = x0
    for (let k = 0; k < 12 && !clear(x, z); k++) x += k % 2 ? -2 * k : 2 * k
    if (!clear(x, z)) continue
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const g = canvas.getContext('2d')
    g.fillStyle = '#f0c400'; g.fillRect(0, 0, 512, 160)
    g.fillStyle = '#1c1915'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = 'bold 60px sans-serif'; g.fillText('SUNNYBAY  \u2193', 256, 58, 490)
    g.font = 'bold 34px sans-serif'; g.fillText('Main Gate \u00b7 taxis \u00b7 5 min', 256, 122, 490)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const sign = signMesh(new THREE.PlaneGeometry(2.4, 0.75), tex)
    sign.position.set(x, 2.35, z)
    sign.name = 'signpost-sunnybay'
    group.add(sign)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.6 }))
    post.position.set(x, 1.0, z)
    group.add(post)
  }
}

export function createCampus(district, homeId) {
  const layout = buildingLayout(district)
  const group = new THREE.Group()
  group.name = 'campus'

  const surroundings = addSurroundings(group)
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(102, 48), grassMaterial)
  lawn.rotation.x = -Math.PI / 2
  lawn.receiveShadow = true
  lawn.name = 'ground'
  group.add(lawn)

  // What people stand on: paths, the Quad plaza, the terrace deck (floor.js).
  const floor = createFloor()
  for (const path of layout.paths) {
    for (let i = 1; i < path.length; i += 1) {
      const piece = ribbon(path[i - 1], path[i], floor)
      if (piece) group.add(piece)
    }
  }

  const buildings = new THREE.Group()
  buildings.name = 'buildings'
  for (const building of layout.buildings) {
    buildings.add(buildingMesh(building, building.id === homeId))
  }
  group.add(buildings)
  const dressing = dressPlaces(layout, floor)
  group.add(dressing.group)
  addSignposts(group, layout)
  addTrees(group, { ...layout, buildings: layout.buildings.concat(dressing.obstacles.map((o) => ({ ...o }))), plazas: [{ x: 0, z: 0, r: 13 }] })

  const grid = buildGrid(layout.obstacles.concat(dressing.obstacles))
  upgrade(buildings, layout.buildings)
  const result = { group, ground: lawn, buildings, grid, layout, dressing, surroundings, floor, colliders: collidersOf(dressing.group) }
  // (and again once every prop model has loaded: benches' neighbours, bins, plants, speakers)
  dressing.ready().then(() => { result.colliders = collidersOf(dressing.group) })
  return result
}

// n: 0 day, 1 night. Windows across campus plus the dressed places' lights.
export function applyNight(campus, n) {
  litWindow.emissiveIntensity = 0.05 + n * 1.5
  campus.dressing?.applyNight(n)
  campus.surroundings?.applyNight(n)
  applyBuildingNight(n)
}

export function markDoors(buildings, ids) {
  for (const group of buildings.children) {
    const on = ids.has(group.userData.placeId)
    const beacon = group.getObjectByName('beacon')
    const badge = group.getObjectByName('badge')
    if (beacon) beacon.visible = on
    // The glowing marker at the door says "something to do here"; the floating "!"
    // said the same thing without explaining itself, so it stays hidden.
    if (badge) badge.visible = false
  }
}

async function upgrade(buildings, specs) {
  const manifest = await modelManifest()
  for (const spec of specs) {
    const url = modelUrl(manifest, spec)
    if (!url) continue
    const model = await loadGlb(url)
    if (!model) continue
    const host = buildings.children.find((child) => child.userData.placeId === spec.id)
    if (!host) continue
    host.clear()
    model.position.y = 0
    host.add(model)
    const label = labelSprite(shortName(spec.name), false)
    label.position.y = spec.h + 1.7
    host.add(label)
  }
}
