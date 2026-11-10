// SunnyBay's still parts: the ground of every district, roads, the river and its bridges, the sea and
// the beach, the hills, the highway ring, every lot's building and sign, the wave 2 plots, billboards,
// street props. Used twice: in full by the city scene (src/world/city.js) and, with far: true, as what
// you see past the ring road from campus (src/world/surroundings.js), so both scenes show one city.
//
// Cheap on a phone by construction: every model (Kenney City Kits, the suburb and township kits of the
// day-1 home, cars, trees; CC0) is baked to vertex colours (its palette texture is read at each vertex)
// and merged with the hand-built boxes into ONE mesh per 128 m cell: one material, one draw call per
// cell on screen. The ground is one mesh, every sign and billboard shares one atlas texture.
// The plan (what stands where) is data: data/campusville/sunnybay.json through src/city/plan.js.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BOUNDS, CITY, FENCE_R, HOMES, LOTS, PARTS, PLOT, RING_OUT, STOPS, WAVE2 } from '../city/plan.js'

const CELL = 128
const ROAD = '#3b3c40'
const LINE = '#f4f1e6'
const SEA_X = 296 // the waterline
const PROM = [236, 250] // the promenade (x from, to)
const TOWN_PAINT = ['#f2a7b5', '#7cc6c0', '#f4d35e', '#a8d5a2', '#f3eee2', '#e08a55', '#9fb7e0']
const TOWN_ROOF = ['#8d969c', '#9b3d2a', '#4f7a5a', '#8d969c']
const BEACH_PAINT = ['#ffd9c2', '#c9ecf0', '#fff1b8', '#f7c6d9', '#d6f0c8']
const CONTAINER = ['#c0392b', '#2456a6', '#e08a24', '#2f8f5b', '#8d969c']

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

// ---------- models, baked to vertex colours ----------
let gltfLoader = null
async function loader() {
  if (gltfLoader) return gltfLoader
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')])
  gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/').setDecoderConfig({ type: 'wasm' }))
  return gltfLoader
}
const files = {}
const loadFile = (url) => (files[url] ||= loader().then((l) => l.loadAsync(url)).catch(() => { delete files[url]; return null }))
const pixels = new Map() // image -> { data, w, h }
function pixelsOf(image) {
  if (!pixels.has(image)) {
    const c = document.createElement('canvas')
    c.width = image.width
    c.height = image.height
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(image, 0, 0)
    pixels.set(image, { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height })
  }
  return pixels.get(image)
}
const tmpC = new THREE.Color()
const tmpV = new THREE.Vector3()
// One model (a file, or a named child of a kit file) as a single indexed geometry with position, normal
// and colour, centred on x/z with its base on y = 0. recolour(materialName) -> a colour, or nothing.
function bakeObject(root, recolour) {
  root.updateMatrixWorld(true)
  const parts = []
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return
    const src = o.geometry
    const pos = src.attributes.position
    const nor = src.attributes.normal
    const uv = src.attributes.uv
    const n = pos.count
    const P = new Float32Array(n * 3)
    const N = new Float32Array(n * 3)
    const C = new Float32Array(n * 3)
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld)
    const m = o.material
    const tex = m.map?.image ? pixelsOf(m.map.image) : null
    const swap = recolour?.(m.name)
    const flat = swap ? new THREE.Color(swap) : m.color
    for (let i = 0; i < n; i++) {
      tmpV.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      P[i * 3] = tmpV.x; P[i * 3 + 1] = tmpV.y; P[i * 3 + 2] = tmpV.z
      if (nor) { tmpV.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize() } else tmpV.set(0, 1, 0)
      N[i * 3] = tmpV.x; N[i * 3 + 1] = tmpV.y; N[i * 3 + 2] = tmpV.z
      if (tex && uv && !swap) {
        const px = Math.min(tex.w - 1, Math.max(0, Math.floor((((uv.getX(i) % 1) + 1) % 1) * tex.w)))
        const py = Math.min(tex.h - 1, Math.max(0, Math.floor((((uv.getY(i) % 1) + 1) % 1) * tex.h)))
        const k = (py * tex.w + px) * 4
        tmpC.setRGB(tex.data[k] / 255, tex.data[k + 1] / 255, tex.data[k + 2] / 255, THREE.SRGBColorSpace).multiply(m.color)
      } else tmpC.copy(flat)
      C[i * 3] = tmpC.r; C[i * 3 + 1] = tmpC.g; C[i * 3 + 2] = tmpC.b
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3))
    g.setAttribute('color', new THREE.BufferAttribute(C, 3))
    g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: n }, (_, i) => i))
    parts.push(g)
  })
  if (!parts.length) return null
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
  geo.computeBoundingBox()
  const b = geo.boundingBox
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  geo.computeBoundingBox()
  const size = geo.boundingBox.getSize(new THREE.Vector3())
  return { geo, size, tris: geo.index.count / 3 }
}
const baked = {}
// url, or url#child for one model of a kit file; key adds a recolour variant.
async function model(ref, recolour, key = '') {
  const id = `${ref}|${key}`
  if (baked[id] !== undefined) return baked[id]
  const [url, child] = ref.split('#')
  const gltf = await loadFile(url)
  let root = gltf?.scene || null
  if (root && child) {
    // (three renames duplicate node names: find the child by the name in the file)
    const nodes = gltf.parser.json.nodes || []
    root = gltf.scene.children.find((c) => { const r = gltf.parser.associations.get(c); return ((r?.nodes !== undefined && nodes[r.nodes]?.name) || c.name) === child }) || null
  }
  baked[id] = root ? bakeObject(root, recolour) : null
  return baked[id]
}

// ---------- the sign atlas: every sign, board and billboard on one texture ----------
function makeAtlas(size = 2048) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  g.fillStyle = '#22143b'
  g.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  let x = 0
  let y = 0
  let rowH = 0
  const PAD = 4
  return {
    texture,
    // A cell w x h px; draw(g, x, y, w, h) paints it. Returns its uv rect [u0, v0, u1, v1].
    cell(w, h, draw) {
      if (x + w + PAD > size) { x = 0; y += rowH + PAD; rowH = 0 }
      if (y + h > size) return [0, 0, 0.01, 0.01]
      const cx = x
      const cy = y
      x += w + PAD
      rowH = Math.max(rowH, h)
      g.save()
      g.beginPath(); g.rect(cx, cy, w, h); g.clip()
      draw(g, cx, cy, w, h)
      g.restore()
      texture.needsUpdate = true
      return { uv: [cx / size, 1 - (cy + h) / size, (cx + w) / size, 1 - cy / size], redraw: (fn) => { g.save(); g.beginPath(); g.rect(cx, cy, w, h); g.clip(); fn(g, cx, cy, w, h); g.restore(); texture.needsUpdate = true } }
    },
  }
}
function fitText(g, text, x, y, maxW, px, weight = 800, family = 'Graduate, Figtree, system-ui, sans-serif') {
  let size = px
  do { g.font = `${weight} ${size}px ${family}`; size -= 2 } while (g.measureText(text).width > maxW && size > 10)
  g.fillText(text, x, y)
}
const board = (bg, fg, text, sub, { edge } = {}) => (g, x, y, w, h) => {
  g.fillStyle = bg; g.fillRect(x, y, w, h)
  if (edge) { g.strokeStyle = edge; g.lineWidth = Math.max(4, h * 0.05); g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth) }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
  fitText(g, text, x + w / 2, y + h * (sub ? 0.4 : 0.52), w * 0.9, h * (sub ? 0.42 : 0.56))
  if (sub) fitText(g, sub, x + w / 2, y + h * 0.77, w * 0.9, h * 0.2, 700, 'Figtree, system-ui, sans-serif')
}

// ---------- the builder ----------
// opts: far (the campus backdrop: no cars, signs, lamps or campus stand-in), campus ({ buildings, paths } from
// layout.js, drawn as simple blocks inside the fence), ads ([{ brand, line, bg, fg, image }], one per billboard).
export async function buildCity(opts = {}) {
  const far = Boolean(opts.far)
  const group = new THREE.Group()
  group.name = 'sunnybay'
  const rand = mulberry32(0x5b4a)
  const solids = [] // { minX, maxX, minZ, maxZ }: what a body cannot walk through
  const doors = [] // { lot, x, z }: where a tap on a building's door leads
  const boards = [] // billboards: { i, x, z, ad }
  const lamps = [] // [x, y, z] lamp heads (they glow at night)
  const glass = [] // lit windows: geometries kept apart so they can glow at night
  const stat = new Map() // cell -> [geometries]
  const ground = []
  const signs = []
  const atlas = far ? null : makeAtlas()
  let tris = 0

  const colour = (g, hex, tint) => {
    const n = g.attributes.position.count
    const c = new Float32Array(n * 3)
    tmpC.set(hex)
    if (tint) tmpC.multiplyScalar(tint)
    for (let i = 0; i < n; i++) { c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.deleteAttribute('uv')
    return g
  }
  const push = (g, list) => {
    if (list) { list.push(g); return }
    g.computeBoundingBox()
    const c = g.boundingBox.getCenter(tmpV)
    const key = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`
    if (!stat.has(key)) stat.set(key, [])
    stat.get(key).push(g)
    tris += g.index.count / 3
  }
  // a box: size, centre (y is the centre), colour, turn
  const box = (w, h, d, x, y, z, hex, rotY = 0, list) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rotY) g.rotateY(rotY)
    g.translate(x, y, z)
    push(colour(g, hex), list)
  }
  const solid = (x, z, w, d) => solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })
  // a flat rectangle on the ground (y a few cm up: layers never fight)
  const flat = (x0, z0, x1, z1, y, hex) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
    g.rotateX(-Math.PI / 2)
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
    g.userData.y = y
    ground.push(colour(g, hex))
  }
  const disc = (x, z, r, y, hex, seg = 24, list = ground) => {
    const g = new THREE.CircleGeometry(r, seg)
    g.rotateX(-Math.PI / 2)
    g.translate(x, y, z)
    g.userData.y = y
    list.push(colour(g, hex))
  }
  const cyl = (rt, rb, h, x, y, z, hex, seg = 8, list) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg)
    g.translate(x, y, z)
    push(colour(g, hex), list)
  }
  // a placed model: fit = the footprint's longer side in metres (or scale), tint darkens/lightens
  const put = (m, x, z, { rot = 0, fit, high, scale, tint, y = 0, hit = true } = {}) => {
    if (!m) return null
    const s = scale || (high ? high / m.size.y : fit ? fit / Math.max(m.size.x, m.size.z) : 1)
    const g = m.geo.clone()
    g.scale(s, s, s)
    if (rot) g.rotateY(rot)
    g.translate(x, y, z)
    if (tint) {
      const c = g.attributes.color.array
      tmpC.set(tint)
      for (let i = 0; i < c.length; i += 3) { c[i] *= tmpC.r; c[i + 1] *= tmpC.g; c[i + 2] *= tmpC.b }
    }
    push(g)
    const sideways = Math.abs(Math.sin(rot)) > 0.7
    const w = (sideways ? m.size.z : m.size.x) * s
    const d = (sideways ? m.size.x : m.size.z) * s
    if (hit) solid(x, z, w * 0.92, d * 0.92)
    return { w, d, h: m.size.y * s }
  }
  // a sign on the atlas: a plane w x h metres at (x, y, z), facing rotY (0 = +z), readable from both sides
  const sign = (cell, w, h, x, y, z, rotY = 0, both = true, gap = 0.03) => {
    if (!atlas || !cell.uv) return
    const [u0, v0, u1, v1] = cell.uv
    const make = (flip) => {
      const g = new THREE.PlaneGeometry(w, h)
      const uv = g.attributes.uv
      for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0)
      g.deleteAttribute('normal')
      if (flip) g.rotateY(Math.PI)
      g.translate(0, 0, flip ? -gap : gap)
      g.rotateY(rotY)
      g.translate(x, y, z)
      signs.push(g)
    }
    make(false)
    if (both) make(true)
  }
  const lamp = (x, z) => {
    if (far) return
    box(0.14, 5, 0.14, x, 2.5, z, '#2f3338')
    lamps.push([x, 5.05, z])
  }
  let treeNo = 0
  const tree = (m, x, z, high = 6) => { if (far && treeNo++ % 3) return; const t = put(m, x, z, { high, rot: rand() * 6.28, hit: false }); if (t) solid(x, z, 0.7, 0.7) }
  const SUB_PAINT = ['#f3eee2', '#e9dcc3', '#d9e4ec', '#f0e2d0']
  const blockHouse = (x, z, w, d, h, wall, roof) => {
    box(w, h, d, x, h / 2, z, wall)
    const g = new THREE.ConeGeometry(Math.max(w, d) * 0.74, 2.2, 4)
    g.rotateY(Math.PI / 4)
    g.translate(x, h + 1.1, z)
    push(colour(g, roof))
    solid(x, z, w, d)
  }

  // ---------- models ----------
  const kc = '/models/city/'
  const [lowA, lowB, lowC, lowD, wideA, wideB, bE, bH, bG, sky, tDef, tOak, palmT, palmB, van, sedan, suv, hatch, truck] = await Promise.all([
    model(`${kc}low-detail-building-a.glb`), model(`${kc}low-detail-building-b.glb`), model(`${kc}low-detail-building-c.glb`), model(`${kc}low-detail-building-d.glb`),
    model(`${kc}low-detail-building-wide-a.glb`), model(`${kc}low-detail-building-wide-b.glb`),
    far ? null : model(`${kc}building-e.glb`), far ? null : model(`${kc}building-h.glb`), far ? null : model(`${kc}building-g.glb`), model(`${kc}building-skyscraper-b.glb`),
    model('/models/props/tree_default.glb'), model('/models/props/tree_oak.glb'), model('/models/props/tree_palmTall.glb'), model('/models/props/tree_palmBend.glb'),
    far ? null : model('/models/cars/van.glb'), far ? null : model('/models/cars/sedan.glb'), far ? null : model('/models/cars/suv.glb'), far ? null : model('/models/cars/hatchback-sports.glb'), far ? null : model('/models/cars/truck.glb'),
  ])
  const sub = '/models/home/suburb-kit.glb#'
  const houses = far ? [1] : (await Promise.all(['building-type-b', 'building-type-d', 'building-type-e', 'building-type-h', 'building-type-l', 'building-type-q'].map((n) => model(sub + n)))).filter(Boolean)
  const subTree = far ? null : await model(`${sub}tree-small`)
  const townNames = ['1story', '1story_gableroof', '1story_roundroof', '1story_sign', '2story_slim']
  const townKit = []
  for (let v = 0; v < 5; v++) {
    if (far) { townKit.push(1); continue }
    const paint = TOWN_PAINT[v % TOWN_PAINT.length]
    const roof = TOWN_ROOF[v % TOWN_ROOF.length]
    const base = { Main: paint, Bricks: '#a5553a', Light: '#f3e6c8', Dark: '#5a554e', White: '#f6f2ea', Wood: '#8a5a3a', DarkWood: '#5a3a26', Glass: '#9cc8de', RoofBricks: roof, Black: '#2f2f2f', DarkBrown: '#4a3020' }
    townKit.push(await model(`/models/home/town-kit.glb#${townNames[v]}`, (name) => base[name], `v${v}`))
  }
  const cars = [sedan, suv, hatch, sedan].filter(Boolean)

  // ---------- 1. the world and its edges ----------
  // far land to the horizon, the sea, the districts' ground
  flat(-1400, -1400, SEA_X + 6, 1400, -0.06, '#7f9a58')
  flat(SEA_X, -1400, 1500, 1400, -0.05, '#2f86b3') // the sea
  flat(SEA_X - 3, -1400, SEA_X + 2, 1400, 0.015, '#eaf6f4') // surf
  flat(SEA_X + 18, -1400, SEA_X + 20, 1400, -0.04, '#8fc7dd')
  flat(SEA_X + 60, -1400, SEA_X + 62.5, 1400, -0.04, '#6fb3cf')
  for (const p of PARTS) {
    if (far && p.id === 'campus') {
      // (the campus scene has its own lawn and ring road: only the corners past the ring)
      flat(p.rect[0], p.rect[1], p.rect[2], p.rect[3], -0.01, p.ground)
      continue
    }
    flat(p.rect[0], p.rect[1], p.rect[2], p.rect[3], 0, p.ground)
  }
  // the beach: promenade, sand
  flat(PROM[0], BOUNDS.z0 - 4, PROM[1], BOUNDS.z1 + 4, 0.012, '#efe4c8')
  flat(PROM[1], -1400, SEA_X, 1400, 0.01, '#f3e2b0')
  // the river and its banks
  const rv = CITY.river.rect
  flat(rv[0] - 2.5, -1400, rv[2] + 2.5, 1400, 0.008, '#5f8a4a')
  flat(rv[0], -1400, rv[2], 1400, 0.014, '#3f8fb5')
  flat(rv[0] + 5, -1400, rv[0] + 6.2, 1400, 0.016, '#63a9c9')
  // roads: a pavement under each, the tarmac, a dashed centre line
  for (const r of CITY.roads) {
    const [x0, z0, x1, z1] = r.rect
    const part = PARTS.find((p) => (x0 + x1) / 2 >= p.rect[0] && (x0 + x1) / 2 <= p.rect[2] && (z0 + z1) / 2 >= p.rect[1] && (z0 + z1) / 2 <= p.rect[3]) || PARTS[0]
    flat(x0 - 2.5, z0 - 2.5, x1 + 2.5, z1 + 2.5, 0.018, part.pave)
  }
  for (const r of CITY.roads) {
    const [x0, z0, x1, z1] = r.rect
    flat(x0, z0, x1, z1, 0.03, ROAD)
    const alongX = x1 - x0 > z1 - z0
    const len = alongX ? x1 - x0 : z1 - z0
    for (let t = 4; t < len - 2; t += 9) {
      if (alongX) flat(x0 + t, (z0 + z1) / 2 - 0.09, x0 + t + 3, (z0 + z1) / 2 + 0.09, 0.04, LINE)
      else flat((x0 + x1) / 2 - 0.09, z0 + t, (x0 + x1) / 2 + 0.09, z0 + t + 3, 0.04, LINE)
    }
  }
  // a light line along each kerb, and zebra crossings where two roads meet
  const crossings = []
  for (const r of CITY.roads) {
    const [x0, z0, x1, z1] = r.rect
    const alongX = x1 - x0 > z1 - z0
    if (alongX) { flat(x0, z0 + 0.25, x1, z0 + 0.4, 0.036, '#d8cfae'); flat(x0, z1 - 0.4, x1, z1 - 0.25, 0.036, '#d8cfae') }
    else { flat(x0 + 0.25, z0, x0 + 0.4, z1, 0.036, '#d8cfae'); flat(x1 - 0.4, z0, x1 - 0.25, z1, 0.036, '#d8cfae') }
    for (const o of CITY.roads) {
      if (o === r) continue
      const [a0, b0, a1, b1] = o.rect
      const oAlongX = a1 - a0 > b1 - b0
      if (oAlongX === alongX) continue
      // where this road meets the other: a crossing on this road, just before the junction, on each side that has road
      if (alongX && a0 >= x0 - 1 && a1 <= x1 + 1 && b0 <= z0 + 1 && b1 >= z1 - 1) { if (a0 - 5 > x0) crossings.push([a0 - 4.5, z0, a0 - 1.5, z1, true]); if (a1 + 5 < x1) crossings.push([a1 + 1.5, z0, a1 + 4.5, z1, true]) }
      if (!alongX && b0 >= z0 - 1 && b1 <= z1 + 1 && a0 <= x0 + 1 && a1 >= x1 - 1) { if (b0 - 5 > z0) crossings.push([x0, b0 - 4.5, x1, b0 - 1.5, false]); if (b1 + 5 < z1) crossings.push([x0, b1 + 1.5, x1, b1 + 4.5, false]) }
    }
  }
  for (const [x0, z0, x1, z1, alongX] of crossings) {
    flat(x0, z0, x1, z1, 0.037, ROAD)
    if (alongX) for (let z = z0 + 0.5; z < z1 - 0.6; z += 1.2) flat(x0, z, x1, z + 0.6, 0.042, LINE)
    else for (let x = x0 + 0.5; x < x1 - 0.6; x += 1.2) flat(x, z0, x + 0.6, z1, 0.042, LINE)
  }
  // bridges: a deck over the water and rails either side
  for (const b of CITY.bridges) {
    flat(rv[0] - 3, b.z - 5, rv[2] + 3, b.z + 5, 0.045, '#8f8a80')
    flat(rv[0] - 3, b.z - 4, rv[2] + 3, b.z + 4, 0.05, ROAD)
    for (const s of [-1, 1]) {
      box(rv[2] - rv[0] + 6, 0.16, 0.2, (rv[0] + rv[2]) / 2, 1.05, b.z + s * 5, '#d8d2c2')
      for (let x = rv[0] - 3; x <= rv[2] + 3; x += 3) box(0.22, 1.1, 0.22, x, 0.55, b.z + s * 5, '#d8d2c2')
      solid((rv[0] + rv[2]) / 2, b.z + s * 5.2, rv[2] - rv[0] + 6, 0.4)
    }
  }
  // the highway ring (west and south) with its barriers, and hills past it; the hills to the north
  flat(-360, -1400, -342, 348, 0.02, '#34353a')
  flat(-360, 332, SEA_X - 4, 348, 0.02, '#34353a')
  for (let t = -1400; t < 340; t += 12) flat(-351.1, t, -350.9, t + 5, 0.03, LINE)
  for (let t = -356; t < SEA_X - 8; t += 12) flat(t, 339.9, t + 5, 340.1, 0.03, LINE)
  box(0.5, 0.9, 640, -341, 0.45, 12, '#b9bec4')
  box(630, 0.9, 0.5, -24, 0.45, 331, '#b9bec4')
  const hill = (x, z, r, h, hex) => {
    const g = new THREE.ConeGeometry(r, h, 7, 1)
    g.rotateY(rand() * 3)
    g.translate(x, h / 2 - 2, z)
    push(colour(g, hex))
  }
  for (let i = 0; i < 13; i++) hill(-460 + i * 72 + rand() * 20, -424 - rand() * 30, 70 + rand() * 34, 46 + rand() * 30, i % 2 ? '#5f8f55' : '#6a9a58')
  for (let i = 0; i < 11; i++) hill(-430 + i * 84 + rand() * 20, -540 - rand() * 30, 100 + rand() * 30, 80 + rand() * 30, '#7fa277')
  for (let i = 0; i < 8; i++) hill(-478 - rand() * 40, -300 + i * 92, 60 + rand() * 24, 10 + rand() * 8, '#86a062')
  for (let i = 0; i < 8; i++) hill(-380 + i * 88, 470 + rand() * 40, 70 + rand() * 24, 9 + rand() * 7, '#86a062')

  // ---------- the campus, seen from the city: the fence, the ring road, the lawn, its buildings as blocks ----------
  if (!far) {
    { const ring = new THREE.RingGeometry(RING_OUT - 7, RING_OUT, 72); ring.rotateX(-Math.PI / 2); ring.translate(0, 0.03, 0); ring.userData.y = 0.03; ground.push(colour(ring, ROAD)) }
    disc(0, 0, 13, 0.05, '#d9cfb6', 24)
    flat(-4, 88, 4, 113, 0.03, ROAD) // the gate road
    const stepA = 2.5 / FENCE_R
    for (let a = 0; a < Math.PI * 2; a += stepA) {
      const x = Math.cos(a) * FENCE_R
      const z = Math.sin(a) * FENCE_R
      if (Math.abs(x) < 5 && z > 0) continue
      box(0.12, 2.4, 0.12, x, 1.2, z, '#2f3338')
      const nx = Math.cos(a + stepA / 2) * FENCE_R
      const nz = Math.sin(a + stepA / 2) * FENCE_R
      for (const y of [0.4, 2.1]) box(2.6, 0.07, 0.07, nx, y, nz, '#2f3338', -(a + stepA / 2) + Math.PI / 2)
    }
    for (const sx of [-1, 1]) { box(1, 3.4, 1, sx * 5.4, 1.7, FENCE_R, '#eadcbc'); box(1.3, 0.3, 1.3, sx * 5.4, 3.5, FENCE_R, '#8a4b32') }
    for (const b of opts.campus?.buildings || []) {
      if (b.open || b.id === 'gate') continue
      box(b.maxX - b.minX, b.h, b.maxZ - b.minZ, b.x, b.h / 2, b.z, `#${(b.house ? new THREE.Color(b.house.main) : new THREE.Color(b.color)).getHexString()}`)
      box(b.maxX - b.minX + 0.6, 0.5, b.maxZ - b.minZ + 0.6, b.x, b.h + 0.25, b.z, `#${new THREE.Color(b.roof).getHexString()}`)
    }
    for (const path of opts.campus?.paths || []) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]
        const b = path[i]
        const len = Math.hypot(b.x - a.x, b.z - a.z)
        if (len < 0.2) continue
        const g = new THREE.PlaneGeometry(len, 3.8)
        g.rotateX(-Math.PI / 2)
        g.rotateY(Math.atan2(-(b.z - a.z), b.x - a.x))
        g.translate((a.x + b.x) / 2, 0.04, (a.z + b.z) / 2)
        g.userData.y = 0.04
        ground.push(colour(g, '#e4d2b0'))
      }
    }
    for (let i = 0; i < 26; i++) {
      const a = rand() * 6.28
      const r = 30 + rand() * 66
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if ((opts.campus?.buildings || []).some((b) => x > b.minX - 3 && x < b.maxX + 3 && z > b.minZ - 3 && z < b.maxZ + 3) || (Math.abs(x) < 6 && z > 60)) continue
      put(i % 2 ? tDef : tOak, x, z, { high: 6 + rand() * 3, hit: false })
    }
    // lamps round the ring road
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 + 0.05; lamp(Math.cos(a) * (RING_OUT + 0.8), Math.sin(a) * (RING_OUT + 0.8)) }
  }

  // ---------- 2 + 3. the lots: a building, a sign and a door each ----------
  const soonCell = atlas?.cell(256, 64, board('#f0c400', '#22143b', 'OPENING SOON'))
  const SIDE = { s: [0, 1, 0], n: [0, -1, Math.PI], e: [1, 0, Math.PI / 2], w: [-1, 0, -Math.PI / 2] }
  const lotSign = (lot, x, y, z, rot, w = 9) => {
    if (!atlas) return
    const cell = atlas.cell(384, 96, board(lot.roof || '#22143b', '#ffffff', lot.sign, '', { edge: '#ffffff55' }))
    sign(cell, w, w / 4, x, y, z, rot)
  }
  const doorway = (lot, x, z, rot) => {
    // a dark door with the "Opening soon" notice on it
    const [sx, sz] = [Math.round(Math.sin(rot)), Math.round(Math.cos(rot))]
    box(sz ? 2.4 : 0.25, 2.7, sz ? 0.25 : 2.4, x, 1.35, z, '#2a2233')
    if (soonCell) sign(soonCell, 2.2, 0.55, x + sx * 0.16, 1.7, z + sz * 0.16, rot, false)
    doors.push({ lot: lot.id, x: x + sx * 0.5, z: z + sz * 0.5 })
  }
  const windowsRow = (cx, cz, len, y, rot, n, hex = '#9cc8de') => {
    const [sx, sz] = [Math.round(Math.sin(rot)), Math.round(Math.cos(rot))]
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5
      if (Math.abs(t * len) < 2.2) continue // (the door)
      box(sz ? (len / n) * 0.6 : 0.12, 1.3, sz ? 0.12 : (len / n) * 0.6, cx + (sz ? t * len : 0) + sx * 0.04, y, cz + (sx ? t * len : 0) + sz * 0.04, hex, 0, glass)
    }
  }
  const building = (lot) => {
    const { x, z, w, d, h } = lot
    const [sx, sz, rot] = SIDE[lot.side]
    box(w, h, d, x, h / 2, z, lot.wall)
    box(w + 0.8, 0.5, d + 0.8, x, h + 0.25, z, lot.roof)
    solid(x, z, w, d)
    const fx = x + sx * (w / 2)
    const fz = z + sz * (d / 2)
    const faceLen = sz ? w : d
    doorway(lot, fx + sx * 0.08, fz + sz * 0.08, rot)
    windowsRow(fx, fz, faceLen * 0.86, Math.min(2.2, h * 0.45), rot, Math.max(3, Math.round(faceLen / 4)))
    if (h > 6.4) windowsRow(fx, fz, faceLen * 0.86, h * 0.72, rot, Math.max(3, Math.round(faceLen / 4)))
    // an awning over the door, and the sign on the wall above it
    box(sz ? 4.4 : 1.6, 0.18, sz ? 1.6 : 4.4, fx + sx * 0.8, 3.0, fz + sz * 0.8, lot.roof)
    lotSign(lot, fx + sx * 0.12, Math.max(3.9, h - 1.3), fz + sz * 0.12, rot, Math.min(faceLen * 0.8, 11))
    return { fx, fz, sx, sz, rot, faceLen }
  }
  const looks = {
    block: building,
    shop(lot) {
      const f = building(lot)
      for (const t of [-1, 1]) box(0.12, 3, 0.12, f.fx + f.sx * 1.5 + (f.sz ? t * 2 : 0), 1.5, f.fz + f.sz * 1.5 + (f.sx ? t * 2 : 0), '#f6f2ea')
    },
    columns(lot) {
      const f = building(lot)
      for (let i = 0; i < 4; i++) {
        const t = (i - 1.5) * (f.faceLen / 5)
        if (Math.abs(t) < 1.6) continue
        cyl(0.45, 0.5, lot.h - 0.6, f.fx + f.sx * 1.3 + (f.sz ? t : 0), (lot.h - 0.6) / 2, f.fz + f.sz * 1.3 + (f.sx ? t : 0), '#f6f2ea', 10)
      }
      for (const t of [-1.5, 1.5]) solid(f.fx + f.sx * 1.3 + (f.sz ? t * (f.faceLen / 5) : 0), f.fz + f.sz * 1.3 + (f.sx ? t * (f.faceLen / 5) : 0), 1, 1)
      box(f.sz ? f.faceLen * 0.9 : 2.2, 0.7, f.sz ? 2.2 : f.faceLen * 0.9, f.fx + f.sx * 0.9, lot.h - 0.1, f.fz + f.sz * 0.9, '#f6f2ea')
    },
    mall(lot) {
      const f = building(lot)
      // a second storey block, a wide canopy on columns, a parking apron with marked bays and parked cars
      box(lot.w * 0.5, 4, lot.d * 0.6, lot.x - lot.w * 0.15, lot.h + 2, lot.z - 2, '#e6dfd0')
      box(16, 0.4, 5, f.fx, 4.3, f.fz + 2.6, lot.roof)
      for (const t of [-7, 7]) { box(0.5, 4.2, 0.5, f.fx + t, 2.1, f.fz + 4.8, '#f6f2ea'); solid(f.fx + t, f.fz + 4.8, 0.7, 0.7) }
      flat(lot.x - 30, lot.z + lot.d / 2 + 6.5, lot.x + 30, 208.4, 0.022, '#45474c')
      for (let i = 0; i <= 12; i++) flat(lot.x - 27 + i * 4.5 - 0.07, 203.2, lot.x - 27 + i * 4.5 + 0.07, 208, 0.03, LINE)
      ;[[-22.5, 0], [-9, 1], [13.5, 2], [22.5, 3]].forEach(([dx, k]) => put(cars[k % cars.length], lot.x + dx - 2.25, 205.7, { scale: 1.6, tint: ['#ffffff', '#9fb4d0', '#f2b0a0', '#d8d8d8'][k] }))
    },
    church(lot) {
      const f = building(lot)
      // a pitched roof, a steeple and a cross
      const roof = new THREE.CylinderGeometry(0.01, lot.w * 0.72, 4, 4, 1)
      roof.rotateY(Math.PI / 4)
      roof.scale(1, 1, lot.d / lot.w)
      roof.translate(lot.x, lot.h + 2.4, lot.z)
      push(colour(roof, lot.roof))
      box(4.4, lot.h + 7, 4.4, lot.x, (lot.h + 7) / 2, lot.z + lot.d / 2 - 2.4, lot.wall)
      const spire = new THREE.ConeGeometry(3.3, 6, 4)
      spire.rotateY(Math.PI / 4)
      spire.translate(lot.x, lot.h + 10, lot.z + lot.d / 2 - 2.4)
      push(colour(spire, lot.roof))
      box(0.3, 2.6, 0.3, lot.x, lot.h + 14.2, lot.z + lot.d / 2 - 2.4, '#f0c400')
      box(1.5, 0.3, 0.3, lot.x, lot.h + 14.6, lot.z + lot.d / 2 - 2.4, '#f0c400')
      void f
    },
    showroom(lot) {
      const f = building(lot)
      box(lot.w * 0.9, 3.2, 0.2, lot.x, 1.9, f.fz + 0.12, '#8fc4e0', 0, glass)
      // the forecourt: cars with a history, bunting poles
      flat(lot.x - 20, f.fz + 1, lot.x + 20, f.fz + 9.5, 0.022, '#55585e')
      ;[[-13, '#d6452f'], [-6.5, '#f4f1e6'], [7, '#2456a6'], [13.5, '#f0c400']].forEach(([dx, tint], k) => put(cars[(k + 1) % cars.length], lot.x + dx, f.fz + 5.6, { scale: 1.6, tint, rot: 0.25 }))
      for (const t of [-19, 19]) box(0.14, 5, 0.14, lot.x + t, 2.5, f.fz + 9, '#f6f2ea')
      for (let i = 0; i < 12; i++) box(0.9, 0.5, 0.05, lot.x - 17.5 + i * 3.2, 4.5 - Math.sin((i / 11) * Math.PI) * 0.8, f.fz + 9, ['#d6452f', '#f0c400', '#2456a6', '#2f8f5b'][i % 4])
    },
    market(lot) {
      const f = building(lot)
      box(lot.w + 0.4, 1.4, 0.5, lot.x, lot.h - 0.9, f.fz + 0.2, lot.roof)
      box(12, 0.35, 4.5, f.fx, 3.6, f.fz + 2.4, lot.roof)
      for (const t of [-5.4, 5.4]) { box(0.4, 3.5, 0.4, f.fx + t, 1.75, f.fz + 4.3, '#f6f2ea'); solid(f.fx + t, f.fz + 4.3, 0.6, 0.6) }
      // trolleys in a bay, a parking apron
      for (let i = 0; i < 5; i++) box(0.7, 0.9, 1.0, f.fx + 9 + i * 0.75, 0.55, f.fz + 1.2, '#b9bec4')
      solid(f.fx + 10.5, f.fz + 1.2, 4, 1.2)
      flat(lot.x - 20, f.fz + 6, lot.x + 20, -134.6, 0.022, '#45474c')
      for (let i = 0; i <= 8; i++) flat(lot.x - 18 + i * 4.5 - 0.07, f.fz + 7, lot.x - 18 + i * 4.5 + 0.07, -135.2, 0.03, LINE)
      ;[[-15.75, 0], [-2.25, 2], [11.25, 1]].forEach(([dx, k]) => put(cars[k], lot.x + dx, f.fz + 10.2, { scale: 1.6, tint: ['#ffffff', '#b8d8b0', '#d8d8d8'][k] }))
    },
    arcade(lot) {
      const f = building(lot)
      // three giant bowling pins and a ball on the roof, a neon band
      box(lot.w + 0.3, 0.5, 0.4, lot.x, lot.h - 2.2, f.fz + 0.16, '#f0c400', 0, glass)
      for (const t of [-3, 0, 3]) {
        cyl(0.5, 1.0, 3.2, lot.x + 10 + t, lot.h + 2.1, lot.z + 2, '#ffffff', 10)
        cyl(0.55, 0.52, 0.45, lot.x + 10 + t, lot.h + 3.2, lot.z + 2, '#d6452f', 10)
        const head = new THREE.SphereGeometry(0.62, 10, 8)
        head.translate(lot.x + 10 + t, lot.h + 4.2, lot.z + 2)
        push(colour(head, '#ffffff'))
      }
      const ball = new THREE.SphereGeometry(1.7, 12, 10)
      ball.translate(lot.x - 11, lot.h + 2.1, lot.z + 2)
      push(colour(ball, '#22143b'))
    },
    beach(lot) {
      // the way onto the sand: an arch with the sign, a lifeguard tower, parasols and towels along the beach
      const [ax, az] = lot.at
      for (const t of [-5, 5]) { box(0.5, 5, 0.5, ax, 2.5, az + t, '#f6f2ea'); solid(ax, az + t, 0.7, 0.7) }
      box(0.5, 0.6, 10.8, ax, 5.2, az, lot.roof)
      lotSign(lot, ax, 4.1, az, Math.PI / 2, 8.4)
      if (soonCell) sign(soonCell, 2.6, 0.65, ax, 2.9, az, Math.PI / 2)
      doors.push({ lot: lot.id, x: ax, z: az })
      box(2.6, 0.2, 2.6, 276, 3.2, az + 16, '#f6f2ea'); box(2.4, 1.2, 2.4, 276, 3.9, az + 16, '#d6452f'); box(2.9, 0.2, 2.9, 276, 4.6, az + 16, '#f6f2ea')
      for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) box(0.16, 3.2, 0.16, 276 + dx, 1.6, az + 16 + dz, '#8a5a3a')
      solid(276, az + 16, 2.6, 2.6)
      for (let i = 0; i < 26; i++) {
        const px = 258 + rand() * 30
        const pz = -280 + i * 22.5 + rand() * 8
        if (Math.abs(pz - az) < 7) continue
        const hue = ['#d6452f', '#f0c400', '#1d7fb8', '#e8497a', '#2f8f5b'][i % 5]
        box(0.08, 2.2, 0.08, px, 1.1, pz, '#f6f2ea')
        const top = new THREE.ConeGeometry(1.5, 0.7, 8)
        top.translate(px, 2.35, pz)
        push(colour(top, hue))
        flat(px + 0.4, pz + 0.6, px + 1.3, pz + 2.5, 0.02, i % 2 ? '#ffffff' : hue)
      }
    },
    park(lot) {
      const [x0, z0, x1, z1] = lot.area
      flat(x0, z0, x1, z1, 0.02, '#5fa052')
      flat(lot.at[0] - 1.6, z0, lot.at[0] + 1.6, z1 + 40, 0.024, '#e4d2b0')
      flat(x0, (z0 + z1) / 2 - 1.4, x1, (z0 + z1) / 2 + 1.4, 0.024, '#e4d2b0')
      disc(lot.x + 16, lot.z - 18, 8, 0.03, '#3f8fb5')
      disc(lot.x + 16, lot.z - 18, 9, 0.026, '#d9cfb6')
      for (let i = 0; i < 18; i++) {
        const tx = x0 + 3 + rand() * (x1 - x0 - 6)
        const tz = z0 + 3 + rand() * (z1 - z0 - 6)
        if (Math.abs(tx - lot.at[0]) < 3 || Math.abs(tz - (z0 + z1) / 2) < 3 || Math.hypot(tx - lot.x - 16, tz - lot.z + 18) < 10) continue
        tree(i % 3 ? tOak : tDef, tx, tz, 6 + rand() * 3)
      }
      for (const [bx, bz] of [[lot.at[0] + 3.2, lot.z + 8], [lot.at[0] - 3.2, lot.z - 8], [lot.x + 6, (z0 + z1) / 2 + 2.6]]) { box(2, 0.12, 0.6, bx, 0.5, bz, '#8a5a3a'); box(2, 0.5, 0.1, bx, 0.8, bz - 0.28, '#8a5a3a'); solid(bx, bz, 2, 0.7) }
      // the gate: two posts, a beam, the sign
      const [gx, gz] = lot.at
      for (const t of [-3, 3]) { box(0.5, 4, 0.5, gx + t, 2, gz - 2, '#f6f2ea'); solid(gx + t, gz - 2, 0.7, 0.7) }
      box(6.6, 0.5, 0.5, gx, 4.1, gz - 2, lot.roof)
      lotSign(lot, gx, 3.3, gz - 2, 0, 5.6)
      if (soonCell) sign(soonCell, 2.4, 0.6, gx, 2.4, gz - 2, 0)
      doors.push({ lot: lot.id, x: gx, z: gz })
    },
    rank(lot) {
      const [x0, z0, x1, z1] = lot.area
      flat(x0, z0, x1, z1 + 10, 0.022, '#8c8a84')
      for (const sz of [z0 + 7, z0 + 22]) {
        box(40, 0.25, 4, (x0 + x1) / 2, 3.2, sz, lot.roof)
        for (let t = -18; t <= 18; t += 9) { box(0.18, 3.2, 0.18, (x0 + x1) / 2 + t, 1.6, sz + 1.6, '#2f3338'); solid((x0 + x1) / 2 + t, sz + 1.6, 0.4, 0.4) }
        box(36, 0.12, 0.6, (x0 + x1) / 2, 0.5, sz + 1.2, '#8a5a3a')
        solid((x0 + x1) / 2, sz + 1.2, 36, 0.7)
      }
      ;[-16, -6, 4, 14].forEach((dx, k) => put(van, (x0 + x1) / 2 + dx, z0 + 14.5, { scale: 1.75, rot: Math.PI / 2 + (k % 2 ? 0.1 : -0.06), tint: k === 2 ? '#fff3c4' : '#ffffff' }))
      const [gx, gz] = lot.at
      for (const t of [-4.6, 4.6]) box(0.3, 5, 0.3, gx + t, 2.5, gz - 3, '#2f3338')
      lotSign(lot, gx, 4.3, gz - 3, 0, 9)
      if (soonCell) sign(soonCell, 2.6, 0.65, gx, 2.9, gz - 3, 0)
      doors.push({ lot: lot.id, x: gx, z: gz })
    },
    petrol(lot) {
      const [x0, z0, x1, z1] = lot.area
      flat(x0, z0 - 4, x1, z1, 0.022, '#55585e')
      // the canopy over four pumps, the shop, the car wash bay
      const cx = lot.x + 6
      const cz = lot.z - 12
      box(26, 0.7, 12, cx, 5.4, cz, lot.wall)
      box(26.2, 0.3, 12.2, cx, 4.95, cz, lot.roof)
      for (const [dx, dz] of [[-11, -4], [11, -4], [-11, 4], [11, 4]]) { box(0.5, 5, 0.5, cx + dx, 2.5, cz + dz, '#f6f2ea'); solid(cx + dx, cz + dz, 0.7, 0.7) }
      for (const dx of [-6, -2, 2, 6]) { box(0.9, 1.7, 0.6, cx + dx, 0.85, cz, lot.roof); box(0.7, 0.5, 0.62, cx + dx, 1.35, cz, '#f6f2ea'); solid(cx + dx, cz, 1.1, 0.8) }
      box(18, 4, 9, lot.x + 8, 2, lot.z + 14, lot.wall); box(18.6, 0.5, 9.6, lot.x + 8, 4.25, lot.z + 14, lot.roof); solid(lot.x + 8, lot.z + 14, 18, 9)
      windowsRow(lot.x + 8, lot.z + 9.5, 15, 2, Math.PI, 5)
      box(7, 4.2, 12, lot.x - 20, 2.1, lot.z + 10, '#cfd8dc'); box(5, 3.2, 12.2, lot.x - 20, 1.6, lot.z + 10, '#1d7fb8'); solid(lot.x - 23.2, lot.z + 10, 0.8, 12); solid(lot.x - 16.8, lot.z + 10, 0.8, 12)
      if (atlas) sign(atlas.cell(256, 64, board('#1d7fb8', '#ffffff', 'CAR WASH')), 5, 1.25, lot.x - 20, 4.9, lot.z + 3.9, Math.PI)
      const [gx, gz] = lot.at
      box(0.5, 7, 0.5, gx - 24, 3.5, gz + 1.5, '#f6f2ea'); solid(gx - 24, gz + 1.5, 0.7, 0.7)
      lotSign(lot, gx - 24, 6.4, gz + 1.5, Math.PI, 6)
      lotSign(lot, cx, 5.4, cz - 6.1, Math.PI, 12)
      if (soonCell) sign(soonCell, 2.6, 0.65, cx, 3.6, cz - 4.3, Math.PI)
      doors.push({ lot: lot.id, x: gx, z: gz })
    },
    stadium(lot) {
      // an oval of stepped stands round a pitch, four floodlight masts
      const { x, z } = lot
      const g0 = new THREE.CircleGeometry(1, 32)
      g0.rotateX(-Math.PI / 2); g0.scale(22, 1, 33); g0.translate(x, 0.03, z)
      g0.userData.y = 0.03
      ground.push(colour(g0, '#4f9a4f'))
      const ln = new THREE.RingGeometry(0.96, 1, 32)
      ln.rotateX(-Math.PI / 2); ln.scale(18, 1, 28); ln.translate(x, 0.04, z)
      ln.userData.y = 0.04
      ground.push(colour(ln, LINE))
      flat(x - 18, z - 0.12, x + 18, z + 0.12, 0.04, LINE)
      const N = 22
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        if (Math.abs(a) < 0.2 || Math.abs(a - Math.PI * 2) < 0.2) continue // (the entrance, on the east)
        const px = x + Math.cos(a) * 27
        const pz = z + Math.sin(a) * 38
        const len = 11.5
        const rot = -Math.atan2(Math.cos(a) * 38, -Math.sin(a) * 27)
        for (let s = 0; s < 3; s++) box(len, 2.2 + s * 2.2, 2.2, x + Math.cos(a) * (25 + s * 2.2), (2.2 + s * 2.2) / 2, z + Math.sin(a) * (36 + s * 2.2), s === 2 ? lot.roof : lot.wall, rot)
        solid(px, pz, 6.5, 6.5)
      }
      for (const [dx, dz] of [[-28, -40], [28, -40], [-28, 40], [28, 40]]) { box(0.5, 20, 0.5, x + dx * 0.95, 10, z + dz * 0.95, '#b9bec4'); box(3.4, 1.8, 0.5, x + dx * 0.95, 20.5, z + dz * 0.95, '#fff7dc', Math.atan2(dx, dz), glass); solid(x + dx * 0.95, z + dz * 0.95, 0.8, 0.8) }
      const [gx, gz] = lot.at
      for (const t of [-5, 5]) { box(0.6, 5.5, 0.6, gx - 3, 2.75, gz + t, '#f6f2ea'); solid(gx - 3, gz + t, 0.8, 0.8) }
      box(0.6, 0.7, 10.6, gx - 3, 5.8, gz, lot.roof)
      lotSign(lot, gx - 3, 4.6, gz, Math.PI / 2, 8.6)
      if (soonCell) sign(soonCell, 2.6, 0.65, gx - 3, 3.3, gz, Math.PI / 2)
      doors.push({ lot: lot.id, x: gx, z: gz })
    },
    yard(lot) {
      // the driving school: a fenced tarmac yard, cones in a slalom and a parking box, the office, the learner's car
      const [x0, z0, x1, z1] = lot.area
      flat(x0, z0, x1, z1, 0.022, '#55585e')
      for (let i = 0; i < 9; i++) cone(x0 + 10 + i * 5, z0 + 22 + (i % 2 ? 2.4 : -2.4))
      for (const [dx, dz] of [[0, 0], [5, 0], [0, 9], [5, 9], [0, 4.5], [5, 4.5]]) cone(x0 + 14 + dx, z0 + 44 + dz)
      for (let i = 0; i < 6; i++) cone(x0 + 34 + i * 3.2, z0 + 50 + Math.sin(i * 1.1) * 3)
      flat(x0 + 13, z0 + 43.2, x0 + 20, z0 + 43.4, 0.03, LINE); flat(x0 + 13, z0 + 53.6, x0 + 20, z0 + 53.8, 0.03, LINE)
      box(12, 3.6, 7, x1 - 9, 1.8, z0 + 7, lot.wall); box(12.6, 0.4, 7.6, x1 - 9, 3.8, z0 + 7, lot.roof); solid(x1 - 9, z0 + 7, 12, 7)
      windowsRow(x1 - 9, z0 + 10.5, 10, 1.9, 0, 4)
      put(hatch, x0 + 30, z0 + 30, { scale: 1.6, rot: 0.5, tint: '#f4f1e6' })
      box(0.7, 0.45, 0.05, x0 + 30, 2.0, z0 + 30, '#d6452f')
      // the fence, open on the east (the entrance)
      for (const [fx, fz, fw, fd] of [[(x0 + x1) / 2, z0, x1 - x0, 0.15], [(x0 + x1) / 2, z1, x1 - x0, 0.15], [x0, (z0 + z1) / 2, 0.15, z1 - z0], [x1, z0 + 14, 0.15, 28], [x1, z1 - 14, 0.15, 28]]) {
        box(fw, 0.08, fd, fx, 1.5, fz, '#2f3338'); box(fw, 0.08, fd, fx, 0.7, fz, '#2f3338'); solid(fx, fz, fw + 0.2, fd + 0.2)
      }
      const [gx, gz] = lot.at
      for (const t of [-5, 5]) box(0.4, 5, 0.4, gx - 2, 2.5, gz + t, '#2f3338')
      lotSign(lot, gx - 2, 4.4, gz, Math.PI / 2, 8.6)
      if (soonCell) sign(soonCell, 2.6, 0.65, gx - 2, 3.1, gz, Math.PI / 2)
      doors.push({ lot: lot.id, x: gx, z: gz })
    },
  }
  function cone(x, z) {
    const g = new THREE.ConeGeometry(0.22, 0.6, 6)
    g.translate(x, 0.3, z)
    push(colour(g, '#f08a24'))
  }
  for (const lot of LOTS) (looks[lot.look] || looks.block)(lot)

  // wave 2: a fenced, empty plot with a board
  for (const lot of WAVE2) {
    const { x, z } = lot
    const part = PARTS.find((p) => p.id === lot.part)
    flat(x - PLOT.w / 2, z - PLOT.d / 2, x + PLOT.w / 2, z + PLOT.d / 2, 0.021, part.id === 'township' ? '#a9764a' : '#9a8f78')
    for (const [fx, fz, fw, fd] of [[x, z - PLOT.d / 2, PLOT.w, 0.1], [x - PLOT.w / 2, z, 0.1, PLOT.d], [x + PLOT.w / 2, z, 0.1, PLOT.d], [x - PLOT.w / 4 - 1.5, z + PLOT.d / 2, PLOT.w / 2 - 3, 0.1], [x + PLOT.w / 4 + 1.5, z + PLOT.d / 2, PLOT.w / 2 - 3, 0.1]]) {
      box(fw, 0.08, fd, fx, 1.1, fz, '#f0c400'); box(fw, 0.08, fd, fx, 0.55, fz, '#f0c400'); solid(fx, fz, fw + 0.2, fd + 0.2)
    }
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.16, 1.3, 0.16, x + cx * PLOT.w / 2, 0.65, z + cz * PLOT.d / 2, '#22143b')
    for (const t of [-2.6, 2.6]) box(0.18, 3.6, 0.18, x + t, 1.8, z + PLOT.d / 2 - 1.5, '#8a5a3a')
    if (atlas) sign(atlas.cell(384, 144, board('#22143b', '#f0c400', 'COMING SOON', lot.name.toUpperCase(), { edge: '#f0c400' })), 6, 2.25, x, 3, z + PLOT.d / 2 - 1.5, 0)
    solid(x, z + PLOT.d / 2 - 1.5, 6, 0.4)
    doors.push({ lot: lot.id, x: lot.door.x, z: lot.door.z })
  }

  // ---------- 7. billboards along the main roads ----------
  const BILLBOARDS = [
    [-12, 168, 0], [12, 262, 0], [-12, 318, 0], [70, 122.5, Math.PI / 2], [-90, 137.5, Math.PI / 2], [146, 60, 0],
    [162, -150, 0], [-146, 207.5, Math.PI / 2], [-290, 222.5, Math.PI / 2], [-232, -7.5, Math.PI / 2], [-80, -122.5, Math.PI / 2], [12, -180, 0],
  ]
  if (!far) {
    BILLBOARDS.forEach(([x, z, rot], i) => {
      const ad = (opts.ads || [])[i]
      if (!ad) return
      const along = Math.abs(Math.sin(rot)) > 0.5
      for (const t of [-3, 3]) { box(0.3, 7.4, 0.3, x + (along ? 0 : t), 3.7, z + (along ? t : 0), '#2f3338'); solid(x + (along ? 0 : t), z + (along ? t : 0), 0.5, 0.5) }
      box(along ? 0.3 : 8.4, 4.4, along ? 8.4 : 0.3, x, 5.6, z, '#1c1915')
      const cell = atlas.cell(384, 192, board(ad.bg || '#22143b', ad.fg || '#ffffff', ad.brand, ad.line || '', { edge: ad.fg || '#ffffff' }))
      sign(cell, 8, 4, x, 5.6, z, rot, true, 0.17)
      if (ad.image) {
        const img = new Image()
        img.onload = () => cell.redraw?.((g, cx, cy, w, h) => g.drawImage(img, cx, cy, w, h))
        img.src = ad.image
      }
      boards.push({ i, x, z, ad })
    })
  }

  // ---------- the districts' own streets ----------
  const free = (x, z, r) => !solids.some((s) => x > s.minX - r && x < s.maxX + r && z > s.minZ - r && z < s.maxZ + r)
    && !CITY.roads.some((rd) => x > rd.rect[0] - r - 2 && x < rd.rect[2] + r + 2 && z > rd.rect[1] - r - 2 && z < rd.rect[3] + r + 2)
    && !LOTS.some((l) => l.area && x > l.area[0] - r && x < l.area[2] + r && z > l.area[1] - r && z < l.area[3] + r)
    && !WAVE2.some((l) => Math.abs(x - l.x) < PLOT.w / 2 + r + 2 && Math.abs(z - l.z) < PLOT.d / 2 + r + 4)
    && !LOTS.some((l) => Math.hypot(l.door.x - x, l.door.z - z) < r + 5)
    && !STOPS.some((s) => Math.hypot(s.x - x, s.z - z) < r + 5)
    && Math.hypot(x, z) > RING_OUT + r + 2
    && !(x > rv[0] - r - 3 && x < rv[2] + r + 3)

  // Town centre: blocks of flats and shops along Varsity Road and Market Street, a tower or two
  const townSpots = [
    [16, 150, bE, 15, -Math.PI / 2], [16, 172, lowC, 14, -Math.PI / 2], [52, 147, lowA, 16, 0], [120, 147, lowB, 16, 0], [-16, 152, bH, 14, Math.PI / 2], [-16, 172, lowB, 13, Math.PI / 2], [-56, 148, lowC, 15, 0], [-96, 148, wideA, 20, 0], [-136, 148, lowD, 14, 0],
    [16, 232, lowB, 14, -Math.PI / 2], [16, 266, lowA, 14, -Math.PI / 2], [16, 306, bG, 15, -Math.PI / 2], [76, 232, sky, 15, 0], [76, 290, wideB, 22, 0], [116, 232, lowA, 16, 0], [124, 294, lowC, 15, 0],
    [-18, 266, lowC, 13, Math.PI / 2], [-18, 312, lowD, 13, Math.PI / 2], [-60, 232, lowA, 16, 0], [-76, 290, lowA, 16, 0], [-124, 232, wideA, 22, 0], [-120, 296, sky, 14, 0], [140, 196, lowC, 12, 0],
  ]
  for (const [x, z, m, fit, rot] of townSpots) if (m && free(x, z, fit / 2 - 2)) put(m, x, z, { fit, rot })
  for (let i = 0; i < 16; i++) { const z = 142 + i * 12; if (z > 205 && z < 225) continue; for (const x of [-7.5, 7.5]) if (free(x, z, -2.2)) tree(subTree || tDef, x, z, 5) }

  // Suburbs: houses with gardens along Oak Avenue and Crescent Road, hedges, big trees
  if (houses.length) {
    let k = 0
    const house = (x, z, rot) => {
      if (!free(x, z, 6)) return
      if (far) blockHouse(x, z, 10, 9, 5, SUB_PAINT[k % 4], k % 2 ? '#4f7a5a' : '#8a4b32')
      else put(houses[k % houses.length], x, z, { fit: 11, rot })
      k++
      flat(x - 8, z - 8, x + 8, z + 8, 0.012, k % 2 ? '#5d9a55' : '#57944f')
    }
    for (let z = -150; z > -290; z -= 19) { if (Math.abs(z + 215) < 14) continue; house(-14, z, Math.PI / 2); house(14, z, -Math.PI / 2) }
    for (let x = -140; x <= 140; x += 20) { if (Math.abs(x) < 26) continue; house(x, -202, 0); house(x, -228, Math.PI) }
    for (let x = -140; x <= 140; x += 20) { if (Math.abs(x) < 26) continue; house(x, -278, 0) }
    for (let x = -128; x <= -100; x += 20) house(x, -146, 0)
  }
  for (let i = 0; i < 60; i++) { const x = -150 + rand() * 296; const z = -292 + rand() * 152; if (free(x, z, 1.5)) tree(i % 2 ? tOak : tDef, x, z, 6 + rand() * 4) }

  // Township: small bright houses close together, a water tower, a high mast light, a spaza
  if (townKit.some(Boolean)) {
    let k = 0
    const home = (x, z, rot) => {
      if (!free(x, z, 4.5)) return
      if (far) blockHouse(x, z, 7.5, 7, 3.4, TOWN_PAINT[k % TOWN_PAINT.length], TOWN_ROOF[k % TOWN_ROOF.length])
      else put(townKit[k % townKit.length], x, z, { fit: k % 5 === 4 ? 6.5 : 8, rot })
      flat(x - 5.5, z - 5.5, x + 5.5, z + 5.5, 0.012, '#b98252')
      k++
    }
    for (let z = -284; z < 92; z += 28) { if (Math.abs(z) < 16 || Math.abs(z + 150) < 16) continue; home(-248, z, Math.PI / 2); home(-272, z, -Math.PI / 2) }
    for (let x = -324; x < -186; x += 24) { if (Math.abs(x + 260) < 18) continue; home(x, 13, Math.PI); home(x, -13, 0); home(x, -137, Math.PI); home(x, -163, 0) }
  }
  // (tin-roof rooms between the houses: boxes, bright walls, grey roofs)
  for (let i = 0; i < 70; i++) {
    const x = -332 + rand() * 148
    const z = -290 + rand() * 380
    if (!free(x, z, 3.2)) continue
    const w = 3.6 + rand() * 1.6
    const d = 3.2 + rand() * 1.4
    box(w, 2.5, d, x, 1.25, z, TOWN_PAINT[i % TOWN_PAINT.length])
    box(w + 0.5, 0.14, d + 0.5, x, 2.62, z, TOWN_ROOF[i % TOWN_ROOF.length])
    box(0.9, 1.9, 0.1, x, 0.95, z + d / 2 + 0.03, '#5a3a26')
    solid(x, z, w, d)
  }
  cyl(3.2, 3.2, 3.4, -300, 13, -100, '#cfd8dc', 12); for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(0.3, 11.4, 0.3, -300 + dx, 5.7, -100 + dz, '#8d969c'); solid(-300, -100, 5, 5)
  box(0.4, 26, 0.4, -236, 13, -100, '#b9bec4'); cyl(1.8, 1.8, 0.5, -236, 26, -100, '#fff7dc', 10, glass); solid(-236, -100, 0.8, 0.8)
  if (atlas && free(-236, 26, 3)) { box(7, 3, 5, -236, 1.5, 26, '#1f7a3a'); box(7.6, 0.2, 5.6, -236, 3.1, 26, '#8d969c'); solid(-236, 26, 7, 5); sign(atlas.cell(256, 64, board('#1f7a3a', '#ffffff', 'SPAZA · AIRTIME · BREAD')), 6, 1.5, -236, 3.9, 28.6, 0) }
  for (let i = 0; i < 16; i++) { const x = -330 + rand() * 144; const z = -290 + rand() * 380; if (free(x, z, 1.5)) tree(tDef, x, z, 4.5 + rand() * 2) }
  // a street football pitch
  if (free(-300, 60, 10)) { flat(-314, 48, -286, 72, 0.014, '#b07a4a'); for (const gx of [-313, -287]) { box(0.12, 2, 0.12, gx, 1, 57, '#f6f2ea'); box(0.12, 2, 0.12, gx, 1, 63, '#f6f2ea'); box(0.12, 0.12, 6, gx, 2, 60, '#f6f2ea') } }

  // Industrial: warehouses with saw-tooth roofs, stacked containers, chimneys, a fence line, trucks
  for (const [x, z, w, d] of [[-214, 304, 44, 26], [-300, 110, 0, 0], [-196, 112, 0, 0], [-304, 216, 0, 0]]) {
    if (!w || !free(x, z, 14)) continue
    box(w, 8, d, x, 4, z, '#aab0b6')
    for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(0.01, 4.4, w, 3, 1); g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1); g.translate(x, 9, z - d / 2 + 3.3 + i * (d / 4)); push(colour(g, '#7f868d')) }
    box(5, 4.4, 0.2, x - 10, 2.2, z - d / 2 - 0.05, '#55585e'); box(5, 4.4, 0.2, x + 8, 2.2, z - d / 2 - 0.05, '#55585e')
    solid(x, z, w, d)
  }
  for (const [x, z] of [[-200, 292], [-186.5, 300], [-322, 212], [-200, 126]]) { if (!free(x, z, 1.5)) continue; cyl(1.1, 1.5, 22, x, 11, z, '#9a6a5a', 10); cyl(1.2, 1.2, 1, x, 21, z, '#d6452f', 10); solid(x, z, 3, 3) }
  for (let i = 0; i < 26; i++) {
    const x = -330 + rand() * 60
    const z = 106 + rand() * 12 + (i > 12 ? 104 : 0)
    if (!free(x, z, 3.6)) continue
    const n = 1 + Math.floor(rand() * 3)
    for (let s = 0; s < n; s++) box(6.1, 2.6, 2.44, x, 1.3 + s * 2.62, z, CONTAINER[(i + s) % CONTAINER.length], i % 4 === 0 ? Math.PI / 2 : 0)
    solid(x, z, 6.2, 6.2)
  }
  if (truck) { for (const [x, z, r] of [[-246, 300, 0], [-192, 232, Math.PI / 2], [-246, 150, Math.PI]]) if (free(x, z, 2.6)) put(truck, x, z, { scale: 1.75, rot: r }) }

  // Beachfront: pastel blocks along Marine Drive, palms down the promenade and the drive
  for (let z = -280; z <= 310; z += 24) {
    const x = 196
    if (!free(x, z, 9)) continue
    const m = [lowA, lowC, wideA, lowB][Math.abs(Math.round(z / 24)) % 4]
    put(m, x, z, { fit: 17, rot: Math.PI / 2, tint: BEACH_PAINT[Math.abs(Math.round(z / 24)) % BEACH_PAINT.length] })
  }
  for (let z = -288; z <= 320; z += 13) {
    if (Math.abs(z) > 8 && Math.abs(z - 114) > 8) tree(Math.round(z / 13) % 2 ? palmT : palmB, PROM[0] + 2.2, z, 9)
    if (free(161.5, z, -2.4)) tree(palmT, 161.5, z, 8)
  }
  for (let z = -270; z <= 310; z += 58) { box(2.2, 0.12, 0.6, 247, 0.5, z, '#8a5a3a'); box(2.2, 0.5, 0.1, 247, 0.8, z + 0.28, '#8a5a3a'); solid(247, z, 2.2, 0.7) }

  // the campus corners past the ring road: lawns and trees
  for (let i = 0; i < 40; i++) { const x = -150 + rand() * 292; const z = -120 + rand() * 240; if (Math.hypot(x, z) > RING_OUT + 6 && free(x, z, 1.5)) tree(i % 2 ? tOak : tDef, x, z, 6 + rand() * 3) }

  // ---------- the family homes' streets (day 1's home scene stays its own scene: here, a signed street) ----------
  for (const h of HOMES) {
    if (far) continue
    box(0.14, 3, 0.14, h.x, 1.5, h.z, '#2f3338')
    solid(h.x, h.z, 0.4, 0.4)
    sign(atlas.cell(256, 80, board('#2c6a9a', '#ffffff', h.sign, 'FAMILY HOMES')), 3.2, 1, h.x, 3.2, h.z, 0)
  }

  // ---------- taxi stops: a shelter, a sign, a minibus taxi waiting ----------
  for (const s of STOPS) {
    if (far) continue
    if (s.id !== 'rank') {
      flat(s.x - 5, s.z - 1.6, s.x + 5, s.z + 2.6, 0.024, '#8c8a84')
      box(8, 0.2, 2.6, s.x, 3, s.z + 1.4, '#c62828')
      for (const t of [-3.7, 3.7]) { box(0.16, 3, 0.16, s.x + t, 1.5, s.z + 2.5, '#2f3338'); solid(s.x + t, s.z + 2.5, 0.4, 0.4) }
      box(6, 0.12, 0.6, s.x, 0.5, s.z + 2.1, '#8a5a3a'); solid(s.x, s.z + 2.1, 6, 0.7)
      sign(atlas.cell(256, 64, board('#f0c400', '#22143b', 'TAXI', s.name.toUpperCase())), 3.6, 0.9, s.x, 3.6, s.z + 1.4, 0)
    }
    put(van, s.van[0], s.van[1], { scale: 1.75, rot: s.van[2] })
  }

  // ---------- district signs where a road crosses a border, the welcome sign at the campus road ----------
  if (!far) {
    const border = (name, x, z, rot) => {
      box(0.16, 4.4, 0.16, x, 2.2, z, '#2f3338'); solid(x, z, 0.4, 0.4)
      sign(atlas.cell(256, 64, board('#1f6b4a', '#ffffff', name.toUpperCase())), 4.4, 1.1, x, 3.8, z, rot)
    }
    border('Town centre', 7, 138, 0); border('Suburbs', 7, -138, 0); border('Beachfront', 147, 7, Math.PI / 2); border('Beachfront', 147, 122, Math.PI / 2)
    border('Township', -185, 7.5, Math.PI / 2); border('Industrial', -185, 222.5, Math.PI / 2); border('Township', -252, 96, 0); border('Industrial', -252, 104, 0)
    border('Campus', -159, 7.5, Math.PI / 2); border('Town centre', -150, 222.5, Math.PI / 2); border('Suburbs', -150, -122, Math.PI / 2)
    // "Welcome to SunnyBay": where the campus road meets the city the road opens into a forecourt, and the sign
    // stands on an island in the middle of it, low enough that it never hides you from the camera
    // (a phone held upright sees only a few metres either side of the road's middle).
    const wx = 0
    const wz = 119.6
    flat(-11, RING_OUT - 1, 11, 126, 0.031, ROAD)
    flat(-4.6, wz - 1.3, 4.6, wz + 1.3, 0.05, '#d9cfb6')
    box(8.4, 0.5, 1.5, wx, 0.25, wz, '#8f8a80')
    box(8, 2.9, 0.3, wx, 1.95, wz, '#22143b')
    for (const t of [-4.1, 4.1]) box(0.5, 3.6, 0.6, wx + t, 1.8, wz, '#f0c400')
    solid(wx, wz, 8.8, 1.2)
    sign(atlas.cell(512, 176, (g, x, y, w, h) => {
      const grad = g.createLinearGradient(x, y, x, y + h)
      grad.addColorStop(0, '#f6b93b'); grad.addColorStop(0.55, '#f08a5d'); grad.addColorStop(1, '#2f86b3')
      g.fillStyle = grad; g.fillRect(x, y, w, h)
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(x + w * 0.5, y + h * 0.62, h * 0.3, Math.PI, 0); g.fill()
      g.fillStyle = '#22143b'; g.textAlign = 'center'; g.textBaseline = 'middle'
      fitText(g, CITY.welcome.toUpperCase(), x + w / 2, y + h * 0.3, w * 0.92, h * 0.3)
      g.fillStyle = '#ffffff'
      fitText(g, CITY.welcomeSub, x + w / 2, y + h * 0.84, w * 0.92, h * 0.13, 700, 'Figtree, system-ui, sans-serif')
    }), 7.6, 2.6, wx, 1.95, wz, 0, true, 0.17)
  }

  // ---------- street lamps and trees along the main roads ----------
  if (!far) {
    for (const r of CITY.roads) {
      const [x0, z0, x1, z1] = r.rect
      const alongX = x1 - x0 > z1 - z0
      const len = alongX ? x1 - x0 : z1 - z0
      for (let t = 14; t < len - 8; t += 44) {
        const x = alongX ? x0 + t : x1 + 1.4
        const z = alongX ? z1 + 1.4 : z0 + t
        if (!solids.some((s) => x > s.minX - 0.6 && x < s.maxX + 0.6 && z > s.minZ - 0.6 && z < s.maxZ + 0.6) && !(x > rv[0] - 4 && x < rv[2] + 4) && Math.hypot(x, z) > RING_OUT + 1) { lamp(x, z); solid(x, z, 0.3, 0.3) }
      }
    }
  }

  // ---------- merge ----------
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  // The ground is drawn in four layers (earth and water; pavements and aprons; tarmac; lines and paths), each its own
  // mesh pulled a little toward the camera (polygonOffset), so flat things a few cm apart never flicker far away.
  const layerOf = (y) => (y <= 0.005 ? 0 : y <= 0.026 ? 1 : y <= 0.034 ? 2 : 3)
  const layers = [[], [], [], []]
  for (const g of ground) { if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i)); layers[layerOf(g.userData.y ?? 0)].push(g) }
  layers.forEach((list, i) => {
    if (!list.length) return
    const mesh = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: i > 0, polygonOffsetFactor: -i * 2, polygonOffsetUnits: -i * 2 }))
    mesh.name = i === 0 ? 'city-ground' : `city-ground-${i}`
    mesh.frustumCulled = false
    mesh.renderOrder = i - 4
    group.add(mesh)
  })
  ground.forEach((g) => g.dispose())
  let cells = 0
  for (const [key, list] of stat) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), material)
    mesh.name = `city-${key}`
    group.add(mesh)
    list.forEach((g) => g.dispose())
    cells++
  }
  // windows and lights: one mesh, their own material so they can glow at night
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffe2a8, emissiveIntensity: 0 })
  if (glass.length) {
    const mesh = new THREE.Mesh(mergeGeometries(glass, false), glassMat)
    mesh.name = 'city-glass'
    mesh.frustumCulled = false
    group.add(mesh)
    glass.forEach((g) => g.dispose())
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x3a3020 })
  if (lamps.length) {
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.22, 0.5), lampMat, lamps.length)
    const m = new THREE.Matrix4()
    lamps.forEach(([x, y, z], i) => { m.makeTranslation(x, y, z); heads.setMatrixAt(i, m) })
    heads.name = 'city-lamps'
    heads.frustumCulled = false
    group.add(heads)
  }
  if (signs.length) {
    const mesh = new THREE.Mesh(mergeGeometries(signs, false), new THREE.MeshBasicMaterial({ map: atlas.texture, toneMapped: false }))
    mesh.name = 'city-signs'
    mesh.frustumCulled = false
    group.add(mesh)
    signs.forEach((g) => g.dispose())
  }

  return {
    group, solids, doors, boards, tris, cells,
    // n: 0 day, 1 night
    applyNight(n) {
      glassMat.emissiveIntensity = n * 0.9
      lampMat.color.setHex(n > 0.3 ? 0xffd28a : 0x3a3020)
    },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose?.(); if (o.material && !Array.isArray(o.material)) o.material.dispose?.() })
      atlas?.texture.dispose()
    },
  }
}
