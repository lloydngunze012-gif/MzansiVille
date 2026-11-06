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
}

// A house (houses.json): its kit building, lightly tinted with its colour, its name
// over the door in its colours. Nothing here names a house.
function houseLook(house) {
  const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(house.main), 0.16)
  return { url: `${CITY}${house.model}.glb`, h: house.height, tint: tint.getHex(), sign: house.name.toUpperCase(), signBg: house.main, signFg: house.accent, house }
}

// A house banner: its colour, an accent band and its short name, hung on the facade.
// (unlit, so the colours read the same in sun and at night)
export function houseBanner(house, w = 0.95, h = 2.3) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 310
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = house.main
  ctx.fillRect(0, 0, 128, 310)
  ctx.fillStyle = house.accent
  ctx.fillRect(0, 0, 128, 14)
  ctx.fillRect(10, 250, 108, 10)
  // a pennant tail
  ctx.beginPath()
  ctx.moveTo(0, 270)
  ctx.lineTo(64, 310)
  ctx.lineTo(128, 270)
  ctx.lineTo(128, 310)
  ctx.lineTo(0, 310)
  ctx.closePath()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = house.accent
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(64, 92, 34, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = house.accent
  ctx.font = 'bold 40px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(house.short[0], 64, 94)
  ctx.font = 'bold 22px sans-serif'
  ctx.save()
  ctx.translate(64, 190)
  ctx.fillText(house.short.toUpperCase(), 0, 0, 120)
  ctx.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }))
  plane.name = 'house-banner'
  return plane
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
export function facadeSign(text, bg, w = 3.4, fg = '#fff6e6') {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 112
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 112)
  ctx.fillStyle = fg
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
  const look = LOOKS[building.id] || (building.house && houseLook(building.house))
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
  const sign = facadeSign(look.sign, look.signBg, 3.4, look.signFg)
  sign.position.set(0, 2.85, building.d / 2 + 0.08)
  group.add(sign)
  // A house: its banners either side of the door.
  if (look.house) {
    for (const side of [-1, 1]) {
      const banner = houseBanner(look.house)
      banner.position.set(side * 2.15, 2.75, building.d / 2 + 0.14)
      group.add(banner)
    }
  }
  return true
}

// Greenway Grocer's shop front, on the ordinary building (owner, 6 Nov): a green awning,
// big shop windows with shelves behind them, the name on a green fascia, and a till
// counter by the door. Green and white, an invented name, no real chain's look.
export function dressGrocer(group, building) {
  const { w, d } = building
  const mat = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra })
  const add = (mesh, x, y, z, name) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; if (name) mesh.name = name; group.add(mesh); return mesh }
  const front = d / 2
  // The green fascia band and the awning over the front.
  add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.7, 0.12), mat(0x2f8f5b)), 0, 3.55, front + 0.06, 'fascia')
  const awning = add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.12, 1.4), mat(0x3aa86b)), 0, 2.75, front + 0.7, 'awning')
  awning.rotation.x = 0.18
  for (let i = 0; i < 6; i++) add(new THREE.Mesh(new THREE.BoxGeometry((w - 0.4) / 12, 0.13, 1.42), mat(0xffffff)), -((w - 0.4) / 2) + ((w - 0.4) / 6) * (i + 0.5) + (w - 0.4) / 24, 2.76, front + 0.7).rotation.x = 0.18
  // Shop windows either side of the door, shelves of colour behind the glass.
  for (const side of [-1, 1]) {
    const cx = side * (w / 4 + 0.35)
    add(new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 1.9, 1.7, 0.04), mat(0xdff5ea, { transparent: true, opacity: 0.35, roughness: 0.1 })), cx, 1.35, front + 0.36, 'shop-window')
    add(new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 1.8, 1.8, 0.04), mat(0xffffff)), cx, 1.35, front + 0.02)
    for (let row = 0; row < 3; row++) {
      add(new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 2.1, 0.05, 0.28), mat(0xd9dcd6)), cx, 0.75 + row * 0.5, front + 0.18)
      for (let k = 0; k < 6; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.2), mat([0xe94b3c, 0xf4c430, 0x3aa86b, 0x2f7fd0, 0xff8a3d, 0xf2f2f2][(k + row) % 6])), cx - (w / 2 - 2.4) / 2 + k * ((w / 2 - 2.4) / 5), 0.92 + row * 0.5, front + 0.18)
    }
  }
  // The till counter beside the door, under the awning: where you pay.
  add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.95, 0.6), mat(0x2f8f5b)), 1.6, 0.48, front + 0.55, 'till')
  add(new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.65), mat(0xffffff)), 1.6, 0.98, front + 0.55)
  add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.28), mat(0x22262a)), 1.85, 1.12, front + 0.5, 'till-screen')
  // Its door in its green.
  const door = group.getObjectByName('door')
  if (door) door.material = mat(0x2f8f5b, { emissive: 0x2f8f5b, emissiveIntensity: 0.12 })
  const sign = facadeSign('GREENWAY GROCER', '#2f8f5b', 3.6)
  sign.position.set(0, 3.55, front + 0.13)
  group.add(sign)
}

// Hand-built: an arched sports hall, the main gate.
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
  // The bus stop by the gate: a shelter, a bench, a sign. (The bus to town: scenes.js busRide.)
  if (building.id === 'bus_stop') {
    const { w, d } = building
    const steel = mat(0x2f4f6f, { metalness: 0.4 })
    add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), steel), 0, 2.5, 0).name = 'shelter roof'
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), steel), x, 1.25, -d / 2 + 0.2)
    add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 1.6, 0.06), mat(0xcfe6f2, { transparent: true, opacity: 0.45 })), 0, 1.5, -d / 2 + 0.15)
    add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.08, 0.45), mat(0x8a5a3a)), 0, 0.48, -d / 2 + 0.55).name = 'bench'
    const sign = facadeSign('BUS TO TOWN', '#2f4f6f', 2.4)
    sign.position.set(0, 2.15, d / 2 - 0.02)
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
      const sign = facadeSign('UNIVERSITY OF MZANSI · MAIN GATE', '#22143b', 2.9)
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
