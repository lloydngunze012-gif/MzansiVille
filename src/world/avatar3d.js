import * as THREE from 'three'
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
  female: {
    hoodie: { file: 'tee', top: ['White'] },
    shirt: { file: 'tee', top: ['White'] },
    organt: { file: 'tee', top: ['White'] },
    jacket: { file: 'suit', top: ['Black'] },
    dress: { file: 'dress', top: ['LimeGreen'], dress: true },
    shweshwe: { file: 'dress', top: ['LimeGreen'], dress: true },
    skirt: { file: 'dress', top: ['LimeGreen'], skirt: true },
    punk: { file: 'punk', top: ['Pink'] },
  },
}
// Creator hair -> head file.
const HEAD = {
  female: { braids: 'long', curls: 'bun', fade: 'bob', crop: 'bob' },
  male: { braids: 'long', curls: 'parted', fade: 'short', crop: 'crop' },
}
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
      if (/^skin/i.test(name)) return shared(`skin${name}`, () => mat(new THREE.Color(look.skin).multiplyScalar(/dark/i.test(name) ? 0.85 : 1)))
      if (part === 'head') {
        if (/^eye|eyebrow|^brown$/i.test(name)) return shared('eyes', () => mat(0x1c120c))
        if (/earring|yellow|moustache/i.test(name)) return shared(`own${m.uuid}`, () => m.clone())
        return shared('hair', () => mat(look.hair))
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
  })
}

// The Organt tee print, like the cover: a big black "031" (the dialling code)
// with "ORGANT" in purple underneath, on the chest, carried by the chest bone.
let printTexture = null
function organtPrint(code = '031') {
  if (printTexture) return printTexture
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1c1915'
  ctx.font = '900 112px "Arial Black", Impact, sans-serif'
  ctx.fillText(code, 128, 82, 240)
  ctx.fillStyle = '#7b3fe4'
  ctx.font = '900 40px "Arial Black", Impact, sans-serif'
  ctx.fillText('ORGANT', 128, 160, 230)
  printTexture = new THREE.CanvasTexture(canvas)
  printTexture.colorSpace = THREE.SRGBColorSpace
  return printTexture
}

const worldOf = (node) => node.getWorldPosition(new THREE.Vector3())

function addOrgantMark(model) {
  const chest = model.getObjectByName('Chest')
  const neck = model.getObjectByName('Neck')
  const torso = model.getObjectByName('Torso') || model.getObjectByName('Abdomen')
  if (!chest || !neck || !torso) return
  model.updateMatrixWorld(true)
  const top = worldOf(neck)
  const low = worldOf(torso)
  const shoulders = worldOf(model.getObjectByName('UpperArmL') || neck).distanceTo(worldOf(model.getObjectByName('UpperArmR') || neck)) || 0.3
  const w = shoulders * 0.95
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.75), new THREE.MeshStandardMaterial({ map: organtPrint(), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }))
  mark.name = 'organt-mark'
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()))
  const at = new THREE.Vector3().lerpVectors(low, top, 0.42).addScaledVector(forward, shoulders * 0.72)
  model.add(mark)
  mark.position.copy(model.worldToLocal(at))
  mark.updateMatrixWorld(true)
  chest.attach(mark)
}

export function lookOf(avatar = {}) {
  const byModel = MODEL_LOOK[avatar.model]
  const gender = byModel ? byModel[0] : genderOf(avatar)
  const outfit = OUTFIT[gender][avatar.outfit] || OUTFIT[gender].shirt
  const cloth = CLOTH[avatar.outfit] || CLOTH.hoodie
  const skin = avatar.skinColor || colorOf(skins, avatar.skin, '#d2956b')
  const head = byModel ? byModel[1] : HEAD[gender][avatar.hair] || HEAD[gender].crop
  return {
    model: avatar.model || `${gender}:${outfit.file}:${head}`,
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
    curvy: avatar.body === 'curvy',
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
    picks.push(...shoe.slice(0, 80).filter((_, i) => i % 5 === 0), ...shoe.slice(-30).filter((_, i) => i % 6 === 0))
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
  const box = new THREE.Box3().setFromObject(model)
  const s = HEIGHT / Math.max(0.1, box.max.y - box.min.y)
  model.scale.setScalar(s)
  // Not everyone has the same build: a little wider or narrower, taller or shorter.
  const wide = 1 + (look.curvy ? 0.12 : 0) + look.build * 0.1
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
  if (look.organt) addOrgantMark(model)
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

// Hide the stand-in parts that other code bolted on (Zanele's arms) once rigged.
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
    // The seat of the trousers on the seat (across its width: the sides of the hips too).
    const butt = Math.min(lowest(group, isCloth, worldOf(bones.Hips || model)), lowest(group, (n) => n.userData.part === 'legs', worldOf(bones.Hips || model), 0.22))
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
export const SIT_MOVE = { turn: 3, lower: 1.0, lean: 0.22, reach: 1.6 } // (lean: forward over the knees, not into a desk)
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
  const rest = { L: toLocal(group, bones.FootL), R: toLocal(group, bones.FootR) }
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
  // (6 cm further out than the seated feet: standing, the calves clear the seat's
  // front edge, and seated the shins lean forward a touch)
  const stand = { x: 0, y: standY, z: seated.z - rest.L.z + 0.06 }
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
    const hipsAt = worldOf(bones.Hips || model)
    const butt = Math.min(lowest(group, (n) => n.userData.part === 'legs' || n.userData.part === 'body', hipsAt), lowest(group, (n) => n.userData.part === 'legs', hipsAt, 0.22))
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
  carryFeet(model, data.bones, data.footInShin)
  // (on the way down, the seat of the trousers never goes below the seat: a low bench's
  // front edge would cut in before the hips are back over it)
  if (k > 0.25 && k < 1) {
    model.updateMatrixWorld(true)
    const butt = Math.min(lowest(group, (n) => n.userData.part === 'legs' || n.userData.part === 'body', worldOf(data.bones.Hips || model), 0.24), overSeat(group))
    if (Number.isFinite(butt) && butt < fit.seatY) {
      model.position.y += fit.seatY - butt
      model.updateMatrixWorld(true)
      for (const side of ['L', 'R']) legTo(group, side, group.localToWorld(rig.ankles[side].clone().addScaledVector(rig.lift[side], Math.sqrt(e))))
      carryFeet(model, data.bones, data.footInShin)
    }
  }
  flatFeet(group, model)
  // The hands come to the lap as the hips go down (and leave it standing up).
  if (k > 0 && k < 1) seatedArms(group, model, data.lastTime || 0, Math.min(1, Math.max(0, (k - 0.15) / 0.6)))
  // Leaning forward over the knees on the way down (and up).
  if (data.bones.Abdomen && k > 0 && k < 1) {
    sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(groupQ)).normalize()
    turnWorld(data.bones.Abdomen, sideways, SIT_MOVE.lean * Math.sin(Math.PI * k))
  }
}
// The lowest point of the trousers over the seat itself (its width, back to front edge
// about 0.2 m ahead of its middle): the thighs as well as the seat of the trousers.
const seatVtx = new THREE.Vector3()
function overSeat(group) {
  let min = Infinity
  group.traverse((node) => {
    if (!node.isSkinnedMesh || !node.visible || node.userData.part !== 'legs') return
    const count = node.geometry.attributes.position.count
    const step = Math.max(1, Math.floor(count / 500))
    for (let i = 0; i < count; i += step) {
      node.getVertexPosition(i, vtx)
      node.localToWorld(vtx)
      group.worldToLocal(seatVtx.copy(vtx))
      if (Math.abs(seatVtx.x) < 0.3 && seatVtx.z > -0.3 && seatVtx.z < 0.18 && vtx.y < min) min = vtx.y
    }
  })
  return min
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
    const span = 0.2 + Math.abs(move.from.yaw) / SIT_MOVE.turn
    move.turn = Math.min(1, move.turn + dt / span)
    const e = move.turn * move.turn * (3 - 2 * move.turn)
    model.rotation.y = move.from.yaw * (1 - e)
    model.position.set(move.from.x + (rig.stand.x - move.from.x) * e, rig.stand.y, move.from.z + (rig.stand.z - move.from.z) * e)
    carryFeet(model, data.bones, data.footInShin)
    data.sitPhase = 'turn'
    return
  }
  move.k = Math.max(0, Math.min(1, move.k + (move.dir * dt) / SIT_MOVE.lower))
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
const RUN_FROM = 2.3
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
  // first, so the step never points more than CRAB away from the body.
  const upright = data.pose !== 'sit' && data.pose !== 'lie' && data.pose !== 'dance'
  data.crab = 0
  if (data.rigged && upright && walking && !data.sitMove && last && moved > 1e-4 && moved < 2 && dt > 0) {
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
  for (const [name, most] of [[CLIP.walk, 2], [CLIP.sprint, 3.4]]) {
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
  if (data.pose !== 'sit' && data.pose !== 'lie') carryFeet(model, data.bones, data.footInShin)
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
  if (!settled) data.standAt = { x: group.position.x, z: group.position.z, yaw: data.yaw }
  if (data.fade !== undefined && data.fade < 1) fadeIn(group, dt)
}

// Tests (motion checks): every rigged person in a live scene, measured from the
// skinned vertices themselves: the lowest point of the shoes, the seat of the
// trousers (lowest leg vertex near the hips) and the body's lowest point overall.
const live = new Set()
const vtx = new THREE.Vector3()
// near: only vertices within that horizontal distance of a point (the seat of the trousers).
function lowest(group, test, near = null, radius = 0.1) {
  let min = Infinity
  group.traverse((node) => {
    if (!node.isSkinnedMesh || !node.visible || !test(node)) return
    const count = node.geometry.attributes.position.count
    const step = near ? 1 : Math.max(1, Math.floor(count / 400))
    for (let i = 0; i < count; i += step) {
      node.getVertexPosition(i, vtx)
      node.localToWorld(vtx)
      if (near && Math.hypot(vtx.x - near.x, vtx.z - near.z) > radius) continue
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
      const row = { id, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +(d.yaw ?? g.rotation.y).toFixed(4), ry: +g.rotation.y.toFixed(4), rx: +g.rotation.x.toFixed(4), clip: d.current, pose: d.pose || 'stand', phase: d.sitMove ? d.sitPhase : null, walking: d.current === CLIP.walk || d.current === CLIP.sprint }
      if (full || rec.feet?.includes(id)) {
        const m = measureBody(g)
        Object.assign(row, { sole: m.sole, ground: m.ground, floor: m.floor, low: m.low, hips: m.hips, seatGap: m.seatGap ?? null, bedGap: m.bedGap ?? null })
        if (rec.feet?.includes(id)) row.feet = feetNow(g)
      }
      people.push(row)
    }
    rec.frames.push({ t: performance.now(), people })
    requestAnimationFrame(record)
  }
  window.mzansiRecord = (opts = {}) => { rec = { where: opts.where, ids: opts.ids, feet: opts.feet, every: opts.every ?? 0, frame: 0, frames: [] }; requestAnimationFrame(record) }
  window.mzansiRecordStop = () => { const r = rec; rec = null; return r?.frames || [] }
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
    const span = 0.2 + Math.abs(move.from.yaw) / SIT_MOVE.turn
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
