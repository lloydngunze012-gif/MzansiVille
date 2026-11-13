// SunnyBay Eats (job L, 13 Nov): a rider on a scooter rides up to you, stops beside you, hands the food over and
// rides off. Self-animated (its own frames), so a scene only has to hand over itself and where you stand.
import * as THREE from 'three'

function build() {
  const g = new THREE.Group()
  g.name = 'eats-rider'
  const m = (geo, c) => new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c }))
  const body = m(new THREE.BoxGeometry(0.36, 0.3, 1.2), '#e23b3b'); body.position.y = 0.42; g.add(body)
  const seat = m(new THREE.BoxGeometry(0.32, 0.1, 0.5), '#1c1915'); seat.position.set(0, 0.62, -0.18); g.add(seat)
  const stem = m(new THREE.BoxGeometry(0.08, 0.6, 0.08), '#444'); stem.position.set(0, 0.85, 0.5); g.add(stem)
  const bar = m(new THREE.BoxGeometry(0.6, 0.06, 0.06), '#444'); bar.position.set(0, 1.15, 0.5); g.add(bar)
  for (const z of [-0.45, 0.48]) { const w = m(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12), '#1c1915'); w.rotation.z = Math.PI / 2; w.position.set(0, 0.22, z); g.add(w) }
  const box = m(new THREE.BoxGeometry(0.5, 0.45, 0.45), '#f0c400'); box.position.set(0, 1.25, -0.55); g.add(box)
  const torso = m(new THREE.CylinderGeometry(0.17, 0.15, 0.55, 8), '#e23b3b'); torso.position.set(0, 1.0, -0.12); torso.rotation.x = 0.25; g.add(torso)
  const head = m(new THREE.SphereGeometry(0.15, 10, 8), '#f0c400'); head.position.set(0, 1.42, -0.02); g.add(head)
  return g
}

// scene: a THREE.Scene; at(): { x, z } of the player, read each frame; done(): called when the food is handed over.
export function rideUp(scene, at, done) {
  const g = build()
  const p0 = at()
  const ang = Math.random() * Math.PI * 2
  g.position.set(p0.x + Math.sin(ang) * 22, 0, p0.z + Math.cos(ang) * 22)
  scene.add(g)
  let phase = 'in'
  let wait = 0
  let last = performance.now()
  let handed = false
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!g.parent) return
    const p = at()
    if (phase === 'in') {
      const tx = p.x + 1.4
      const tz = p.z + 0.4
      const dx = tx - g.position.x
      const dz = tz - g.position.z
      const d = Math.hypot(dx, dz)
      g.rotation.y = Math.atan2(dx, dz)
      if (d < 0.2) { phase = 'stop'; wait = 1.2 } else { const s = Math.min(d, Math.max(1.5, Math.min(7, d * 1.4)) * dt); g.position.x += (dx / d) * s; g.position.z += (dz / d) * s }
    } else if (phase === 'stop') {
      wait -= dt
      if (wait < 0.6 && !handed) { handed = true; done?.() }
      if (wait <= 0) phase = 'out'
    } else {
      g.rotation.y += dt * 0.8
      g.position.x += Math.sin(g.rotation.y) * 7 * dt
      g.position.z += Math.cos(g.rotation.y) * 7 * dt
      wait -= dt
      if (wait < -3.5) { scene.remove(g); return }
    }
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  // (a scene that closes mid-ride: the food still arrives)
  return { cancel() { scene.remove(g); if (!handed) { handed = true; done?.() } } }
}
