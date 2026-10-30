import * as THREE from 'three'
import { buildingLayout } from './layout.js'
import { buildGrid } from './nav.js'
import { dressPlaces } from './dress.js'
import { loadGlb, modelManifest, modelUrl } from './models.js'

const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xe4d2b0, roughness: 1 })
const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x74b254, roughness: 1 })
const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x5d8f42, roughness: 1 })
// Windows: most glow warm at night, a few stay dark (applyNight sets the glow).
const litWindow = new THREE.MeshStandardMaterial({ color: 0x2a3442, emissive: 0xffc870, emissiveIntensity: 0.05, roughness: 0.4 })
const darkWindow = new THREE.MeshStandardMaterial({ color: 0x26303c, roughness: 0.4 })
const windowGeo = new THREE.BoxGeometry(0.7, 0.8, 0.06)

function addWindows(group, building) {
  const floors = Math.max(1, Math.floor((building.h - 0.6) / 2.2))
  const across = Math.max(1, Math.floor((building.w - 1.4) / 1.6))
  const spots = []
  for (const side of [1, -1]) {
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < across; i++) {
        const x = -((across - 1) * 1.6) / 2 + i * 1.6
        if (side === 1 && f === 0 && Math.abs(x) < 1.2) continue // the door
        spots.push([x, 1.6 + f * 2.2, side * (building.d / 2 + 0.03)])
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set(1.35, 1.35, 1)
  sprite.raycast = () => {}
  return sprite
}

function labelSprite(text, home) {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = home ? 'rgba(240,196,0,0.94)' : 'rgba(28,25,21,0.82)'
  ctx.beginPath()
  ctx.roundRect(4, 6, 312, 60, 18)
  ctx.fill()
  ctx.fillStyle = home ? '#1c1915' : '#fffaf2'
  ctx.font = '600 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 160, 38)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set(7.2, 1.62, 1)
  sprite.raycast = () => {}
  sprite.name = 'label'
  return sprite
}

const labelAt = new THREE.Vector3()
const labelEdge = new THREE.Vector3()
const camRight = new THREE.Vector3()

// Name tags are world sprites, so one close to the camera gets wide and runs off
// the screen edge as a dark cut-off slab. Fade out any tag that would not fit.
export function fitLabels(buildings, camera, dt) {
  camRight.setFromMatrixColumn(camera.matrixWorld, 0)
  for (const group of buildings.children) {
    for (const label of group.children) {
      if (label.name !== 'label') continue
      label.getWorldPosition(labelAt)
      labelEdge.copy(labelAt).addScaledVector(camRight, label.scale.x / 2)
      labelAt.project(camera)
      labelEdge.project(camera)
      const half = Math.abs(labelEdge.x - labelAt.x)
      const fits = labelAt.z < 1 && labelAt.x - half > -0.98 && labelAt.x + half < 0.98 && half < 0.6
      const material = label.material
      material.opacity += ((fits ? 1 : 0) - material.opacity) * Math.min(1, dt * 10)
      label.visible = material.opacity > 0.02
    }
  }
}

function ribbon(a, b) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < 0.2) return null
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 3.8), pathMaterial)
  mesh.position.set((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2)
  mesh.rotation.y = Math.atan2(-dz, dx)
  mesh.receiveShadow = true
  return mesh
}

function buildingMesh(building, home) {
  const group = new THREE.Group()
  group.position.set(building.x, 0, building.z)
  group.userData.placeId = building.id
  // An open place (the Quad) is dressed in dress.js; it has no walls, roof or door here.
  if (!building.open) {
    const wall = new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.86 })
    const roofMat = new THREE.MeshStandardMaterial({ color: building.roof, roughness: 0.8 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(building.w, building.h, building.d), wall)
    body.position.y = building.h / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(building.w + 0.5, 0.5, building.d + 0.5), roofMat)
    roof.position.y = building.h + 0.22
    roof.castShadow = true
    group.add(roof)
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 2.15, 0.16),
      new THREE.MeshStandardMaterial({ color: home ? 0xf0c400 : 0x3a2a22, roughness: 0.7 }),
    )
    door.position.set(0, 1.08, building.d / 2 + 0.02)
    door.name = 'door'
    group.add(door)
    addWindows(group, building)
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf0c400, emissive: 0xf0c400, emissiveIntensity: 0.9, roughness: 0.4 }),
  )
  beacon.position.set(0, 1.35, building.d / 2 + 0.55)
  beacon.name = 'beacon'
  beacon.visible = false
  group.add(beacon)
  const badge = badgeSprite()
  badge.position.set(building.w * 0.28, building.h + 1.15, -building.d * 0.28)
  badge.name = 'badge'
  badge.visible = false
  group.add(badge)
  const label = labelSprite(shortName(building.name), home)
  label.position.y = building.open ? 4.8 : Math.min(building.h + 1.3, 5.6)
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

export function createCampus(district, homeId) {
  const layout = buildingLayout(district)
  const group = new THREE.Group()
  group.name = 'campus'

  const skirt = new THREE.Mesh(new THREE.CircleGeometry(108, 40), skirtMaterial)
  skirt.rotation.x = -Math.PI / 2
  skirt.position.y = -0.04
  skirt.receiveShadow = true
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(102, 48), grassMaterial)
  lawn.rotation.x = -Math.PI / 2
  lawn.receiveShadow = true
  lawn.name = 'ground'
  group.add(skirt, lawn)

  for (const path of layout.paths) {
    for (let i = 1; i < path.length; i += 1) {
      const piece = ribbon(path[i - 1], path[i])
      if (piece) group.add(piece)
    }
  }

  const buildings = new THREE.Group()
  buildings.name = 'buildings'
  for (const building of layout.buildings) {
    buildings.add(buildingMesh(building, building.id === homeId))
  }
  group.add(buildings)
  const dressing = dressPlaces(layout)
  group.add(dressing.group)
  addTrees(group, { ...layout, buildings: layout.buildings.concat(dressing.obstacles.map((o) => ({ ...o }))), plazas: [{ x: 0, z: 0, r: 13 }] })

  const grid = buildGrid(layout.obstacles.concat(dressing.obstacles))
  upgrade(buildings, layout.buildings)
  return { group, ground: lawn, buildings, grid, layout, dressing }
}

// n: 0 day, 1 night. Windows across campus plus the dressed places' lights.
export function applyNight(campus, n) {
  litWindow.emissiveIntensity = 0.05 + n * 1.5
  campus.dressing?.applyNight(n)
}

export function markDoors(buildings, ids) {
  for (const group of buildings.children) {
    const on = ids.has(group.userData.placeId)
    const beacon = group.getObjectByName('beacon')
    const badge = group.getObjectByName('badge')
    if (beacon) beacon.visible = on
    if (badge) badge.visible = on
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
