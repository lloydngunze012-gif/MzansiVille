// The inside of a SunnyBay place (City job B): the Room and Hall templates.
// A place is dressed from data (data/campusville/city_places.json): the size, wall, floor and trim
// colours, a sign, its props, where the staff and the patrons stand. The whole room is TWO draw calls:
// one mesh for the shell and every prop (vertex colours), one for the sign and the labels (one canvas).
// The walls only show from inside (single-sided), so whichever way the camera looks you see into the
// room, never a wall's back. The door is in the middle of the south wall.
// The city scene (src/world/city.js) owns the player, camera and people; this only builds the room.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { bakeModel } from './citybuild.js'
import { buildProps, kitRefs } from './cityprops.js'
import { TEMPLATES } from '../city/places.js'

const C = new THREE.Color()
const DEG = Math.PI / 180

function paint(g, hex, tint = 1) {
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  C.set(hex)
  if (tint !== 1) C.multiplyScalar(tint)
  for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  g.deleteAttribute('uv')
  return g
}

// Every label of a room on one canvas: cell(text, wide, bg, fg) -> uv rect.
function labelSheet() {
  const SIZE = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const g = canvas.getContext('2d')
  g.fillStyle = '#22143b'
  g.fillRect(0, 0, SIZE, SIZE)
  let x = 0
  let y = 0
  let rowH = 0
  return {
    canvas,
    cell(text, w, h, bg, fg) {
      const cw = w > h * 6 ? 1020 : 508
      const ch = Math.max(48, Math.min(160, Math.round((cw * h) / w)))
      if (x + cw > SIZE) { x = 0; y += rowH + 4; rowH = 0 }
      if (y + ch > SIZE) return [0, 0, 0.01, 0.01]
      g.fillStyle = bg
      g.fillRect(x, y, cw, ch)
      g.fillStyle = fg
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      let px = Math.round(ch * 0.56)
      do { g.font = `800 ${px}px Graduate, Figtree, system-ui, sans-serif`; px -= 2 } while (g.measureText(text).width > cw * 0.92 && px > 10)
      g.fillText(text, x + cw / 2, y + ch / 2 + 1)
      const uv = [x / SIZE, 1 - (y + ch) / SIZE, (x + cw) / SIZE, 1 - y / SIZE]
      x += cw + 4
      rowH = Math.max(rowH, ch)
      return uv
    },
  }
}

// place: from src/city/places.js (template room | hall). ox, oz: where the middle of its floor is in the scene.
export async function buildInterior(place, ox, oz) {
  const t = TEMPLATES[place.template] || TEMPLATES.room
  const d = place.dress
  const [W, D] = d.size || t.size
  const H = place.template === 'hall' ? 4.8 : 3.8
  const models = {}
  await Promise.all(kitRefs(d.props).map(async (ref) => { models[ref] = await bakeModel(ref) }))

  const geos = []
  const wallPlane = (w, h, x, y, z, rotY, hex, tint) => { const g = new THREE.PlaneGeometry(w, h); if (rotY) g.rotateY(rotY); g.translate(x, y, z); geos.push(paint(g, hex, tint)) }
  // the floor, and a lighter inlay so a big floor is not one flat colour
  const floor = new THREE.PlaneGeometry(W, D)
  floor.rotateX(-Math.PI / 2)
  geos.push(paint(floor, d.floor))
  const inlay = new THREE.PlaneGeometry(W - 3, D - 3)
  inlay.rotateX(-Math.PI / 2)
  inlay.translate(0, 0.006, 0)
  geos.push(paint(inlay, d.floor, 1.07))
  // four walls that face inward, each with a trim band on top and a skirting
  const walls = [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]
  for (const [len, x, z, rot] of walls) {
    const nx = Math.sin(rot) * 0.01
    const nz = Math.cos(rot) * 0.01
    wallPlane(len, H, x, H / 2, z, rot, d.wall, rot ? 0.93 : 1)
    wallPlane(len, 0.2, x + nx, H - 0.1, z + nz, rot, d.trim)
    wallPlane(len, 0.16, x + nx, 0.08, z + nz, rot, d.trim, 0.7)
  }
  // windows on the side walls of a hall
  if (place.template === 'hall') for (const side of [-1, 1]) for (let i = 0; i < 3; i++) wallPlane(2.2, 1.5, side * (W / 2 - 0.02), 2.5, -D / 3 + i * (D / 3), side < 0 ? Math.PI / 2 : -Math.PI / 2, '#bfe3f5')
  // the door (south wall) and its mat
  wallPlane(2.3, 2.7, 0, 1.35, D / 2 - 0.02, Math.PI, '#2a2233')
  wallPlane(2.7, 0.14, 0, 2.77, D / 2 - 0.025, Math.PI, d.trim)
  const mat = new THREE.PlaneGeometry(2.6, 1.3)
  mat.rotateX(-Math.PI / 2)
  mat.translate(0, 0.012, D / 2 - 0.75)
  geos.push(paint(mat, d.trim))

  const props = buildProps(d.props, models)
  geos.push(...props.geos)
  for (const g of geos) if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i))
  const merged = mergeGeometries(geos, false)
  geos.forEach((g) => g.dispose())
  const group = new THREE.Group()
  group.name = `place-${place.id}`
  group.position.set(ox, 0, oz)
  const shellMat = new THREE.MeshLambertMaterial({ vertexColors: true })
  const shell = new THREE.Mesh(merged, shellMat)
  shell.name = 'place-shell'
  group.add(shell)

  // the sign on the far wall, EXIT over the door, and the props' own labels
  const sheet = labelSheet()
  const signW = Math.min(W * 0.6, 11)
  const labels = [
    { text: d.sign || place.name.toUpperCase(), w: signW, h: signW / 11, x: 0, y: H - 0.2 - signW / 22, z: -D / 2 + 0.04, rot: 0, bg: d.trim, fg: '#ffffff' },
    { text: 'EXIT', w: 1.3, h: 0.34, x: 0, y: 3.08, z: D / 2 - 0.04, rot: Math.PI, bg: '#2f8f5b', fg: '#ffffff' },
    ...props.labels,
  ]
  const lg = labels.map((l) => {
    const g = new THREE.PlaneGeometry(l.w, l.h)
    const [u0, v0, u1, v1] = sheet.cell(l.text, l.w, l.h, l.bg, l.fg)
    g.attributes.uv.setXY(0, u0, v1); g.attributes.uv.setXY(1, u1, v1); g.attributes.uv.setXY(2, u0, v0); g.attributes.uv.setXY(3, u1, v0)
    if (l.rot) g.rotateY(l.rot)
    g.translate(l.x, l.y, l.z)
    return g
  })
  const texture = new THREE.CanvasTexture(sheet.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const labelMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  const signs = new THREE.Mesh(mergeGeometries(lg, false), labelMat)
  signs.name = 'place-signs'
  lg.forEach((g) => g.dispose())
  group.add(signs)

  const solids = props.solids.map((s) => ({ minX: s.minX + ox, maxX: s.maxX + ox, minZ: s.minZ + oz, maxZ: s.maxZ + oz }))
  const at = ([x, z, rot = 0]) => ({ x: ox + x, z: oz + z, rot: rot * DEG })
  const staff = at(d.staff || [0, -D / 2 + 1.2, 0])
  return {
    group, W, D, H,
    cam: d.cam || t.cam, top: d.top || t.top,
    tris: merged.index.count / 3 + lg.length * 2,
    solids,
    bounds: { minX: ox - W / 2, maxX: ox + W / 2, minZ: oz - D / 2, maxZ: oz + D / 2 },
    centre: { x: ox, z: oz },
    // where you stand when you come in, and the mat that takes you back out
    spawn: { x: ox, z: oz + D / 2 - 2.4 },
    exit: { x: ox, z: oz + D / 2 - 0.75 },
    staff,
    // where you stand to be served: a step and a half in front of the staff
    focus: { x: staff.x + Math.sin(staff.rot) * 2.3, z: staff.z + Math.cos(staff.rot) * 2.3 },
    people: (d.people || []).map(at),
    blocked(x, z, pad = 0.32) {
      if (x < ox - W / 2 + pad || x > ox + W / 2 - pad || z < oz - D / 2 + pad || z > oz + D / 2 - pad) return true
      for (const s of solids) if (x > s.minX - pad && x < s.maxX + pad && z > s.minZ - pad && z < s.maxZ + pad) return true
      return false
    },
    dispose() {
      merged.dispose(); shellMat.dispose(); signs.geometry.dispose(); labelMat.dispose(); texture.dispose()
    },
  }
}
