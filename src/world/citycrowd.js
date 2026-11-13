// SunnyBay full of people (owner, 12 Nov, job J), on top of the eight full street people near you (city.js):
//   - the pavements: a crowd of cheap figures (extras.js) walking the pavements around you, a target per district
//     (TARGET, kept inside the frame-rate budget: tests/basics/movement-fps.spec.js), re-placed ahead of you as you
//     go; about one in four goes into a shop door, is inside a while, and comes back out;
//   - the beach: families on the towels, kids running round them, a pair of kids with a ball, kids building
//     sandcastles at the water, swimmers, the lifeguard by the tower; now and then one of them calls out (Cursor's
//     lines, docs/world-designer/alive.md: written, not spoken) and the kids laugh;
//   - the sea: the foam rolls slowly up the sand and back (one strip with a little shader, in step with the waves
//     you hear: soundscape.js swells every ten seconds).
// Everything here is one createExtras (8 draw calls), the foam (1), the sandcastles and the ball (2).
import * as THREE from 'three'
import { createExtras, looksFor, walkAlong, walkTo } from './extras.js'
import { play } from '../actsound.js'
import LINES from '../../data/campusville/beach_lines.json' with { type: 'json' }

// how many people on the pavements around you, per district (the beachfront's beach life comes on top)
export const TARGET = { campus: 18, town: 44, suburbs: 22, beachfront: 26, township: 38, industrial: 18 }
const NEAR = 55 // (people further than this are put back near you: a phone sees a few metres either side of you)
const SEA_X = 296

export function createCityCrowd({ scene, linesFor, doorsFor, parasols = [], tower = null, project, uiRoot, free = () => true }) {
  const crowd = createExtras(scene, { max: 130 })
  let walkers = []
  let partNow = ''
  let seedAt = null
  // ---------- the pavements ----------
  function seed(part, px, pz) {
    for (const w of walkers) crowd.remove(w)
    walkers = []
    partNow = part
    seedAt = { x: px, z: pz }
    const near = (l) => Math.min(Math.hypot(l.a.x - px, l.a.z - pz), Math.hypot(l.b.x - px, l.b.z - pz), Math.hypot((l.a.x + l.b.x) / 2 - px, (l.a.z + l.b.z) / 2 - pz))
    const lines = (linesFor(part) || []).filter((l) => near(l) < NEAR - 5)
    if (!lines.length) return
    const n = TARGET[part] ?? 20
    // (a third are strollers: from one open spot near you to another, on squares and forecourts as well as pavements)
    const strollers = Math.round(n / 3)
    for (let i = 0; i < strollers; i++) {
      const spot = openSpot(px, pz, 6, 30, i)
      if (!spot) continue
      const w = crowd.add({ ...looksFor(i + 91), x: spot.x, z: spot.z, pose: 'stand', speed: 0.9 + ((i * 7) % 5) / 10, stroll: true, wait: (i % 5) * 0.8 })
      if (w) walkers.push(w)
    }
    for (let i = 0; i < n - strollers; i++) {
      const l = lines[(i * 7) % lines.length]
      // (somewhere along the line close to you)
      const t = Math.max(0, Math.min(1, (() => { const dx = l.b.x - l.a.x; const dz = l.b.z - l.a.z; const L = dx * dx + dz * dz || 1; return ((px - l.a.x) * dx + (pz - l.a.z) * dz) / L })() + (((i * 0.37) % 1) - 0.5) * 0.6))
      const look = looksFor(i + 31)
      const w = crowd.add({ ...look, x: l.a.x + (l.b.x - l.a.x) * t, z: l.a.z + (l.b.z - l.a.z) * t, pose: 'walk', speed: 1.0 + ((i * 13) % 6) / 10, line: [l.a, l.b], k: 0, dir: 1, shopper: i % 4 === 1, shopIn: 3 + ((i * 11) % 10) })
      if (w) walkers.push(w)
    }
  }
  // an open spot r0..r1 metres from (x, z), off buildings and roads' solids (city.js blockedAt)
  function openSpot(x, z, r0, r1, salt = 0) {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2 + salt
      const r = r0 + Math.random() * (r1 - r0)
      const sx = x + Math.cos(a) * r
      const sz = z + Math.sin(a) * r
      if (free(sx, sz)) return { x: sx, z: sz }
    }
    return null
  }
  function tickWalkers(dt, px, pz, part) {
    if (part !== partNow || !seedAt || Math.hypot(px - seedAt.x, pz - seedAt.z) > 40) seed(part, px, pz)
    const doors = doorsFor(part) || []
    for (const w of walkers) {
      // a shopper: now and then into the nearest door, inside a while, back out to the pavement
      if (w.shopper) {
        if (w.inside > 0) { w.inside -= dt; if (w.inside <= 0) { w.visible = true; w.going = null; w.back = { x: w.home.x, z: w.home.z } } continue }
        if (w.going) { if (walkTo(w, w.going.x, w.going.z, dt)) { w.visible = false; w.inside = 6 + Math.random() * 10; w.going = null } continue }
        if (w.back) { if (walkTo(w, w.back.x, w.back.z, dt)) w.back = null; continue }
        w.shopIn -= dt
        if (w.shopIn <= 0) {
          w.shopIn = 20 + Math.random() * 25
          const d = doors.filter((o) => Math.hypot(o.x - w.x, o.z - w.z) < 28).sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(b.x - w.x, b.z - w.z))[0]
          if (d) { w.home = { x: w.x, z: w.z }; w.going = { x: d.x, z: d.z }; continue }
        }
      }
      if (w.stroll) {
        if (w.wait > 0) { w.wait -= dt; w.pose = 'stand'; continue }
        if (!w.goal || Math.hypot(w.goal.x - px, w.goal.z - pz) > NEAR) w.goal = openSpot(px, pz, 5, 32)
        if (!w.goal) continue
        if (walkTo(w, w.goal.x, w.goal.z, dt)) { w.goal = null; w.wait = 1.5 + Math.random() * 5; w.pose = Math.random() < 0.3 ? 'talk' : 'stand' }
        else if (!free(w.x + Math.sin(w.rot) * 0.6, w.z + Math.cos(w.rot) * 0.6)) w.goal = null
        if (Math.hypot(w.x - px, w.z - pz) > NEAR) { const sp = openSpot(px, pz, 22, 40); if (sp) { w.x = sp.x; w.z = sp.z; w.goal = null } }
        continue
      }
      walkAlong(w, dt)
      // far away: put back on a pavement near you (out of sight first: the far end of a line)
      if (Math.hypot(w.x - px, w.z - pz) > NEAR) {
        const lines = (linesFor(part) || []).filter((l) => { const d = Math.hypot(l.b.x - px, l.b.z - pz); return d > 22 && d < NEAR - 8 })
        const l = lines[Math.floor(Math.random() * lines.length)]
        if (l) { w.line = [l.a, l.b]; w.x = l.b.x; w.z = l.b.z; w.k = 1; w.dir = -1 }
      }
    }
  }

  // ---------- the beach ----------
  const beach = { people: [], castles: null, towels: null, ball: null, kick: null, bubbleAt: 4, giggleAt: 6, z: null }
  const TOWELS = ['#d6452f', '#f0c400', '#1d7fb8', '#e8497a', '#2f8f5b', '#ffffff', '#ff8a3d']
  // A stretch of beach about you (60 m along the sand): families on towels, kids running round them, sandcastles
  // at the wet sand, swimmers, a pair of kids with a ball, and the lifeguard by the tower when it is in reach.
  function makeBeach(pz) {
    dropBeach()
    beach.z = pz
    const add = (spec, i, kid = false) => { const p = crowd.add({ ...looksFor(i, kid), ...spec }); if (p) beach.people.push(p); return p }
    const rnd = (k) => { const x = Math.sin(k * 127.1 + Math.round(pz / 60) * 311.7) * 43758.5453; return x - Math.floor(x) }
    const towels = []
    for (let i = 0; i < 9; i++) {
      const x = 262 + rnd(i) * 26
      const z = pz - 30 + i * 7 + rnd(i + 50) * 3
      towels.push({ x, z, c: TOWELS[i % TOWELS.length] })
      add({ x: x - 0.1, z: z - 0.35, rot: Math.PI / 2, pose: i % 4 === 0 ? 'lie' : 'sitGround', role: 'family', y: 0.03 }, 200 + i * 3)
      if (i % 2 === 0) add({ x: x + 0.45, z: z + 0.45, rot: Math.PI / 2 + 0.5, pose: 'sitGround', role: 'family', y: 0.03 }, 201 + i * 3)
      if (i % 3 !== 2) add({ x: x + 2, z, rot: 0, pose: 'run', speed: 2.6, role: 'kid', centre: { x: x + 2.2, z }, r: 2.5 + rnd(i + 9) * 2, ang: i * 1.7 }, 202 + i * 3, true)
    }
    const castlesAt = []
    for (let i = 0; i < 5; i++) {
      const z = pz - 24 + i * 11 + rnd(i + 70) * 4
      castlesAt.push(z)
      add({ x: SEA_X - 2.7, z, rot: Math.PI / 2, pose: 'crouch', role: 'castle' }, 300 + i, true)
    }
    for (let i = 0; i < 7; i++) add({ x: SEA_X + 5 + (i % 4) * 3.5, z: pz - 26 + i * 8, rot: Math.PI / 2, pose: 'swim', role: 'swimmer', x0: SEA_X + 5 + (i % 4) * 3.5 }, 320 + i)
    const m = new THREE.Matrix4()
    const castles = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.42, 6).translate(0, 0.21, 0), new THREE.MeshLambertMaterial({ color: '#e2c486' }), castlesAt.length)
    castlesAt.forEach((z, i) => castles.setMatrixAt(i, m.makeTranslation(SEA_X - 2.0, 0.02, z + 0.5)))
    castles.name = 'sandcastles'
    scene.add(castles)
    beach.castles = castles
    const towelMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.0, 1.9).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), towels.length)
    const col = new THREE.Color()
    towels.forEach((t, i) => { towelMesh.setMatrixAt(i, m.makeTranslation(t.x + 0.2, 0.025, t.z)); towelMesh.setColorAt(i, col.set(t.c)) })
    towelMesh.name = 'towels'
    scene.add(towelMesh)
    beach.towels = towelMesh
    // the ball game: two kids passing a ball
    const k1 = add({ x: SEA_X - 9, z: pz + 4, rot: 0, pose: 'stand', role: 'ball' }, 340, true)
    const k2 = add({ x: SEA_X - 9, z: pz + 10, rot: Math.PI, pose: 'stand', role: 'ball' }, 341, true)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshLambertMaterial({ color: '#f0c400' }))
    ball.name = 'beach-kids-ball'
    scene.add(ball)
    beach.ball = ball
    beach.kick = { a: k1, b: k2, t: 0, from: 0 }
    // the lifeguard by the tower (red shirt, yellow shorts), when the tower is in this stretch
    if (tower && Math.abs(tower.z - pz) < 50) add({ x: tower.x - 2, z: tower.z, rot: Math.PI / 2, pose: 'stand', role: 'lifeguard', shirt: '#d6452f', pants: '#f0c400' }, 360)
    else add({ x: SEA_X - 6, z: pz - 12, rot: Math.PI / 2, pose: 'stand', role: 'lifeguard', shirt: '#d6452f', pants: '#f0c400' }, 360)
  }
  function dropBeach() {
    for (const p of beach.people) crowd.remove(p)
    beach.people = []
    for (const k of ['castles', 'towels', 'ball']) { const o = beach[k]; if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); o.dispose?.(); beach[k] = null } }
    beach.kick = null
    beach.z = null
    hideBubble()
  }
  function tickBeach(dt, t, px, pz) {
    for (const p of beach.people) {
      if (p.role === 'kid') {
        p.ang += dt * (p.speed / p.r)
        p.x = p.centre.x + Math.cos(p.ang) * p.r
        p.z = p.centre.z + Math.sin(p.ang) * p.r
        p.rot = Math.atan2(-Math.sin(p.ang), Math.cos(p.ang))
      } else if (p.role === 'swimmer') {
        p.x = p.x0 + Math.sin(t * 0.25 + p.phase) * 5
        p.rot = Math.cos(t * 0.25 + p.phase) > 0 ? Math.PI / 2 : -Math.PI / 2
      } else if (p.role === 'lifeguard') {
        p.pose = Math.sin(t * 0.21) > 0.94 ? 'wave' : 'stand'
      }
    }
    const k = beach.kick
    if (k && beach.ball) {
      k.t += dt / 1.2
      const from = k.from ? k.b : k.a
      const to = k.from ? k.a : k.b
      const s = Math.min(1, k.t)
      beach.ball.position.set(from.x + (to.x - from.x) * s, 0.13 + Math.sin(s * Math.PI) * 1.4, from.z + (to.z - from.z) * s)
      if (s >= 1) { k.t = 0; k.from = 1 - k.from; to.pose = 'wave'; from.pose = 'stand'; if (Math.hypot(to.x - px, to.z - pz) < 30) play('thud', null, 0.35) }
    }
    // a voice now and then (written) and the kids' laughter, only when you are near the sand
    const nearSand = px > 230
    if (!nearSand) { hideBubble(); return }
    beach.giggleAt -= dt
    if (beach.giggleAt <= 0) { beach.giggleAt = 7 + Math.random() * 9; play('giggle', null, 0.5) }
    beach.bubbleAt -= dt
    if (beach.bubbleAt <= 0) {
      beach.bubbleAt = 6 + Math.random() * 5
      const near = beach.people.filter((p) => Math.hypot(p.x - px, p.z - pz) < 26 && p.role !== 'swimmer')
      const who = near[Math.floor(Math.random() * near.length)]
      if (who) showBubble(who, who.role === 'lifeguard' ? LINES.lifeguard : who.role === 'family' ? LINES.families : LINES.kids)
    }
    placeBubble()
  }
  // ---------- a line said on the beach ----------
  let bubble = null
  let bubbleFor = null
  let bubbleUntil = 0
  function showBubble(p, list) {
    if (!uiRoot || !project || !list?.length) return
    bubble ||= Object.assign(document.createElement('div'), { className: 'cb-bubble' })
    if (!bubble.isConnected) uiRoot.append(bubble)
    bubble.textContent = list[Math.floor(Math.random() * list.length)]
    bubble.hidden = false
    bubbleFor = p
    bubbleUntil = performance.now() + 3600
    said.push(bubble.textContent)
  }
  function placeBubble() {
    if (!bubble || bubble.hidden) return
    if (performance.now() > bubbleUntil || !bubbleFor) { hideBubble(); return }
    const at = project(bubbleFor.x, (bubbleFor.scale || 1) * 1.9 + (bubbleFor.y || 0), bubbleFor.z)
    if (!at || at.behind) { bubble.style.opacity = '0'; return }
    bubble.style.opacity = '1'
    bubble.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`
  }
  function hideBubble() { if (bubble) bubble.hidden = true; bubbleFor = null }
  const said = []

  // ---------- the foam ----------
  const foam = makeFoam(scene)

  return {
    update(dt, t, px, pz, part, inside) {
      crowd.setVisible(!inside)
      foam.mesh.visible = !inside
      if (inside) { placeBubble(); return }
      tickWalkers(dt, px, pz, part)
      const atBeach = part === 'beachfront' && px > 200
      if (atBeach && (beach.z === null || Math.abs(pz - beach.z) > 35)) makeBeach(pz); else if (!atBeach && beach.z !== null) dropBeach()
      if (beach.people.length) tickBeach(dt, t, px, pz)
      crowd.update(dt, t)
      foam.update(t)
    },
    // positions of everybody on foot here (the cars stop for anybody in their lane)
    positions: () => walkers.filter((w) => w.visible).map((w) => ({ x: w.x, z: w.z })),
    // a line over somebody's head for a few seconds (the staff greeting you when you come in)
    say(x, z, text, height = 1.9) { showBubble({ x, z, scale: height / 1.9 }, [text]); bubbleUntil = performance.now() + 4200 },
    tickBubble() { placeBubble() },
    info: () => ({ walkers: walkers.length, visible: walkers.filter((w) => w.visible).length, inShops: walkers.filter((w) => w.shopper && !w.visible).length, shoppers: walkers.filter((w) => w.shopper).length, beach: beach.people.length, roles: beach.people.reduce((m, p) => ((m[p.role] = (m[p.role] || 0) + 1), m), {}), said: [...said], total: crowd.count(), target: TARGET[partNow] ?? 0 }),
    dispose() { dropBeach(); crowd.dispose(); foam.dispose(); bubble?.remove() },
  }
}

// The foam: a strip along the waterline whose edge rolls up the sand and back, slowly, with a wet shine behind it.
function makeFoam(scene) {
  const geo = new THREE.PlaneGeometry(16, 900, 1, 1).rotateX(-Math.PI / 2).translate(SEA_X - 2, 0.03, 15)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; varying vec3 vW;
      void main() {
        // the edge comes in and goes out every ten seconds (the waves you hear), with a lazy wobble along the beach
        float swell = sin(uTime * 0.628) * 1.6 + sin(uTime * 0.21 + 1.3) * 0.5;
        float edge = ${SEA_X.toFixed(1)} - 1.2 - swell + sin(vW.z * 0.07 + uTime * 0.4) * 0.6 + sin(vW.z * 0.23 - uTime * 0.7) * 0.25;
        float d = vW.x - edge;
        float foamLine = smoothstep(0.9, 0.0, abs(d)) * 0.9;
        float lace = smoothstep(0.5, 1.0, sin(vW.z * 1.7 + uTime * 1.3) * sin(vW.z * 0.9 - uTime) ) * smoothstep(3.0, 0.4, d) * step(0.0, d) * 0.35;
        float wet = smoothstep(-3.5, 0.0, d) * step(d, 0.0) * 0.22;
        float a = max(foamLine, lace);
        vec3 col = mix(vec3(0.75, 0.66, 0.46), vec3(0.97, 0.99, 1.0), clamp(a * 1.4, 0.0, 1.0));
        float alpha = max(a, wet);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col, alpha);
      }`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'foam'
  mesh.renderOrder = 2
  scene.add(mesh)
  return { mesh, update(t) { mat.uniforms.uTime.value = t }, dispose() { scene.remove(mesh); geo.dispose(); mat.dispose() } }
}
