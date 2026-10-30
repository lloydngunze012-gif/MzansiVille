import * as THREE from 'three'
import { genderOf, SKIRTED, skins } from '../avatar.js'

// Students are Kenney "Mini Characters" (CC0, public/models/characters).
// createAvatar returns at once with a capsule stand-in; the rigged model swaps in
// when its GLB has loaded. The palette texture is replaced by vertex colours so
// skin, hair, top, trousers and shoes follow the character creator.

const BASE = '/models/characters/'
// Gender and creator hair -> the Kenney body and head that read closest to it.
const HAIR_MODEL = {
  female: { braids: 'female-d', curls: 'female-f', fade: 'female-b', crop: 'female-b' },
  male: { braids: 'male-f', curls: 'male-a', fade: 'male-f', crop: 'male-d' },
}
export const CROWD_MODELS = ['female-b', 'female-d', 'female-f', 'male-a', 'male-d', 'male-f']
const HEIGHT = 1.55

// [top, shade, trousers, shoes], the same palette as the 2D creator (src/avatar.js).
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

const gltfCache = {}
let paletteData = null

function colorOf(list, id, fallback) {
  return list.find((item) => item.id === id)?.fill || fallback
}

async function palette() {
  if (paletteData) return paletteData
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = `${BASE}Textures/colormap.png`
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  paletteData = { size: img.width, px: ctx.getImageData(0, 0, img.width, img.height).data }
  return paletteData
}

function loadModel(name) {
  if (!gltfCache[name]) {
    gltfCache[name] = (async () => {
      const [{ GLTFLoader }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), palette()])
      return new GLTFLoader().loadAsync(`${BASE}character-${name}.glb`)
    })()
    gltfCache[name].catch(() => { delete gltfCache[name] })
  }
  return gltfCache[name]
}

// The palette is 16-px swatches: column = hue, top or bottom half = a second hue.
// Bottom halves of columns 23-31 are the skin tones.
function swatchOf(u, v, size) {
  const x = Math.min(size - 1, Math.floor(u * size))
  const y = Math.min(size - 1, Math.floor(v * size))
  const col = x >> 4
  const row = y >> 4
  return { x, y, col, key: `${col}:${row < 24 ? 'a' : 'b'}`, skinTone: col >= 23 && row >= 24 }
}

function partOf(mesh, index) {
  if (mesh.name === 'head-mesh') return 'head'
  const si = mesh.geometry.attributes.skinIndex
  const sw = mesh.geometry.attributes.skinWeight
  let best = 0
  for (let k = 1; k < 4; k++) if (sw.getComponent(index, k) > sw.getComponent(index, best)) best = k
  return mesh.skeleton.bones[si.getComponent(index, best)].name.replace(/-(left|right)$/, '')
}

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Class every vertex as skin, hair, top, bottom, shoes or keep (eyes, glasses, props).
function recolour(root, look) {
  const { size, px } = paletteData
  const meshes = []
  root.traverse((node) => { if (node.isSkinnedMesh) meshes.push(node) })
  // Which swatches show on which parts: skin is the skin tone on the hands.
  const onParts = {}
  for (const mesh of meshes) {
    const uv = mesh.geometry.attributes.uv
    for (let i = 0; i < uv.count; i++) {
      const s = swatchOf(uv.getX(i), uv.getY(i), size)
      ;(onParts[s.key] ||= new Set()).add(partOf(mesh, i))
    }
  }
  const target = {
    skin: new THREE.Color(look.skin),
    hair: new THREE.Color(look.hair),
    top: new THREE.Color(look.top),
    bottom: new THREE.Color(look.bottom),
    shoes: new THREE.Color(look.shoes),
  }
  for (const mesh of meshes) {
    const geometry = mesh.geometry
    const uv = geometry.attributes.uv
    const pos = geometry.attributes.position
    geometry.computeBoundingBox()
    const floor = geometry.boundingBox.min.y
    const span = geometry.boundingBox.max.y - floor || 1
    const colors = new Float32Array(uv.count * 3)
    const groups = {}
    const picks = []
    for (let i = 0; i < uv.count; i++) {
      const s = swatchOf(uv.getX(i), uv.getY(i), size)
      const p = (s.y * size + s.x) * 4
      const rgb = [px[p] / 255, px[p + 1] / 255, px[p + 2] / 255]
      const part = partOf(mesh, i)
      const parts = onParts[s.key]
      let kind = 'keep'
      if (part === 'head') {
        if (s.skinTone && (parts.has('arm') || parts.has('torso') || parts.has('leg'))) kind = 'skin'
        else if (s.skinTone || s.col === 3) kind = 'hair'
      } else if (s.skinTone) kind = 'skin'
      else if (part === 'torso') kind = 'top'
      else if (part === 'arm') kind = parts.has('torso') ? 'top' : 'keep'
      else if (part === 'leg') kind = (pos.getY(i) - floor) / span < 0.12 || s.col === 19 ? 'shoes' : 'bottom'
      picks.push([kind, rgb])
      if (kind !== 'keep') (groups[kind] ||= []).push(lum(...rgb))
    }
    const mean = {}
    for (const [kind, list] of Object.entries(groups)) mean[kind] = list.reduce((a, b) => a + b, 0) / list.length
    picks.forEach(([kind, rgb], i) => {
      if (kind === 'keep') { colors.set(rgb, i * 3); return }
      // Keep the baked shading: scale the new colour by how light this swatch is.
      const shade = Math.min(1.35, Math.max(0.6, lum(...rgb) / (mean[kind] || 1)))
      const c = target[kind]
      colors.set([c.r * shade, c.g * shade, c.b * shade], i * 3)
    })
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide })
    mesh.castShadow = true
  }
}

// The Organt tee: a dark wordmark bar on the chest, parented to the torso bone
// so it moves with the walk. Placed from the torso's own vertices in bind pose.
function addOrgantMark(model) {
  const torso = model.getObjectByName('torso')
  const body = model.getObjectByName('body-mesh')
  if (!torso || !body?.isSkinnedMesh) return
  model.updateMatrixWorld(true)
  const pos = body.geometry.attributes.position
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    if (partOf(body, i) === 'torso') box.expandByPoint(point.fromBufferAttribute(pos, i))
  }
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(size.x * 0.5, size.y * 0.16, size.z * 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1c1915, roughness: 0.5 }),
  )
  mark.name = 'organt-mark'
  const front = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + size.y * 0.62, box.max.z + size.z * 0.02).applyMatrix4(body.matrixWorld)
  torso.worldToLocal(front)
  mark.position.copy(front)
  torso.add(mark)
}

// A flared low-poly hem from the waist, carried by the torso bone so it turns
// and bobs with the walk while the legs swing underneath.
function addSkirt(model, look) {
  const torso = model.getObjectByName('torso')
  const body = model.getObjectByName('body-mesh')
  if (!torso || !body?.isSkinnedMesh) return
  model.updateMatrixWorld(true)
  const pos = body.geometry.attributes.position
  const waist = new THREE.Box3()
  const legs = new THREE.Box3()
  const point = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    const part = partOf(body, i)
    if (part === 'torso') waist.expandByPoint(point.fromBufferAttribute(pos, i))
    else if (part === 'leg') legs.expandByPoint(point.fromBufferAttribute(pos, i))
  }
  if (waist.isEmpty() || legs.isEmpty()) return
  const width = Math.max(waist.max.x - waist.min.x, legs.max.x - legs.min.x)
  const depth = Math.max(waist.max.z - waist.min.z, legs.max.z - legs.min.z)
  const top = waist.min.y + (waist.max.y - waist.min.y) * 0.25
  const height = (top - legs.min.y) * 0.62
  const geometry = new THREE.CylinderGeometry(0.5, 0.68, height, 8, 1, true)
  geometry.scale(width, 1, depth * 1.1)
  const material = new THREE.MeshStandardMaterial({ color: look.skirt, roughness: 0.8, side: THREE.DoubleSide, flatShading: true })
  if (look.print) material.emissive = new THREE.Color(0x0b1a3a)
  const hem = new THREE.Mesh(geometry, material)
  hem.name = 'skirt'
  hem.castShadow = true
  hem.position.set((waist.min.x + waist.max.x) / 2, top - height / 2, (waist.min.z + waist.max.z) / 2)
  body.add(hem)
  hem.updateMatrixWorld(true)
  torso.attach(hem)
}

export function lookOf(avatar = {}) {
  const cloth = CLOTH[avatar.outfit] || CLOTH.hoodie
  const gender = genderOf(avatar)
  const skin = avatar.skinColor || colorOf(skins, avatar.skin, '#d2956b')
  const skirted = SKIRTED.has(avatar.outfit)
  return {
    model: avatar.model || HAIR_MODEL[gender][avatar.hair] || HAIR_MODEL[gender].crop,
    skin,
    hair: avatar.hairColor || HAIR,
    top: avatar.topColor || cloth[0],
    // Under a skirt or dress the legs are bare; the hem is its own mesh.
    bottom: skirted ? skin : avatar.bottomColor || cloth[1],
    shoes: avatar.shoeColor || cloth[2],
    skirt: skirted ? avatar.skirtColor || cloth[1] : '',
    print: avatar.outfit === 'shweshwe',
    organt: avatar.outfit === 'organt',
    curvy: avatar.body === 'curvy',
  }
}

async function attachModel(group, look) {
  const gltf = await loadModel(look.model)
  if (group.userData.disposed) return
  const { clone } = await import('three/addons/utils/SkeletonUtils.js')
  const model = clone(gltf.scene)
  // SkeletonUtils.clone shares geometry between clones; each student needs its own,
  // or the last recolour on a model paints everyone who uses that model.
  model.traverse((node) => { if (node.isSkinnedMesh) node.geometry = node.geometry.clone() })
  recolour(model, look)
  const box = new THREE.Box3().setFromObject(model)
  model.scale.setScalar(HEIGHT / Math.max(0.1, box.max.y - box.min.y))
  if (look.curvy) { model.scale.x *= 1.14; model.scale.z *= 1.1 }
  model.name = 'rig'
  if (look.organt) addOrgantMark(model)
  if (look.skirt) addSkirt(model, look)
  const mixer = new THREE.AnimationMixer(model)
  const actions = {}
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip)
  for (const child of group.children) if (child.userData.standIn) child.visible = false
  group.add(model)
  group.userData.mixer = mixer
  group.userData.actions = actions
  group.userData.current = ''
  group.userData.rigged = true
  group.dispatchEvent({ type: 'rigged' })
}

export function createAvatar(avatar = {}) {
  const look = lookOf(avatar)
  const group = new THREE.Group()
  group.name = 'player'

  // Stand-in until the GLB arrives (and the fallback if it never does).
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.62, 4, 8), new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.8 }))
  body.position.y = 0.78
  body.castShadow = true
  body.userData.standIn = true
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7 }))
  head.position.y = 1.42
  head.castShadow = true
  head.userData.standIn = true
  group.add(head)

  group.userData.bob = body
  group.userData.look = look
  attachModel(group, look).catch((error) => console.warn('character model', error))
  return group
}

// Hide the stand-in parts that other code bolted on (Zanele's arms) once rigged.
export function markStandIn(node) {
  node.userData.standIn = true
}

function play(group, name, fade = 0.2) {
  const { actions, current } = group.userData
  if (!actions || current === name || !actions[name]) return
  const next = actions[name]
  next.reset().fadeIn(fade).play()
  if (current && actions[current]) actions[current].fadeOut(fade)
  group.userData.current = name
}

// One-off clip (a wave or a nod), then back to idle or walk on the next frame.
export function gesture(group, name) {
  const { actions, mixer } = group.userData
  const action = actions?.[name]
  if (!action) return 0
  if (group.userData.current && actions[group.userData.current]) actions[group.userData.current].fadeOut(0.15)
  action.reset().setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.fadeIn(0.15).play()
  group.userData.current = name
  const done = () => { mixer.removeEventListener('finished', onFinish); if (group.userData.current === name) group.userData.current = '' }
  const onFinish = (event) => { if (event.action === action) { action.fadeOut(0.2); done() } }
  mixer.addEventListener('finished', onFinish)
  return action.getClip().duration
}

// pose: 'stand' (idle or walk), 'sit', or 'lie' (frozen, the caller tilts the group).
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
  const busy = data.actions[data.current]?.loop === THREE.LoopOnce && data.actions[data.current].isRunning()
  if (!busy) {
    if (data.pose === 'sit') play(group, 'sit')
    else if (data.pose === 'lie') play(group, 'idle')
    else play(group, walking ? 'walk' : 'idle')
  }
  // In bed the idle runs slowly, so the arms stay down and it reads as breathing.
  data.mixer.update(data.pose === 'lie' ? dt * 0.25 : dt)
  if (data.pose === 'lie') {
    // The idle only lowers the arms part way from the T-pose; in bed they lie at the sides.
    const left = group.getObjectByName('arm-left')
    const right = group.getObjectByName('arm-right')
    if (left) left.rotation.z = -1.3
    if (right) right.rotation.z = 1.3
  }
}
