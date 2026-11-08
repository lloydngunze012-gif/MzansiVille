// Builds the cafeteria props kit (public/models/caf/caf-kit.glb) from seven Polyfork GLBs.
//
//   node scripts/caf-assets.mjs <dir with the seven .glb files>
//
// Source: Polyfork (https://polyfork.dev), free low-poly meshes, CC BY 4.0 with credit and a
// note of what we changed. Credit lines: docs/credits.md and the #/credits screen. We changed:
// the rig is stripped (skins, animation, joint weights, rig metadata; the doors, trays, wheels
// and folds stay in their closed, rest pose), every node transform is baked, each prop is one
// mesh, the vertex colours are re-mapped to the game's palette, and the kit is welded,
// quantised and Draco-compressed like the home scene's kits (scripts/home-assets.mjs).
// The Polyfork files are untrusted input: they are only parsed, never run.
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, flatten, getBounds, join, mergeDocuments, prune, quantize, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const SRC = path.resolve(process.argv[2] || '')
const OUT = path.resolve('public/models/caf')
if (!process.argv[2] || !fs.existsSync(SRC)) { console.error('usage: node scripts/caf-assets.mjs <dir with the seven .glb files>'); process.exit(1) }
fs.mkdirSync(OUT, { recursive: true })

// kit node name <- Polyfork asset id (size_m from the catalogue, for the bounds check)
const ASSETS = [
  ['cafe-counter', 'cafe-counter-d8b226', [2, 1.4, 1]],
  ['servery-counter', 'servery-counter-3afbb9', [2, 1.3, 0.8]],
  ['cafe-table-set', 'cafe-table-set-1868d1', [1.65, 0.85, 1.19]],
  ['folding-dining-table', 'folding-dining-table-7b68ce', [2.4, 0.72, 1.4]],
  ['bar-stool', 'bar-stool-878f03', [0.45, 0.8, 0.41]],
  ['campus-coffee-kiosk', 'campus-coffee-kiosk-ec2395', [2, 2.8, 2.55]],
  ['cafe-parasol', 'cafe-parasol-61a313', [2.72, 2.69, 2.72]],
]

// The game's palette (src/styles.css :root). Each source colour is sorted into a family by hue;
// the family's palette colour gives hue and saturation, the source keeps its own lightness so
// the shading of the model survives.
const PAL = { ink: '#1c1915', paper: '#f4efe4', line: '#e4dac8', yellow: '#f0c400', green: '#1f6b45', clay: '#c4512a', blue: '#244e78', muted: '#6f675c' }
const srgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)
const linear = (s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
function toHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [r + m, g + m, b + m]
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const HSL = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, toHsl(hex(v))]))
function recolour(rgbLinear) {
  const [h, s, l] = toHsl(rgbLinear.map(srgb))
  const fam = (name, lo = 0, hi = 1) => { const [fh, fs] = HSL[name]; return fromHsl([fh, fs, Math.min(hi, Math.max(lo, l))]) }
  let out
  if (s < 0.16) { // neutrals: ink -> muted -> line -> paper by lightness
    const stops = [[0.1, 'ink'], [0.42, 'muted'], [0.84, 'line'], [0.95, 'paper']]
    let a = stops[0], b = stops[stops.length - 1]
    for (let i = 0; i < stops.length - 1; i++) if (l >= stops[i][0] && l <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1] }
    const t = Math.min(1, Math.max(0, (l - a[0]) / (b[0] - a[0] || 1)))
    const ca = hex(PAL[a[1]]), cb = hex(PAL[b[1]])
    out = ca.map((v, i) => v + (cb[i] - v) * t)
  } else if (h >= 190 && h <= 270) out = fam('blue', 0.14, 0.7)
  else if (h >= 90 && h < 190) out = fam('green', 0.14, 0.7)
  else if ((h < 14 || h > 330) && s > 0.3) out = fam('clay', 0.25, 0.7)
  else if (h >= 14 && h < 38 && s >= 0.45) out = fam('clay', 0.3, 0.75) // orange
  else if (h >= 38 && h < 56 && s >= 0.45) out = fam('yellow', 0.3, 0.8) // gold
  else { const [fh] = HSL.line; out = fromHsl([fh, 0.3, Math.min(0.82, Math.max(0.2, l))]) } // wood: the line colour's hue, muted
  return out.map((v) => linear(Math.min(1, Math.max(0, v))))
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
})

// One Polyfork file -> a static, one-mesh, recoloured document (not yet compressed).
async function prepare(file) {
  const doc = await io.read(file)
  const root = doc.getRoot()
  // strip the rig: animation, skins, joint weights, rig metadata
  for (const a of root.listAnimations()) a.dispose()
  for (const s of root.listSkins()) s.dispose()
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) for (const sem of ['JOINTS_0', 'WEIGHTS_0']) { const acc = p.getAttribute(sem); if (acc) { p.setAttribute(sem, null); acc.dispose() } }
  for (const n of root.listNodes()) { n.setSkin?.(null); n.setExtras({}) }
  for (const m of root.listMeshes()) m.setExtras({})
  for (const s of root.listScenes()) s.setExtras({})
  root.getAsset().extras = {}
  // bake every node transform into the meshes, then one mesh
  await doc.transform(flatten(), join({ keepNamed: false }))
  // recolour the vertex colours
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const acc = p.getAttribute('COLOR_0')
    if (!acc) continue
    const v = [0, 0, 0, 1]
    for (let i = 0; i < acc.getCount(); i++) { acc.getElement(i, v); const c = recolour(v.slice(0, 3)); acc.setElement(i, [c[0], c[1], c[2], v[3] ?? 1]) }
  }
  return doc
}

async function compress(doc, output) {
  await doc.transform(dedup(), prune(), weld(), quantize(), draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5 }))
  await io.write(output, doc)
  return fs.statSync(output).size
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const rows = []
const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'mzv-caf-'))
const kitDoc = new Document()
const kitScene = kitDoc.createScene('kit')
const credits = []
for (const [name, id, want] of ASSETS) {
  const file = path.join(SRC, `${id}.glb`)
  const before = fs.statSync(file).size
  const doc = await prepare(file)
  const b = getBounds(doc.getRoot().listScenes()[0])
  const got = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  const tris = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0)
  const meshes = doc.getRoot().listMeshes().length
  // after (alone): a copy, compressed on its own
  const alone = await prepare(file)
  const aloneSize = await compress(alone, path.join(tmp, `${name}.glb`))
  // into the kit
  const map = mergeDocuments(kitDoc, doc)
  const holder = kitDoc.createNode(name)
  for (const s of doc.getRoot().listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child))
  kitScene.addChild(holder)
  rows.push({ name, id, before, aloneSize, tris, meshes, got, want })
  credits.push(id)
}
for (const s of kitDoc.getRoot().listScenes()) if (s !== kitScene) s.dispose()
kitDoc.getRoot().setDefaultScene(kitScene)
const buffer = kitDoc.getRoot().listBuffers()[0]
for (const a of kitDoc.getRoot().listAccessors()) a.setBuffer(buffer)
for (const bf of kitDoc.getRoot().listBuffers()) if (bf !== buffer) bf.dispose()
kitDoc.getRoot().getAsset().copyright = 'Props by Polyfork (https://polyfork.dev), CC BY 4.0. Changed: rig removed, one mesh each, recoloured to the Soft Life palette, Draco-compressed. Assets: ' + credits.join(', ')
const kitSize = await compress(kitDoc, path.join(OUT, 'caf-kit.glb'))

console.log('prop'.padEnd(22), 'before'.padStart(10), 'after (alone)'.padStart(14), 'tris'.padStart(6), 'meshes'.padStart(7), '  size m (got / catalogue)')
let b0 = 0, a0 = 0
for (const r of rows) {
  b0 += r.before; a0 += r.aloneSize
  console.log(r.name.padEnd(22), kb(r.before).padStart(10), kb(r.aloneSize).padStart(14), String(Math.round(r.tris)).padStart(6), String(r.meshes).padStart(7), ' ', r.got.map((v) => v.toFixed(2)).join(' x '), '/', r.want.join(' x '))
}
console.log('sum of the seven'.padEnd(22), kb(b0).padStart(10), kb(a0).padStart(14))
console.log('caf-kit.glb (one file)'.padEnd(22), ''.padStart(10), kb(kitSize).padStart(14))
const decoder = ['draco_decoder.wasm', 'draco_wasm_wrapper.js'].reduce((n, f) => n + fs.statSync(path.resolve('public/draco', f)).size, 0)
console.log(`Draco decoder (already shipped, shared): ${kb(decoder)}; kit + decoder = ${kb(kitSize + decoder)} of the 2048 KB budget`)
