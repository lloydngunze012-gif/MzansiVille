import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { genderOf, skins } from '../avatar.js'
import { SPEED } from '../speed.js'

// Students are Quaternius "Ultimate Modular Men / Women" (CC0, public/models/people2):
// low-poly people with modelled clothes, shoes and hairstyles. Each student is an
// outfit (Body, Legs, Feet meshes) plus a head (face and hair) from the same rig,
// animated with that gender's clips. Material colours follow the character creator.
// createAvatar returns at once with a capsule stand-in; the model swaps in when loaded.

const BASE = '/models/people2/'
// Creator outfit -> outfit file, and which of its materials take the top colour
// (the rest keep their own colour: a white sole, a tie, a belt).
const OUTFIT = {
  male: {
    hoodie: { file: 'hoodie', top: ['Purple'] },
    shirt: { file: 'tee', top: ['LightBrown'] },
    organt: { file: 'tee', top: ['LightBrown'] },
    jacket: { file: 'suit', top: ['Suit'] },
    punk: { file: 'punk', top: ['Black'] },
    beach: { file: 'beach', top: ['LightBrown'] },
  },
  // (the women's pack has no hoodie: "hoodie" is the tee with a hood, long sleeves and
  // a pocket made here, see addHoodie; "shirt" is the punk crop top, named Crop top)
  female: {
    hoodie: { file: 'tee', top: ['White'], hoodie: true },
    shirt: { file: 'punk', top: ['Pink'] },
    organt: { file: 'tee', top: ['White'] },
    jacket: { file: 'suit', top: ['Black'] },
    dress: { file: 'dress', top: ['LimeGreen'], dress: true },
    shweshwe: { file: 'dress', top: ['LimeGreen'], dress: true },
    skirt: { file: 'dress', top: ['LimeGreen'], skirt: true },
    punk: { file: 'punk', top: ['Pink'] },
  },
}
// Creator hair -> head file, and the hair made here on top of it (HAIR_STYLE: locs and
// a fade aren't in the pack; see hairCap and addLocs). ("braids" is the saved id of the
// locs: it was braids first.)
const HEAD = {
  female: { braids: 'bob', curls: 'bun', fade: 'bob', crop: 'bob', long: 'long', mohawk: 'mohawk' },
  male: { braids: 'short', curls: 'parted', fade: 'short', crop: 'crop', spiky: 'long' },
}
const HAIR_STYLE = { female: { braids: 'locs', fade: 'fade' }, male: { braids: 'locs' } }
// Cast and crowd "model" keys: gender and head, for variety.
const MODEL_LOOK = {
  'female-b': ['female', 'bun'], 'female-d': ['female', 'long'], 'female-f': ['female', 'bob'],
  'male-a': ['male', 'short'], 'male-d': ['male', 'parted'], 'male-f': ['male', 'long'],
}
export const CROWD_MODELS = Object.keys(MODEL_LOOK)
const HEIGHT = 1.74

// [top, trousers, shoes], the same palette as the 2D creator (src/avatar.js).
const CLOTH = {
  hoodie: ['#2e8b57', '#2b3a55', '#f7f4ee'],
  shirt: ['#ff8a3d', '#244e78', '#1c1915'],
  jacket: ['#1d7fb8', '#3a2f4f', '#f0c400'],
  organt: ['#f0c400', '#1c1915', '#7b3fe4'],
  dress: ['#e8497a', '#e8497a', '#f7f4ee'],
  skirt: ['#f7f4ee', '#7b3fe4', '#1c1915'],
  shweshwe: ['#2456a6', '#2456a6', '#c58a3a'],
}
const HAIR = '#1c1915'

// Game names for poses and gestures -> clip names in the pack.
const CLIP = { idle: 'Idle', walk: 'Walk', sprint: 'Run', talk: 'Idle_Neutral', dance: 'Wave' }
const GESTURE = { 'interact-right': 'Interact', 'interact-left': 'Interact', 'pick-up': 'Interact', 'emote-yes': 'Wave', 'emote-no': 'HitRecieve' }

const cache = {}
function load(name) {
  if (!cache[name]) {
    cache[name] = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(`${BASE}${name}.glb`))
    cache[name].catch(() => { delete cache[name] })
  }
  return cache[name]
}

function colorOf(list, id, fallback) {
  return list.find((item) => item.id === id)?.fill || fallback
}

// Shweshwe: deep blue with a small white geometric print.
let shweshweTexture = null
function shweshwe() {
  if (shweshweTexture) return shweshweTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#9fb6ea'
  for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) { ctx.beginPath(); ctx.arc(x + 4, y + 4, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x, y + 10, 8, 1.5) }
  shweshweTexture = new THREE.CanvasTexture(c)
  shweshweTexture.wrapS = shweshweTexture.wrapT = THREE.RepeatWrapping
  shweshweTexture.colorSpace = THREE.SRGBColorSpace
  return shweshweTexture
}

function partOf(name) {
  if (/head/i.test(name)) return 'head'
  if (/legs/i.test(name)) return 'legs'
  if (/feet/i.test(name)) return 'feet'
  return 'body'
}

function recolour(model, look) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true, ...extra })
  const made = {}
  const shared = (key, make) => (made[key] ||= make())
  const topMat = () => shared('top', () => mat(look.top, look.shweshwe ? { map: shweshwe() } : {}))
  model.traverse((node) => {
    if (!node.isMesh) return
    const part = node.userData.part || 'body'
    const list = Array.isArray(node.material) ? node.material : [node.material]
    let shoeDone = false
    const next = list.map((m) => {
      const name = m.name || ''
      // Shoes for everyone: where an outfit shows bare feet (sandals, flip-flops,
      // pumps), that part becomes the shoe's upper, a shade darker than the shoe.
      if (part === 'feet' && /^skin/i.test(name)) return shared('upper', () => mat(new THREE.Color(look.shoes).multiplyScalar(0.72)))
      if (/^skin/i.test(name)) return shared(`skin${name}`, () => {
        const c = new THREE.Color(look.skin).multiplyScalar(/dark/i.test(name) ? 0.85 : 1)
        // Deep and Ebony skin (QA pass 1: faces read as a dark block): a little glow of its own and a
        // soft sheen, so the planes of the face and the dark eyes and brows read against it.
        const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
        const lift = lum < 0.06 ? Math.min(1.2, Math.max(0.3, 0.035 / lum - 0.3)) : 0
        const m = mat(c, lift ? { emissive: c.clone().multiplyScalar(lift), roughness: 0.55 } : {})
        m.userData.skin = true
        return m
      })
      if (part === 'head') {
        // Eyebrows follow a chosen hair colour (a darker shade of it): blond hair over black
        // brows is the first thing that looks wrong. (The women's brows are "Hair_Brown".)
        if (look.tone && /eyebrow|^hair_brown$/i.test(name)) return shared('brows', () => mat(new THREE.Color(look.hair).multiplyScalar(0.62)))
        if (/^eye|eyebrow|^brown$/i.test(name)) return shared('eyes', () => mat(0x0e0806, { roughness: 0.35 }))
        if (/earring|yellow|moustache/i.test(name)) return shared(`own${m.uuid}`, () => m.clone())
        return shared('hair', () => { const m = mat(look.hair); m.userData.hair = true; return m })
      }
      if (part === 'body') return look.outfitTop.includes(name) ? topMat() : shared(`own${m.uuid}`, () => m.clone())
      if (part === 'legs') {
        if (look.dress) return topMat()
        if (look.skirt) return shared('skirt', () => mat(look.skirt))
        return shared('bottom', () => mat(look.bottom))
      }
      if (part === 'feet' && !shoeDone && !/^white$/i.test(name)) { shoeDone = true; return shared('shoes', () => mat(look.shoes)) }
      return shared(`own${m.uuid}`, () => m.clone())
    })
    node.material = Array.isArray(node.material) ? next : next[0]
    node.castShadow = true
    if (look.tone && part === 'head' && next.some((m) => m.userData.hair)) tintHair(node)
  })
}

// Chosen hair colours: not one flat colour, which reads as a painted-on cap. Each vertex of
// the hair takes a shade of it, darker towards the roots and the lower locks, a little
// different from its neighbours, so the flat facets read as clumps of strands.
function tintHair(mesh) {
  const geo = mesh.geometry.clone() // (heads of one file share their geometry)
  const pos = geo.attributes.position
  geo.computeBoundingBox()
  const { min, max } = geo.boundingBox
  const span = Math.max(1e-4, max.y - min.y)
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / span
    const h = Math.sin(pos.getX(i) * 91.7 + pos.getY(i) * 53.1 + pos.getZ(i) * 77.3) * 43758.5453
    const jitter = (h - Math.floor(h) - 0.5) * 0.2
    const shade = 0.74 + 0.3 * Math.pow(t, 0.7) + jitter
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  mesh.geometry = geo
  for (const m of [].concat(mesh.material)) if (m.userData.hair) { m.vertexColors = true; m.needsUpdate = true }
}

// The Organt tee print, like the cover: a big black "031" (the dialling code)
// with "ORGANT" in purple underneath, on the chest, carried by the chest bone.
const printTextures = {}
// (the creator's stage draws it four times as big and sharpened for the angles it turns
// through; campus keeps the small one)
function organtPrint(code = '031', hi = false) {
  const k = hi ? 4 : 1
  if (printTextures[k]) return printTextures[k]
  const canvas = document.createElement('canvas')
  canvas.width = 256 * k
  canvas.height = 192 * k
  const ctx = canvas.getContext('2d')
  ctx.scale(k, k)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1c1915'
  ctx.font = '900 100px "Arial Black", Impact, sans-serif'
  ctx.fillText(code, 128, 70, 236)
  // ORGANT big enough to read on a phone (QA pass 1), in a darker purple for contrast on any tee
  ctx.fillStyle = '#5b23c9'
  ctx.font = '900 50px "Arial Black", Impact, sans-serif'
  ctx.fillText('ORGANT', 128, 152, 244)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  if (hi) tex.anisotropy = 8
  printTextures[k] = tex
  return tex
}

const worldOf = (node) => node.getWorldPosition(new THREE.Vector3())

function addOrgantMark(model, hi = false) {
  const chest = model.getObjectByName('Chest')
  const neck = model.getObjectByName('Neck')
  const torso = model.getObjectByName('Torso') || model.getObjectByName('Abdomen')
  if (!chest || !neck || !torso) return
  model.updateMatrixWorld(true)
  const top = worldOf(neck)
  const low = worldOf(torso)
  const shoulders = worldOf(model.getObjectByName('UpperArmL') || neck).distanceTo(worldOf(model.getObjectByName('UpperArmR') || neck)) || 0.3
  const w = shoulders * 0.88
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.75), new THREE.MeshStandardMaterial({ map: organtPrint('031', hi), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }))
  mark.name = 'organt-mark'
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()))
  const at = new THREE.Vector3().lerpVectors(low, top, 0.42).addScaledVector(forward, shoulders * 0.76)
  model.add(mark)
  mark.position.copy(model.worldToLocal(at))
  mark.updateMatrixWorld(true)
  chest.attach(mark)
}

// Hair the pack doesn't have, made here in the same flat low-poly style and carried by
// the head bone: a close crop (a fade) and dreadlocks. The head's own hair is hidden
// (its big hair meshes; the eyebrows stay) and a cap is shaped over the scalp.
function hairCap(model, heads, look, fuller) {
  const head = model.getObjectByName('Head')
  if (!head) return null
  model.updateMatrixWorld(true)
  const box = new THREE.Box3()
  for (const mesh of heads) {
    const m = [].concat(mesh.material)[0]
    const b = new THREE.Box3().setFromObject(mesh)
    if (m?.userData.hair && b.getSize(new THREE.Vector3()).y > 0.05) mesh.visible = false
    else if (m?.userData.skin) box.union(b)
  }
  if (box.isEmpty()) return null
  const size = box.getSize(new THREE.Vector3())
  const mid = box.getCenter(new THREE.Vector3())
  // An egg round the whole skull (a touch bigger, fuller for braids), tilted back so its
  // rim sits at the brow in front and down at the nape behind: hair, not a hat.
  const k = fuller ? 1.2 : 1.16
  const radii = new THREE.Vector3(size.x / 2 * k * 1.08, size.y / 2 * k * 1.14, size.z / 2 * k * 1.1)
  const RIM = Math.PI * 0.57
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 9, 0, Math.PI * 2, 0, RIM), new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }))
  cap.scale.copy(radii)
  // (a fade sits higher and tighter: a short crop with the forehead showing)
  cap.rotation.x = fuller ? -0.46 : -0.62
  // (the men's face is longer: their hairline sits higher still)
  cap.position.copy(mid).add(new THREE.Vector3(0, size.y * (fuller ? 0.06 : look.gender === 'male' ? 0.22 : 0.13), fuller ? 0 : -size.z * 0.06))
  cap.castShadow = true
  cap.name = 'hair-cap'
  // (built in world space, then handed to the model and on to the head bone)
  cap.position.copy(model.worldToLocal(cap.position.clone()))
  const s = model.getWorldScale(new THREE.Vector3())
  cap.scale.divide(s)
  model.add(cap)
  cap.updateMatrixWorld(true)
  // A point on the cap, at an angle round the head (0: the back) and down from the
  // crown (the rim at RIM), a little proud of it with lift, in world space.
  const on = (a, down = RIM, lift = 1) => new THREE.Vector3(Math.sin(a) * Math.sin(down) * lift, Math.cos(down) * lift, -Math.cos(a) * Math.sin(down) * lift).applyMatrix4(cap.matrixWorld)
  const rim = (a) => on(a)
  head.attach(cap)
  return { head, rim, on, RIM, radii, mid }
}

function addLocs(model, heads, look) {
  // (men's locs sit on the tight, high crop; women's on a fuller cap)
  const base = hairCap(model, heads, look, look.gender !== 'male')
  if (!base) return
  const { head, on, RIM, mid } = base
  const parts = []
  const unit = new THREE.Vector3(1, 1, 1).divide(model.getWorldScale(new THREE.Vector3()))
  // One lumpy rope segment from p to q (world space), thick r.
  const rope = (p, q, r, seed) => {
    const len = p.distanceTo(q)
    const g = new THREE.CylinderGeometry(r, r * 0.85, len, 6, 3)
    const pos = g.attributes.position
    for (let v = 0; v < pos.count; v++) {
      const ring = Math.round((pos.getY(v) / len + 0.5) * 3)
      const w = 0.82 + 0.36 * (((ring + seed) * 5) % 4) / 3
      pos.setX(v, pos.getX(v) * w)
      pos.setZ(v, pos.getZ(v) * w)
    }
    const dir = q.clone().sub(p).normalize()
    const at = model.worldToLocal(p.clone().lerp(q, 0.5))
    g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), unit))
    parts.push(g)
  }
  const reach = look.gender === 'male' ? 0.22 : 0.34 // how far below the head they hang
  const COUNT = 20
  // Each loc grows from near the crown, lies over the head to the hairline, and (round
  // the sides and back, never over the face) hangs down from there, a little out.
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2
    const r = 0.016 + 0.004 * ((i * 3) % 3) / 2
    const front = Math.cos(a) < -0.45 // (0 is the back of the head)
    const path = [on(a, 0.12 * Math.PI, 1.04), on(a, 0.32 * Math.PI, 1.07), on(a, RIM, 1.06)]
    if (!front) {
      const end = path[2].clone()
      const out = new THREE.Vector3(end.x - mid.x, 0, end.z - mid.z).normalize()
      const len = (end.y - (mid.y - reach)) * (0.8 + 0.35 * ((i * 7) % 5) / 4)
      path.push(end.clone().addScaledVector(out, len * 0.18).add(new THREE.Vector3(0, -len * 0.55, 0)))
      path.push(end.clone().addScaledVector(out, len * 0.26).add(new THREE.Vector3(0, -len, 0)))
    }
    for (let k = 0; k + 1 < path.length; k++) rope(path[k], path[k + 1], k < 2 ? r * 1.1 : r, i + k)
  }
  const locs = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.95, flatShading: true }))
  locs.castShadow = true
  locs.name = 'locs'
  model.add(locs)
  locs.updateMatrixWorld(true)
  head.attach(locs)
}

// The women's pack has no hoodie: the tee, with long sleeves on the arm bones, a hood
// lying at the back of the neck, a front pocket and drawstrings, in the top colour.
function addHoodie(model, look) {
  const chest = model.getObjectByName('Chest')
  const neck = model.getObjectByName('Neck')
  const torso = model.getObjectByName('Torso') || model.getObjectByName('Abdomen')
  if (!chest || !neck || !torso) return
  model.updateMatrixWorld(true)
  const cloth = new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.85, flatShading: true })
  const shade = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.top).multiplyScalar(0.8), roughness: 0.85, flatShading: true })
  const put = (mesh, bone) => { mesh.castShadow = true; model.add(mesh); mesh.updateMatrixWorld(true); bone.attach(mesh) }
  // Sleeves: from the shoulder to the wrist, a slightly baggy tube on each arm bone.
  for (const side of ['L', 'R']) {
    const upper = model.getObjectByName(`UpperArm${side}`)
    const lower = model.getObjectByName(`LowerArm${side}`)
    const wrist = model.getObjectByName(`Wrist${side}`)
    if (!upper || !lower || !wrist) continue
    for (const [bone, from, to, r] of [[upper, worldOf(upper), worldOf(lower), 0.058], [lower, worldOf(lower), worldOf(wrist), 0.046]]) {
      const len = from.distanceTo(to)
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len * 1.04, 7), cloth)
      tube.position.copy(from).lerp(to, 0.5)
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
      tube.position.copy(model.worldToLocal(tube.position.clone()))
      tube.quaternion.premultiply(model.getWorldQuaternion(new THREE.Quaternion()).invert())
      put(tube, bone)
    }
    // Round the joints off (the tee's own sleeve ends in a ragged cap that shows skin at the
    // shoulder and the elbow when the arm lifts): a ball of cloth at each.
    for (const [bone, at, r] of [[upper, worldOf(upper), 0.066], [lower, worldOf(lower), 0.052]]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), cloth)
      ball.position.copy(model.worldToLocal(at.clone()))
      put(ball, bone)
    }
  }
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()))
  const top = worldOf(neck)
  const low = worldOf(torso)
  const shoulders = worldOf(model.getObjectByName('UpperArmL') || neck).distanceTo(worldOf(model.getObjectByName('UpperArmR') || neck)) || 0.3
  const local = (v) => model.worldToLocal(v.clone())
  // The hood: a thick ring round the neck (what you see from the front), bunched up into
  // a fuller hood at the back, a front pocket, drawstrings with tips, and ribbed cuffs.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.036, 8, 18), shade)
  collar.scale.set(1.22, 1.0, 0.95)
  collar.rotation.x = Math.PI / 2 + 0.28
  collar.position.copy(local(top.clone().addScaledVector(forward, 0.03).add(new THREE.Vector3(0, -0.04, 0))))
  put(collar, chest)
  const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), cloth)
  hood.scale.set(shoulders * 0.46, 0.12, 0.09)
  hood.rotation.x = Math.PI * 0.62
  hood.position.copy(local(top.clone().addScaledVector(forward, -0.08).add(new THREE.Vector3(0, -0.06, 0))))
  put(hood, chest)
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(shoulders * 0.7, 0.085, 0.014), shade)
  pocket.position.copy(local(new THREE.Vector3().lerpVectors(low, top, 0.02).addScaledVector(forward, shoulders * 0.5)))
  put(pocket, torso)
  const tip = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.6 })
  for (const side of [-1, 1]) {
    const cordAt = top.clone().addScaledVector(forward, shoulders * 0.52).add(new THREE.Vector3(side * 0.034, -0.15, 0))
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.2, 4), tip)
    cord.position.copy(local(cordAt))
    put(cord, chest)
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), tip)
    end.position.copy(local(cordAt.clone().add(new THREE.Vector3(0, -0.1, 0))))
    put(end, chest)
  }
  // Ribbed cuffs: a darker band at each wrist.
  for (const side of ['L', 'R']) {
    const lower = model.getObjectByName(`LowerArm${side}`)
    const wrist = model.getObjectByName(`Wrist${side}`)
    if (!lower || !wrist) continue
    const from = worldOf(lower)
    const to = worldOf(wrist)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.035, 8), shade)
    cuff.position.copy(from.clone().lerp(to, 0.94))
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    cuff.position.copy(model.worldToLocal(cuff.position.clone()))
    cuff.quaternion.premultiply(model.getWorldQuaternion(new THREE.Quaternion()).invert())
    put(cuff, lower)
  }
}

export function lookOf(avatar = {}) {
  const byModel = MODEL_LOOK[avatar.model]
  const gender = byModel ? byModel[0] : genderOf(avatar)
  const outfit = OUTFIT[gender][avatar.outfit] || OUTFIT[gender].shirt
  const cloth = CLOTH[avatar.outfit] || CLOTH.hoodie
  const skin = avatar.skinColor || colorOf(skins, avatar.skin, '#d2956b')
  const head = byModel ? byModel[1] : HEAD[gender][avatar.hair] || HEAD[gender].crop
  return {
    model: avatar.model || `${gender}:${outfit.file}:${head}${HAIR_STYLE[gender]?.[avatar.hair] ? `:${HAIR_STYLE[gender][avatar.hair]}` : ''}${outfit.hoodie ? ':hood' : ''}`,
    gender,
    outfitFile: outfit.file,
    outfitTop: outfit.top,
    headFile: head,
    skin,
    hair: avatar.hairColor || HAIR,
    top: avatar.topColor || cloth[0],
    bottom: avatar.bottomColor || cloth[1],
    shoes: avatar.shoeColor || cloth[2],
    skirt: outfit.skirt ? avatar.skirtColor || cloth[1] : '',
    dress: Boolean(outfit.dress),
    shweshwe: avatar.outfit === 'shweshwe',
    organt: avatar.outfit === 'organt',
    hoodie: Boolean(outfit.hoodie),
    hairStyle: byModel ? '' : HAIR_STYLE[gender]?.[avatar.hair] || '',
    // (a hair colour beyond the default black gets light and dark in it, see tintHair)
    tone: Boolean(avatar.hairColor) && avatar.hairColor.toLowerCase() !== HAIR,
    // (the creator's stage: the chest print is drawn at high resolution)
    studio: Boolean(avatar.studio),
    // (a curvy body is a women's option: the men's creator doesn't offer it)
    curvy: gender === 'female' && avatar.body === 'curvy',
    build: avatar.build ?? 0,
  }
}

// Gait calibration, once per outfit: for each clip, how far the lowest sole is off
// the ground through the cycle (the walk and run clips dip the feet into the floor),
// and how fast the planted foot slides back (the speed the clip was animated for).
// poseAvatar lifts the body by the first and sets the clip rate from the second,
// so feet rest on the ground and don't slide.
const GAIT_SAMPLES = 40
const gaits = {}
const gaitVtx = new THREE.Vector3()
// The lowest sole point, and the middle of each foot (left and right of the body).
function soleOf(model, feet) {
  let min = Infinity
  feet?.forEach((f) => f.set(0, 0, 0, 0))
  model.traverse((node) => {
    if (!node.isSkinnedMesh || node.userData.part !== 'feet') return
    const count = node.geometry.attributes.position.count
    for (let i = 0; i < count; i++) {
      node.getVertexPosition(i, gaitVtx)
      node.localToWorld(gaitVtx)
      if (gaitVtx.y < min) min = gaitVtx.y
      if (feet) { const f = feet[gaitVtx.x < 0 ? 0 : 1]; f.x += gaitVtx.x; f.y += gaitVtx.y; f.z += gaitVtx.z; f.w += 1 }
    }
  })
  feet?.forEach((f) => { if (f.w) f.multiplyScalar(1 / f.w) })
  return min
}
// The bottom of each shoe as a few points fixed to its foot bone (the lowest
// vertices, standing): read every frame, they say exactly where the soles are,
// whatever the clip or blend, so the body can stand on them.
function solePoints(model, bones) {
  const feet = ['FootL', 'FootR'].map((n) => bones[n]).filter(Boolean)
  if (!feet.length) return []
  const all = []
  model.traverse((node) => {
    if (!node.isSkinnedMesh || node.userData.part !== 'feet') return
    for (let i = 0; i < node.geometry.attributes.position.count; i++) {
      node.getVertexPosition(i, gaitVtx)
      all.push(node.localToWorld(gaitVtx.clone()))
    }
  })
  all.sort((a, b) => a.y - b.y)
  const lowest = all.filter((v) => v.y < all[0].y + 0.04)
  // Heel to toe on each foot: spread the picks along the foot's length.
  lowest.sort((a, b) => a.z - b.z)
  const picks = lowest.filter((_, i) => i % Math.max(1, Math.floor(lowest.length / 24)) === 0)
  // ...and the toe caps and heels (up to 10 cm high), so a shoe never pushes into the
  // riser of a step.
  for (const side of [1, -1]) {
    const shoe = all.filter((v) => Math.sign(v.x) === side && v.y < all[0].y + 0.1).sort((a, b) => b.z - a.z)
    picks.push(...shoe.slice(0, 90).filter((_, i) => i % 3 === 0), ...shoe.slice(-60).filter((_, i) => i % 3 === 0))
  }
  const inv = new THREE.Matrix4()
  return picks.map((v) => {
    const foot = feet.reduce((best, f) => (worldOf(f).distanceTo(v) < worldOf(best).distanceTo(v) ? f : best))
    return [foot, v.clone().applyMatrix4(inv.copy(foot.matrixWorld).invert())]
  })
}
const soleAt = new THREE.Vector3()
function soleNow(data) {
  let min = Infinity
  for (const [foot, local] of data.soles) {
    const y = soleAt.copy(local).applyMatrix4(foot.matrixWorld).y
    if (y < min) min = y
  }
  return min
}
// How far to lift the body so every sole point is on or above what's under it (the
// scene's floor map: paths, decks, steps; never below the person's own ground).
function soleLift(data, floorAt, ground) {
  let need = -Infinity
  for (const [foot, local] of data.soles) {
    soleAt.copy(local).applyMatrix4(foot.matrixWorld)
    const under = Math.max(ground, floorAt(soleAt.x, soleAt.z))
    if (under - soleAt.y > need) need = under - soleAt.y
  }
  return need
}
// The floor map of the scene a person is in (scene.userData.floorAt), if any.
function floorOf(group) {
  for (let n = group.parent; n; n = n.parent) if (n.userData?.floorAt) return n.userData.floorAt
  return null
}

// The rig's legs were made to be aimed by a knee target (an IK pole) that three.js
// doesn't run, and the left one comes out turned well outwards. Turn each thigh about
// its hip-to-ankle line so the knee points ahead: the ankle stays put (the feet keep
// their place), only the knee comes round.
const poleAxis = new THREE.Vector3()
const poleOff = new THREE.Vector3()
const poleWant = new THREE.Vector3()
const poleFwd = new THREE.Vector3()
function aimKnees(group, model) {
  const { bones, footInShin } = group.userData
  if (!footInShin) return
  model.updateMatrixWorld(true)
  poleFwd.set(0, 0, 1).applyQuaternion(model.getWorldQuaternion(groupQ))
  for (const side of ['L', 'R']) {
    const up = bones[`UpperLeg${side}`]
    const low = bones[`LowerLeg${side}`]
    if (!up || !low || !footInShin[side]) continue
    const H = worldOf(up)
    const K = worldOf(low)
    const A = low.localToWorld(footInShin[side].clone())
    poleAxis.subVectors(A, H)
    const len = poleAxis.length()
    if (len < 1e-4) continue
    poleAxis.divideScalar(len)
    poleOff.subVectors(K, H)
    poleOff.addScaledVector(poleAxis, -poleOff.dot(poleAxis))
    if (poleOff.length() < 0.01) continue // (a straight leg has no knee to aim)
    poleWant.copy(poleFwd).addScaledVector(poleAxis, -poleFwd.dot(poleAxis))
    if (poleWant.lengthSq() < 1e-6) continue
    poleOff.normalize()
    poleWant.normalize()
    const angle = Math.atan2(poleAxis.dot(new THREE.Vector3().crossVectors(poleOff, poleWant)), poleOff.dot(poleWant))
    if (Math.abs(angle) > 0.02) turnWorld(up, poleAxis, angle)
  }
}

// ...and the feet: each turned to at most a natural toe-out from straight ahead (the
// left one comes out turned well outwards too), keeping the clip's heel and toe lift.
const TOE_OUT = 15 * Math.PI / 180
const footFwd = new THREE.Vector3()
const footUp = new THREE.Vector3()
function aimFeet(group, model) {
  const { bones, footFlat } = group.userData
  if (!footFlat) return
  const mq = model.getWorldQuaternion(new THREE.Quaternion())
  const inv = mq.clone().invert()
  footUp.set(0, 1, 0).applyQuaternion(mq)
  for (const side of ['L', 'R']) {
    const foot = bones[`Foot${side}`]
    if (!foot || !footFlat[side]) continue
    legQ.copy(inv).multiply(foot.getWorldQuaternion(new THREE.Quaternion())).multiply(footFlat[side].clone().invert())
    footFwd.set(0, 0, 1).applyQuaternion(legQ)
    if (Math.hypot(footFwd.x, footFwd.z) < 0.35) continue // (pointing down mid-stride)
    const turn = Math.atan2(footFwd.x, footFwd.z)
    const keep = Math.max(-TOE_OUT, Math.min(TOE_OUT, turn))
    if (Math.abs(turn - keep) > 0.01) turnWorld(foot, footUp, keep - turn)
  }
}

// Put each foot back at the end of its shin (see footInShin in attachModel).
function carryFeet(model, bones, footInShin) {
  model.updateMatrixWorld(true)
  for (const side of ['L', 'R']) {
    const shin = bones[`LowerLeg${side}`]
    const foot = bones[`Foot${side}`]
    const local = footInShin?.[side]
    if (!shin || !foot || !local) continue
    const at = shin.localToWorld(local.clone())
    foot.parent.worldToLocal(at)
    foot.position.copy(at)
  }
  model.updateMatrixWorld(true)
}

function calibrate(model, animations, bones, footInShin) {
  const saved = []
  model.traverse((node) => { if (node.isBone) saved.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]) })
  const mixer = new THREE.AnimationMixer(model)
  const gait = {}
  for (const clip of animations) {
    const action = mixer.clipAction(clip).play()
    const lift = new Float32Array(GAIT_SAMPLES + 1)
    const prints = []
    for (let i = 0; i <= GAIT_SAMPLES; i++) {
      mixer.setTime((clip.duration * i) / GAIT_SAMPLES)
      carryFeet(model, bones, footInShin)
      const feet = [new THREE.Vector4(), new THREE.Vector4()]
      lift[i] = -soleOf(model, feet)
      prints.push(feet)
    }
    // The planted foot (the lower one) slides backwards at the walking speed.
    const slides = []
    const step = clip.duration / GAIT_SAMPLES
    for (let i = 1; i <= GAIT_SAMPLES; i++) {
      const low = prints[i][0].y <= prints[i][1].y ? 0 : 1
      if ((prints[i - 1][0].y <= prints[i - 1][1].y ? 0 : 1) !== low) continue
      slides.push(Math.hypot(prints[i][low].x - prints[i - 1][low].x, prints[i][low].z - prints[i - 1][low].z) / step)
    }
    slides.sort((a, b) => a - b)
    gait[clip.name] = { lift, speed: slides.length ? slides[Math.floor(slides.length / 2)] : 0, duration: clip.duration }
    action.stop()
    mixer.uncacheAction(clip)
  }
  for (const [bone, p, q, sc] of saved) { bone.position.copy(p); bone.quaternion.copy(q); bone.scale.copy(sc) }
  model.updateMatrixWorld(true)
  return gait
}

// Curvy (women): the outfit's own shape is reshaped, so every outfit shows it, from the
// front and the side: wider hips and fuller thighs, a rounder behind (more than the
// front), a slightly slimmer waist. Done on the bind-pose vertices, weighted by how much
// each one follows the hips and thighs, so the skeleton is untouched (walking, sitting
// and the seat fits are as before) and arms, shoes and the head are not moved.
export const CURVY_SHAPE = { hips: 0.30, behind: 0.55, front: 0.16, waist: 0.07 }
function shapeCurvy(model, look = {}) {
  model.updateMatrixWorld(true)
  const hips = model.getObjectByName('Hips')
  const box = new THREE.Box3().setFromObject(model)
  const H = Math.max(0.1, box.max.y - box.min.y)
  const at = hips ? model.worldToLocal(worldOf(hips)) : new THREE.Vector3(0, box.min.y + H * 0.52, 0)
  const hipC = at.y - 0.025 * H
  const waistC = at.y + 0.11 * H
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert()
  const p = new THREE.Vector3()
  model.traverse((node) => {
    if (!node.isSkinnedMesh || (node.userData.part !== 'body' && node.userData.part !== 'legs')) return
    // A skirt or a dress falls straight from the wider hips (an A-line) instead of following the
    // thighs in and out, which made it balloon (QA pass 1).
    const aLine = (look.dress || look.skirt) && node.userData.part === 'legs'
    const geo = node.geometry.clone() // (clones of one outfit share their geometry)
    node.geometry = geo
    const toModel = inv.clone().multiply(node.matrixWorld)
    const toMesh = toModel.clone().invert()
    const pos = geo.attributes.position
    const ids = geo.attributes.skinIndex
    const wts = geo.attributes.skinWeight
    const names = node.skeleton.bones.map((b) => b.name)
    const hipWeight = names.map((n) => (/^(Hips|UpperLeg)/.test(n) ? 1 : /^LowerLeg/.test(n) ? 0.35 : 0))
    const waistWeight = names.map((n) => (/^(Abdomen|Hips)$/.test(n) ? 1 : n === 'Torso' ? 0.6 : 0))
    for (let i = 0; i < pos.count; i++) {
      let wh = 0
      let ww = 0
      for (let k = 0; k < 4; k++) { const w = wts.getComponent(i, k); const b = ids.getComponent(i, k); wh += w * hipWeight[b]; ww += w * waistWeight[b] }
      if (wh < 0.01 && ww < 0.01) continue
      p.fromBufferAttribute(pos, i).applyMatrix4(toModel)
      const u = (p.y - hipC) / H
      const g = u >= 0 ? Math.exp(-((u / 0.075) ** 2)) : aLine ? 0.8 : Math.exp(-((u / 0.105) ** 2))
      const gw = Math.exp(-(((p.y - waistC) / H / 0.05) ** 2))
      const dz = p.z - at.z
      const f = wh * g
      p.x += p.x * (CURVY_SHAPE.hips * f - CURVY_SHAPE.waist * ww * gw)
      p.z += dz * f * (dz < 0 ? CURVY_SHAPE.behind : CURVY_SHAPE.front)
      p.applyMatrix4(toMesh)
      pos.setXYZ(i, p.x, p.y, p.z)
    }
    pos.needsUpdate = true
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
  })
}

async function attachModel(group, look) {
  const g = look.gender
  const [animGltf, outfitGltf, headGltf] = await Promise.all([
    load(`${g}_anim`),
    load(`${g}_outfit_${look.outfitFile}`),
    load(`${g}_head_${look.headFile}`),
  ])
  if (group.userData.disposed) return
  const { clone } = await import('three/addons/utils/SkeletonUtils.js')
  const model = clone(outfitGltf.scene)
  // The head comes from another file of the same rig: bind it to this skeleton.
  let skinned = null
  model.traverse((node) => { if (node.isSkinnedMesh && !skinned) skinned = node })
  const heads = []
  clone(headGltf.scene).traverse((node) => { if (node.isSkinnedMesh) heads.push(node) })
  // Tag each part before moving anything (multi-material parts load as a group).
  model.traverse((node) => { if (node.isMesh) node.userData.part = partOf(`${node.name} ${node.parent?.name || ''}`) })
  for (const mesh of heads) {
    mesh.userData.part = 'head'
    // Same rig, same bind pose: take the outfit mesh's place and bind matrix.
    skinned.parent.add(mesh)
    mesh.position.copy(skinned.position)
    mesh.quaternion.copy(skinned.quaternion)
    mesh.scale.copy(skinned.scale)
    mesh.bind(skinned.skeleton, skinned.bindMatrix)
  }
  recolour(model, look)
  if (look.curvy) shapeCurvy(model, look)
  const box = new THREE.Box3().setFromObject(model)
  const s = HEIGHT / Math.max(0.1, box.max.y - box.min.y)
  model.scale.setScalar(s)
  // Not everyone has the same build: a little wider or narrower, taller or shorter.
  const wide = 1 + look.build * 0.1
  model.scale.x *= wide
  model.scale.z *= wide
  model.scale.y *= 1 + look.build * 0.03
  model.name = 'rig'
  const bones = {}
  // (three.js drops the dots from bone names: UpperLeg.L loads as UpperLegL.)
  for (const name of ['UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'Hips', 'Abdomen']) {
    const bone = model.getObjectByName(name)
    if (bone) bones[name] = bone
  }
  model.updateMatrixWorld(true)
  const hipHeight = bones.Hips ? worldOf(bones.Hips).y : 0.9
  // The feet are IK bones outside the leg chain, and the clips only turn them: left
  // alone they stay behind while the legs walk, and the shoes stretch ("melt").
  // Remember where each foot sits in its shin's space; carryFeet puts it back there.
  // Rest pose of the bones the poses move: not every clip drives them, so they are
  // reset each frame before the clip plays (or the bends would pile up).
  const rest = Object.values(bones).map((bone) => [bone, bone.position.clone(), bone.quaternion.clone()])
  // Each foot's resting turn relative to the whole body (sitting keeps the feet flat
  // whatever the clip does to the hips above them).
  const modelQ = model.getWorldQuaternion(new THREE.Quaternion()).invert()
  const footFlat = {}
  for (const side of ['L', 'R']) if (bones[`Foot${side}`]) footFlat[side] = modelQ.clone().multiply(bones[`Foot${side}`].getWorldQuaternion(new THREE.Quaternion()))
  const footInShin = {}
  for (const side of ['L', 'R']) {
    const shin = bones[`LowerLeg${side}`]
    const foot = bones[`Foot${side}`]
    if (shin && foot) footInShin[side] = shin.worldToLocal(worldOf(foot))
  }
  // How high the ankle bone is above the sole, standing (sitting puts feet flat).
  const footRest = bones.FootL ? worldOf(bones.FootL).y - soleOf(model) : undefined
  const soles = solePoints(model, bones)
  const gaitKey = `${g}:${look.outfitFile}`
  gaits[gaitKey] ||= calibrate(model, animGltf.animations, bones, footInShin)
  if (look.organt) addOrgantMark(model, look.studio)
  if (look.hairStyle === 'locs') addLocs(model, heads, look)
  if (look.hairStyle === 'fade') hairCap(model, heads, look, false)
  if (look.hoodie) addHoodie(model, look)
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of animGltf.animations) actions[clip.name] = mixer.clipAction(clip)
  for (const child of group.children) if (child.userData.standIn) child.visible = false
  const materials = new Set()
  model.traverse((node) => { if (node.isMesh) for (const m of [].concat(node.material)) materials.add(m) })
  group.userData.materials = [...materials]
  group.userData.fade = 0
  fadeIn(group, 0)
  group.add(model)
  Object.assign(group.userData, { mixer, actions, current: '', rigged: true, gait: gaits[gaitKey], yaw: group.rotation.y, headParts: heads, bones, hipHeight, footInShin, footRest, soles, rest, footFlat })
  live.add(group)
  // (the clip sit is on trial: ?sitclips=1, see docs/backlog.md)
  if (!ualReady && typeof location !== 'undefined' && /[?&]sitclips=1/.test(location.search)) preloadSitClips()
  group.dispatchEvent({ type: 'rigged' })
}

export function createAvatar(avatar = {}) {
  const look = lookOf(avatar)
  const group = new THREE.Group()
  group.name = 'player'
  group.rotation.order = 'YXZ' // a person lying down keeps their yaw (see layDown)

  // Stand-in until the GLB arrives (and the fallback if it never does).
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.8 }))
  body.position.y = 0.85
  body.castShadow = true
  body.userData.standIn = true
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 }))
  head.position.y = 1.6
  head.castShadow = true
  head.userData.standIn = true
  group.add(head)

  // The tap target is the body itself (a slim cylinder): a tap on the ground next
  // to someone walks there; only a tap on the person starts a conversation.
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.8, 8), new THREE.MeshBasicMaterial())
  hit.position.y = 0.95
  hit.visible = false
  hit.name = 'hit'
  group.add(hit)
  group.userData.bob = body
  group.userData.look = look
  // The stand-in stays hidden (the model fades in when it arrives); it shows only
  // if the model never loads.
  for (const child of group.children) if (child.userData.standIn) child.visible = false
  group.userData.ready = attachModel(group, look).catch((error) => {
    console.warn('character model', error)
    for (const child of group.children) if (child.userData.standIn) child.visible = true
  })
  return group
}

// A person appears by fading in (no pop, no blocky stand-in first).
function fadeIn(group, dt) {
  const data = group.userData
  data.fade = Math.min(1, data.fade + dt / 0.4)
  for (const m of data.materials) {
    m.userData.base ||= { opacity: m.opacity, transparent: m.transparent }
    m.transparent = data.fade < 1 || m.userData.base.transparent
    m.opacity = m.userData.base.opacity * data.fade
    m.needsUpdate = true
  }
}

// Fetch a person's model files now (the cache keeps them) without building anyone: the home scene
// and the campus load their cast while the player is still in the creator.
export function warmLook(avatar) {
  try {
    const look = lookOf(avatar)
    for (const name of [`${look.gender}_anim`, `${look.gender}_outfit_${look.outfitFile}`, `${look.gender}_head_${look.headFile}`]) load(name).catch(() => {})
  } catch { /* (they load when the scene starts instead) */ }
}

// Start loading the most likely students early (the title screen), so the creator's
// student is there the moment it opens.
export function preloadPeople() {
  for (const name of ['female_anim', 'female_outfit_tee', 'female_head_bob', 'male_anim', 'male_outfit_hoodie', 'male_head_crop']) load(name).catch(() => {})
}

// Fully there now, no fade (a still picture of them: the creator's icons).
export function appearNow(group) {
  if (group.userData.materials) fadeIn(group, 1)
}

// Hide the stand-in parts that other code bolted on (the roommate's arms) once rigged.
// (Hidden like the stand-in itself: shown only if the model never loads.)
export function markStandIn(node) {
  node.userData.standIn = true
  node.visible = false
}

function play(group, name, fade = 0.25) {
  const { actions, current } = group.userData
  const clip = CLIP[name] || name
  if (!actions || current === clip || !actions[clip]) return
  const next = actions[clip]
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play()
  if (current && actions[current]) actions[current].fadeOut(fade)
  group.userData.current = clip
}

// One-off clip (a wave, reaching for something), then back to the pose.
export function gesture(group, name) {
  const { actions, mixer } = group.userData
  const clip = GESTURE[name] || CLIP[name] || name
  const action = actions?.[clip]
  if (!action || group.userData.pose === 'sit' || group.userData.pose === 'lie') return 0
  if (group.userData.current && actions[group.userData.current] && group.userData.current !== clip) actions[group.userData.current].fadeOut(0.15)
  action.reset().setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.fadeIn(0.15).play()
  group.userData.current = clip
  group.userData.gesturing = action
  const onFinish = (event) => {
    if (event.action !== action) return
    mixer.removeEventListener('finished', onFinish)
    action.fadeOut(0.25)
    if (group.userData.current === clip) group.userData.current = ''
    if (group.userData.gesturing === action) group.userData.gesturing = null
  }
  mixer.addEventListener('finished', onFinish)
  return action.getClip().duration
}

// Sitting: bend the hips and knees on top of the idle, and lower the body so the
// seat of the trousers rests on the seat. Callers put the avatar's origin at the
// seat surface (y) and its centre (x, z), facing out of the seat. fitSeat (once per
// person and seat) measures the body: it slides the hips back until the back
// touches the backrest, drops them onto the seat, and angles the thighs and shins
// so the feet rest flat on the floor (seats are SEAT_HEIGHT above the floor; one
// lower than SIT.low is on the floor itself, like a stage step).
export const SIT = { thigh: -1.57, knee: 1.57, drop: 0.08, back: -0.12, backrest: -0.17, seatHeight: 0.46, low: 0.5 }
const bend = new THREE.Quaternion()
const parentQ = new THREE.Quaternion()
const sideways = new THREE.Vector3()
// Rotate a bone about an axis given in world space (the bones' own axes differ
// between the left and right legs in this rig).
function turnWorld(bone, axis, angle) {
  bone.parent.getWorldQuaternion(parentQ)
  const local = axis.clone().applyQuaternion(parentQ.clone().invert())
  bone.quaternion.premultiply(bend.setFromAxisAngle(local, angle))
  bone.updateMatrixWorld(true)
}
function bendLegs(group, model, thigh, knee, onGround) {
  const { bones } = group.userData
  model.updateMatrixWorld(true)
  // The body's left-right axis, in world space.
  sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())).normalize()
  for (const side of ['L', 'R']) {
    const up = bones[`UpperLeg${side}`]
    const low = bones[`LowerLeg${side}`]
    if (up) turnWorld(up, sideways, thigh)
    if (low && !onGround) turnWorld(low, sideways, knee)
  }
  // Carry each foot to the end of its bent shin.
  carryFeet(model, bones, group.userData.footInShin)
}
// (and the hips and waist: a seated body is fitted and posed with them at rest, so the
// walk or idle clip swaying them can't tip the seat of the trousers or a foot off its spot)
const legNames = new Set(['UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'Hips', 'Abdomen'])
function restLegs(group) {
  for (const [bone, p, q] of group.userData.rest || []) if (legNames.has(bone.name)) { bone.position.copy(p); bone.quaternion.copy(q) }
}
// The floor under a seat: the caller's (rooms, beds), else the scene's floor map
// (a deck, a lecture row), else a standard seat height above the floor.
function seatFloorOf(group, seatY) {
  if (group.userData.seatFloor !== undefined) return group.userData.seatFloor
  const floorAt = floorOf(group)
  if (floorAt) { const p = group.getWorldPosition(new THREE.Vector3()); return floorAt(p.x, p.z) }
  return seatY < SIT.low ? 0 : seatY - SIT.seatHeight
}
function fitSeat(group, model, seatY, onGround) {
  const { bones, hipHeight } = group.userData
  // From the legs' rest pose, not this frame's clip (the walk may still be fading out).
  const restore = () => restLegs(group)
  const fit = { seatY, y: -(hipHeight || 0.9) + SIT.drop, z: SIT.back, thigh: SIT.thigh, knee: SIT.knee }
  // (square to the seat: a sit-down measures while the body is still turning round)
  const pose = () => { restore(); model.rotation.set(0, 0, 0); model.position.set(0, fit.y, fit.z); bendLegs(group, model, fit.thigh, fit.knee, onGround) }
  const isCloth = (n) => n.userData.part === 'legs' || n.userData.part === 'body'
  const isFeet = (n) => n.userData.part === 'feet'
  const floor = seatFloorOf(group, seatY)
  const legs = !onGround && bones.FootL && bones.LowerLegL && bones.UpperLegL
  pose()
  // The back against the backrest: the rearmost point of the lower back.
  let back = Infinity
  group.updateMatrixWorld(true)
  group.traverse((node) => {
    if (!node.isSkinnedMesh || node.userData.part !== 'body') return
    const count = node.geometry.attributes.position.count
    for (let i = 0; i < count; i++) {
      node.getVertexPosition(i, vtx)
      node.localToWorld(vtx)
      group.worldToLocal(vtx)
      if (vtx.y > 0.12 && vtx.y < 0.5 && Math.abs(vtx.x) < 0.12 && vtx.z < back) back = vtx.z
    }
  })
  if (Number.isFinite(back)) fit.z += Math.max(-0.15, Math.min(0.2, SIT.backrest - back))
  for (let round = 0; round < 4; round++) {
    pose()
    // The seat of the trousers on the seat.
    const butt = lowest(group, isCloth, worldOf(bones.Hips || model))
    if (Number.isFinite(butt)) fit.y -= butt - seatY
    pose()
    if (!legs) break
    // Feet flat on the floor.
    const d = lowest(group, isFeet) - floor
    if (Math.abs(d) < 0.01) break
    const knee = worldOf(bones.LowerLegL)
    const thighLen = knee.distanceTo(worldOf(bones.UpperLegL))
    const shinLen = worldOf(bones.FootL).distanceTo(knee) + 0.08
    if (d > 0 && fit.knee >= SIT.knee - 0.01) {
      // Feet dangling: slope the thighs down (shins stay upright).
      const t = Math.min(0.7 - (fit.thigh - SIT.thigh), Math.asin(Math.min(1, d / thighLen)))
      fit.thigh += t
      fit.knee -= t
    } else {
      // A low seat: the shins reach forward so the feet stay on the floor.
      const forward = SIT.knee - (fit.thigh - SIT.thigh) - fit.knee // the shin's lean now
      const drop = Math.cos(forward) * shinLen // how far the shin reaches down now
      const c = Math.max(0, Math.min(1, (drop + d) / shinLen))
      fit.knee -= Math.min(1.2, Math.acos(c)) - forward
    }
  }
  restore()
  fit.floorY = floor
  return fit
}
const seatAt = new THREE.Vector3()
function sitPose(group, onGround) {
  const data = group.userData
  const model = group.getObjectByName('rig')
  // (fresh: on the first frame on a seat the world matrix still has them standing)
  group.updateMatrixWorld(true)
  const seatY = +group.getWorldPosition(seatAt).y.toFixed(3)
  // (not while sitting down or standing up: the caller may already have cleared the seat's floor)
  const refit = data.sitFit?.seatY !== seatY || data.sitFit.onGround !== onGround || data.sitFit.floor !== data.seatFloor
  if (ualReady && !onGround) { clipSeated(group, model, data.lastTime || 0); return }
  if (refit && !(data.sitMove && data.sitFit)) data.sitFit = { ...fitSeat(group, model, seatY, onGround), onGround, floor: data.seatFloor }
  const fit = data.sitFit
  model.position.y = fit.y
  model.position.z = fit.z
  restLegs(group)
  if (!onGround && data.bones.FootR && data.footInShin?.R) { sitBetween(group, model, 1); seatedArms(group, model, data.lastTime || 0); return }
  bendLegs(group, model, fit.thigh, fit.knee, onGround)
}

// Sitting down and standing up, with the feet planted. The pack has no sit clips,
// so the legs are bent by hand: from standing in front of the seat (back to it),
// the hips go back and down onto the seat while each ankle stays where it is (leg
// IK: thigh and shin angles from the hip-to-ankle distance), and the body leans
// forward a little on the way, like a person lowering themselves. Standing up is
// the same in reverse. poseAvatar starts one when the pose changes between 'stand'
// and 'sit' (callers just set the pose and the seat position).
// turn: rad/s turning round in front of the seat (plus `settle` s); lower / rise: seconds
// onto the seat / back up (owner, 4 Nov: sitting and getting up were too slow at 3 rad/s,
// 1 s and 1 s). lean: forward over the knees, not into a desk.
export const SIT_MOVE = { turn: 5, settle: 0.12, lower: 0.6, rise: 0.55, lean: 0.22, reach: 1.6 }
const toLocal = (group, bone) => group.worldToLocal(worldOf(bone))
// The standing stance for this seat (kept with the seat fit): where the ankles
// plant, in group space, so that seated they rest where the fit put them.
function sitRig(group, model, fit) {
  if (fit.rig) return fit.rig
  const { bones } = group.userData
  restLegs(group)
  model.position.set(0, 0, 0)
  model.rotation.set(0, 0, 0)
  model.updateMatrixWorld(true)
  // (the model's rest pose is mid-stride, one foot well ahead: the feet plant side by
  // side, hip-width apart, at the middle of the two)
  const raw = { L: toLocal(group, bones.FootL), R: toLocal(group, bones.FootR) }
  const half = Math.max(0.08, Math.abs(raw.L.x - raw.R.x) / 2)
  const sign = Math.sign(raw.L.x - raw.R.x) || 1
  const midZ = (raw.L.z + raw.R.z) / 2
  const rest = { L: new THREE.Vector3(sign * half, raw.L.y, midZ), R: new THREE.Vector3(-sign * half, raw.R.y, midZ) }
  // Standing on the floor with the rest legs: how high the model sits.
  const floor = fit.floorY - fit.seatY
  const standY = floor - group.worldToLocal(new THREE.Vector3(0, lowest(group, (n) => n.userData.part === 'feet'), 0)).y
  // How far forward the fit put the feet.
  model.position.set(0, fit.y, fit.z)
  bendLegs(group, model, fit.thigh, fit.knee, false)
  const seated = toLocal(group, bones.FootL)
  restLegs(group)
  model.position.set(0, 0, 0)
  model.updateMatrixWorld(true)
  // (a few cm further out than the seated feet: standing in front of the seat, the
  // calves clear its front edge)
  const stand = { x: 0, y: standY, z: seated.z - rest.L.z + 0.08 }
  const plant = (v) => new THREE.Vector3(v.x + stand.x, v.y + stand.y, v.z + stand.z)
  fit.rig = { stand, ankles: { L: plant(rest.L), R: plant(rest.R) }, lift: { L: new THREE.Vector3(), R: new THREE.Vector3() } }
  group.userData.standReach = stand.z
  // Some shoes are partly skinned to the shin and sag or twist as the knee bends:
  // compare each shoe standing and seated, and move that ankle by the difference so
  // the shoe itself stays put (a few rounds: moving the ankle changes the knee too).
  sitBetween(group, model, 0)
  model.updateMatrixWorld(true)
  const standing = shoesBySide(group)
  // (each round also puts the seat of the trousers back on the seat: the planted legs
  // angle the thighs a little differently from the fit)
  for (let round = 0; round < 6; round++) {
    sitBetween(group, model, 1)
    model.updateMatrixWorld(true)
    // (right under the hips only: a skirt's hem hangs lower than the seat of it)
    const butt = lowest(group, (n) => n.userData.part === 'legs' || n.userData.part === 'body', worldOf(bones.Hips || model))
    if (Number.isFinite(butt)) fit.y -= butt - fit.seatY
    const seatedShoes = shoesBySide(group)
    for (const side of ['L', 'R']) {
      const a = standing[side]
      const b = seatedShoes[side]
      if (!a || !b) continue
      fit.rig.lift[side].add(group.worldToLocal(a.mid.clone()).sub(group.worldToLocal(b.mid.clone())).setY(0))
      fit.rig.lift[side].y += fit.floorY - b.low
      // (a small correction only: past that the seated foot is out of reach, and
      // chasing it would swing the foot about)
      if (fit.rig.lift[side].length() > 0.05) fit.rig.lift[side].setLength(0.05)
    }
  }
  restLegs(group)
  model.position.set(0, 0, 0)
  model.updateMatrixWorld(true)
  return fit.rig
}
// Each shoe's middle and lowest point (world), split by the body's left and right.
function shoesBySide(group) {
  const out = {}
  group.traverse((node) => {
    if (!node.isSkinnedMesh || !node.visible || node.userData.part !== 'feet') return
    const count = node.geometry.attributes.position.count
    const step = Math.max(1, Math.floor(count / 400))
    for (let i = 0; i < count; i += step) {
      node.getVertexPosition(i, vtx)
      node.localToWorld(vtx)
      const side = group.worldToLocal(soleAt.copy(vtx)).x > 0 ? 'L' : 'R'
      const o = (out[side] ||= { sum: new THREE.Vector3(), n: 0, low: Infinity })
      o.sum.add(vtx)
      o.n++
      if (vtx.y < o.low) o.low = vtx.y
    }
  })
  for (const o of Object.values(out)) o.mid = o.sum.divideScalar(o.n)
  return out
}
const clamp1 = (v) => Math.max(-1, Math.min(1, v))
const legA = new THREE.Vector3()
const legB = new THREE.Vector3()
const axisW = new THREE.Vector3()
// Two-bone leg IK for one side: bend the knee to the hip-to-target distance, then
// swing the thigh so the ankle lands on the target (world space).
function legTo(group, side, target) {
  const { bones, footInShin } = group.userData
  const up = bones[`UpperLeg${side}`]
  const low = bones[`LowerLeg${side}`]
  const foot = bones[`Foot${side}`]
  if (!up || !low || !foot || !footInShin?.[side]) return
  const H = worldOf(up)
  const K = worldOf(low)
  const A = low.localToWorld(footInShin[side].clone())
  const L1 = H.distanceTo(K)
  const L2 = K.distanceTo(A)
  const D = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.001, H.distanceTo(target)))
  const before = legA.subVectors(H, K).angleTo(legB.subVectors(A, K))
  const after = Math.acos(clamp1((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)))
  sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(groupQ)).normalize()
  turnWorld(low, sideways, before - after)
  const reach = low.localToWorld(footInShin[side].clone()).sub(H).normalize()
  const want = target.clone().sub(H).normalize()
  const angle = Math.acos(clamp1(reach.dot(want)))
  if (angle > 1e-5) turnWorld(up, axisW.crossVectors(reach, want).normalize(), angle)
}
// Feet flat to the body, whatever the clip turned the bones above them.
const flatQ = new THREE.Quaternion()
function flatFeet(group, model) {
  const { bones, footFlat } = group.userData
  if (!footFlat) return
  model.getWorldQuaternion(flatQ)
  for (const side of ['L', 'R']) {
    const foot = bones[`Foot${side}`]
    if (!foot || !footFlat[side]) continue
    const want = flatQ.clone().multiply(footFlat[side])
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want))
    foot.updateMatrixWorld(true)
  }
}
// One frame between standing in front of the seat (k = 0) and seated (k = 1): the
// hips travel back and down, each ankle stays planted where it stood.
function sitBetween(group, model, k) {
  const data = group.userData
  const fit = data.sitFit
  const rig = sitRig(group, model, fit)
  const e = k * k * (3 - 2 * k)
  // The hips go down first, then back: standing, the legs are straight, so moving the
  // hips back before they drop would stretch the legs past their length.
  const back = e * e * (3 - 2 * e)
  restLegs(group)
  model.rotation.y = 0
  model.position.set(rig.stand.x * (1 - back), rig.stand.y + (fit.y - rig.stand.y) * e, rig.stand.z + (fit.z - rig.stand.z) * back)
  model.updateMatrixWorld(true)
  // (the sag comes early, with the first bend of the knee)
  for (const side of ['L', 'R']) legTo(group, side, group.localToWorld(rig.ankles[side].clone().addScaledVector(rig.lift[side], Math.sqrt(e))))
  aimKnees(group, model)
  carryFeet(model, data.bones, data.footInShin)
  flatFeet(group, model)
  // The hands come to the lap as the hips go down (and leave it standing up).
  if (k > 0 && k < 1) seatedArms(group, model, data.lastTime || 0, Math.min(1, Math.max(0, (k - 0.15) / 0.6)))
  // Leaning forward over the knees on the way down (and up).
  if (data.bones.Abdomen && k > 0 && k < 1) {
    sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(groupQ)).normalize()
    turnWorld(data.bones.Abdomen, sideways, SIT_MOVE.lean * Math.sin(Math.PI * k))
  }
}
// Is this person sitting down or standing up right now?
export function inTransition(group) { return Boolean(group.userData.sitMove) }
// Where to stand to sit on a seat (parent space): in front of it, ankles over where
// they'll rest. seat: { x, z, rot } (rot faces out of the seat).
export function standSpotFor(group, seat) {
  const z = group.userData.standReach ?? 0.3
  return { x: seat.x + Math.sin(seat.rot) * z, z: seat.z + Math.cos(seat.rot) * z }
}
// Starts a sit-down or stand-up when the pose changes between standing and sitting.
const isStanding = (p) => p === undefined || p === 'stand' || p === 'talk' || p === 'run'
function startSitMove(group) {
  const data = group.userData
  const prev = data.prevPose
  const pose = data.pose || 'stand'
  data.prevPose = pose
  if (pose === 'sit' && prev && isStanding(prev) && data.standAt && group.position.y >= 0.2 && !data.sitMove) {
    // From where they stood, in the seat's own frame.
    const dx = data.standAt.x - group.position.x
    const dz = data.standAt.z - group.position.z
    if (Math.hypot(dx, dz) < SIT_MOVE.reach) {
      const c = Math.cos(group.rotation.y)
      const s = Math.sin(group.rotation.y)
      data.sitMove = { dir: 1, k: 0, turn: 0, from: { x: dx * c - dz * s, z: dx * s + dz * c, yaw: wrap(data.standAt.yaw - group.rotation.y) } }
      data.noCollide = 'in'
      data.noCollideAt = typeof performance !== 'undefined' ? performance.now() : 0
    }
  } else if (isStanding(pose) && prev === 'sit' && (ualReady ? data.clipSeat : data.sitFit && !data.sitFit.onGround) && data.seatAt && !data.sitMove) {
    data.sitMove = { dir: -1, k: 1, seat: { ...data.seatAt } }
    data.noCollide = 'out' // (standing up in front of the seat, among the furniture)
  }
  if (pose === 'sit') data.seatAt = { x: group.position.x, y: group.position.y, z: group.position.z, rot: group.rotation.y }
  if (pose === 'lie') { data.sitMove = null; data.seatAt = null }
  return data.sitMove
}
// One frame of a sit-down (turn round on the spot, then lower) or a stand-up (rise,
// then they stand in front of the seat).
function sitMotion(group, model, move, dt) {
  const data = group.userData
  if (ualReady) return clipSitMotion(group, model, move, dt)
  if (move.dir < 0) {
    // Hold the seat while rising (callers may already have moved the person on).
    group.position.set(move.seat.x, move.seat.y, move.seat.z)
    group.rotation.y = move.seat.rot
    group.updateMatrixWorld(true)
  }
  sitPose(group, false) // keeps the seat fit current
  const rig = sitRig(group, model, data.sitFit)
  restLegs(group)
  if (move.dir > 0 && move.turn < 1) {
    // Part-way round, measure the seat again: the body has settled into the idle (the
    // first measure, mid-stride, sits the hips and feet a little off), and the
    // shuffle onto the spot in front of the seat smoothly takes the new spot.
    move.t = (move.t || 0) + dt
    if (!move.refit && move.t >= 0.15) {
      move.refit = true
      data.sitFit = null
      sitPose(group, false)
      restLegs(group)
    }
    const rig = sitRig(group, model, data.sitFit)
    const span = SIT_MOVE.settle + Math.abs(move.from.yaw) / SIT_MOVE.turn
    move.turn = Math.min(1, move.turn + dt / span)
    const e = move.turn * move.turn * (3 - 2 * move.turn)
    model.rotation.y = move.from.yaw * (1 - e)
    model.position.set(move.from.x + (rig.stand.x - move.from.x) * e, rig.stand.y, move.from.z + (rig.stand.z - move.from.z) * e)
    // (the feet step onto their spots, side by side, as the body comes round)
    const w = Math.min(1, Math.max(0, (move.turn - 0.25) / 0.6))
    if (w > 0) {
      model.updateMatrixWorld(true)
      for (const side of ['L', 'R']) {
        const low = data.bones[`LowerLeg${side}`]
        if (!low || !data.footInShin?.[side]) continue
        const now = low.localToWorld(data.footInShin[side].clone())
        legTo(group, side, now.lerp(group.localToWorld(rig.ankles[side].clone()), w * w * (3 - 2 * w)))
      }
    }
    aimKnees(group, model)
    carryFeet(model, data.bones, data.footInShin)
    aimFeet(group, model)
    data.sitPhase = 'turn'
    return
  }
  move.k = Math.max(0, Math.min(1, move.k + (move.dir * dt) / (move.dir > 0 ? SIT_MOVE.lower : SIT_MOVE.rise)))
  data.sitPhase = move.dir > 0 ? 'lower' : 'rise'
  sitBetween(group, model, move.k)
  if (move.dir > 0 && move.k >= 1) { data.sitMove = null; data.sitPhase = 'seated' }
  if (move.dir < 0 && move.k <= 0) {
    // Standing in front of the seat now, on the floor.
    const c = Math.cos(move.seat.rot)
    const s = Math.sin(move.seat.rot)
    const fit = data.sitFit
    group.position.set(move.seat.x + rig.stand.x * c + rig.stand.z * s, fit.floorY, move.seat.z - rig.stand.x * s + rig.stand.z * c)
    // (this frame still standing at the stand height; the soles take over next frame)
    model.position.set(0, rig.stand.y + move.seat.y - fit.floorY, 0)
    data.sitMove = null
    data.sitPhase = 'up'
    data.yaw = move.seat.rot
    data.lastPos?.copy(group.position)
  }
}

// Lying: the caller tips the group onto its back (rotation.x = -PI/2*recline, see
// layDown) with its origin at the middle of the mattress top. The hips sit on the
// origin, the body lies flat, and it is lifted until its lowest point rests on the
// mattress (measured once per bed). userData.recline (0..1) blends from sitting on
// the edge (knees bent) to lying flat, for getting into and out of bed.
const upLocal = new THREE.Vector3()
const groupQ = new THREE.Quaternion()
function liePose(group, model) {
  const data = group.userData
  const r = data.recline ?? 1
  model.position.set(0, -(data.hipHeight || 0.9), 0)
  restLegs(group)
  bendLegs(group, model, SIT.thigh * (1 - r), SIT.knee * (1 - r), false)
  upLocal.set(0, 1, 0).applyQuaternion(group.getWorldQuaternion(groupQ).invert())
  const bed = +group.getWorldPosition(seatAt).y.toFixed(3)
  if (r >= 1 && data.lieFit?.bed !== bed) {
    model.updateMatrixWorld(true)
    const low = lowest(group, () => true)
    data.lieFit = { bed, lift: Number.isFinite(low) ? bed - low : 0 }
  }
  model.position.addScaledVector(upLocal, (data.lieFit?.lift ?? 0.12) * r)
}

// Tips a person onto their back along headYaw (0 = head towards -z), or part-way
// (recline < 1) while getting in or out of bed.
export function layDown(group, headYaw, recline = 1) {
  group.rotation.order = 'YXZ'
  group.rotation.y = headYaw
  group.rotation.x = -Math.PI / 2 * recline
  group.userData.pose = 'lie'
  group.userData.recline = recline
}

// How the body follows the ground: the clips' lift (see calibrate), blended by weight.
function liftOf(data) {
  let lift = 0
  let weight = 0
  for (const [name, action] of Object.entries(data.actions)) {
    const w = action.getEffectiveWeight()
    const g = data.gait?.[name]
    if (!g || w <= 0 || !action.isRunning()) continue
    const f = ((action.time % g.duration) / g.duration) * GAIT_SAMPLES
    const i = Math.floor(f)
    lift += (g.lift[i] + (g.lift[Math.min(i + 1, GAIT_SAMPLES)] - g.lift[i]) * (f - i)) * w
    weight += w
  }
  return weight > 0 ? lift / weight : 0
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
// Walks slower than this play the walk clip, faster ones the run (metres a second).
const RUN_FROM = 2.9 // (faster than this: the run clip; the walk is 2.3, the jog 4.0)
const TURN = 10 // how quickly the body turns to face where it's going (per second)
const TURN_MIN = 3 // ...but never slower than this, or faster than TURN_MAX (radians a second)
const TURN_MAX = 9
const CRAB = 0.2 // a step may point at most this far from the body (radians, about 11 degrees)
const SHARP = 1 // turns sharper than this (about 57 degrees) turn on the spot first

// pose: 'stand' (idle or walk), 'sit', 'talk', 'run', 'dance' or 'lie'
// (the caller tilts the group to lie down).
// Callers set position and rotation.y; the body turns smoothly towards rotation.y,
// and the walk or run clip plays at the speed the person is really moving.
export function poseAvatar(group, walking, time) {
  const data = group.userData
  const dt = Math.min(0.1 * SPEED, Math.max(0, time - (data.lastTime ?? time)))
  data.lastTime = time
  // Real ground speed, smoothed (teleports and seat placements don't count).
  const last = data.lastPos
  let moved = last ? Math.hypot(group.position.x - last.x, group.position.z - last.z) : 0
  // Never sideways: a walker's body turns towards where they're going, and they only
  // move along the way they face. On a sharp turn they slow down or turn on the spot
  // first, so the step never points more than CRAB away from the body. (Not the
  // player, data.leads: player.js moves them at once and turns them as they go.)
  const upright = data.pose !== 'sit' && data.pose !== 'lie' && data.pose !== 'dance'
  data.crab = 0
  if (data.rigged && upright && walking && !data.leads && !data.sitMove && last && moved > 1e-4 && moved < 2 && dt > 0) {
    const want = Math.atan2(group.position.x - last.x, group.position.z - last.z)
    if (data.yaw === undefined) data.yaw = want
    const off = wrap(want - data.yaw)
    const rate = Math.min(TURN_MAX, Math.max(TURN_MIN, Math.abs(off) * TURN))
    data.yaw += Math.sign(off) * Math.min(Math.abs(off), rate * dt)
    const left = Math.abs(wrap(want - data.yaw))
    if (left > CRAB) {
      const along = Math.max(0, moved * Math.cos(left) * Math.min(1, Math.max(0, (SHARP - left) / (SHARP - CRAB))))
      group.position.x = last.x + Math.sin(data.yaw) * along
      group.position.z = last.z + Math.cos(data.yaw) * along
      moved = along
    } else data.crab = left
    data.steered = true
  } else data.steered = false
  if (!last) data.lastPos = new THREE.Vector3()
  data.lastPos.copy(group.position)
  if (dt > 0) {
    const now = moved > 2 ? data.speed || 0 : moved / dt
    data.speed = (data.speed || 0) + (now - (data.speed || 0)) * Math.min(1, dt * 8)
  }
  if (!data.rigged) {
    // No blocky stand-in: the person fades in once the model arrives (see attachModel).
    return
  }
  if (data.baseY !== undefined) { if (data.pose !== 'lie') group.position.y = data.baseY; group.rotation.z = 0; data.baseY = undefined }
  const move = startSitMove(group)
  const onGround = data.pose === 'sit' && group.position.y < 0.2
  const settled = data.pose === 'sit' || data.pose === 'lie' || Boolean(move)
  // Walking in place against a wall reads as sliding: stand still instead.
  const moving = walking && data.speed > 0.25
  const fast = data.speed > RUN_FROM
  if (!data.gesturing?.isRunning()) {
    if (settled) play(group, 'idle', 0.1) // (quickly: a walk's bob must not linger on the seat)
    else if (data.pose === 'talk') play(group, 'talk')
    else if (data.pose === 'run') play(group, moving ? 'sprint' : 'idle')
    else if (data.pose === 'dance') play(group, 'dance')
    else play(group, moving ? (fast ? 'sprint' : 'walk') : 'idle')
  }
  const idle = data.actions[CLIP.idle]
  if (idle) idle.timeScale = data.pose === 'lie' ? 0.25 : 1
  // The feet keep pace with the ground: the clip rate follows the real speed.
  // (the caps leave room for the 2.3 m/s walk and the jog up to 5.2 m/s)
  for (const [name, most] of [[CLIP.walk, 3], [CLIP.sprint, 4.5]]) {
    const action = data.actions[name]
    const natural = data.gait?.[name]?.speed
    if (action && natural > 0.2) action.timeScale = moving ? Math.min(most, Math.max(0.55, data.speed / natural)) : 1
  }
  for (const [bone, p, q] of data.rest || []) { bone.position.copy(p); bone.quaternion.copy(q) }
  data.mixer.update(dt)
  const model = group.getObjectByName('rig')
  if (!model) return
  // Turn smoothly: the body lags the facing a little instead of snapping.
  if (settled || data.yaw === undefined) data.yaw = group.rotation.y
  else if (!data.steered) data.yaw += wrap(group.rotation.y - data.yaw) * Math.min(1, dt * TURN)
  model.position.set(0, 0, 0)
  model.rotation.y = settled ? 0 : wrap(data.yaw - group.rotation.y)
  if (data.pose !== 'sit' && data.pose !== 'lie') { aimKnees(group, model); carryFeet(model, data.bones, data.footInShin); aimFeet(group, model) }
  // Standing on the soles: the lowest sole point rests on the ground (the group's y).
  if (!settled && data.soles?.length) {
    const ground = group.getWorldPosition(seatAt).y
    const floorAt = floorOf(group)
    if (floorAt) {
      const lift = soleLift(data, floorAt, ground)
      if (Number.isFinite(lift)) model.position.y = lift
    } else {
      const sole = soleNow(data)
      if (Number.isFinite(sole)) model.position.y = ground - sole
    }
  } else if (!settled) model.position.y = liftOf(data)
  if (move) sitMotion(group, model, move, dt)
  else if (data.pose === 'sit') sitPose(group, onGround)
  if (data.eating && data.pose === 'sit' && !move) eatArm(group, model, time) // (job K: eating at a table shows)
  if (data.pose === 'lie') liePose(group, model)
  // Slumping forward (dozing at a desk): bend at the waist, hips stay on the seat.
  if (data.slump && data.bones.Abdomen) {
    sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(groupQ)).normalize()
    turnWorld(data.bones.Abdomen, sideways, data.slump)
  }
  // Dancing: the wave with a bounce and a sway on the beat (112 BPM, like the groove).
  if (data.pose === 'dance') {
    const beat = (time * 112) / 60
    model.position.y += Math.abs(Math.sin(beat * Math.PI)) * 0.1
    model.rotation.y += Math.sin(beat * Math.PI / 2) * 0.4
  }
  // (job K) a clip from the animation library on top: dancing, swimming, a workout, a kick (playClip below)
  if (data.clip && data.pose !== 'sit' && data.pose !== 'lie') clipOn(group, model, time)
  if (!settled) data.standAt = { x: group.position.x, z: group.position.z, yaw: data.yaw }
  if (data.fade !== undefined && data.fade < 1) fadeIn(group, dt)
}

// Eating while seated (job K): a gesture cannot play on a seated body, so the right arm brings the food up to the
// mouth and back every couple of seconds (shoulder forward, elbow bent), on top of the seated arms.
function eatArm(group, model, time) {
  const data = group.userData
  data.armR ||= { up: model.getObjectByName('UpperArmR'), low: model.getObjectByName('LowerArmR') }
  const { up, low } = data.armR
  if (!up || !low) return
  const k = Math.pow(Math.max(0, Math.sin(time * 2.4)), 2)
  model.updateMatrixWorld(true)
  sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(groupQ)).normalize()
  turnWorld(up, sideways, -0.75 * k)
  turnWorld(low, sideways, -1.35 * k)
}

// ---------- Job K (owner, 12 Nov: "your student visibly does it"): library clips on anybody ----------
// The Universal Animation Library (public/models/ual, Quaternius, CC0) has Dance_Loop, Swim_Fwd_Loop, Swim_Idle_Loop,
// Punch_Jab, Punch_Cross, Push_Loop, Jump_Start, Jump_Loop, Jump_Land, PickUp_Table, Fixing_Kneeling, Crouch_Idle_Loop,
// Idle_Talking_Loop, Interact... Until now only the seated clips were used. playClip puts one on a person (standing):
// once (held on its last frame) or looping, at a speed; stopClip takes it off. The library loads the first time.
let ualClips = null
let ualClipsAsked = false
export function preloadClips() { if (!ualClipsAsked) { ualClipsAsked = true; loadUal().then((src) => { ualClips = src }).catch(() => {}) } }
export const clipsReady = () => Boolean(ualClips)
export function clipLength(name) { return ualClips?.clips[name]?.duration || 0 }
export function playClip(group, name, { once = false, speed = 1 } = {}) {
  preloadClips()
  group.userData.clip = { name, once, speed, t0: undefined }
  return clipLength(name) / (speed || 1)
}
export function stopClip(group) { delete group.userData.clip }
function clipOn(group, model, time) {
  const c = group.userData.clip
  const src = ualClips
  const clip = src?.clips[c.name]
  if (!clip) return
  if (c.t0 === undefined) c.t0 = time
  const t = (time - c.t0) * (c.speed || 1)
  model.updateMatrixWorld(true)
  poseFromUal(group, model, src, c.name, c.once ? Math.min(t, clip.duration - 1e-3) : t % clip.duration)
}

// Hold a small thing in the right hand (a book, a plate, a tray, a phone, a ball), at world size whatever the bone's
// scale; null puts down what was held. (Job K: the old lookup asked for 'hand_r', which this rig does not have: its
// wrist bone is 'WristR', so nothing anybody held ever showed.)
export function holdIn(group, mesh, at = [0.06, 0.04, 0]) {
  const old = group.userData.held
  if (old) old.removeFromParent()
  group.userData.held = mesh || null
  if (!mesh) return false
  const hand = group.getObjectByName('WristR') || group.getObjectByName('hand_r') || group.getObjectByName('Wrist.R')
  if (!hand) return false
  const s = new THREE.Vector3()
  hand.getWorldScale(s)
  mesh.scale.multiplyScalar(1 / (s.x || 1))
  mesh.position.set(at[0] / (s.x || 1), at[1] / (s.x || 1), at[2] / (s.x || 1))
  hand.add(mesh)
  return true
}

// Tests (motion checks): every rigged person in a live scene, measured from the
// skinned vertices themselves: the lowest point of the shoes, the seat of the
// trousers (lowest leg vertex near the hips) and the body's lowest point overall.
const live = new Set()
const vtx = new THREE.Vector3()
// near: only vertices within that horizontal distance of a point (the seat of the trousers).
// above: only vertices higher than this (the seat of the trousers, not the hems below it).
function lowest(group, test, near = null, radius = 0.1, above = -Infinity) {
  let min = Infinity
  group.traverse((node) => {
    if (!node.isSkinnedMesh || !node.visible || !test(node)) return
    const count = node.geometry.attributes.position.count
    const step = near ? 1 : Math.max(1, Math.floor(count / 400))
    for (let i = 0; i < count; i += step) {
      node.getVertexPosition(i, vtx)
      node.localToWorld(vtx)
      if (near && Math.hypot(vtx.x - near.x, vtx.z - near.z) > radius) continue
      if (vtx.y < above) continue
      if (vtx.y < min) min = vtx.y
    }
  })
  return min
}
function sceneOf(node) {
  for (let n = node; n; n = n.parent) { if (!n.visible) return null; if (n.isScene) return n }
  return null
}
// Any skin showing on the feet (no shoes)?
function bareFeet(group) {
  const skin = new THREE.Color(group.userData.look?.skin || '#000')
  let bare = false
  group.traverse((node) => {
    if (!node.isMesh || node.userData.part !== 'feet') return
    for (const m of [].concat(node.material)) if (/^skin/i.test(m.name) || m.color?.equals(skin)) bare = true
  })
  return bare
}
export function measureBody(group) {
  const data = group.userData
  group.updateMatrixWorld(true)
  const hips = data.bones?.Hips ? worldOf(data.bones.Hips) : null
  const ground = group.parent ? group.parent.localToWorld(new THREE.Vector3(group.position.x, data.pose === 'sit' ? 0 : group.position.y, group.position.z)).y : group.position.y
  const out = {
    id: data.isPlayer ? 'player' : data.personId || 'extra',
    pose: data.pose || 'stand',
    phase: data.sitMove ? data.sitPhase : null,
    clip: data.current,
    rate: +(data.actions?.[data.current]?.timeScale ?? 0).toFixed(2),
    t: +(data.actions?.[data.current]?.time ?? 0).toFixed(3),
    natural: +(data.gait?.[data.current]?.speed ?? 0).toFixed(2),
    yaw: +(data.yaw ?? group.rotation.y).toFixed(3),
    crab: +((data.crab || 0) * 180 / Math.PI).toFixed(1),
    lastPosed: data.lastTime,
    speed: +(data.speed || 0).toFixed(2),
    x: +group.position.x.toFixed(2), y: +group.position.y.toFixed(3), z: +group.position.z.toFixed(2),
    sole: +lowest(group, (n) => n.userData.part === 'feet').toFixed(3),
    low: +lowest(group, () => true).toFixed(3),
    seatOfPants: hips ? +lowest(group, (n) => n.userData.part === 'legs' || n.userData.part === 'body', hips).toFixed(3) : null,
    hips: hips ? +hips.y.toFixed(3) : null,
    ground: +ground.toFixed(3),
    standIn: group.children.some((c) => c.userData.standIn && c.visible),
    bareFeet: bareFeet(group),
  }
  // On a floor map: each shoe's lowest point against what's under that shoe.
  const floorAt = floorOf(group)
  // (the smallest clearance under any point of the shoes: a foot resting on a step's
  // edge, heel over the step below, is on that step)
  if (floorAt && out.pose !== 'sit' && out.pose !== 'lie') {
    let gap = Infinity
    group.traverse((node) => {
      if (!node.isSkinnedMesh || !node.visible || node.userData.part !== 'feet') return
      const count = node.geometry.attributes.position.count
      const step = Math.max(1, Math.floor(count / 400))
      for (let i = 0; i < count; i += step) {
        node.getVertexPosition(i, vtx)
        node.localToWorld(vtx)
        gap = Math.min(gap, vtx.y - Math.max(ground, floorAt(vtx.x, vtx.z)))
      }
    })
    if (Number.isFinite(gap)) out.ground = +(out.sole - gap).toFixed(3)
    out.floor = +floorAt(out.x, out.z).toFixed(3)
  }
  // Sitting: the seat of the trousers vs the seat, the soles vs the floor under it.
  if (out.pose === 'sit' && out.seatOfPants !== null) {
    const seat = group.getWorldPosition(new THREE.Vector3()).y
    out.seatGap = +(out.seatOfPants - seat).toFixed(3)
    out.footGap = +(out.sole - seatFloorOf(group, seat)).toFixed(3)
    out.fit = data.sitFit && { thigh: +data.sitFit.thigh.toFixed(2), knee: +data.sitFit.knee.toFixed(2), y: +data.sitFit.y.toFixed(3), z: +data.sitFit.z.toFixed(3), seatY: data.sitFit.seatY, onGround: data.sitFit.onGround, floorY: data.sitFit.floorY, lift: data.sitFit.rig && Object.fromEntries(Object.entries(data.sitFit.rig.lift).map(([k, v]) => [k, v.toArray().map((n) => +n.toFixed(3))])) }
    out.walking = data.current
  }
  // Lying: the body's lowest point vs the mattress top (the origin).
  if (out.pose === 'lie') out.bedGap = +(out.low - group.getWorldPosition(new THREE.Vector3()).y).toFixed(3)
  return out
}
if (typeof window !== 'undefined') {
  window.mzansiGait = () => Object.fromEntries(Object.entries(gaits).map(([k, g]) => [k, Object.fromEntries(Object.entries(g).map(([c, v]) => [c, { speed: +v.speed.toFixed(2), maxLift: +Math.max(...v.lift).toFixed(3),   minLift: +Math.min(...v.lift).toFixed(3) }]))]))
  window.mzansiBodies = (where, id) => {
    for (const g of live) if (g.userData.disposed) live.delete(g)
    const idOf = (g) => (g.userData.isPlayer ? 'player' : g.userData.personId || 'extra')
    return [...live].filter((g) => sceneOf(g) && (!where || sceneOf(g).name === where) && (!id || idOf(g) === id)).map((g) => ({ ...measureBody(g), scene: sceneOf(g).name }))
  }
  // Every rendered frame: where each person is and which way their body faces (the
  // tests work out sideways sliding from consecutive frames). Every `every` frames,
  // also everyone's soles, hips and lowest point from the skinned vertices.
  let rec = null
  const record = () => {
    if (!rec) return
    rec.frame++
    const full = rec.every > 0 && rec.frame % rec.every === 0
    const people = []
    for (const g of live) {
      const sc = sceneOf(g)
      if (!sc || g.userData.disposed || (rec.where && sc.name !== rec.where)) continue
      const d = g.userData
      const id = d.isPlayer ? 'player' : d.personId || 'extra'
      if (rec.ids && !rec.ids.includes(id)) continue
      const p = g.parent ? g.parent.localToWorld(g.position.clone()) : g.position.clone()
      const row = { id, clock: d.lastTime, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +(d.yaw ?? g.rotation.y).toFixed(4), ry: +g.rotation.y.toFixed(4), rx: +g.rotation.x.toFixed(4), clip: d.current, pose: d.pose || 'stand', phase: d.sitMove ? d.sitPhase : null, walking: d.current === CLIP.walk || d.current === CLIP.sprint }
      if (full || rec.feet?.includes(id) || rec.legs?.includes(id)) {
        const m = measureBody(g)
        Object.assign(row, { rate: m.rate, natural: m.natural, sole: m.sole, ground: m.ground, floor: m.floor, low: m.low, hips: m.hips, seatGap: m.seatGap ?? null, bedGap: m.bedGap ?? null })
        if (rec.feet?.includes(id)) row.feet = feetNow(g)
        if (rec.legs?.includes(id)) row.legs = measureLegs(g)
      }
      people.push(row)
    }
    rec.frames.push({ t: performance.now(), people })
    requestAnimationFrame(record)
  }
  window.mzansiRig = () => { for (const g of live) if (g.userData.isPlayer && sceneOf(g)) { const r = g.userData.sitFit?.rig; return r && { stand: r.stand, ankles: Object.fromEntries(Object.entries(r.ankles).map(([k, v]) => [k, v.toArray().map((n) => +n.toFixed(3))])), lift: Object.fromEntries(Object.entries(r.lift).map(([k, v]) => [k, v.toArray().map((n) => +n.toFixed(3))])), fit: { y: g.userData.sitFit.y, z: g.userData.sitFit.z, thigh: g.userData.sitFit.thigh, knee: g.userData.sitFit.knee, seatY: g.userData.sitFit.seatY, floorY: g.userData.sitFit.floorY } } } return null }
  window.mzansiLegs = (id) => { for (const g of live) if ((g.userData.isPlayer ? 'player' : g.userData.personId) === id && sceneOf(g)) return measureLegs(g); return null }
  window.mzansiRecord = (opts = {}) => { rec = { where: opts.where, ids: opts.ids, feet: opts.feet, legs: opts.legs, every: opts.every ?? 0, frame: 0, frames: [] }; requestAnimationFrame(record) }
  window.mzansiRecordStop = () => { const r = rec; rec = null; return r?.frames || [] }
}

// Tests (natural legs): for each leg, which way the knee points against the body's
// forward (degrees in the body's own frame; a bent knee points ahead, not out or in),
// and how far the foot is turned from straight ahead (its rest turn).
const legQ = new THREE.Quaternion()
export function measureLegs(group) {
  const data = group.userData
  const model = group.getObjectByName('rig')
  if (!model || !data.bones) return null
  model.updateMatrixWorld(true)
  const inv = model.getWorldQuaternion(new THREE.Quaternion()).invert()
  const out = {}
  for (const side of ['L', 'R']) {
    const up = data.bones[`UpperLeg${side}`]
    const low = data.bones[`LowerLeg${side}`]
    const foot = data.bones[`Foot${side}`]
    if (!up || !low || !foot) continue
    const H = worldOf(up).applyQuaternion(inv)
    const K = worldOf(low).applyQuaternion(inv)
    const A = low.localToWorld(data.footInShin[side].clone()).applyQuaternion(inv)
    // (the knee's offset from the hip-to-ankle line, seen from above, in the body's frame)
    const along = A.clone().sub(H)
    const t = along.lengthSq() > 1e-6 ? K.clone().sub(H).dot(along) / along.lengthSq() : 0
    const off = K.clone().sub(H.clone().addScaledVector(along, t))
    const bent = off.length()
    const knee = bent > 0.025 ? Math.atan2(off.x, off.z) * 180 / Math.PI : null
    // (the foot's turn about the body's up axis, against its rest turn)
    legQ.copy(inv).multiply(foot.getWorldQuaternion(new THREE.Quaternion())).multiply(data.footFlat?.[side]?.clone().invert() || new THREE.Quaternion())
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(legQ)
    // (a toe pointing down mid-stride has no turn to speak of)
    const footTurn = Math.abs(fwd.y) < 0.6 ? Math.atan2(fwd.x, fwd.z) * 180 / Math.PI : null
    out[side] = { knee: knee === null ? null : +knee.toFixed(1), bend: +bent.toFixed(3), foot: footTurn === null ? null : +footTurn.toFixed(1) }
  }
  return out
}
// Where the two feet are in the world (the middle of each shoe, and its lowest
// point), for the planted-feet checks.
function feetNow(group) {
  const out = []
  for (const side of ['L', 'R']) {
    const sum = new THREE.Vector3()
    let n = 0
    let low = Infinity
    group.traverse((node) => {
      if (!node.isSkinnedMesh || !node.visible || node.userData.part !== 'feet') return
      const count = node.geometry.attributes.position.count
      const step = Math.max(1, Math.floor(count / 300))
      for (let i = 0; i < count; i += step) {
        node.getVertexPosition(i, vtx)
        node.localToWorld(vtx)
        const local = group.worldToLocal(vtx.clone())
        if ((side === 'L') !== (local.x > 0)) continue
        sum.add(vtx)
        n++
        low = Math.min(low, vtx.y)
      }
    })
    if (n) out.push([+(sum.x / n).toFixed(3), +(sum.y / n).toFixed(3), +(sum.z / n).toFixed(3), +low.toFixed(3)])
  }
  return out
}

// Clips from the Universal Animation Library (Quaternius, CC0: public/models/ual),
// retargeted live onto our rig: each mapped bone takes the source bone's turn away
// from its rest pose, in world space; the hips also take its lift and drop.
const UAL_MAP = {
  pelvis: 'Hips', spine_01: 'Abdomen', spine_02: 'Torso', spine_03: 'Chest', neck_01: 'Neck', Head: 'Head',
  clavicle_l: 'ShoulderL', upperarm_l: 'UpperArmL', lowerarm_l: 'LowerArmL', hand_l: 'WristL',
  clavicle_r: 'ShoulderR', upperarm_r: 'UpperArmR', lowerarm_r: 'LowerArmR', hand_r: 'WristR',
  thigh_l: 'UpperLegL', calf_l: 'LowerLegL', foot_l: 'FootL', thigh_r: 'UpperLegR', calf_r: 'LowerLegR', foot_r: 'FootR',
}
let ual = null
function loadUal() {
  ual ||= import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync('/models/ual/UAL1_Standard.glb')).then((gltf) => {
    const root = gltf.scene
    root.updateMatrixWorld(true)
    const bones = {}
    root.traverse((n) => { if (n.isBone && UAL_MAP[n.name]) bones[n.name] = n })
    const rest = {}
    for (const [name, bone] of Object.entries(bones)) rest[name] = { q: bone.getWorldQuaternion(new THREE.Quaternion()), p: bone.getWorldPosition(new THREE.Vector3()) }
    const mixer = new THREE.AnimationMixer(root)
    const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]))
    return { root, bones, rest, mixer, clips, hipHeight: rest.pelvis.p.y }
  })
  return ual
}
// Our rig's bind (rest) pose, each bone's turn relative to the model (once per person).
function rigRest(group, model) {
  const data = group.userData
  if (data.rigRest) return data.rigRest
  let skin = null
  model.traverse((n) => { if (!skin && n.isSkinnedMesh) skin = n })
  const bones = {}
  const rest = {}
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const sc = new THREE.Vector3()
  for (const name of Object.values(UAL_MAP)) {
    const i = skin.skeleton.bones.findIndex((b) => b.name === name)
    if (i < 0) continue
    bones[name] = skin.skeleton.bones[i]
    skin.skeleton.boneInverses[i].clone().invert().decompose(p, q, sc)
    rest[name] = { q: q.clone() }
  }
  data.rigRest = { bones, rest }
  return data.rigRest
}
const srcQ = new THREE.Quaternion()
const delta = new THREE.Quaternion()
// Pose this person from a UAL clip at time t (seconds).
// only: just these of our bones (the arms of a seated person, say); hips stay put.
function poseFromUal(group, model, src, clipName, t, only = null) {
  const data = group.userData
  const clip = src.clips[clipName]
  if (!clip) return
  const action = src.mixer.clipAction(clip)
  if (!action.isRunning()) { src.mixer.stopAllAction(); action.play() }
  action.time = Math.min(t, clip.duration)
  src.mixer.update(0)
  src.root.updateMatrixWorld(true)
  const { bones, rest } = rigRest(group, model)
  const modelQ = model.getWorldQuaternion(new THREE.Quaternion())
  const srcRootInv = src.root.getWorldQuaternion(new THREE.Quaternion()).invert()
  // Parents before children (the map is in hierarchy order).
  for (const [from, to] of Object.entries(UAL_MAP)) {
    const s = src.bones[from]
    const b = bones[to]
    if (!s || !b || !rest[to] || (only && !only.has(to))) continue
    // The source bone's turn from its rest, in the source's own frame...
    delta.copy(srcRootInv).multiply(s.getWorldQuaternion(srcQ)).multiply(src.rest[from].q.clone().invert().multiply(srcRootInv.clone().invert()))
    // ...applied to ours, in the model's frame.
    const want = modelQ.clone().multiply(delta).multiply(rest[to].q)
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want))
    b.updateMatrixWorld(true)
  }
  if (only) return
  // The hips rise and drop with the clip (scaled to our height).
  const p = src.bones.pelvis.getWorldPosition(new THREE.Vector3()).sub(src.rest.pelvis.p).applyQuaternion(srcRootInv)
  const k = (data.hipHeight || 0.9) / src.hipHeight
  model.position.add(p.multiplyScalar(k))
  carryFeet(model, data.bones, data.footInShin)
}

// ---------- Sitting with the clips (Sitting_Enter, Sitting_Idle_Loop, Sitting_Exit) ----------
// Each seat is placed under the clip: the person stands in front of it where the clip
// starts, and the clip's hips land on the seat; the only adjustment is a small foot
// lock that keeps the soles on the floor when the seat is higher or lower than the
// clip's own chair. Until the clips have loaded, the hand-made sit stands in.
let ualReady = null
export function preloadSitClips() { loadUal().then((src) => { ualReady = src }).catch(() => {}) }
// Seated arms: hands resting on the lap, from the clip's seated idle (the standing idle
// left them hanging straight down beside the seat, into a wide bench). Loaded the first
// time anyone sits.
const ARMS = new Set(['ShoulderL', 'UpperArmL', 'LowerArmL', 'WristL', 'ShoulderR', 'UpperArmR', 'LowerArmR', 'WristR'])
let ualArms = null
let ualArmsAsked = false
// w: how far the hands have come to the lap (sitting down and standing up blend them).
function seatedArms(group, model, time, w = 1) {
  if (!ualArmsAsked) { ualArmsAsked = true; loadUal().then((src) => { ualArms = src }).catch(() => {}) }
  if (!ualArms || w <= 0) return
  const { bones } = rigRest(group, model)
  const before = w < 1 ? [...ARMS].map((n) => [bones[n], bones[n]?.quaternion.clone()]) : null
  model.updateMatrixWorld(true)
  poseFromUal(group, model, ualArms, 'Sitting_Idle_Loop', time % ualArms.clips.Sitting_Idle_Loop.duration, ARMS)
  if (before) for (const [bone, q] of before) if (bone && q) bone.quaternion.copy(q.slerp(bone.quaternion, w))
  model.updateMatrixWorld(true)
}
function pelvisAt(src, name, t) {
  const clip = src.clips[name]
  const action = src.mixer.clipAction(clip)
  if (!action.isRunning()) { src.mixer.stopAllAction(); action.play() }
  action.time = Math.max(0, Math.min(t, clip.duration))
  src.mixer.update(0)
  src.root.updateMatrixWorld(true)
  return src.bones.pelvis.getWorldPosition(new THREE.Vector3()).sub(src.rest.pelvis.p).applyQuaternion(src.root.getWorldQuaternion(new THREE.Quaternion()).invert())
}
// How far through sitting down (0 standing .. 1 seated) the clip's hips are at t.
function dropAt(src, name, t) {
  const c = (src.drops ||= {})
  const d = (c[name] ||= { start: pelvisAt(src, name, 0).y, end: pelvisAt(src, name, src.clips[name].duration).y })
  const hi = Math.max(d.start, d.end)
  const lo = Math.min(d.start, d.end)
  return Math.max(0, Math.min(1, (hi - pelvisAt(src, name, t).y) / Math.max(1e-3, hi - lo)))
}
// Where this seat puts the clip, once per person and seat: the standing spot in front
// of it, the body's height standing on the floor (y0) and seated on the seat (y1).
function clipSeat(group, model) {
  const data = group.userData
  const src = ualReady
  const seatY = +group.getWorldPosition(seatAt).y.toFixed(3)
  const floor = seatFloorOf(group, seatY)
  if (data.clipSeat?.seatY === seatY && data.clipSeat.floor === floor) return data.clipSeat
  group.updateMatrixWorld(true)
  const k = (data.hipHeight || 0.9) / src.hipHeight
  const end = pelvisAt(src, 'Sitting_Enter', src.clips.Sitting_Enter.duration).multiplyScalar(k)
  const c = { seatY, floor, k, stand: { x: -end.x, z: -end.z }, y0: floor - seatY, y1: 0 }
  // Standing at the start of the clip: soles on the floor.
  model.rotation.set(0, 0, 0)
  model.position.set(c.stand.x, c.y0, c.stand.z)
  poseFromUal(group, model, src, 'Sitting_Enter', 0)
  model.updateMatrixWorld(true)
  c.y0 += floor - lowest(group, (n) => n.userData.part === 'feet')
  // Seated: the seat of the trousers on the seat.
  model.position.set(c.stand.x, c.y0, c.stand.z)
  poseFromUal(group, model, src, 'Sitting_Idle_Loop', 0)
  model.updateMatrixWorld(true)
  c.y1 = c.y0 + seatY - lowest(group, (n) => n.userData.part === 'legs' || n.userData.part === 'body', worldOf(data.bones.Hips || model))
  data.clipSeat = c
  data.standReach = c.stand.z
  return c
}
// One frame of a clip at this seat; f blends the body's height from standing on the
// floor (0) to seated on the seat (1), and the feet stay where the clip puts them.
function clipSit(group, model, name, t, f, at = null) {
  const data = group.userData
  const c = clipSeat(group, model)
  const y = c.y0 + (c.y1 - c.y0) * f
  model.rotation.set(0, at?.yaw || 0, 0)
  model.position.set(at ? at.x : c.stand.x, y, at ? at.z : c.stand.z)
  poseFromUal(group, model, ualReady, name, t)
  const shift = y - c.y0
  if (Math.abs(shift) > 0.002) {
    model.updateMatrixWorld(true)
    for (const side of ['L', 'R']) {
      const foot = data.bones[`Foot${side}`]
      if (foot) legTo(group, side, worldOf(foot).add(new THREE.Vector3(0, -shift, 0)))
    }
    carryFeet(model, data.bones, data.footInShin)
  }
}
function clipSeated(group, model, time) {
  clipSit(group, model, 'Sitting_Idle_Loop', time % ualReady.clips.Sitting_Idle_Loop.duration, 1)
}
function clipSitMotion(group, model, move, dt) {
  const data = group.userData
  const src = ualReady
  if (move.dir < 0) {
    // Hold the seat while rising (callers may already have moved the person on).
    group.position.set(move.seat.x, move.seat.y, move.seat.z)
    group.rotation.y = move.seat.rot
  }
  group.updateMatrixWorld(true)
  const c = clipSeat(group, model)
  if (move.dir > 0 && move.turn < 1) {
    // Turn round on the spot, shuffling onto the clip's starting spot.
    const span = SIT_MOVE.settle + Math.abs(move.from.yaw) / SIT_MOVE.turn
    move.turn = Math.min(1, move.turn + dt / span)
    const e = move.turn * move.turn * (3 - 2 * move.turn)
    clipSit(group, model, 'Sitting_Enter', 0, 0, { x: move.from.x + (c.stand.x - move.from.x) * e, z: move.from.z + (c.stand.z - move.from.z) * e, yaw: move.from.yaw * (1 - e) })
    data.sitPhase = 'turn'
    return
  }
  const name = move.dir > 0 ? 'Sitting_Enter' : 'Sitting_Exit'
  const dur = src.clips[name].duration
  move.t = (move.t || 0) + dt
  const t = Math.min(dur, move.t)
  const drop = dropAt(src, name, t)
  data.sitPhase = move.dir > 0 ? 'lower' : 'rise'
  clipSit(group, model, name, t, move.dir > 0 ? drop : 1 - drop)
  if (t < dur) return
  if (move.dir > 0) { data.sitMove = null; data.sitPhase = 'seated'; return }
  // Up: standing where the clip ends, on the floor.
  const end = pelvisAt(src, 'Sitting_Exit', dur).multiplyScalar(c.k)
  const x = c.stand.x + end.x
  const z = c.stand.z + end.z
  const cs = Math.cos(move.seat.rot)
  const sn = Math.sin(move.seat.rot)
  group.position.set(move.seat.x + x * cs + z * sn, c.floor, move.seat.z - x * sn + z * cs)
  model.position.set(0, 0, 0)
  model.rotation.set(0, 0, 0)
  data.sitMove = null
  data.sitPhase = 'up'
  data.yaw = move.seat.rot
  data.lastPos?.copy(group.position)
}
