// Props for SunnyBay's places (City job B): the things a place is dressed with, from data
// (data/campusville/city_places.json: { k, x, z, rot, n, dx, dz, w, d, c, ... }).
// Every prop is plain coloured geometry (boxes and cylinders), or a model of a kit that is already in the
// game (public/models/props, cars: CC0, see docs/credits.md) baked to vertex colours by citybuild.js. The
// caller merges everything into one mesh: a whole room of props is one draw call, and no new download.
// Used by the interiors (src/world/cityplace.js) and, for the open-ground places, by citybuild.js.
import * as THREE from 'three'

const C = new THREE.Color()
const DEG = Math.PI / 180

// Kit models a prop can use: kind -> [file, height in metres].
export const KIT = {
  chair: ['/models/props/chair.glb', 0.95],
  table: ['/models/props/table.glb', 0.78],
  round: ['/models/props/tableRound.glb', 0.78],
  stool: ['/models/props/stoolBar.glb', 0.82],
  plant: ['/models/props/pottedPlant.glb', 1.15],
  bench: ['/models/props/bench.glb', 0.95],
  bin: ['/models/props/trashcan.glb', 0.85],
  coffee: ['/models/props/kitchenCoffeeMachine.glb', 0.55],
  fridge: ['/models/props/kitchenFridge.glb', 1.9],
  speaker: ['/models/props/speaker.glb', 1.25],
}
const CAR = (name) => `/models/cars/${name}.glb`
// The kit models a list of props needs: [ref].
export function kitRefs(props) {
  const refs = new Set()
  const need = (k) => KIT[k] && refs.add(KIT[k][0])
  for (const p of props || []) {
    need(p.k)
    if (p.chairs) need('chair')
    if (p.stools) need('stool')
    if (p.k === 'longtable' || p.k === 'station' || p.k === 'dryer') need('chair')
    if (p.k === 'car') refs.add(CAR(p.model || 'sedan'))
  }
  return [...refs]
}

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

// Build a list of props. models: { ref: { geo, size } } (already baked). Returns
// { geos, solids: [{ minX, maxX, minZ, maxZ }], labels: [{ text, w, h, x, y, z, rot, bg, fg }] } in the caller's frame.
export function buildProps(props, models = {}) {
  const geos = []
  const solids = []
  const labels = []
  const unknown = [] // (kinds this file does not know: npm run check fails on one)
  for (const spec of props || []) {
    const n = spec.n || 1
    for (let i = 0; i < n; i++) one(spec, spec.x + (spec.dx || 0) * i, spec.z + (spec.dz || 0) * i, i)
  }
  return { geos, solids, labels, unknown }

  function one(o, px, pz, index) {
    const rot = (o.rot || 0) * DEG
    const part = []
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const world = (x, z) => [px + x * cos + z * sin, pz - x * sin + z * cos]
    const box = (w, h, d, x, y, z, hex, tint) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); part.push(paint(g, hex, tint)) }
    const cyl = (rt, rb, h, x, y, z, hex, seg = 10, tint) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y, z); part.push(paint(g, hex, tint)) }
    const cone = (r, h, x, y, z, hex, seg = 8) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(x, y, z); part.push(paint(g, hex)) }
    // a kit model: its height from KIT (or high), turned by turn degrees
    const model = (kind, x, z, { turn = 0, y = 0, high, ref, fit, tint } = {}) => {
      const m = models[ref || KIT[kind]?.[0]]
      if (!m) return false
      const s = fit ? fit / Math.max(m.size.x, m.size.z) : (high || KIT[kind][1]) / m.size.y
      const g = m.geo.clone()
      g.scale(s, s, s)
      if (turn) g.rotateY(turn * DEG)
      g.translate(x, y, z)
      if (tint) { const c = g.attributes.color.array; C.set(tint); for (let k = 0; k < c.length; k += 3) { c[k] *= C.r; c[k + 1] *= C.g; c[k + 2] *= C.b } }
      part.push(g)
      return { w: m.size.x * s, d: m.size.z * s, h: m.size.y * s }
    }
    // what a body cannot walk through: a rectangle in the prop's own frame (it turns with the prop)
    const solid = (w, d, x = 0, z = 0) => {
      const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([cx, cz]) => world(x + cx, z + cz))
      solids.push({ minX: Math.min(...corners.map((c) => c[0])), maxX: Math.max(...corners.map((c) => c[0])), minZ: Math.min(...corners.map((c) => c[1])), maxZ: Math.max(...corners.map((c) => c[1])) })
    }
    const label = (text, w, h, x, y, z, bg = '#22143b', fg = '#ffffff') => { const [wx, wz] = world(x, z); labels.push({ text, w, h, x: wx, y, z: wz, rot, bg, fg }) }
    const chairsRound = (count, r) => { for (let k = 0; k < count; k++) { const a = (k / count) * 360 + 45; model('chair', Math.sin(a * DEG) * r, Math.cos(a * DEG) * r, { turn: a + 180 }) } }
    const c = o.c || '#8a6a44'
    const w = o.w || 0
    const HUES = ['#d6452f', '#f0c400', '#1d7fb8', '#2f8f5b', '#e8497a', '#7b3fe4', '#f6f2ea', '#ff8a3d']
    const hue = (k) => HUES[((k % HUES.length) + HUES.length) % HUES.length]

    switch (o.k) {
      // ---------- kit pieces ----------
      case 'chair': case 'bench': case 'bin': case 'plant': case 'speaker': case 'fridge': case 'stool': {
        const m = model(o.k, 0, 0)
        if (m) solid(Math.max(0.5, m.w * 0.9), Math.max(0.5, m.d * 0.9))
        break
      }
      case 'coffee': model('coffee', 0, 0, { y: 1.06 }); break
      case 'table': {
        const m = model('table', 0, 0)
        if (o.flask) { cyl(0.11, 0.13, 0.36, 0.2, 0.96, 0, '#b9bec4'); cyl(0.05, 0.05, 0.1, -0.15, 0.83, 0.1, '#f6f2ea'); cyl(0.05, 0.05, 0.1, -0.3, 0.83, -0.1, '#f6f2ea') }
        solid(m ? m.w : 1.2, m ? m.d : 0.8)
        break
      }
      case 'round': {
        const m = model('round', 0, 0, { tint: o.c })
        if (o.chairs) chairsRound(o.chairs, 1.05)
        solid(m ? m.w : 1, m ? m.d : 1)
        break
      }
      case 'car': {
        const m = model('car', 0, 0, { ref: CAR(o.model || 'sedan'), fit: 4.3, tint: o.c })
        solid(m ? m.w : 1.9, m ? m.d : 4.3)
        break
      }
      // ---------- counters and desks ----------
      case 'counter': {
        box(w, 1.0, 0.8, 0, 0.5, 0, c, 0.82)
        box(w + 0.12, 0.07, 0.94, 0, 1.03, 0, '#f6efe2')
        box(w, 0.12, 0.82, 0, 0.06, 0, c, 0.5)
        if (o.glass) { box(w, 0.85, 0.05, 0, 1.5, 0.3, '#bfe0ee'); for (let t = -w / 2; t <= w / 2 + 0.01; t += w / 3) box(0.08, 0.9, 0.08, t, 1.5, 0.3, c, 0.7) }
        for (let k = 0; k < (o.stools || 0); k++) model('stool', -w / 2 + (k + 0.5) * (w / o.stools), -0.95)
        solid(w, 0.9)
        break
      }
      case 'desk': {
        box(1.7, 0.07, 0.85, 0, 0.76, 0, '#f6efe2'); box(0.08, 0.74, 0.8, -0.78, 0.37, 0, c); box(0.08, 0.74, 0.8, 0.78, 0.37, 0, c); box(1.5, 0.5, 0.05, 0, 0.45, -0.38, c, 0.8)
        box(0.5, 0.34, 0.04, 0.3, 1.05, 0.1, '#2a2233'); box(0.08, 0.14, 0.08, 0.3, 0.86, 0.1, '#2a2233')
        solid(1.7, 0.85)
        break
      }
      case 'till': {
        box(1.9, 0.9, 0.7, 0, 0.45, 0, '#dfe5e8'); box(1.3, 0.05, 0.5, -0.25, 0.93, 0, '#2a2233'); box(0.34, 0.3, 0.06, 0.72, 1.2, 0, '#2a2233'); box(0.06, 0.3, 0.06, 0.72, 1.0, 0, '#8d969c')
        box(1.9, 0.14, 0.72, 0, 0.83, 0, '#2f8f5b')
        solid(1.9, 0.7)
        break
      }
      case 'kiosk': box(0.6, 1.25, 0.5, 0, 0.62, 0, '#f6f2ea'); box(0.5, 0.36, 0.05, 0, 1.0, 0.26, '#2a2233'); box(0.62, 0.16, 0.52, 0, 1.33, 0, c); solid(0.6, 0.5); break
      case 'menu': if (w) label(o.text || '', w, w / 7, 0, 2.3, 0.06, '#22143b', '#fff3c4'); break
      // ---------- shelves, racks, storage ----------
      case 'shelf': {
        // a shop gondola: products both sides
        box(w, 1.7, 0.24, 0, 0.85, 0, '#f6f2ea'); box(w + 0.06, 0.12, 0.8, 0, 0.06, 0, c, 0.7); box(w + 0.06, 0.1, 0.8, 0, 1.74, 0, c)
        for (const side of [-1, 1]) for (let s = 0; s < 3; s++) for (let t = 0; t < Math.floor(w / 0.8); t++) box(0.66, 0.34, 0.2, -w / 2 + 0.4 + t * 0.8, 0.36 + s * 0.48, side * 0.26, hue(t + s * 3 + index + (side > 0 ? 2 : 0)))
        solid(w, 0.8)
        break
      }
      case 'bookshelf': {
        box(w, 2.1, 0.5, 0, 1.05, 0, '#6b4a2c')
        for (const side of [-1, 1]) for (let s = 0; s < 4; s++) for (let t = 0; t < Math.floor(w / 0.55); t++) box(0.46, 0.34, 0.06, -w / 2 + 0.3 + t * 0.55, 0.3 + s * 0.48, side * 0.26, hue(t * 3 + s + index), 0.85)
        solid(w, 0.55)
        break
      }
      case 'rack': {
        cyl(0.04, 0.04, 1.5, -0.8, 0.75, 0, '#b9bec4', 6); cyl(0.04, 0.04, 1.5, 0.8, 0.75, 0, '#b9bec4', 6); box(1.7, 0.05, 0.05, 0, 1.5, 0, '#b9bec4')
        for (let t = 0; t < 6; t++) box(0.2, 0.75, 0.45, -0.6 + t * 0.24, 1.08, 0, t % 2 ? c : hue(t + index))
        solid(1.7, 0.5)
        break
      }
      case 'cabinet': box(1.6, 1.8, 0.5, 0, 0.9, 0, c); for (const t of [-0.4, 0.4]) for (const y of [0.5, 1.3]) box(0.7, 0.7, 0.03, t, y, 0.26, c, 0.86); solid(1.6, 0.5); break
      case 'safe': box(0.5, 2.1, 2.6, 0, 1.05, 0, '#8d969c'); for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) box(0.04, 0.4, 0.7, -0.27, 0.4 + a * 0.46, -0.85 + b * 0.85, '#6b747a'); solid(0.5, 2.6); break
      case 'breadrack': box(1.4, 1.5, 0.6, 0, 0.75, 0, '#8a6a44'); for (let s = 0; s < 3; s++) for (let t = 0; t < 3; t++) box(0.36, 0.16, 0.5, -0.45 + t * 0.45, 0.42 + s * 0.42, 0.06, '#d9a45a'); solid(1.4, 0.6); break
      case 'trolley': box(0.5, 0.4, 0.8, 0, 0.62, 0, '#b9bec4'); box(0.5, 0.05, 0.05, 0, 1.0, -0.45, '#2f8f5b'); for (const [a, b] of [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]]) cyl(0.07, 0.07, 0.06, a, 0.07, b, '#2a2233', 8); solid(0.5, 0.8); break
      case 'crate': box(0.7, 0.5, 0.5, 0, 0.25, 0, hue(index + 1)); box(0.7, 0.5, 0.5, 0.1, 0.75, 0, hue(index + 3)); solid(0.8, 0.5); break
      // ---------- seats and tables ----------
      case 'longtable': {
        box(w, 0.07, 1.0, 0, 0.76, 0, '#c9a36e'); box(0.1, 0.74, 0.8, -w / 2 + 0.2, 0.37, 0, '#6b4a2c'); box(0.1, 0.74, 0.8, w / 2 - 0.2, 0.37, 0, '#6b4a2c')
        const each = Math.ceil((o.chairs || 0) / 2)
        for (let k = 0; k < each; k++) { const t = -w / 2 + (k + 0.5) * (w / each); model('chair', t, -0.95); model('chair', t, 0.95, { turn: 180 }) }
        solid(w, 1.0)
        break
      }
      case 'pew': box(w, 0.1, 0.5, 0, 0.45, 0, '#7b4a2a'); box(w, 0.62, 0.08, 0, 0.72, 0.26, '#7b4a2a'); box(0.1, 0.9, 0.6, -w / 2, 0.45, 0, '#5c351d'); box(0.1, 0.9, 0.6, w / 2, 0.45, 0, '#5c351d'); solid(w, 0.6); break
      case 'booth': {
        if (o.ticket) { box(1.7, 2.3, 1.5, 0, 1.15, 0, c); box(1.2, 0.7, 0.05, 0, 1.45, 0.76, '#bfe0ee'); box(2.0, 0.14, 1.8, 0, 2.37, 0, '#f6f2ea'); label('TICKETS', 1.5, 0.36, 0, 2.05, 0.78, '#f0c400', '#22143b'); solid(1.7, 1.5); break }
        box(2.6, 0.45, 0.6, 0, 0.23, -0.5, c); box(2.6, 0.7, 0.14, 0, 0.8, -0.78, c, 0.85)
        box(0.6, 0.45, 1.4, -1.0, 0.23, 0.5, c); box(0.6, 0.45, 1.4, 1.0, 0.23, 0.5, c)
        box(1.1, 0.06, 0.9, 0, 0.72, 0.45, '#f6efe2'); cyl(0.06, 0.1, 0.7, 0, 0.36, 0.45, '#2a2233')
        for (let k = 0; k < 4; k++) cyl(0.07, 0.05, 0.22 + k * 0.06, -0.24 + k * 0.16, 0.86 + k * 0.03, 0.45, hue(k + 1), 8)
        solid(2.6, 2.0, 0, 0.2)
        break
      }
      case 'station': {
        // a barber's place: the mirror on the wall, a shelf, the chair in front of it
        box(1.3, 1.4, 0.06, 0, 1.6, -0.5, '#cfe6f0'); box(1.5, 1.6, 0.04, 0, 1.6, -0.54, '#22143b'); box(1.4, 0.06, 0.34, 0, 0.9, -0.34, '#f6efe2')
        cyl(0.1, 0.32, 0.4, 0, 0.2, 0.9, '#8d969c'); box(0.62, 0.14, 0.62, 0, 0.5, 0.9, '#22143b'); box(0.62, 0.7, 0.12, 0, 0.9, 1.18, '#22143b'); box(0.1, 0.2, 0.5, -0.36, 0.68, 0.9, '#8d969c'); box(0.1, 0.2, 0.5, 0.36, 0.68, 0.9, '#8d969c')
        solid(0.9, 0.9, 0, 0.9)
        break
      }
      case 'dryer': model('chair', 0, 0, { turn: 180 }); cyl(0.3, 0.34, 0.4, 0, 1.55, -0.1, '#f6f2ea', 12); cyl(0.04, 0.04, 1.4, 0, 0.8, -0.42, '#8d969c', 6); solid(0.7, 0.8); break
      case 'basin': box(0.9, 0.85, 0.6, 0, 0.42, 0, '#f6f2ea'); box(0.6, 0.1, 0.4, 0, 0.88, 0, '#bfe0ee'); cyl(0.03, 0.03, 0.3, 0, 1.0, -0.22, '#8d969c', 6); solid(0.9, 0.6); break
      case 'bed': box(2.0, 0.5, 0.9, 0, 0.25, 0, '#b9bec4'); box(1.96, 0.16, 0.86, 0, 0.58, 0, '#ffffff'); box(0.4, 0.12, 0.6, -0.72, 0.7, 0, c); cyl(0.03, 0.03, 2.0, 1.15, 1.0, -0.5, '#8d969c', 6); box(0.04, 1.3, 1.1, 1.15, 1.3, 0.05, c); solid(2.0, 0.9); break
      case 'tank': box(1.3, 0.8, 0.5, 0, 0.4, 0, '#6b4a2c'); box(1.3, 0.62, 0.46, 0, 1.12, 0, '#3f8fb5'); box(0.16, 0.08, 0.04, 0.2, 1.1, 0.24, '#ff8a3d'); box(0.12, 0.06, 0.04, -0.3, 1.25, 0.24, '#f0c400'); box(1.34, 0.06, 0.5, 0, 1.46, 0, '#2a2233'); solid(1.3, 0.5); break
      case 'chute': box(0.9, 1.15, 0.5, 0, 0.58, 0, '#7b4a2a'); box(0.6, 0.12, 0.06, 0, 0.9, -0.26, '#2a2233'); label('RETURNS', 0.8, 0.2, 0, 1.3, -0.27, '#7b4a2a', '#fff3c4'); solid(0.9, 0.5); break
      case 'rope': cyl(0.05, 0.08, 1.0, -1.0, 0.5, 0, '#f0c400', 8); cyl(0.05, 0.08, 1.0, 1.0, 0.5, 0, '#f0c400', 8); box(2.0, 0.06, 0.04, 0, 0.9, 0, '#8a2f3a'); solid(2.0, 0.2); break
      // ---------- the lounge and the arcade ----------
      case 'pool': {
        box(2.7, 0.2, 1.5, 0, 0.78, 0, '#6b4a2c'); box(2.4, 0.04, 1.2, 0, 0.9, 0, '#2f8f5b')
        for (const [a, b] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) box(0.16, 0.7, 0.16, a, 0.35, b, '#4a321c')
        for (let k = 0; k < 6; k++) cyl(0.05, 0.05, 0.06, -0.5 + (k % 3) * 0.12, 0.95, -0.1 + Math.floor(k / 3) * 0.12, hue(k), 8)
        box(1.5, 0.03, 0.03, 0.4, 0.95, 0.3, '#d9b98a')
        solid(2.7, 1.5)
        break
      }
      case 'stage': {
        box(w, 0.3, 2.0, 0, 0.15, 0, '#4a321c'); cyl(0.02, 0.02, 1.3, 0.4, 0.95, 0.3, '#b9bec4', 6); cyl(0.06, 0.06, 0.12, 0.4, 1.62, 0.3, '#2a2233', 8); cyl(0.16, 0.16, 0.03, 0.4, 0.32, 0.3, '#2a2233', 10)
        box(1.4, 0.8, 0.06, -0.6, 1.9, -0.9, '#2a2233'); label('KARAOKE', 1.3, 0.34, -0.6, 1.95, -0.86, '#e8497a', '#ffffff')
        solid(w, 2.0)
        break
      }
      case 'lights': for (let t = 0; t < Math.floor(w / 0.6); t++) box(0.14, 0.14, 0.1, -w / 2 + 0.3 + t * 0.6, 3.0 - Math.abs(Math.sin(t * 0.8)) * 0.3, 0, hue(t)); break
      case 'bunting': for (let t = 0; t < Math.floor(w / 0.7); t++) cone(0.2, 0.36, -w / 2 + 0.35 + t * 0.7, 3.05, 0, hue(t), 3); box(w, 0.03, 0.03, 0, 3.24, 0, '#f6f2ea'); break
      case 'lane': {
        const d = o.d || 12
        box(1.2, 0.06, d, 0, 0.03, 0, '#d9b98a'); box(0.2, 0.1, d, -0.72, 0.05, 0, '#2a2233'); box(0.2, 0.1, d, 0.72, 0.05, 0, '#2a2233')
        for (let k = 0; k < 6; k++) cyl(0.06, 0.08, 0.38, [-0.3, 0, 0.3, -0.15, 0.15, 0][k], 0.25, -d / 2 + 0.5 + (k < 3 ? 0 : k < 5 ? 0.3 : 0.6), '#ffffff', 8)
        box(1.5, 1.0, 0.3, 0, 1.7, -d / 2 + 0.1, '#22143b'); box(1.3, 0.5, 0.06, 0, 1.75, -d / 2 + 0.27, hue(index + 2))
        cyl(0.16, 0.16, 0.3, 0.5, 0.2, d / 2 - 0.5, hue(index), 12); box(0.6, 0.3, 1.2, 0.9, 0.15, d / 2 - 0.9, '#3a2452')
        solid(1.7, d - 1.6, 0, -0.8)
        break
      }
      case 'cabinet2': box(0.8, 1.8, 0.8, 0, 0.9, 0, '#22143b'); box(0.62, 0.5, 0.05, 0, 1.3, 0.41, hue(index + 2)); box(0.8, 0.26, 0.82, 0, 1.92, 0, hue(index)); box(0.7, 0.1, 0.4, 0, 0.92, 0.5, '#3a2452'); solid(0.8, 1.0, 0, 0.1); break
      case 'dancemat': box(1.8, 0.12, 1.8, 0, 0.06, 0, '#22143b'); for (const [a, b, k] of [[0, -0.55, 0], [0, 0.55, 1], [-0.55, 0, 2], [0.55, 0, 4]]) box(0.5, 0.02, 0.5, a, 0.13, b, hue(k)); box(1.4, 1.0, 0.2, 0, 1.6, -1.1, '#22143b'); box(1.2, 0.8, 0.04, 0, 1.6, -0.98, '#e8497a'); cyl(0.05, 0.05, 1.1, 0, 0.55, -1.1, '#8d969c', 6); solid(1.4, 0.3, 0, -1.1); break
      case 'airhockey': box(2.0, 0.2, 1.1, 0, 0.8, 0, '#f6f2ea'); box(1.8, 0.03, 0.9, 0, 0.91, 0, '#bfe0ee'); box(2.1, 0.1, 1.2, 0, 0.72, 0, '#1d7fb8'); for (const [a, b] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) box(0.12, 0.7, 0.12, a, 0.35, b, '#2a2233'); cyl(0.07, 0.07, 0.05, 0.2, 0.95, 0.1, '#d6452f', 10); solid(2.1, 1.2); break
      // ---------- the gym ----------
      case 'treadmill': box(0.8, 0.22, 1.8, 0, 0.11, 0, '#2a2233'); box(0.66, 0.02, 1.4, 0, 0.23, 0.1, '#6b747a'); box(0.06, 1.2, 0.06, -0.36, 0.7, -0.75, '#b9bec4'); box(0.06, 1.2, 0.06, 0.36, 0.7, -0.75, '#b9bec4'); box(0.8, 0.3, 0.1, 0, 1.35, -0.78, '#e8552f'); solid(0.8, 1.8); break
      case 'bike': box(0.3, 0.5, 1.1, 0, 0.35, 0, '#2a2233'); cyl(0.3, 0.3, 0.08, 0, 0.4, -0.4, '#e8552f', 12); box(0.24, 0.08, 0.3, 0, 0.98, 0.3, '#2a2233'); box(0.06, 0.6, 0.06, 0, 0.7, 0.3, '#b9bec4'); box(0.5, 0.05, 0.05, 0, 1.12, -0.42, '#b9bec4'); box(0.06, 0.8, 0.06, 0, 0.75, -0.42, '#b9bec4'); solid(0.5, 1.1); break
      case 'weights': box(w, 0.06, 0.5, 0, 0.5, 0, '#6b747a'); box(w, 0.06, 0.5, 0, 1.0, 0, '#6b747a'); box(0.08, 1.2, 0.5, -w / 2, 0.6, 0, '#2a2233'); box(0.08, 1.2, 0.5, w / 2, 0.6, 0, '#2a2233'); for (let t = 0; t < Math.floor(w / 0.5); t++) for (const y of [0.63, 1.13]) { cyl(0.1 + (t % 3) * 0.02, 0.1 + (t % 3) * 0.02, 0.34, -w / 2 + 0.3 + t * 0.5, y, 0, t % 2 ? '#2a2233' : '#e8552f', 8) } solid(w, 0.5); break
      case 'press': box(0.4, 0.12, 1.4, 0, 0.45, 0.2, '#2a2233'); box(0.1, 0.45, 0.1, -0.15, 0.22, 0.7, '#6b747a'); box(0.1, 0.45, 0.1, 0.15, 0.22, -0.3, '#6b747a'); box(0.06, 1.1, 0.06, -0.55, 0.55, -0.4, '#b9bec4'); box(0.06, 1.1, 0.06, 0.55, 0.55, -0.4, '#b9bec4'); box(1.7, 0.04, 0.04, 0, 1.05, -0.4, '#b9bec4'); for (const t of [-0.78, 0.78]) { const g = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12); g.rotateZ(Math.PI / 2); g.translate(t, 1.05, -0.4); part.push(paint(g, '#2a2233')) } solid(1.4, 1.5); break
      case 'mat': box(0.8, 0.04, 1.9, 0, 0.02, 0, c, index % 2 ? 0.8 : 1); break
      case 'bell': for (let k = 0; k < 4; k++) { cyl(0.14 + k * 0.02, 0.16 + k * 0.02, 0.24, -0.6 + k * 0.42, 0.12, 0, hue(k), 10); box(0.16, 0.12, 0.04, -0.6 + k * 0.42, 0.32, 0, '#2a2233') } solid(1.8, 0.5); break
      case 'fan': cyl(0.22, 0.26, 0.08, 0, 0.04, 0, '#2a2233', 10); cyl(0.03, 0.03, 1.4, 0, 0.74, 0, '#b9bec4', 6); { const g = new THREE.CylinderGeometry(0.36, 0.36, 0.1, 14); g.rotateZ(Math.PI / 2); g.translate(0.1, 1.5, 0); part.push(paint(g, '#dfe5e8')) } solid(0.5, 0.5); break
      // ---------- the church ----------
      case 'lectern': box(0.6, 1.1, 0.45, 0, 0.55, 0, '#7b4a2a'); box(0.7, 0.06, 0.5, 0, 1.14, 0.03, '#5c351d'); solid(0.6, 0.45); break
      case 'altar': box(w, 0.9, 0.8, 0, 0.45, 0, '#f6f2ea'); box(w + 0.1, 0.06, 0.9, 0, 0.93, 0, '#8a2f3a'); cyl(0.04, 0.05, 0.3, -w / 2 + 0.4, 1.1, 0, '#f0c400', 8); cyl(0.04, 0.05, 0.3, w / 2 - 0.4, 1.1, 0, '#f0c400', 8); solid(w, 0.8); break
      case 'cross': box(0.2, 1.9, 0.08, 0, 2.9, 0.1, '#7b4a2a'); box(1.1, 0.2, 0.08, 0, 3.25, 0.1, '#7b4a2a'); break
      case 'urn': box(1.6, 0.06, 0.7, 0, 0.76, 0, '#f6f2ea'); box(0.08, 0.74, 0.6, -0.7, 0.37, 0, '#8d969c'); box(0.08, 0.74, 0.6, 0.7, 0.37, 0, '#8d969c'); cyl(0.16, 0.16, 0.42, -0.4, 1.0, 0, '#b9bec4', 12); cyl(0.03, 0.03, 0.08, -0.4, 0.86, 0.18, '#2a2233', 6); for (let k = 0; k < 4; k++) cyl(0.045, 0.04, 0.09, 0.05 + k * 0.16, 0.84, 0.05, '#ffffff', 8); solid(1.6, 0.7); break
      case 'rug': box(w, 0.02, o.d || 3, 0, 0.012, 0, c); break
      // ---------- outdoors (the open-ground places) ----------
      case 'cart': box(1.4, 0.8, 0.8, 0, 0.75, 0, '#f6f2ea'); box(1.4, 0.16, 0.82, 0, 0.42, 0, '#e8497a'); cyl(0.26, 0.26, 0.08, -0.5, 0.26, 0.44, '#2a2233', 12); cyl(0.26, 0.26, 0.08, 0.5, 0.26, 0.44, '#2a2233', 12); cyl(0.03, 0.03, 1.5, 0, 1.9, 0, '#f6f2ea', 6); cone(1.1, 0.5, 0, 2.75, 0, '#e8497a'); cone(0.1, 0.3, 0.4, 1.3, 0, '#fff3c4', 8); label('SOFT SERVE', 1.2, 0.3, 0, 0.82, 0.42, '#e8497a', '#ffffff'); solid(1.4, 0.9); break
      case 'net': cyl(0.05, 0.05, 2.4, -w / 2, 1.2, 0, '#f6f2ea', 6); cyl(0.05, 0.05, 2.4, w / 2, 1.2, 0, '#f6f2ea', 6); for (let t = 0; t < 5; t++) box(w, 0.03, 0.03, 0, 1.6 + t * 0.18, 0, '#f6f2ea'); box(w, 0.07, 0.05, 0, 2.4, 0, '#d6452f'); cyl(0.12, 0.12, 0.24, 1.2, 0.14, 0.9, '#f0c400', 10); break
      case 'towel': box(w || 2, 0.03, 1.2, 0, 0.03, 0, c); box(0.34, 0.1, 0.34, 0.3, 0.09, 0, '#f6f2ea'); for (let k = 0; k < 3; k++) cyl(0.06, 0.06, 0.08, 0.22 + k * 0.08, 0.17, (k % 2) * 0.08, '#ff8a3d', 8); break
      case 'flagboard': cyl(0.05, 0.05, 2.2, 0, 1.1, 0, '#8a5a3a', 6); box(1.2, 0.8, 0.06, 0, 1.6, 0, '#f6f2ea'); box(0.3, 0.2, 0.04, -0.3, 1.75, 0.04, '#d6452f'); box(0.3, 0.2, 0.04, 0.1, 1.75, 0.04, '#f0c400'); box(0.3, 0.2, 0.04, -0.1, 1.45, 0.04, '#2f8f5b'); solid(0.4, 0.4); break
      case 'cabana': for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) cyl(0.06, 0.06, 2.5, a, 1.25, b, '#f6f2ea', 6); box(3.4, 0.1, 3.4, 0, 2.55, 0, '#fff3c4'); box(3.4, 0.3, 0.04, 0, 2.36, 1.7, '#1d7fb8'); box(1.0, 0.06, 0.7, 0, 0.5, 0, '#f6f2ea'); box(0.5, 0.1, 0.4, 0, 0.58, 0, '#ff8a3d'); box(1.8, 0.12, 0.7, -0.6, 0.3, -1.0, '#1d7fb8'); break
      case 'tin': cyl(0.05, 0.05, 1.1, 0, 0.55, 0, '#8a5a3a', 6); box(0.36, 0.3, 0.3, 0, 1.2, 0, '#2f6a3a'); label('DUCK SEED', 0.7, 0.2, 0, 1.55, 0.02, '#2f6a3a', '#ffffff'); solid(0.3, 0.3); break
      case 'watertable': box(1.5, 0.06, 0.7, 0, 0.76, 0, '#f6f2ea'); box(0.06, 0.74, 0.6, -0.65, 0.37, 0, '#8d969c'); box(0.06, 0.74, 0.6, 0.65, 0.37, 0, '#8d969c'); cyl(0.14, 0.14, 0.36, -0.3, 0.97, 0, '#3f8fb5', 10); cyl(0.14, 0.14, 0.36, 0.2, 0.97, 0, '#3f8fb5', 10); solid(1.5, 0.7); break
      case 'sprinkler': cyl(0.05, 0.07, 0.24, 0, 0.12, 0, '#2a2233', 8); cone(0.5, 0.5, 0, 0.5, 0, '#bfe0ee', 8); break
      case 'tripod': for (const a of [0, 120, 240]) { const g = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 5); g.rotateX(0.22); g.rotateY(a * DEG); g.translate(Math.sin(a * DEG) * 0.16, 0.72, Math.cos(a * DEG) * 0.16); part.push(paint(g, '#2a2233')) } box(0.26, 0.18, 0.2, 0, 1.52, 0, '#2a2233'); cyl(0.06, 0.06, 0.12, 0, 1.52, 0.14, '#6b747a', 8); solid(0.4, 0.4); break
      case 'stall': box(2.2, 0.9, 0.9, 0, 0.45, 0, '#f6f2ea'); box(2.3, 0.06, 1.0, 0, 0.93, 0, '#8a5a3a'); for (const t of [-1.05, 1.05]) cyl(0.04, 0.04, 2.3, t, 1.15, -0.4, '#8a5a3a', 6); box(2.6, 0.1, 1.5, 0, 2.3, 0, '#d6452f'); for (let k = 0; k < 4; k++) cyl(0.12, 0.12, 0.1, -0.7 + k * 0.4, 1.0, 0.1, '#d9a45a', 8); if (o.text) label(o.text, 2.2, 0.4, 0, 1.95, 0.76, '#d6452f', '#ffffff'); solid(2.2, 0.9); break
      case 'routeboard': cyl(0.05, 0.05, 2.6, -0.9, 1.3, 0, '#2f3338', 6); cyl(0.05, 0.05, 2.6, 0.9, 1.3, 0, '#2f3338', 6); box(2.0, 1.2, 0.06, 0, 2.0, 0, '#f6f2ea'); label(o.text || 'ROUTES', 1.9, 0.38, 0, 2.38, 0.05, '#c62828', '#ffffff'); for (let k = 0; k < 3; k++) box(1.6, 0.1, 0.02, 0, 2.0 - k * 0.22, 0.04, hue(k + 1)); solid(2.0, 0.3); break
      case 'drum': cyl(0.3, 0.3, 0.9, 0, 0.45, 0, '#2456a6', 12); box(0.5, 0.04, 0.4, 0, 0.92, 0, '#f6f2ea'); solid(0.6, 0.6); break
      case 'lowwall': box(w, 0.55, 0.4, 0, 0.275, 0, '#cfc7b4'); box(w + 0.06, 0.06, 0.46, 0, 0.58, 0, '#f6f2ea'); solid(w, 0.4); break
      case 'airline': cyl(0.07, 0.07, 1.5, 0, 0.75, 0, '#d6452f', 8); box(0.4, 0.4, 0.2, 0, 1.3, 0, '#f6f2ea'); cyl(0.2, 0.2, 0.08, 0, 0.7, 0.12, '#2a2233', 12); label('AIR', 0.4, 0.2, 0, 1.62, 0.02, '#d6452f', '#ffffff'); solid(0.4, 0.4); break
      case 'warmer': box(1.2, 0.9, 0.6, 0, 0.45, 0, '#f6f2ea'); box(1.2, 0.5, 0.56, 0, 1.15, 0, '#ffd28a'); box(1.24, 0.06, 0.62, 0, 1.42, 0, '#d6452f'); for (let k = 0; k < 3; k++) box(0.22, 0.1, 0.2, -0.36 + k * 0.36, 1.0, 0, '#c98a3a'); label('HOT PIES', 1.1, 0.24, 0, 1.6, -0.02, '#d6452f', '#ffffff'); solid(1.2, 0.6); break
      case 'bucket': cyl(0.2, 0.16, 0.34, 0, 0.17, 0, hue(index + 2), 10); break
      default: unknown.push(o.k); break
    }
    if (!part.length) return
    for (const g of part) {
      if (rot) g.rotateY(rot)
      g.translate(px, 0, pz)
      geos.push(g)
    }
  }
}
