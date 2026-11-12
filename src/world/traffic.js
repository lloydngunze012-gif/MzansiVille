// SunnyBay's moving traffic (Movement job, 11 Nov): cars on the roads and minibus taxis (kombis) driving between
// the stops. Everything that drives is an instance of one mesh per model (five draw calls for the lot), keeps to
// the left lane, slows at junctions and crossings, and stops for anybody on foot: nobody gets hit.
//
// The roads come from data/campusville/sunnybay.json. They are straight and axis-aligned, so the network is a
// graph: a node where two roads meet and at each road's end, an edge between neighbours along a road. A car
// drives an edge in its left lane, then takes a short curve through the node onto the next edge (a U-turn at a
// dead end). Traffic stays near the player: a car that has driven far out of sight is put back on a road a
// block or two away, so the streets you see are always busy with 8 to 15 vehicles, not the whole city's.
import * as THREE from 'three'
import CITY from '../../data/campusville/sunnybay.json' with { type: 'json' }

const LANE = 2 // m from the road's middle to the middle of a lane (roads are 8 m wide)
const INSET = 6.2 // a lane ends this far before a junction's middle (behind the zebra crossing)
const END_INSET = 3 // and this far before a dead end
const CRUISE = 8.5 // m/s
const SLOW = 3.6 // through a junction, over a crossing
const ACCEL = 3.2
const BRAKE = 9
const FAR = 150 // further than this from the player: put back nearer
const NEAR = [45, 115] // where a car is put back: out of the picture, close enough to arrive soon

// ---------- the network ----------
const roads = CITY.roads.map((r) => {
  const [x0, z0, x1, z1] = r.rect
  const alongX = x1 - x0 > z1 - z0
  return { alongX, c: alongX ? (z0 + z1) / 2 : (x0 + x1) / 2, s0: alongX ? x0 : z0, s1: alongX ? x1 : z1, nodes: [] }
})
export const nodes = []
function nodeAt(x, z, junction) {
  let n = nodes.find((m) => Math.hypot(m.x - x, m.z - z) < 7)
  if (!n) { n = { id: nodes.length, x, z, junction: false, out: [] }; nodes.push(n) }
  if (junction) n.junction = true
  return n
}
for (const h of roads.filter((r) => r.alongX)) {
  for (const v of roads.filter((r) => !r.alongX)) {
    if (v.c >= h.s0 - 1 && v.c <= h.s1 + 1 && h.c >= v.s0 - 1 && h.c <= v.s1 + 1) {
      const n = nodeAt(v.c, h.c, true)
      h.nodes.push(n)
      v.nodes.push(n)
    }
  }
}
for (const r of roads) {
  for (const s of [r.s0, r.s1]) {
    const x = r.alongX ? s : r.c
    const z = r.alongX ? r.c : s
    if (!r.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 12)) r.nodes.push(nodeAt(x, z, false))
  }
}
export const edges = [] // directed: { a, b, dx, dz, len, x0, z0 (where its lane starts), back (the edge the other way) }
for (const r of roads) {
  const list = [...new Set(r.nodes)].sort((p, q) => (r.alongX ? p.x - q.x : p.z - q.z))
  for (let i = 0; i + 1 < list.length; i++) {
    const pair = [[list[i], list[i + 1]], [list[i + 1], list[i]]].map(([a, b]) => {
      const d = Math.hypot(b.x - a.x, b.z - a.z)
      const dx = (b.x - a.x) / d
      const dz = (b.z - a.z) / d
      const ia = a.junction ? INSET : END_INSET
      const ib = b.junction ? INSET : END_INSET
      // (the left of the way you are going: heading south it is east, heading east it is north)
      const e = { a, b, dx, dz, len: d - ia - ib, x0: a.x + dx * ia + dz * LANE, z0: a.z + dz * ia - dx * LANE, heading: Math.atan2(dx, dz) }
      a.out.push(e)
      edges.push(e)
      return e
    })
    pair[0].back = pair[1]
    pair[1].back = pair[0]
  }
}
const usable = edges.filter((e) => e.len > 6)
// Shortest way between nodes (kombis drive from stop to stop): hop[from][to] = the edge to take.
const hop = nodes.map(() => nodes.map(() => null))
for (const to of nodes) {
  const dist = nodes.map(() => Infinity)
  dist[to.id] = 0
  const queue = [to]
  while (queue.length) {
    queue.sort((p, q) => dist[p.id] - dist[q.id])
    const n = queue.shift()
    for (const e of n.out) {
      // (e goes n -> e.b; its twin comes from e.b to n)
      const d = dist[n.id] + e.len + 12
      if (d < dist[e.b.id]) { dist[e.b.id] = d; hop[e.b.id][to.id] = e.back; queue.push(e.b) }
    }
  }
}
// The lane point nearest a place on foot: { edge, s } on the nearest side of the nearest road.
export function laneNear(x, z) {
  let best = null
  for (const e of usable) {
    const s = Math.min(e.len, Math.max(0, (x - e.x0) * e.dx + (z - e.z0) * e.dz))
    const d = Math.hypot(e.x0 + e.dx * s - x, e.z0 + e.dz * s - z)
    if (!best || d < best.d) best = { edge: e, s, d }
  }
  return best
}
const stops = CITY.stops.map((s) => ({ id: s.id, ...laneNear(s.x, s.z) }))

// Zebra crossings (the same rule citybuild.js paints them by): [x0, z0, x1, z1, alongX of the road crossed].
export const crossings = []
for (const r of CITY.roads) {
  const [x0, z0, x1, z1] = r.rect
  const alongX = x1 - x0 > z1 - z0
  for (const o of CITY.roads) {
    if (o === r) continue
    const [a0, b0, a1, b1] = o.rect
    if ((a1 - a0 > b1 - b0) === alongX) continue
    if (alongX && a0 >= x0 - 1 && a1 <= x1 + 1 && b0 <= z0 + 1 && b1 >= z1 - 1) { if (a0 - 5 > x0) crossings.push([a0 - 4.5, z0, a0 - 1.5, z1, true]); if (a1 + 5 < x1) crossings.push([a1 + 1.5, z0, a1 + 4.5, z1, true]) }
    if (!alongX && b0 >= z0 - 1 && b1 <= z1 + 1 && a0 <= x0 + 1 && a1 >= x1 - 1) { if (b0 - 5 > z0) crossings.push([x0, b0 - 4.5, x1, b0 - 1.5, false]); if (b1 + 5 < z1) crossings.push([x0, b1 + 1.5, x1, b1 + 4.5, false]) }
  }
}
// Where somebody on foot crosses: from the pavement on one side to the pavement on the other.
export const crossLines = crossings.map(([x0, z0, x1, z1, alongX]) => (alongX
  ? { cross: true, a: { x: (x0 + x1) / 2, z: z0 - 1.9 }, b: { x: (x0 + x1) / 2, z: z1 + 1.9 } }
  : { cross: true, a: { x: x0 - 1.9, z: (z0 + z1) / 2 }, b: { x: x1 + 1.9, z: (z0 + z1) / 2 } }))

// ---------- the vehicles ----------
// kind -> [model file, scale, how many, half its length]
const KINDS = {
  sedan: ['/models/cars/sedan.glb', 1.6, 3, 2.1], // (15 on the roads at most: 11 cars and 4 kombis; the fifth kombi is your ride)
  suv: ['/models/cars/suv.glb', 1.6, 3, 2.2],
  hatch: ['/models/cars/hatchback-sports.glb', 1.6, 3, 2],
  truck: ['/models/cars/truck.glb', 1.6, 2, 2.6],
  kombi: ['/models/cars/van.glb', 1.75, 5, 2.4], // (four on the roads, one for your own ride)
}
const TINTS = ['#ffffff', '#f3d9c4', '#cfe3f2', '#ffe9a8', '#d9f0d3', '#f0c8c8', '#e2e2e2']

function whiteBody(src) {
  const geo = src.clone()
  const c = geo.attributes.color
  for (let i = 0; i < c.count; i++) {
    const r = c.getX(i), g = c.getY(i), b = c.getZ(i)
    if (b > r + 0.08 && b > g + 0.02 && b > 0.18) { const l = 0.86 + Math.min(0.1, b * 0.15); c.setXYZ(i, l, l, l * 0.98) }
  }
  c.needsUpdate = true
  return geo
}

export function createTraffic({ scene, bake, flip = 0 }) {
  const group = new THREE.Group()
  group.name = 'traffic'
  scene.add(group)
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  const cars = []
  const meshes = {}
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const UP = new THREE.Vector3(0, 1, 0)
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const colour = new THREE.Color()
  let rand = 12345
  const rnd = () => { rand = (rand * 1664525 + 1013904223) >>> 0; return rand / 4294967296 }
  let ready = false
  let disposed = false
  let rideCar = null

  for (const [kind, [, scale, count, half]] of Object.entries(KINDS)) {
    for (let i = 0; i < count; i++) {
      const kombi = kind === 'kombi'
      cars.push({ kind, slot: i, scale, half, kombi, ride: kombi && i === count - 1, on: false, edge: null, s: 0, v: 0, x: 0, z: 0, h: 0, turn: null, wait: 0, dest: null, held: 0, tint: kombi ? '#ffffff' : TINTS[(cars.length * 3) % TINTS.length] })
    }
  }
  rideCar = cars.find((c) => c.ride)

  Promise.all(Object.entries(KINDS).map(async ([kind, [url, , count]]) => {
    const m = await bake(url)
    if (!m || disposed) return
    // (a kombi is a white minibus taxi: the kit van's blue body is painted white; glass, tyres and lights keep theirs)
    const geo = kind === 'kombi' ? whiteBody(m.geo) : m.geo
    const mesh = new THREE.InstancedMesh(geo, material, count)
    mesh.name = `traffic-${kind}`
    mesh.frustumCulled = false // (the instances move all over the city; the box of the first one is not theirs)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.count = count
    for (let i = 0; i < count; i++) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, colour.set('#ffffff')) }
    for (const c of cars.filter((x) => x.kind === kind)) mesh.setColorAt(c.slot, colour.set(c.tint))
    mesh.instanceColor.needsUpdate = true
    meshes[kind] = mesh
    group.add(mesh)
  })).then(() => { ready = true }).catch(() => { ready = true })

  // ---- putting a car on the road ----
  const lanePoint = (e, s) => ({ x: e.x0 + e.dx * s, z: e.z0 + e.dz * s })
  function clearOf(x, z, self, gap = 9) {
    for (const c of cars) if (c.on && c !== self && Math.hypot(c.x - x, c.z - z) < gap) return false
    return true
  }
  function seat(c, e, s) {
    c.edge = e
    c.s = s
    c.turn = null
    c.next = null
    c.v = CRUISE * 0.7
    c.wait = 0
    c.held = 0
    const p = lanePoint(e, s)
    c.x = p.x
    c.z = p.z
    c.h = e.heading
    c.on = true
  }
  // Somewhere on a road a block or two from the player (out of the picture), not on top of another car.
  function respawn(c, px, pz, range = NEAR) {
    for (let tries = 0; tries < 40; tries++) {
      const e = usable[Math.floor(rnd() * usable.length)]
      const s = rnd() * e.len
      const p = lanePoint(e, s)
      const d = Math.hypot(p.x - px, p.z - pz)
      if (d < range[0] || d > range[1] || !clearOf(p.x, p.z, c, 12)) continue
      seat(c, e, s)
      if (c.kombi) c.dest = null
      return true
    }
    c.on = false
    return false
  }

  // ---- where a car goes next ----
  function nextEdge(c) {
    const n = c.edge.b
    if (c.kombi && !c.ride) {
      if (!c.dest || c.dest.done) c.dest = { stop: stops[Math.floor(rnd() * stops.length)], done: false }
      const st = c.dest.stop
      // (the stop's lane runs a -> b: come in at a)
      if (n === st.edge.a) return st.edge
      const e = hop[n.id][st.edge.a.id]
      if (e) return e
    }
    const choices = n.out.filter((e) => e.b !== c.edge.a && e.len > 6)
    if (!choices.length) return c.edge.back // (a dead end: round and back)
    // (straight on more often than not: traffic flows along the main roads)
    const straight = choices.find((e) => e.dx === c.edge.dx && e.dz === c.edge.dz)
    if (straight && rnd() < 0.6) return straight
    return choices[Math.floor(rnd() * choices.length)]
  }
  function startTurn(c) {
    const to = c.next || (c.route?.length ? c.route.shift() : nextEdge(c))
    c.next = null
    const from = c.edge
    const p0 = lanePoint(from, from.len)
    const p3 = { x: to.x0, z: to.z0 }
    const k = Math.max(2.6, Math.hypot(p3.x - p0.x, p3.z - p0.z) * 0.42)
    c.turn = { to, from, t: 0, p0, p1: { x: p0.x + from.dx * k, z: p0.z + from.dz * k }, p2: { x: p3.x - to.dx * k, z: p3.z - to.dz * k }, p3, len: Math.hypot(p3.x - p0.x, p3.z - p0.z) * 1.15 + 0.5 }
  }

  // ---- one step ----
  let peds = []
  function limitFor(c) {
    let limit = c.turn ? SLOW : CRUISE
    if (!c.turn) {
      const left = c.edge.len - c.s
      // (easing down for the junction or the dead end ahead, and its crossing)
      if (left < 16) limit = Math.min(limit, SLOW + (CRUISE - SLOW) * Math.max(0, (left - 4) / 12))
      if (c.s < 6 && c.edge.a.junction) limit = Math.min(limit, SLOW + 1.5)
      // a kombi pulls up at its stop; your own ride pulls up where it was sent
      const stopAt = c.ride ? c.target : c.dest && !c.dest.done && c.dest.stop.edge === c.edge ? c.dest.stop.s : null
      if (stopAt != null && stopAt >= c.s - 0.5) {
        const d = stopAt - c.s
        limit = Math.min(limit, d < 0.4 ? 0 : Math.max(0.9, Math.sqrt(2 * 3.2 * d)))
        if (d < 0.4 && c.v < 0.3) {
          if (c.ride) { c.arrived = true } else { c.dest.done = true; c.wait = 3.5 }
        }
      }
    }
    const fx = Math.sin(c.h)
    const fz = Math.cos(c.h)
    const reach = c.half + 2.2 + (c.v * c.v) / (2 * BRAKE) + c.v * 0.25
    let why = ''
    // people on foot: anyone in the lane ahead, or right beside the car
    for (const p of peds) {
      const rx = p.x - c.x
      const rz = p.z - c.z
      if (Math.abs(rx) > 30 || Math.abs(rz) > 30) continue
      const along = rx * fx + rz * fz
      const side = Math.abs(rx * fz - rz * fx)
      if ((along > -c.half - 0.6 && along < reach && side < 2.3) || (Math.abs(along) < c.half + 1 && side < 2.6)) return { limit: 0, ped: true, why: 'person' }
    }
    // the vehicle in front, in YOUR lane only: ahead of you on the same road, turning out of that road in front of
    // you, or (while you turn) on the road you are turning into. A car waiting at the line of another road is not in
    // your way, even when your turn points at it: giving way to it was a gridlock (it was waiting for you).
    for (const o of cars) {
      if (!o.on || o === c) continue
      const mine = c.turn ? (o.edge === c.turn.to && !o.turn) : ((o.edge === c.edge && !o.turn && o.s > c.s) || (o.turn && o.turn.from === c.edge))
      if (!mine) continue
      const rx = o.x - c.x
      const rz = o.z - c.z
      const along = rx * fx + rz * fz
      const gap = Math.hypot(rx, rz) - c.half - o.half
      if (along > -0.5 && gap < reach + 1.5) {
        if (gap < 2.2 || o.v < limit) why = `behind ${o.kind}${o.slot}`
        limit = Math.min(limit, gap < 2.2 ? 0 : o.v)
      }
    }
    return { limit, ped: false, why }
  }
  // Is there room for c at the start of lane e? Only what is IN that lane counts (a car waiting in the other lane, or
  // at the line of another road, is not in the way).
  function roomOn(e, c) {
    for (const o of cars) {
      if (!o.on || o === c) continue
      if (o.edge === e && !o.turn && o.s < c.half * 2 + o.half + 2) return false
      if (o.turn?.to === e) return false
    }
    return true
  }
  function step(c, dt) {
    if (c.wait > 0) { c.wait -= dt; c.v = 0; return }
    const { limit, ped, why } = limitFor(c)
    c.stoppedFor = ped
    c.why = why
    if (c.v > limit) c.v = Math.max(limit, c.v - BRAKE * dt)
    else c.v = Math.min(limit, c.v + ACCEL * dt)
    c.held = c.v < 0.2 ? c.held + dt : 0
    const move = c.v * dt
    if (c.turn) {
      const t = (c.turn.t = Math.min(1, c.turn.t + move / c.turn.len))
      const u = 1 - t
      const { p0, p1, p2, p3 } = c.turn
      c.x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x
      c.z = u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z
      const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x)
      const dz = 3 * u * u * (p1.z - p0.z) + 6 * u * t * (p2.z - p1.z) + 3 * t * t * (p3.z - p2.z)
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) c.h = Math.atan2(dx, dz)
      if (t >= 1) { if (c.turn.node.lock === c) c.turn.node.lock = null; c.edge = c.turn.to; c.s = 0; c.turn = null; c.h = c.edge.heading }
      return
    }
    c.s += move
    if (c.s >= c.edge.len) {
      c.s = c.edge.len
      // (one vehicle through a junction at a time: the next waits at the line)
      const node = c.edge.b
      const holder = node.lock
      if (holder && holder !== c && holder.on && holder.turn?.node === node) { c.v = 0; c.why = `junction ${holder.kind}${holder.slot}`; return }
      // (and never into it unless there is room on the far side: a car stuck half way through a junction would hold
      // it for ever and stop the cross traffic too; that was a gridlock at the taxi rank)
      if (!c.next) c.next = c.route?.length ? c.route.shift() : nextEdge(c)
      if (!roomOn(c.next, c)) { c.v = 0; c.why = 'no room past the junction'; return }
      node.lock = c
      startTurn(c)
      c.turn.node = node
    } else { c.x = c.edge.x0 + c.edge.dx * c.s; c.z = c.edge.z0 + c.edge.dz * c.s }
  }
  function draw() {
    for (const c of cars) {
      const mesh = meshes[c.kind]
      if (!mesh) continue
      if (c.on) {
        q.setFromAxisAngle(UP, c.h + flip)
        m4.compose(pos.set(c.x, 0.02, c.z), q, scl.setScalar(c.scale))
      } else m4.makeScale(0, 0, 0)
      mesh.setMatrixAt(c.slot, m4)
    }
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true
  }

  const api = {
    group,
    cars,
    get ready() { return ready },
    // dt: seconds (the game's, so it can run fast); px, pz: the player; people: [{ x, z }] everyone on foot
    update(dt, px, pz, people) {
      if (!ready) return
      const t0 = performance.now()
      peds = people
      for (const c of cars) {
        if (c.ride) continue
        if (!c.on) { respawn(c, px, pz, api.started ? NEAR : [28, 110]); continue }
        if (Math.hypot(c.x - px, c.z - pz) > FAR) respawn(c, px, pz)
      }
      api.started = true
      // (small steps, so a car never jumps a person even when the game clock runs fast)
      for (let left = dt; left > 1e-4; left -= 0.05) {
        const h = Math.min(0.05, left)
        for (const c of cars) if (c.on) step(c, h)
      }
      draw()
      api.cost = api.cost * 0.95 + (performance.now() - t0) * 0.05 // (ms a frame, smoothed: tests read it)
    },
    cost: 0,
    setVisible(on) { group.visible = on },
    // Is something driving at or near this spot (somebody about to cross waits for it to stop)?
    movingNear(x, z, r = 7) {
      for (const c of cars) if (c.on && c.v > 0.8 && Math.hypot(c.x - x, c.z - z) < r) return true
      return false
    },
    // ---- your own ride ----
    // A kombi comes down the road and pulls up at the lane point nearest (x, z). `arrived` turns true when it has stopped.
    pullUp(x, z, back = 26) {
      const at = laneNear(x, z)
      const c = rideCar
      seat(c, at.edge, Math.max(0, at.s - back))
      c.target = at.s
      c.arrived = false
      c.v = Math.min(CRUISE, Math.sqrt(2 * 3.2 * Math.max(0.5, at.s - c.s)))
      // (make room: nobody parked where it comes in)
      for (const o of cars) if (o !== c && o.on && Math.hypot(o.x - c.x, o.z - c.z) < 30 && o.edge === c.edge) o.on = false
      return c
    },
    // It pulls off again. With a `toward` point it heads that way through the first junctions.
    pullOff() {
      const c = rideCar
      c.target = null
      c.arrived = false
      c.wait = 0
      return c
    },
    // The ride is over: the kombi drives on and is taken off the road once it is out of sight.
    release(px, pz) {
      const c = rideCar
      c.target = null
      c.arrived = false
      c.releasing = true
      api.releaseFrom = { x: px, z: pz }
    },
    tidyRide(px, pz) {
      const c = rideCar
      if (c.on && c.releasing && Math.hypot(c.x - px, c.z - pz) > 70) { c.on = false; c.releasing = false }
    },
    info() {
      const on = cars.filter((c) => c.on)
      return { ready, cost: +api.cost.toFixed(3), cars: on.filter((c) => !c.kombi).length, kombis: on.filter((c) => c.kombi).length, moving: on.filter((c) => c.v > 0.5).length, stoppedForPeople: on.filter((c) => c.stoppedFor).length, draws: Object.keys(meshes).length, list: on.map((c) => ({ id: `${c.kind}${c.slot}`, why: c.v < 0.2 ? c.why || (c.wait > 0 ? 'at a stop' : '') : '', turn: Boolean(c.turn), kind: c.kind, x: +c.x.toFixed(1), z: +c.z.toFixed(1), v: +c.v.toFixed(1), h: +c.h.toFixed(2), ride: c.ride, stopped: Boolean(c.stoppedFor) })) }
    },
    dispose() {
      disposed = true
      scene.remove(group)
      for (const mesh of Object.values(meshes)) mesh.dispose()
      material.dispose()
    },
  }
  return api
}
