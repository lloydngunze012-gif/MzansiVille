// Builds the day-1 home scene's models (public/models/home/) from the CC0 packs.
// Every file comes out as glTF binary, Draco-compressed, welded and quantised.
//
//   node scripts/home-assets.mjs <kenney-suburban.zip> <kenney-furniture.zip> <quaternius-buildings-dir> <quaternius-animals-dir>
//
// Sources (docs/credits.md): Kenney City Kit (Suburban) 2.0, Kenney Furniture Kit,
// Quaternius Ultimate Textured Building Pack (Dec 2019, "Models with Materials" FBX),
// Quaternius Ultimate Animated Animal Pack (Shiba Inu FBX). All CC0.
// Quaternius ships FBX/OBJ only, so three.js's own FBXLoader reads them here and
// GLTFExporter writes glTF; glTF-Transform then compresses everything.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, draco, mergeDocuments, prune, quantize, weld, resample } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const [suburbZip, furnitureZip, buildingsDir, animalsDir] = process.argv.slice(2)
const OUT = path.resolve('public/models/home')
const TMP = path.resolve(process.env.TEMP || '/tmp', 'mzv-home-assets')
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(TMP, { recursive: true })

// Kenney models used by the home scene (houses, fences, driveways, trees; furniture).
const SUBURB = ['building-type-b', 'building-type-d', 'building-type-e', 'building-type-f', 'building-type-h', 'building-type-l', 'building-type-o', 'building-type-q', 'driveway-long', 'driveway-short', 'fence', 'fence-low', 'fence-1x3', 'path-short', 'path-stones-short', 'planter', 'tree-small']
const FURNITURE = ['bedSingle', 'cabinetBedDrawer', 'desk', 'chairDesk', 'rugRectangle', 'rugRound', 'lampRoundFloor', 'bookcaseOpenLow', 'kitchenCabinet', 'kitchenCabinetDrawer', 'kitchenFridge', 'kitchenStove', 'kitchenSink', 'kitchenCabinetUpper', 'table', 'chair', 'loungeSofa', 'tableCoffee', 'televisionModern', 'cabinetTelevision', 'pottedPlant', 'stairs', 'wall', 'wallWindow', 'wallDoorway', 'floorFull', 'doorway', 'coatRackStanding', 'rugDoormat', 'toaster', 'kitchenCoffeeMachine', 'cardboardBoxClosed', 'plantSmall1', 'pillow', 'books']
// Quaternius buildings for the township street (recoloured at runtime from homes.json).
const BUILDINGS = ['1Story_Mat', '1Story_GableRoof_Mat', '1Story_RoundRoof_Mat', '1Story_Sign_Mat', '2Story_Mat', '2Story_GableRoof_Mat', '2Story_Slim_Mat']

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
})

async function compress(input, output, { keepAnim = false } = {}) {
  const doc = typeof input === 'string' ? await io.read(input) : input
  const ops = [dedup(), prune(), weld()]
  if (keepAnim) ops.push(resample())
  ops.push(quantize(), draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5 }))
  await doc.transform(...ops)
  await io.write(output, doc)
  return fs.statSync(output).size
}

// One file per pack: every model is a named node at the top of one scene, so the pack's
// shared colour map and materials are stored once, and the scene loads one file per pack.
async function kit(files, output) {
  const doc = new Document()
  const scene = doc.createScene('kit')
  for (const [name, file] of files) {
    const part = await io.read(file)
    const map = mergeDocuments(doc, part)
    const holder = doc.createNode(name)
    for (const s of part.getRoot().listScenes()) for (const child of s.listChildren()) holder.addChild(map.get(child))
    scene.addChild(holder)
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose()
  doc.getRoot().setDefaultScene(scene)
  // (one buffer for the whole kit)
  const buffer = doc.getRoot().listBuffers()[0]
  for (const accessor of doc.getRoot().listAccessors()) accessor.setBuffer(buffer)
  for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose()
  return compress(doc, output)
}

function unzip(zip, inner, dest) {
  // (the zip tools in Git Bash and PowerShell both read paths with spaces; tar is on every Windows 10+)
  fs.mkdirSync(dest, { recursive: true })
  execFileSync(process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar', ['-xf', zip, '-C', dest, inner], { stdio: 'ignore' })
  return path.join(dest, inner)
}

// GLTFExporter wants FileReader (browser); this is all it uses of it.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.() }) }
}

async function fbxToGlb(file, out, { clips } = {}) {
  const buf = fs.readFileSync(file)
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.dirname(file) + '/')
  let animations = root.animations || []
  if (clips) {
    animations = animations.filter((a) => clips.some((c) => a.name.toLowerCase().endsWith(`|${c.toLowerCase()}`)))
    // (only rotations move a rig's bones; scale never changes and only the root moves)
    for (const a of animations) a.tracks = a.tracks.filter((t) => t.name.endsWith('.quaternion') || (t.name.endsWith('.position') && /Body|Root|Hips/i.test(t.name.split('.')[0])))
  }
  // Phong from FBX becomes standard (rough, not shiny) so it sits with the Kenney kits.
  root.traverse((node) => {
    if (!node.isMesh) return
    const swap = (m) => new THREE.MeshStandardMaterial({ name: m.name, color: m.color, roughness: 0.85, metalness: 0, map: m.map || null, vertexColors: m.vertexColors })
    node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material)
  })
  const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations })
  fs.writeFileSync(out, Buffer.from(glb))
}

const report = []
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

if (suburbZip) {
  // (the suburban kit's glbs read a shared colour map from Textures/; it is embedded once)
  unzip(suburbZip, 'Models/GLB format/Textures/colormap.png', path.join(TMP, 'suburb'))
  const files = SUBURB.map((name) => [name, unzip(suburbZip, `Models/GLB format/${name}.glb`, path.join(TMP, 'suburb'))])
  report.push(['suburb-kit.glb', await kit(files, path.join(OUT, 'suburb-kit.glb'))])
}
if (furnitureZip) {
  const files = FURNITURE.map((name) => [name, unzip(furnitureZip, `Models/GLTF format/${name}.glb`, path.join(TMP, 'furniture'))])
  report.push(['furniture-kit.glb', await kit(files, path.join(OUT, 'furniture-kit.glb'))])
}
if (buildingsDir) {
  const files = []
  for (const name of BUILDINGS) {
    const src = path.join(buildingsDir, 'Models with Materials', 'FBX', `${name}.fbx`)
    const raw = path.join(TMP, `${name}.glb`)
    await fbxToGlb(src, raw)
    files.push([name.replace('_Mat', '').toLowerCase(), raw])
  }
  report.push(['town-kit.glb', await kit(files, path.join(OUT, 'town-kit.glb'))])
}
if (animalsDir) {
  const src = path.join(animalsDir, 'FBX', 'ShibaInu.fbx')
  const raw = path.join(TMP, 'dog.glb')
  await fbxToGlb(src, raw, { clips: ['Idle', 'Walk', 'Gallop'] })
  report.push(['dog.glb', await compress(raw, path.join(OUT, 'dog.glb'), { keepAnim: true })])
}
let total = 0
for (const [name, size] of report) { total += size; console.log(name.padEnd(36), kb(size)) }
console.log('total'.padEnd(36), kb(total))
