import * as THREE from 'three'
import { genderOf, SKIRTED, skins } from '../avatar.js'

// Students are Quaternius "Universal Base Characters" (CC0, public/models/people):
// normal-proportion male and female bodies, animated with clips from the Universal
// Animation Library (same rig). createAvatar returns at once with a capsule
// stand-in; the rigged model swaps in when its GLB has loaded. Skin, top, bottoms
// and shoes are vertex colours by body region (the dominant bone of each vertex),
// so the character creator decides them; hair is a separate mesh on the head bone.

const BASE = '/models/people/'
const BODY = { female: 'superhero_female', male: 'superhero_male' }
// Creator hair -> hairstyle mesh, by gender.
const HAIR_MESH = {
  female: { braids: 'hair_long', curls: 'hair_buns', fade: 'hair_buzzedfemale', crop: 'hair_simpleparted' },
  male: { braids: 'hair_long', curls: 'hair_simpleparted', fade: 'hair_buzzed', crop: 'hair_simpleparted' },
}
// Crowd and cast "model" keys pick a gender and a hairstyle for variety.
const MODEL_LOOK = {
  'female-b': ['female', 'hair_buns'], 'female-d': ['female', 'hair_long'], 'female-f': ['female', 'hair_buzzedfemale'],
  'male-a': ['male', 'hair_buzzed'], 'male-d': ['male', 'hair_simpleparted'], 'male-f': ['male', 'hair_buzzed', 'hair_beard'],
}
export const CROWD_MODELS = Object.keys(MODEL_LOOK)
const HEIGHT = 1.72
// The sitting clip sits on a 45 cm chair, hips behind the origin: callers put the
// avatar at the seat surface, so the model drops and moves forward to sit on it.
const SIT_DROP = -0.47
const SIT_FORWARD = 0.3
const LIE_LIFT = 0.15

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
const LONG_SLEEVES = new Set(['hoodie', 'jacket'])
const DRESSES = new Set(['dress', 'shweshwe'])
const HAIR = '#1c1915'

// Game names for clips -> Universal Animation Library clip names.
const CLIP = { idle: 'Idle_Loop', walk: 'Walk_Loop', sprint: 'Jog_Fwd_Loop', sit: 'Sitting_Idle_Loop', sitTalk: 'Sitting_Talking_Loop', talk: 'Idle_Talking_Loop', dance: 'Dance_Loop', crouch: 'Crouch_Idle_Loop', static: 'Idle_Loop' }
const GESTURE = { 'interact-right': 'Interact', 'interact-left': 'Interact', 'pick-up': 'PickUp_Table', 'emote-yes': 'Dance_Loop', 'emote-no': 'Idle_Talking_Loop' }

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

// Body region of a bone, from its name.
function regionName(name = '') {
  if (/^(head|neck)/i.test(name)) return 'head'
  if (/^(spine|clavicle)/.test(name)) return 'torso'
  if (/^upperarm/.test(name)) return 'upperarm'
  if (/^lowerarm/.test(name)) return 'lowerarm'
  if (/^(hand|index|middle|pinky|ring|thumb)/.test(name)) return 'hand'
  if (/^pelvis/.test(name)) return 'pelvis'
  if (/^thigh/.test(name)) return 'thigh'
  if (/^calf/.test(name)) return 'calf'
  if (/^(foot|ball)/.test(name)) return 'foot'
  return 'torso'
}

function recolour(model, look) {
  const c = (hex) => new THREE.Color(hex)
  const skin = c(look.skin)
  const top = c(look.top)
  const bottom = c(look.bottom)
  const shoes = c(look.shoes)
  const pick = {
    head: skin, hand: skin, torso: top, upperarm: top,
    lowerarm: look.longSleeves ? top : skin,
    pelvis: look.dress ? top : look.skirt ? c(look.skirt) : bottom,
    thigh: look.skirt ? skin : bottom,
    calf: look.skirt ? skin : bottom,
    foot: shoes,
  }
  model.traverse((node) => {
    if (!node.isSkinnedMesh) return
    const geometry = node.geometry
    if (/eye/i.test(node.name) && !/brow/i.test(node.name)) {
      node.material = new THREE.MeshStandardMaterial({ color: 0x20140e, roughness: 0.3 })
      geometry.deleteAttribute('color')
      return
    }
    if (/brow/i.test(node.name)) {
      node.material = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.8 })
      geometry.deleteAttribute('color')
      return
    }
    // Blend the region colours by skin weight: clean soft edges, no zigzags.
    const n = geometry.attributes.position.count
    const colors = new Float32Array(n * 3)
    const si = geometry.attributes.skinIndex
    const sw = geometry.attributes.skinWeight
    const regionOfBone = node.skeleton.bones.map((bone) => regionName(bone.name))
    for (let i = 0; i < n; i++) {
      let r = 0
      let g = 0
      let b = 0
      let total = 0
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k)
        if (!w) continue
        const col = pick[regionOfBone[si.getComponent(i, k)]] || top
        r += col.r * w
        g += col.g * w
        b += col.b * w
        total += w
      }
      colors[i * 3] = r / (total || 1)
      colors[i * 3 + 1] = g / (total || 1)
      colors[i * 3 + 2] = b / (total || 1)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    node.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 })
    node.castShadow = true
  })
}

// The Organt tee print, like the cover: a big black "031" (the dialling code) with
// "ORGANT" in purple underneath, on the chest, carried by the upper spine bone.
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

// Placed from bone positions (the mesh's bind-space numbers do not match the world).
function addOrgantMark(model) {
  const spine = model.getObjectByName('spine_03') || model.getObjectByName('spine_02')
  const neck = model.getObjectByName('neck_01')
  const lower = model.getObjectByName('spine_01')
  if (!spine || !neck || !lower) return
  model.updateMatrixWorld(true)
  const top = worldOf(neck)
  const bottom = worldOf(lower)
  const shoulders = (worldOf(model.getObjectByName('upperarm_l') || neck).distanceTo(worldOf(model.getObjectByName('upperarm_r') || neck))) || 0.3
  const w = shoulders * 0.55
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.75), new THREE.MeshStandardMaterial({ map: organtPrint(), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }))
  mark.name = 'organt-mark'
  const chestY = bottom.y + (top.y - bottom.y) * 0.62
  // Out in front of the chest: a little ahead of the spine.
  const at = new THREE.Vector3(top.x, chestY, Math.max(top.z, bottom.z) + shoulders * 0.6)
  model.add(mark)
  mark.position.copy(model.worldToLocal(at.clone()))
  mark.updateMatrixWorld(true)
  spine.attach(mark)
}

// A flared hem from the hips, carried by the pelvis bone so it moves with the walk.
function addSkirt(model, look) {
  const pelvis = model.getObjectByName('pelvis')
  const thighL = model.getObjectByName('thigh_l')
  const thighR = model.getObjectByName('thigh_r')
  if (!pelvis || !thighL || !thighR) return
  model.updateMatrixWorld(true)
  const hip = worldOf(pelvis)
  const width = worldOf(thighL).distanceTo(worldOf(thighR)) * 2.3
  const height = look.dress ? 0.5 : 0.38
  const geometry = new THREE.CylinderGeometry(width * 0.5, width * 0.68, height, 10, 1, true)
  geometry.scale(1, 1, 0.82)
  const material = new THREE.MeshStandardMaterial({ color: look.skirt, roughness: 0.8, side: THREE.DoubleSide, flatShading: true })
  if (look.print) material.emissive = new THREE.Color(0x0b1a3a)
  const hem = new THREE.Mesh(geometry, material)
  hem.name = 'skirt'
  hem.castShadow = true
  model.add(hem)
  hem.position.copy(model.worldToLocal(new THREE.Vector3(hip.x, hip.y + 0.07 - height / 2, hip.z)))
  hem.updateMatrixWorld(true)
  pelvis.attach(hem)
}

// Hair and eyebrows meshes are modelled in place over the head: add them to the
// model, then hang them on the head bone so they turn and nod with it.
function addToHead(model, scene, color) {
  const head = model.getObjectByName('Head') || model.getObjectByName('head')
  const parts = []
  scene.traverse((node) => { if (node.isMesh) parts.push(node) })
  model.updateMatrixWorld(true)
  for (const src of parts) {
    const mesh = new THREE.Mesh(src.geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }))
    src.updateWorldMatrix(true, false)
    mesh.applyMatrix4(src.matrixWorld)
    mesh.castShadow = true
    mesh.name = 'hair'
    model.add(mesh)
    if (head) head.attach(mesh)
    model.userData.headParts.push(mesh)
  }
}

export function lookOf(avatar = {}) {
  const cloth = CLOTH[avatar.outfit] || CLOTH.hoodie
  const byModel = MODEL_LOOK[avatar.model]
  const gender = byModel ? byModel[0] : genderOf(avatar)
  const skin = avatar.skinColor || colorOf(skins, avatar.skin, '#d2956b')
  const skirted = SKIRTED.has(avatar.outfit)
  const hair = byModel ? byModel[1] : HAIR_MESH[gender][avatar.hair] || HAIR_MESH[gender].crop
  return {
    model: avatar.model || `${gender}:${hair}`,
    body: BODY[gender],
    gender,
    hairMesh: hair,
    beard: byModel?.[2] || '',
    skin,
    hair: avatar.hairColor || HAIR,
    top: avatar.topColor || cloth[0],
    bottom: skirted ? skin : avatar.bottomColor || cloth[1],
    shoes: avatar.shoeColor || cloth[2],
    skirt: skirted ? avatar.skirtColor || cloth[1] : '',
    dress: DRESSES.has(avatar.outfit),
    longSleeves: LONG_SLEEVES.has(avatar.outfit || 'hoodie'),
    print: avatar.outfit === 'shweshwe',
    organt: avatar.outfit === 'organt',
    curvy: avatar.body === 'curvy',
  }
}

async function attachModel(group, look) {
  const [bodyGltf, animGltf, hairGltf, browGltf, beardGltf] = await Promise.all([
    load(look.body),
    load('animations'),
    load(look.hairMesh),
    load(look.gender === 'female' ? 'eyebrows_female' : 'eyebrows_regular'),
    look.beard ? load(look.beard) : null,
  ])
  if (group.userData.disposed) return
  const { clone } = await import('three/addons/utils/SkeletonUtils.js')
  const model = clone(bodyGltf.scene)
  model.userData.headParts = []
  // Each student needs its own geometry, or recolouring one paints them all.
  model.traverse((node) => { if (node.isSkinnedMesh) node.geometry = node.geometry.clone() })
  recolour(model, look)
  addToHead(model, hairGltf.scene, look.hair)
  addToHead(model, browGltf.scene, look.hair)
  if (beardGltf) addToHead(model, beardGltf.scene, look.hair)
  model.traverse((node) => { if (node.isSkinnedMesh && /eye/i.test(node.name)) model.userData.headParts.push(node) })
  const box = new THREE.Box3().setFromObject(model)
  model.scale.setScalar(HEIGHT / Math.max(0.1, box.max.y - box.min.y))
  if (look.curvy) { model.scale.x *= 1.08; model.scale.z *= 1.06 }
  if (look.organt) addOrgantMark(model)
  if (look.skirt) addSkirt(model, look)
  model.name = 'rig'
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of animGltf.animations) actions[clip.name] = mixer.clipAction(clip)
  for (const child of group.children) if (child.userData.standIn) child.visible = false
  group.add(model)
  group.userData.mixer = mixer
  group.userData.actions = actions
  group.userData.current = ''
  group.userData.rigged = true
  group.userData.headParts = model.userData.headParts
  group.dispatchEvent({ type: 'rigged' })
}

export function createAvatar(avatar = {}) {
  const look = lookOf(avatar)
  const group = new THREE.Group()
  group.name = 'player'

  // Stand-in until the GLB arrives (and the fallback if it never does).
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.8 }))
  body.position.y = 0.85
  body.castShadow = true
  body.userData.standIn = true
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 }))
  head.position.y = 1.58
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

// One-off clip (a wave, a nod, picking something up), then back to the pose.
export function gesture(group, name) {
  const { actions, mixer } = group.userData
  const clip = GESTURE[name] || CLIP[name] || name
  const action = actions?.[clip]
  if (!action) return 0
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
    if (data.pose === 'sit') play(group, onGround ? 'crouch' : 'sit')
    else if (data.pose === 'talk') play(group, 'talk')
    else if (data.pose === 'lie') play(group, 'idle')
    else if (data.pose === 'run') play(group, walking ? 'sprint' : 'idle')
    else if (data.pose === 'dance') play(group, 'dance')
    else play(group, walking ? 'walk' : 'idle')
  }
  // Sitting on a chair or bench: drop onto the seat and slide forward over it.
  const model = group.getObjectByName('rig')
  if (model) {
    const seated = data.pose === 'sit' && !onGround
    model.position.y = seated ? SIT_DROP : 0
    // Lying (the caller tips the group onto its back): lift by half the body's
    // depth so the back rests on the bed instead of sinking into it.
    model.position.z = seated ? SIT_FORWARD : data.pose === 'lie' ? LIE_LIFT : 0
  }
  // In bed the idle runs slowly, so it reads as breathing (only the clip slows,
  // not its fade-in, or the arms start in the T-pose).
  const idle = data.actions[CLIP.idle]
  if (idle) idle.timeScale = data.pose === 'lie' ? 0.25 : 1
  data.mixer.update(dt)
}
