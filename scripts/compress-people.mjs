// Job F (13 Nov): download size. Also run on public/models/city, cars, props and suburb (pass the files). The students' parts (public/models/people2, Quaternius CC0) and the animation
// library (public/models/ual/UAL1_Standard.glb, Quaternius CC0) were plain geometry: 6.5 MB and 7.6 MB, and the
// parts all load before Play. Draco for the meshes (the decoder is already in public/draco for the home and the city),
// redundant animation keyframes resampled away, unused data pruned. One-off, like home-assets.mjs:
//   node scripts/compress-people.mjs [--dry] [file ...]
// Writes in place (the originals stay in git history). Run it once; running it again is harmless.
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { draco, prune, resample, dedup } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

const dry = process.argv.includes('--dry')
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })
const dir = 'public/models/people2'
const files = only.length ? only : [...fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => path.join(dir, f)), 'public/models/ual/UAL1_Standard.glb']
let before = 0
let after = 0
for (const file of files) {
  const doc = await io.read(file)
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'KHR_draco_mesh_compression')) { console.log('already', file); continue }
  await doc.transform(dedup(), resample({ tolerance: 1e-4 }), prune({ keepLeaves: true, keepAttributes: true }), draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeGeneric: 12 }))
  const out = await io.writeBinary(doc)
  const a = fs.statSync(file).size
  before += a
  after += out.length
  console.log(`${file}: ${(a / 1e3).toFixed(0)} KB -> ${(out.length / 1e3).toFixed(0)} KB`)
  if (!dry) fs.writeFileSync(file, out)
}
console.log(`total ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB${dry ? ' (dry run)' : ''}`)
