import * as THREE from 'three'
import { genderOf, skins } from '../avatar.js'

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
      if (/^skin/i.test(name)) return shared(`skin${name}`, () => mat(new THREE.Color(look.skin).multiplyScalar(/dark/i.test(name) ? 0.85 : 1)))
      if (part === 'head') {
        if (/^eye|eyebrow|^brown$/i.test(name)) return shared('eyes', () => mat(0x1c120c))
        if (/earring|yellow|moustache/i.test(name)) return m
        return shared('hair', () => mat(look.hair))
      }
      if (part === 'body') return look.outfitTop.includes(name) ? topMat() : m
      if (part === 'legs') {
        if (look.dress) return topMat()
        if (look.skirt) return shared('skirt', () => mat(look.skirt))
        return shared('bottom', () => mat(look.bottom))
      }
      if (part === 'feet' && !shoeDone) { shoeDone = true; return shared('shoes', () => mat(look.shoes)) }
      return m
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
  if (look.organt) addOrgantMark(model)
  model.name = 'rig'
  const bones = {}
  // (three.js drops the dots from bone names: UpperLeg.L loads as UpperLegL.)
  for (const name of ['UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR', 'Hips']) {
    const bone = model.getObjectByName(name)
    if (bone) bones[name] = bone
  }
  model.updateMatrixWorld(true)
  const hipHeight = bones.Hips ? worldOf(bones.Hips).y : 0.9
  // The feet are IK bones outside the leg chain: remember where each foot sits in
  // its shin's space, so the sitting pose can carry the feet with the knees.
  // Rest pose of the bones the poses move: not every clip drives them, so they are
  // reset each frame before the clip plays (or the bends would pile up).
  const rest = Object.values(bones).map((bone) => [bone, bone.position.clone(), bone.quaternion.clone()])
  const footInShin = {}
  for (const side of ['L', 'R']) {
    const shin = bones[`LowerLeg${side}`]
    const foot = bones[`Foot${side}`]
    if (shin && foot) footInShin[side] = shin.worldToLocal(worldOf(foot))
  }
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of animGltf.animations) actions[clip.name] = mixer.clipAction(clip)
  for (const child of group.children) if (child.userData.standIn) child.visible = false
  group.add(model)
  Object.assign(group.userData, { mixer, actions, current: '', rigged: true, headParts: heads, bones, hipHeight, footInShin, rest })
  group.dispatchEvent({ type: 'rigged' })
}

export function createAvatar(avatar = {}) {
  const look = lookOf(avatar)
  const group = new THREE.Group()
  group.name = 'player'

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

  const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.9, 8), new THREE.MeshBasicMaterial())
  hit.position.y = 0.95
  hit.visible = false
  hit.name = 'hit'
  group.add(hit)
  group.userData.bob = body
  group.userData.look = look
  attachModel(group, look).catch((error) => console.warn('character model', error))
  return group
}

// Hide the stand-in parts that other code bolted on (Zanele's arms) once rigged.
export function markStandIn(node) {
  node.userData.standIn = true
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
// seat rests on the seat. Callers put the avatar's origin at the seat surface (y)
// and its centre (x, z), facing out of the seat. SIT holds the bend angles and offsets.
export const SIT = { thigh: -1.57, knee: 1.57, drop: 0.08, back: -0.12 }
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
function sitPose(group, onGround) {
  const { bones, hipHeight } = group.userData
  const model = group.getObjectByName('rig')
  model.position.y = -(hipHeight || 0.9) + SIT.drop
  model.position.z = SIT.back
  model.updateMatrixWorld(true)
  // The body's left-right axis, in world space.
  sideways.set(1, 0, 0).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion())).normalize()
  for (const side of ['L', 'R']) {
    const up = bones[`UpperLeg${side}`]
    const low = bones[`LowerLeg${side}`]
    if (up) turnWorld(up, sideways, SIT.thigh)
    if (low && !onGround) turnWorld(low, sideways, SIT.knee)
  }
  // Carry each foot to the end of its bent shin.
  model.updateMatrixWorld(true)
  for (const side of ['L', 'R']) {
    const shin = bones[`LowerLeg${side}`]
    const foot = bones[`Foot${side}`]
    const local = group.userData.footInShin?.[side]
    if (!shin || !foot || !local) continue
    const at = shin.localToWorld(local.clone())
    foot.parent.worldToLocal(at)
    foot.position.copy(at)
  }
}

// pose: 'stand' (idle or walk), 'sit', 'talk', 'run', 'dance' or 'lie'
// (the caller tilts the group to lie down).
export function poseAvatar(group, walking, time) {
  const data = group.userData
  const dt = Math.min(0.1, Math.max(0, time - (data.lastTime ?? time)))
  data.lastTime = time
  if (!data.rigged) {
    const bob = walking ? Math.abs(Math.sin(time * 10)) * 0.06 : 0
    group.position.y = data.pose === 'lie' ? group.position.y : bob
    group.rotation.z = walking ? Math.sin(time * 10) * 0.04 : 0
    return
  }
  const onGround = data.pose === 'sit' && group.position.y < 0.2
  if (!data.gesturing?.isRunning()) {
    if (data.pose === 'sit' || data.pose === 'lie') play(group, 'idle')
    else if (data.pose === 'talk') play(group, 'talk')
    else if (data.pose === 'run') play(group, walking ? 'sprint' : 'idle')
    else if (data.pose === 'dance') play(group, 'dance')
    else play(group, walking ? 'walk' : 'idle')
  }
  const idle = data.actions[CLIP.idle]
  if (idle) idle.timeScale = data.pose === 'lie' ? 0.25 : 1
  for (const [bone, p, q] of data.rest || []) { bone.position.copy(p); bone.quaternion.copy(q) }
  data.mixer.update(dt)
  const model = group.getObjectByName('rig')
  if (!model) return
  model.position.set(0, 0, 0)
  model.rotation.y = 0
  if (data.pose === 'sit') sitPose(group, onGround)
  // Lying (the caller tips the group onto its back): lift so the back rests on top.
  if (data.pose === 'lie') model.position.z = 0.12
  // Dancing: the wave with a bounce and a sway on the beat (112 BPM, like the groove).
  if (data.pose === 'dance') {
    const beat = (time * 112) / 60
    model.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.1
    model.rotation.y = Math.sin(beat * Math.PI / 2) * 0.4
  }
}
