// Campus outside, alive (owner, 12 Nov, job J), on top of the full students of crowd.js and dress.js: cheap figures
// (extras.js: 8 draw calls for all of them) walking the paths between the buildings, little groups sitting on the
// lawns and standing chatting, and a football kick-about on an open lawn. Nobody here ever stands on a building.
import * as THREE from 'three'
import { createExtras, looksFor, walkAlong } from './extras.js'
import { play } from '../actsound.js'

const WALKERS = 22
const GROUPS = 6

// layout: campus.layout (paths in metres, buildings with minX/minZ/w/d); solid(x, z): blocked.
export function createCampusLife(scene, layout, { solid = () => false } = {}) {
  const crowd = createExtras(scene, { max: 70 })
  const paths = (layout.paths || []).filter((p) => p.length > 1)
  const inBuilding = (x, z, m = 2.5) => layout.buildings.some((b) => x > b.minX - m && x < b.minX + b.w + m && z > b.minZ - m && z < b.minZ + b.d + m)
  const nearPath = (x, z, r = 2.2) => paths.some((p) => p.some((a, i) => { const b = p[i + 1]; if (!b) return false; const dx = b.x - a.x; const dz = b.z - a.z; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < r }))
  const lawn = (x, z) => Math.hypot(x, z) < 92 && Math.hypot(x, z) > 16 && !inBuilding(x, z) && !nearPath(x, z) && !solid(x, z)
  const rnd = (() => { let s = 0x5eed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } })()
  // walkers: along the paths, there and back, at their own pace
  const walkers = []
  for (let i = 0; i < WALKERS && paths.length; i++) {
    const p = paths[i % paths.length]
    const k = Math.floor(rnd() * (p.length - 1))
    const a = p[k]
    const b = p[k + 1]
    const t = rnd()
    // (a step to the side of the path's middle, so two people pass each other)
    const off = (i % 2 ? 0.7 : -0.7)
    const line = p.map((q, j) => { const n = p[j + 1] || p[j - 1]; const dx = n.x - q.x; const dz = n.z - q.z; const L = Math.hypot(dx, dz) || 1; return { x: q.x - (dz / L) * off * (p[j + 1] ? 1 : -1), z: q.z + (dx / L) * off * (p[j + 1] ? 1 : -1) } })
    const w = crowd.add({ ...looksFor(i + 500), x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, line, k, dir: i % 2 ? 1 : -1, speed: 1.0 + (i % 5) * 0.12, pose: 'walk' })
    if (w) walkers.push(w)
  }
  // groups on the lawns: three or four sitting in a ring, now and then one standing and talking
  const groups = []
  for (let g = 0, tries = 0; g < GROUPS && tries < 400; tries++) {
    const ang = rnd() * Math.PI * 2
    const r = 22 + rnd() * 62
    const cx = Math.cos(ang) * r
    const cz = Math.sin(ang) * r
    if (!lawn(cx, cz) || groups.some((o) => Math.hypot(o.x - cx, o.z - cz) < 14)) continue
    const n = 3 + (g % 2)
    const sitting = g % 3 !== 2
    const members = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + g
      const x = cx + Math.cos(a) * 1.0
      const z = cz + Math.sin(a) * 1.0
      const m = crowd.add({ ...looksFor(600 + g * 5 + i), x, z, rot: Math.atan2(cx - x, cz - z), pose: sitting ? 'sitGround' : 'talk' })
      if (m) members.push(m)
    }
    groups.push({ x: cx, z: cz, members, sitting })
    g++
  }
  // the kick-about: four on an open lawn, the ball between them
  let kick = null
  for (let tries = 0; tries < 300 && !kick; tries++) {
    const ang = rnd() * Math.PI * 2
    const r = 30 + rnd() * 45
    const cx = Math.cos(ang) * r
    const cz = Math.sin(ang) * r
    const ok = [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]].every(([dx, dz]) => lawn(cx + dx, cz + dz)) && !groups.some((o) => Math.hypot(o.x - cx, o.z - cz) < 12)
    if (!ok) continue
    const corners = [[-4, -3], [4, -3], [4, 3], [-4, 3]]
    const players = corners.map(([dx, dz], i) => crowd.add({ ...looksFor(700 + i), x: cx + dx, z: cz + dz, rot: Math.atan2(-dx, -dz), pose: 'stand', home: { x: cx + dx, z: cz + dz } }))
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial({ color: '#ffffff' }))
    ball.name = 'campus-football'
    scene.add(ball)
    kick = { x: cx, z: cz, players, ball, from: 0, to: 2, t: 0 }
  }
  let near = false
  return {
    update(dt, t, player) {
      for (const w of walkers) walkAlong(w, dt)
      // now and then somebody in a standing group speaks with their hands; a sitter leans back
      for (const g of groups) if (!g.sitting) g.members.forEach((m, i) => { m.pose = Math.sin(t * 0.5 + i * 2 + g.x) > 0.2 ? 'talk' : 'stand' })
      if (kick) {
        const k = kick
        k.t += dt / 1.1
        const from = k.players[k.from]
        const to = k.players[k.to]
        const s = Math.min(1, k.t)
        k.ball.position.set(from.x + (to.x - from.x) * s, 0.12 + Math.sin(s * Math.PI) * 0.5, from.z + (to.z - from.z) * s)
        // the one it is going to steps to meet it; the others drift back home
        for (const p of k.players) {
          const goal = p === to ? { x: to.home.x + (from.x - to.home.x) * 0.15, z: to.home.z + (from.z - to.home.z) * 0.15 } : p.home
          const dx = goal.x - p.x
          const dz = goal.z - p.z
          const d = Math.hypot(dx, dz)
          if (d > 0.1) { const st = Math.min(d, 2.4 * dt); p.x += (dx / d) * st; p.z += (dz / d) * st; p.pose = 'run'; p.rot = Math.atan2(dx, dz) } else { p.pose = 'stand'; p.rot = Math.atan2(k.ball.position.x - p.x, k.ball.position.z - p.z) }
        }
        if (s >= 1) {
          k.t = 0
          k.from = k.to
          k.to = (k.to + 1 + Math.floor(Math.random() * 3)) % 4
          if (k.to === k.from) k.to = (k.to + 1) % 4
          to.pose = 'wave'
          near = player && Math.hypot(player.x - k.x, player.z - k.z) < 30
          if (near) play('thud', null, 0.4)
        }
      }
      crowd.update(dt, t)
    },
    setVisible(on) { crowd.setVisible(on); if (kick) kick.ball.visible = on },
    info: () => ({ walkers: walkers.length, groups: groups.length, sitting: groups.filter((g) => g.sitting).reduce((n, g) => n + g.members.length, 0), kick: kick ? { x: +kick.x.toFixed(1), z: +kick.z.toFixed(1), ball: [+kick.ball.position.x.toFixed(1), +kick.ball.position.z.toFixed(1)] } : null, total: crowd.count() }),
    dispose() { crowd.dispose(); if (kick) { scene.remove(kick.ball); kick.ball.geometry.dispose(); kick.ball.material.dispose() } },
  }
}
