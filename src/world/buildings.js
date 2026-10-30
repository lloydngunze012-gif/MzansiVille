// Every building looks different: Kenney City Kit buildings (CC0, public/models/city
// and suburb), fitted to each place's footprint and tinted, plus hand-built ones
// (sports hall, bus station, main gate). Each gets a facade sign over its entrance.
// The box in campus.js stays as a stand-in until the model loads.
import * as THREE from 'three'
import { loadModel } from './models.js'

const CITY = '/models/city/'
const SUBURB = '/models/suburb/'

// place id -> model, height and tint (tint multiplies the kit's mostly white palette).
export const LOOKS = {
  library: { url: `${CITY}building-k.glb`, h: 7, tint: 0xd6ecff, sign: 'LIBRARY', signBg: '#1d4f7a' },
  smig: { url: `${CITY}building-skyscraper-b.glb`, h: 17, tint: 0xe6eeff, sign: 'SMIG', signBg: '#22143b' },
  health_sciences: { url: `${CITY}building-h.glb`, h: 8, tint: 0xd2fbe6, sign: 'HEALTH SCIENCES', signBg: '#1f6b5a' },
  science: { url: `${CITY}building-e.glb`, h: 6.5, tint: 0xfff0b0, sign: 'SCIENCE', signBg: '#7a5a00' },
  law: { url: `${CITY}building-j.glb`, h: 8, tint: 0xf6c8a8, sign: 'LAW', signBg: '#5a2a14' },
  engineering: { url: `${CITY}building-n.glb`, h: 9, tint: 0xe4e8ec, sign: 'ENGINEERING', signBg: '#2b2b30' },
  res_o: { url: `${CITY}building-m.glb`, h: 12, tint: 0xffd2a8, sign: 'O BLOCK', signBg: '#a8501a' },
  res_r: { url: `${CITY}building-l.glb`, h: 11, tint: 0xf0a088, sign: 'R BLOCK', signBg: '#6a2214' },
  res_s: { url: `${CITY}building-i.glb`, h: 10, tint: 0xb4eee6, sign: 'S BLOCK', signBg: '#1f5a55' },
  res_other: { url: `${CITY}building-g.glb`, h: 10, tint: 0xfff2d8, sign: 'RESIDENCES', signBg: '#5a4a2a' },
  off_campus: { url: `${SUBURB}building-type-n.glb`, h: 6, tint: 0xffffff, sign: 'OFF-CAMPUS RES', signBg: '#2b3a55' },
}

// At night the kit buildings get lit window panels over their facades (hidden by
// day, when the kit's own windows show). campus.js passes in its window builder.
const lit = []
const nightWindows = []
let nightLevel = 0
let windowBuilder = null
export function setWindowBuilder(fn) { windowBuilder = fn }

export function applyBuildingNight(n) {
  nightLevel = n
  for (const material of lit) material.emissiveIntensity = n * 1.6
  for (const group of nightWindows) group.visible = n > 0.3
}

// A facade sign over the entrance (canvas text on a plane).
export function facadeSign(text, bg, w = 3.4) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 112)
  ctx.fillStyle = '#fff6e6'
  ctx.font = 'bold 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 60, 480)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.22), new THREE.MeshBasicMaterial({ map: texture }))
  plane.name = 'facade-sign'
  return plane
}

function fit(model, w, d, h) {
  const size = model.userData.size
  model.scale.set(w / size.x, h / size.y, d / size.z)
}

// Swap the stand-in box of a building for its kit model.
export function upgradeBuilding(group, building) {
  const look = LOOKS[building.id]
  if (!look) return false
  loadModel(look.url).then((src) => {
    const model = src.clone(true)
    fit(model, building.w, building.d, look.h)
    model.traverse((node) => {
      if (!node.isMesh) return
      const material = node.material.clone()
      material.color.multiply(new THREE.Color(look.tint))
      node.material = material
    })
    model.name = 'kit'
    if (windowBuilder) {
      const windows = new THREE.Group()
      windows.name = 'night-windows'
      windowBuilder(windows, { ...building, h: look.h }, 0.06)
      windows.visible = nightLevel > 0.3
      nightWindows.push(windows)
      group.add(windows)
    }
    for (const name of ['body', 'roof', 'windows']) group.getObjectsByProperty('name', name).forEach((o) => { o.visible = false })
    group.add(model)
    // The label floats above the real roof.
    const label = group.getObjectByName('label')
    if (label) label.position.y = look.h + 1.4
    const badge = group.getObjectByName('badge')
    if (badge) badge.position.y = look.h + 1
  }).catch(() => {})
  const sign = facadeSign(look.sign, look.signBg)
  sign.position.set(0, 2.85, building.d / 2 + 0.08)
  group.add(sign)
  return true
}

// Hand-built: an arched sports hall, a bus station shelter, the main gate.
export function buildSpecial(group, building) {
  const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra })
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh }
  if (building.id === 'sports_centre') {
    const { w, d } = building
    add(new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, d), mat(0x3f8f62)), 0, 1.6, 0).name = 'hall'
    const roof = add(new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w + 0.4, 24, 1, false, 0, Math.PI), mat(0xd9dfe4, { metalness: 0.3 })), 0, 3.2, 0)
    roof.rotation.z = Math.PI / 2
    roof.scale.set(0.55, 1, 1)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 10, 6), mat(0x8a8f96)), sx * (w / 2 + 2), 5, sz * (d / 2 + 1.5))
        const head = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.3), mat(0x2b2b30, { emissive: 0xfff6d8, emissiveIntensity: 0 })), sx * (w / 2 + 2), 10, sz * (d / 2 + 1.5))
        lit.push(head.material)
      }
    }
    const sign = facadeSign('SPORTS CENTRE', '#1f5a3a', 4.2)
    sign.position.set(0, 2.6, d / 2 + 0.06)
    group.add(sign)
    return true
  }
  if (building.id === 'bus_station') {
    const { w, d } = building
    for (const x of [-w / 2 + 0.4, 0, w / 2 - 0.4]) for (const z of [-d / 2 + 0.4, d / 2 - 0.4]) add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 0.18), mat(0x5a6068)), x, 1.5, z)
    add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.8), mat(0x2c6a9a)), 0, 3.1, 0).name = 'canopy'
    add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.45, 0.5), mat(0x9a6a40)), 0, 0.45, -d / 2 + 0.6)
    const sign = facadeSign('BUS STATION', '#2c6a9a', 4)
    sign.position.set(0, 2.5, d / 2 + 0.45)
    group.add(sign)
    return true
  }
  if (building.id === 'gate') {
    const { w } = building
    add(new THREE.Mesh(new THREE.BoxGeometry(3, 2.8, 3), mat(0xeadcbc)), -w / 2 + 1.5, 1.4, 0).name = 'gatehouse'
    add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 3.4), mat(0x8a5a3a)), -w / 2 + 1.5, 2.9, 0)
    for (const x of [-w / 2 - 0.3, w / 2 + 0.3]) add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.8), mat(0xd9c49c)), x, 1.3, 0)
    // Signs on the gatehouse walls (no overhead arch: it blocked the camera).
    for (const [z, rot] of [[1.52, 0], [-1.52, Math.PI]]) {
      const sign = facadeSign('WESTVILLE CAMPUS · MAIN GATE', '#22143b', 2.9)
      sign.position.set(-w / 2 + 1.5, 2.1, z)
      sign.rotation.y = rot
      group.add(sign)
    }
    const boom = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.12, 0.12), mat(0xffffff)), w * 0.1, 1.1, 1.2)
    boom.name = 'boom'
    return true
  }
  return false
}
