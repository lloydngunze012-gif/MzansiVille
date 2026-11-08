import * as THREE from 'three'

// A small puff of dust at the feet when the player changes gear (walk -> jog -> run).
// Six soft spheres drift out and up and fade over about half a second.
const geo = new THREE.SphereGeometry(0.09, 6, 5)
export function createDust(scene) {
  const puffs = []
  return {
    burst(x, z) {
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd9cdb8, transparent: true, opacity: 0.55, depthWrite: false }))
        const a = (i / 6) * Math.PI * 2 + Math.random()
        m.position.set(x + Math.cos(a) * 0.15, 0.08, z + Math.sin(a) * 0.15)
        m.userData = { vx: Math.cos(a) * 0.7, vz: Math.sin(a) * 0.7, age: 0 }
        scene.add(m)
        puffs.push(m)
      }
    },
    update(dt) {
      for (let i = puffs.length - 1; i >= 0; i--) {
        const m = puffs[i]
        const d = m.userData
        d.age += dt
        const k = d.age / 0.55
        if (k >= 1) { scene.remove(m); m.material.dispose(); puffs.splice(i, 1); continue }
        m.position.x += d.vx * dt
        m.position.z += d.vz * dt
        m.position.y += 0.35 * dt
        m.scale.setScalar(1 + k * 1.6)
        m.material.opacity = 0.55 * (1 - k)
      }
    },
  }
}
