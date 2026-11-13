// Cheap people for a busy world (owner, 12 Nov, job J). A full student (avatar3d.js) is a skinned clone with its own
// mixer and foot IK: about 16 draw calls and 9.5k triangles each, so a crowd of them would sink a phone. These are
// the background: simple figures (head, hair, body, two arms, two legs, a soft shadow), every one of them in the
// same eight InstancedMeshes, so a hundred people cost eight draw calls and a few hundred triangles each. They walk
// (arms and legs swing with their speed), stand, talk, run, sit on the ground or on a chair, crouch, swim and wave.
// They are for people seen from a little way off; the people close to you stay full students.
//   const crowd = createExtras(scene, { max: 120 })
//   const p = crowd.add({ x, z, rot, pose: 'walk', skin, shirt, pants, hair, scale })   // returns a plain object
//   p.x = ...; p.pose = 'sitGround'   // move it, change what it does: it is drawn from its fields each frame
//   crowd.update(dt)   crowd.remove(p)   crowd.clear()   crowd.count()
import * as THREE from 'three'
import { SKIN_MIX } from './skinmix.js'

const SKIN_HEX = { ebony: '#3d2418', deep: '#5a3a2a', brown: '#8a5a3c', amber: '#b07a4e', sand: '#d9a87c', fair: '#e8c4a8' }
const SHIRTS = ['#d6452f', '#2f6fb0', '#f0c400', '#2fa35a', '#ffffff', '#7a3b5c', '#e8497a', '#4a6a8a', '#ff8a3d', '#5ab4c8', '#8a5ab0', '#c8b48a']
const PANTS = ['#2b2b35', '#3a4f7a', '#5a4632', '#1c1915', '#8a8f99', '#2f4f3a', '#c8b48a']
const HAIRS = ['#1b1410', '#2a1d14', '#3b2a1e', '#6b4a2b', '#c9a15a', '#1b1410']
export function looksFor(i, kid = false) {
  const skin = SKIN_MIX[i % SKIN_MIX.length] || 'brown'
  return { skin: SKIN_HEX[skin] || SKIN_HEX.brown, skinName: skin, shirt: SHIRTS[(i * 7 + 3) % SHIRTS.length], pants: PANTS[(i * 5 + 1) % PANTS.length], hair: HAIRS[(i * 3) % HAIRS.length], scale: kid ? 0.6 + ((i * 13) % 10) / 100 : 0.94 + ((i * 17) % 12) / 100 }
}

// part geometry (metres, a 1.7 m figure at scale 1), each pivoting where it joins the body
function parts() {
  const g = {}
  g.head = new THREE.SphereGeometry(0.115, 10, 8).translate(0, 0.115, 0)
  g.hair = new THREE.SphereGeometry(0.122, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.125, -0.01)
  g.torso = new THREE.CylinderGeometry(0.17, 0.15, 0.56, 8).translate(0, 0.28, 0)
  g.arm = new THREE.CylinderGeometry(0.045, 0.04, 0.58, 6).translate(0, -0.29, 0)
  g.leg = new THREE.CylinderGeometry(0.07, 0.055, 0.8, 6).translate(0, -0.4, 0)
  g.shadow = new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2)
  return g
}

export function createExtras(scene, { max = 120, shadow = true } = {}) {
  const geo = parts()
  const lam = (opts = {}) => new THREE.MeshLambertMaterial({ ...opts })
  const make = (g, mat) => {
    const m = new THREE.InstancedMesh(g, mat, max)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.frustumCulled = false
    m.count = 0
    return m
  }
  const mesh = {
    head: make(geo.head, lam()), hair: make(geo.hair, lam()), torso: make(geo.torso, lam()),
    armL: make(geo.arm, lam()), armR: make(geo.arm, lam()), legL: make(geo.leg, lam()), legR: make(geo.leg, lam()),
  }
  if (shadow) mesh.shadow = make(geo.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }))
  const group = new THREE.Group()
  group.name = 'extras'
  for (const m of Object.values(mesh)) group.add(m)
  scene.add(group)
  const people = []
  let dirty = true
  const col = new THREE.Color()
  const paint = (p, i) => {
    mesh.head.setColorAt(i, col.set(p.skin)); mesh.hair.setColorAt(i, col.set(p.hair)); mesh.torso.setColorAt(i, col.set(p.shirt))
    mesh.armL.setColorAt(i, col.set(p.shirt)); mesh.armR.setColorAt(i, col.set(p.shirt)); mesh.legL.setColorAt(i, col.set(p.pants)); mesh.legR.setColorAt(i, col.set(p.pants))
  }
  const m4 = new THREE.Matrix4()
  const base = new THREE.Matrix4()
  const local = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const v = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  function put(m, i, x, y, z, rx = 0, ry = 0, rz = 0) {
    local.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), one)
    m4.multiplyMatrices(base, local)
    m.setMatrixAt(i, m4)
  }
  // one person's parts, from what they are doing
  function draw(p, i, t) {
    if (!p.visible) { for (const m of Object.values(mesh)) m.setMatrixAt(i, zero); return }
    const s = p.scale || 1
    base.compose(v.set(p.x, p.y || 0, p.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rot || 0), new THREE.Vector3(s, s, s))
    const ph = (p.phase || 0) + t * (p.pose === 'run' ? 9 : 6.5)
    const sw = Math.sin(ph)
    let hip = 0.82
    let lean = 0
    let legL = 0, legR = 0, armL = 0.05, armR = 0.05, armLz = 0.08, armRz = -0.08, kneel = 0
    switch (p.pose) {
      case 'walk': legL = sw * 0.5; legR = -sw * 0.5; armL = -sw * 0.4; armR = sw * 0.4; hip += Math.abs(Math.cos(ph)) * 0.02; break
      case 'run': legL = sw * 0.9; legR = -sw * 0.9; armL = -sw * 0.9; armR = sw * 0.9; lean = 0.18; hip += Math.abs(Math.cos(ph)) * 0.05; break
      case 'talk': armR = -0.5 - Math.max(0, Math.sin(t * 2.2 + (p.phase || 0))) * 0.7; armRz = -0.25; hip += Math.sin(t * 1.3 + (p.phase || 0)) * 0.006; break
      case 'wave': armR = Math.PI * 0.95; armRz = -0.3 - Math.sin(t * 8) * 0.35; break
      case 'sitGround': hip = 0.12; legL = -1.45; legR = -1.4; armL = 0.5; armR = 0.5; armLz = 0.35; armRz = -0.35; break
      case 'sitChair': hip = (p.seat || 0.46) + 0.02; legL = -1.45; legR = -1.45; armL = -0.5; armR = -0.5; kneel = 1; break
      case 'crouch': hip = 0.38; legL = -1.9; legR = -1.9; lean = 0.55; armL = -1.0 + Math.sin(t * 3 + (p.phase || 0)) * 0.3; armR = -1.0 - Math.sin(t * 3 + (p.phase || 0)) * 0.3; break
      case 'swim': hip = -0.7 + Math.sin(t * 1.6 + (p.phase || 0)) * 0.04; lean = 1.25; armL = Math.sin(ph * 0.5) * 2.8; armR = -Math.sin(ph * 0.5) * 2.8; legL = sw * 0.3; legR = -sw * 0.3; break
      case 'lie': hip = 0.12; lean = -1.5; break
      default: hip += Math.sin(t * 1.1 + (p.phase || 0)) * 0.004; armL = 0.04; armR = 0.04
    }
    const sh = hip + Math.cos(lean) * 0.56
    const fwd = Math.sin(lean) * 0.56
    put(mesh.torso, i, 0, hip, 0, lean, 0, 0)
    put(mesh.head, i, 0, sh + 0.02, fwd * 1.04, lean * 0.4, 0, 0)
    put(mesh.hair, i, 0, sh + 0.02, fwd * 1.04, lean * 0.4, 0, 0)
    put(mesh.armL, i, 0.21, sh - 0.05, fwd * 0.92, armL + lean, 0, armLz)
    put(mesh.armR, i, -0.21, sh - 0.05, fwd * 0.92, armR + lean, 0, armRz)
    // a sitter on a chair: thighs forward, the shins (drawn as one leg) hang from the knee
    if (kneel) { put(mesh.legL, i, 0.09, hip, 0.38, 0, 0, 0); put(mesh.legR, i, -0.09, hip, 0.38, 0, 0, 0); put(mesh.torso, i, 0, hip, 0, 0, 0, 0) } else {
      put(mesh.legL, i, 0.09, hip, 0, legL, 0, 0)
      put(mesh.legR, i, -0.09, hip, 0, legR, 0, 0)
    }
    if (mesh.shadow) {
      if (p.pose === 'swim' || (p.y || 0) > 0.3) mesh.shadow.setMatrixAt(i, zero)
      else { m4.compose(v.set(p.x, (p.y || 0) + 0.035, p.z), q.identity(), new THREE.Vector3(s, s, s)); mesh.shadow.setMatrixAt(i, m4) }
    }
  }
  const api = {
    group,
    add(spec) {
      if (people.length >= max) return null
      const p = { x: 0, y: 0, z: 0, rot: 0, pose: 'stand', phase: Math.random() * 6, visible: true, ...spec }
      people.push(p)
      dirty = true
      return p
    },
    remove(p) { const i = people.indexOf(p); if (i >= 0) { people.splice(i, 1); dirty = true } },
    clear() { people.length = 0; dirty = true },
    count: () => people.length,
    list: () => people,
    setVisible(on) { group.visible = on },
    update(dt, t) {
      if (!group.visible) return
      const n = people.length
      if (dirty) {
        for (const m of Object.values(mesh)) m.count = n
        people.forEach(paint)
        for (const m of Object.values(mesh)) if (m.instanceColor) m.instanceColor.needsUpdate = true
        dirty = false
      }
      for (let i = 0; i < n; i++) draw(people[i], i, t)
      for (const m of Object.values(mesh)) m.instanceMatrix.needsUpdate = true
    },
    recolour() { dirty = true },
    dispose() {
      scene.remove(group)
      for (const m of Object.values(mesh)) { m.geometry.dispose(); m.material.dispose(); m.dispose() }
    },
  }
  return api
}

// Walking along a polyline [{x,z},...] at speed m/s, there and back. Returns true while moving.
export function walkAlong(p, dt) {
  const line = p.line
  if (!line || line.length < 2) return false
  if (p.wait > 0) { p.wait -= dt; p.pose = p.idlePose || 'stand'; return false }
  p.k ??= 0
  p.dir ||= 1
  const a = line[p.k]
  const b = line[p.k + p.dir] || null
  if (!b) { p.dir = -p.dir; p.wait = 0.5 + Math.random() * 2; return false }
  const dx = b.x - p.x
  const dz = b.z - p.z
  const d = Math.hypot(dx, dz)
  void a
  if (d < 0.15) { p.k += p.dir; if (p.k <= 0 || p.k >= line.length - 1) { p.dir = -p.dir; p.wait = 0.5 + Math.random() * 2.5 } return true }
  const step = Math.min(d, (p.speed || 1.2) * dt)
  p.x += (dx / d) * step
  p.z += (dz / d) * step
  p.rot = Math.atan2(dx, dz)
  p.pose = p.speed > 2.4 ? 'run' : 'walk'
  return true
}
// Walking straight to a point; true on arrival.
export function walkTo(p, x, z, dt) {
  const dx = x - p.x
  const dz = z - p.z
  const d = Math.hypot(dx, dz)
  if (d < 0.12) { p.pose = p.idlePose || 'stand'; return true }
  const step = Math.min(d, (p.speed || 1.2) * dt)
  p.x += (dx / d) * step
  p.z += (dz / d) * step
  p.rot = Math.atan2(dx, dz)
  p.pose = (p.speed || 1.2) > 2.4 ? 'run' : 'walk'
  return false
}
