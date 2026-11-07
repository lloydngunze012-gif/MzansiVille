// Test harness (not shipped): an Ara 3D Gen student for the creator studio comparison.
// Loads Athletic_man.glb / Athletic_woman.glb (kept in Downloads, served by the test, never in
// public/), retargets the game's UAL Dance_Loop onto Ara's Mixamo-named rig (the spike 3b method:
// a 20-bone name map and a rest-pose fix, baked at 30 fps into an ordinary clip), takes the
// MakeHuman logo off the tee, and optionally puts the Organt print on it.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const MAP = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot',
}
const CHILD = {
  pelvis: ['spine_01', 'Spine'], spine_01: ['spine_02', 'Spine1'], spine_02: ['spine_03', 'Spine2'], spine_03: ['neck_01', 'Neck'], neck_01: ['Head', 'Head'],
  clavicle_l: ['upperarm_l', 'LeftArm'], upperarm_l: ['lowerarm_l', 'LeftForeArm'], lowerarm_l: ['hand_l', 'LeftHand'], hand_l: ['middle_01_l', 'LeftHandMiddle1'],
  clavicle_r: ['upperarm_r', 'RightArm'], upperarm_r: ['lowerarm_r', 'RightForeArm'], lowerarm_r: ['hand_r', 'RightHand'], hand_r: ['middle_01_r', 'RightHandMiddle1'],
  thigh_l: ['calf_l', 'LeftLeg'], calf_l: ['foot_l', 'LeftFoot'], foot_l: ['ball_l', 'LeftToeBase'],
  thigh_r: ['calf_r', 'RightLeg'], calf_r: ['foot_r', 'RightFoot'], foot_r: ['ball_r', 'RightToeBase'],
}

let ualPromise = null
export async function ual() {
  if (!ualPromise) {
    ualPromise = new GLTFLoader().loadAsync('/models/ual/UAL1_Standard.glb').then((g) => {
      g.scene.updateMatrixWorld(true)
      const bones = {}
      g.scene.traverse((n) => { if (n.isBone) bones[n.name] = n })
      const rest = {}
      for (const name of Object.keys(MAP)) rest[name] = { q: bones[name].getWorldQuaternion(new THREE.Quaternion()), p: bones[name].getWorldPosition(new THREE.Vector3()) }
      const restPos = {}
      for (const [n, b] of Object.entries(bones)) restPos[n] = b.getWorldPosition(new THREE.Vector3())
      return { root: g.scene, bones, rest, restPos, mixer: new THREE.AnimationMixer(g.scene), clips: Object.fromEntries(g.animations.map((c) => [c.name, c])), hipHeight: rest.pelvis.p.y }
    })
  }
  return ualPromise
}

function rigOf(src, root) {
  let skin = null
  root.traverse((n) => { if (!skin && n.isSkinnedMesh) skin = n })
  const byName = {}
  skin.skeleton.bones.forEach((b, i) => { byName[b.name] = { bone: b, i } })
  const rest = {}
  const pos = {}
  skin.skeleton.bones.forEach((b, i) => {
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    skin.skeleton.boneInverses[i].clone().invert().decompose(p, q, new THREE.Vector3())
    pos[b.name] = p
    rest[b.name] = { q, p }
  })
  const srcRootInv = src.root.getWorldQuaternion(new THREE.Quaternion()).invert()
  const fix = {}
  for (const [from, to] of Object.entries(MAP)) {
    const c = CHILD[from]
    if (!c || !pos[to] || !pos[c[1]] || !src.restPos[c[0]]) { fix[to] = new THREE.Quaternion(); continue }
    const dirT = pos[c[1]].clone().sub(pos[to]).normalize()
    const dirS = src.restPos[c[0]].clone().sub(src.restPos[from]).applyQuaternion(srcRootInv).normalize()
    fix[to] = new THREE.Quaternion().setFromUnitVectors(dirT, dirS)
  }
  return { skin, byName, rest, fix }
}

function poseFromUal(src, rig, root, clipName, t) {
  const clip = src.clips[clipName]
  const action = src.mixer.clipAction(clip)
  if (!action.isRunning()) { src.mixer.stopAllAction(); action.play() }
  action.time = Math.min(t, clip.duration)
  src.mixer.update(0)
  src.root.updateMatrixWorld(true)
  root.updateMatrixWorld(true)
  const modelQ = root.getWorldQuaternion(new THREE.Quaternion())
  const srcRootInv = src.root.getWorldQuaternion(new THREE.Quaternion()).invert()
  const out = {}
  for (const [from, to] of Object.entries(MAP)) {
    const s = src.bones[from]
    const e = rig.byName[to]
    const r = rig.rest[to]
    if (!s || !e || !r) continue
    const delta = srcRootInv.clone().multiply(s.getWorldQuaternion(new THREE.Quaternion())).multiply(src.rest[from].q.clone().invert().multiply(srcRootInv.clone().invert()))
    const want = modelQ.clone().multiply(delta).multiply(rig.fix[to] || new THREE.Quaternion()).multiply(r.q)
    e.bone.quaternion.copy(e.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want))
    e.bone.updateMatrixWorld(true)
    out[to] = e.bone.quaternion.clone()
  }
  const p = src.bones.pelvis.getWorldPosition(new THREE.Vector3()).sub(src.rest.pelvis.p).applyQuaternion(srcRootInv)
  return { quats: out, hipsDelta: p }
}

function bake(src, root, rig, clipName, fps = 30) {
  const clip = src.clips[clipName]
  const frames = Math.max(2, Math.round(clip.duration * fps))
  const times = []
  const q = Object.fromEntries(Object.values(MAP).filter((n) => rig.byName[n]).map((n) => [n, []]))
  const hips = rig.byName.Hips.bone
  const hipRest = hips.position.clone()
  const k = (rig.rest.Hips.p.y || 0.95) / src.hipHeight
  const hipTrack = []
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * clip.duration
    times.push(t)
    const { quats, hipsDelta } = poseFromUal(src, rig, root, clipName, t)
    for (const [n, quat] of Object.entries(quats)) q[n].push(quat.x, quat.y, quat.z, quat.w)
    hipTrack.push(...hipRest.clone().add(hipsDelta.multiplyScalar(k)).toArray())
  }
  const tracks = Object.entries(q).map(([n, v]) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, v))
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipTrack))
  return new THREE.AnimationClip(`${clipName}_baked`, clip.duration, tracks)
}

// What is in the file (the parts, their materials and textures) for the report and for finding the tee.
export function describe(gltf) {
  const parts = []
  gltf.scene.traverse((n) => {
    if (!n.isMesh) return
    const m = n.material
    parts.push({ name: n.name, material: m.name, tris: Math.round((n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position.count) / 3), map: m.map ? [m.map.image?.width, m.map.image?.height] : null, normal: Boolean(m.normalMap), color: m.color?.getHexString() })
  })
  return parts
}

// The Organt print, like ours (src/world/avatar3d.js organtPrint), big and crisp.
function printTexture() {
  const k = 4
  const canvas = document.createElement('canvas')
  canvas.width = 256 * k
  canvas.height = 192 * k
  const ctx = canvas.getContext('2d')
  ctx.scale(k, k)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1c1915'
  ctx.font = '900 112px "Arial Black", Impact, sans-serif'
  ctx.fillText('031', 128, 82, 240)
  ctx.fillStyle = '#7b3fe4'
  ctx.font = '900 40px "Arial Black", Impact, sans-serif'
  ctx.fillText('ORGANT', 128, 160, 230)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const gltfs = {}
// opts: { top: '#f0c400' (tee colour), print: true (the Organt print), height: 1.74 }
export async function loadAra(url, opts = {}) {
  const t0 = performance.now()
  gltfs[url] ||= new GLTFLoader().loadAsync(url)
  const gltf = await gltfs[url]
  const loadMs = performance.now() - t0
  const obj = clone(gltf.scene)
  obj.traverse((n) => { if (n.isMesh) { n.frustumCulled = false; if (n.isSkinnedMesh) n.skeleton.update() } })
  const box = new THREE.Box3().setFromObject(obj)
  const s = (opts.height || 1.74) / (box.max.y - box.min.y)
  obj.scale.setScalar(s)
  obj.updateMatrixWorld(true)
  const lowest = new THREE.Box3().setFromObject(obj).min.y
  obj.position.y = -lowest
  const group = new THREE.Group()
  group.add(obj)
  // The tee: the "Outfit" part holds the tee and the jeans in one mesh and one 2048 px texture,
  // and the tee's texture carries the MakeHuman logo. The tee's own triangles (the connected
  // pieces of the mesh that sit above the hips) are drawn in a plain colour instead of the
  // texture (so the logo is gone; the fabric normal map stays); the jeans keep their texture.
  const hipsY = obj.getObjectByName('Hips').getWorldPosition(new THREE.Vector3()).y
  const outfit = []
  obj.traverse((n) => { if (n.isMesh && n.material?.name === 'Outfit') outfit.push(n) })
  const teeColor = new THREE.Color(opts.top || '#f0c400')
  for (const n of outfit) {
    const geo = n.geometry.clone()
    n.geometry = geo
    const count = geo.attributes.position.count
    const parent = new Int32Array(count).map((_, i) => i)
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
    const idx = geo.index.array
    for (let i = 0; i < idx.length; i += 3) { const r = find(idx[i]); parent[find(idx[i + 1])] = r; parent[find(idx[i + 2])] = r }
    const sums = new Map()
    const v = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(geo.attributes.position, i)
      n.localToWorld(v)
      const r = find(i)
      const e = sums.get(r) || { y: 0, n: 0 }
      e.y += v.y; e.n += 1
      sums.set(r, e)
    }
    const isTee = new Map([...sums].map(([r, e]) => [r, e.y / e.n > hipsY]))
    const tee = new Float32Array(count)
    let teeVerts = 0
    for (let i = 0; i < count; i++) { tee[i] = isTee.get(find(i)) ? 1 : 0; teeVerts += tee[i] }
    geo.setAttribute('aTee', new THREE.BufferAttribute(tee, 1))
    const m = n.material.clone()
    n.userData.alpha = { alphaTest: m.alphaTest, transparent: m.transparent, alphaMap: Boolean(m.alphaMap), side: m.side }
    m.alphaTest = 0
    m.alphaMap = null
    m.transparent = false
    m.onBeforeCompile = (sh) => {
      sh.uniforms.teeColor = { value: teeColor }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTee;\nvarying float vTee;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTee = aTee;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 teeColor;\nvarying float vTee;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, teeColor, vTee);\ndiffuseColor.a = mix(diffuseColor.a, 1.0, vTee);')
    }
    n.material = m
    n.userData.tee = { pieces: sums.size, teePieces: [...isTee.values()].filter(Boolean).length, teeVerts, verts: count }
  }
  // The print: a plane on the chest, carried by the chest bone like ours.
  if (opts.print) {
    const chest = obj.getObjectByName('Spine2') || obj.getObjectByName('Spine1')
    const neck = obj.getObjectByName('Neck')
    const hips = obj.getObjectByName('Hips')
    if (chest && neck && hips) {
      obj.updateMatrixWorld(true)
      const arm = (side) => obj.getObjectByName(`${side}Arm`)?.getWorldPosition(new THREE.Vector3())
      const shoulders = arm('Left') && arm('Right') ? arm('Left').distanceTo(arm('Right')) : 0.4
      const w = shoulders * 0.82
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.75), new THREE.MeshStandardMaterial({ map: printTexture(), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }))
      mark.name = 'organt-mark'
      const nw = neck.getWorldPosition(new THREE.Vector3())
      const hw = hips.getWorldPosition(new THREE.Vector3())
      const at = new THREE.Vector3().lerpVectors(hw, nw, opts.printAt ?? 0.62)
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()))
      at.addScaledVector(fwd, opts.printDepth ?? 0.13)
      obj.add(mark)
      mark.position.copy(obj.worldToLocal(at))
      mark.quaternion.copy(obj.getWorldQuaternion(new THREE.Quaternion()).invert())
      mark.updateMatrixWorld(true)
      chest.attach(mark)
    }
  }
  const src = await ual()
  const rig = rigOf(src, obj)
  const t1 = performance.now()
  const clip = bake(src, obj, rig, opts.clip || 'Dance_Loop')
  const bakeMs = performance.now() - t1
  const mixer = new THREE.AnimationMixer(obj)
  mixer.clipAction(clip).play()
  return {
    group,
    obj,
    mixer,
    info: { loadMs: Math.round(loadMs), bakeMs: Math.round(bakeMs), scale: +s.toFixed(3), teeParts: outfit.map((n) => [n.name, n.userData.tee, n.userData.alpha]) },
  }
}
