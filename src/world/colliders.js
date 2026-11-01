// Every solid thing gets a collider from its own shape: for each mesh, the part of it
// between the shins and the head (BAND) is boxed in the mesh's own turn (an oriented
// box), so a bench at an angle blocks the bench, not a square round it, a lamp post
// blocks its pole and a tree its trunk. Floors, rugs and paving (nothing in the band),
// people, flowers and grass are left out. bodies.js pushes everyone out of these.
import * as THREE from 'three'

export const BAND = [0.12, 1.7]
const SOFT = /flower|grass|rug|petal/i
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()

function isPerson(node) {
  for (let n = node; n; n = n.parent) if (n.userData?.personId || n.userData?.isPlayer || n.name === 'player') return true
  return false
}
function isSoft(node) {
  for (let n = node; n; n = n.parent) if (n.userData?.soft || SOFT.test(n.userData?.kind || '') || SOFT.test(n.name || '')) return true
  return false
}
function kindOf(node) {
  for (let n = node; n; n = n.parent) if (n.userData?.kind) return n.userData.kind
  return node.name || 'mesh'
}

// The colliders of everything under root (world space): { cx, cz, hx, hz, rot, minX,
// maxX, minZ, maxZ, kind }. Each triangle edge is cut to the band, so a pole or trunk
// running right through it still counts.
export function collidersOf(root, band = BAND) {
  const out = []
  root.updateMatrixWorld(true)
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.visible || isPerson(mesh) || isSoft(mesh)) return
    const m = mesh.material
    if (m && !Array.isArray(m) && m.transparent && m.opacity < 0.5) return
    const pos = mesh.geometry?.attributes?.position
    if (!pos) return
    const e = mesh.matrixWorld.elements
    const rot = Math.atan2(-e[2], e[0])
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity
    const take = (p) => {
      const u = p.x * cs - p.z * sn
      const v = p.x * sn + p.z * cs
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    const cut = (p, q) => {
      if (p.y >= band[0] && p.y <= band[1]) take(p)
      for (const y of band) {
        if ((p.y - y) * (q.y - y) < 0) {
          const t = (y - p.y) / (q.y - p.y)
          take({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t })
        }
      }
    }
    const index = mesh.geometry.index
    const n = index ? index.count : pos.count
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld)
      cut(a, b)
      cut(b, c)
      cut(c, a)
    }
    if (!Number.isFinite(minU)) return
    const hx = (maxU - minU) / 2
    const hz = (maxV - minV) / 2
    if (hx > 30 || hz > 30) return // (a ground or a backdrop, not a thing to walk into)
    const mu = (minU + maxU) / 2
    const mv = (minV + maxV) / 2
    const cx = mu * cs + mv * sn
    const cz = -mu * sn + mv * cs
    const ex = Math.abs(hx * cs) + Math.abs(hz * sn)
    const ez = Math.abs(hx * sn) + Math.abs(hz * cs)
    out.push({ cx, cz, hx: Math.max(hx, 0.03), hz: Math.max(hz, 0.03), rot, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez, kind: kindOf(mesh) })
  })
  return out
}
