import * as THREE from 'three'
import { createAvatar, poseAvatar } from './avatar3d.js'
import { lookForPerson } from './cast.js'
import { CELL, doorPoint } from './layout.js'
import { cellCenter, cellOf, findPath, followStep, nearestOpen, pointBlocked } from './nav.js'
import { VENUES } from '../venues.js'

// Other students: some walk between building doors, some sit on the Quad lawn.
// Each is a person you can talk to (people.json); their look comes from cast.js.

const WALKERS = 9
const SITTERS = 4
// Seat height of a Kenney bench at the scale dress.js uses.
const BENCH_Y = 0.45

const pick = (list) => list[Math.floor(Math.random() * list.length)]
// Personal space: nobody stands closer than this to anyone else (metres).
const SPACE = 1.0
// Tester fixes 2 (owner, 11 Nov): never more than NEAR_MAX NPCs within NEAR_R of a player (you, or another real
// player), and no walker stands still longer than its pause between trips says.
const NEAR_R = 4
const NEAR_MAX = 3
const STILL_MAX = 8 // s: the longest pause is 5.5 s; past this a walker sets off again, round the players

// opts.roommate: the roommate's id (zoe, ethan...), who sits on the first Quad bench.
export function createCrowd(scene, campus, opts = {}) {
  const group = new THREE.Group()
  group.name = 'crowd'
  scene.add(group)
  const doors = campus.layout.buildings
    .filter((building) => building.id !== 'quad')
    .map((building) => {
      const cell = nearestOpen(campus.grid, doorPoint(building))
      return cell ? { id: building.id, cell, point: cellCenter(cell.c, cell.r) } : null
    })
    .filter(Boolean)
  // Where the bus drops the player: just inside the gate (see respawn in scene.js).
  const gateBuilding = campus.layout.buildings.find((building) => building.id === 'gate')
  const arrival = gateBuilding && nearestOpen(campus.grid, { x: gateBuilding.x, z: gateBuilding.minZ - 16 })
  const gate = arrival && { id: 'arrival', cell: arrival, point: cellCenter(arrival.c, arrival.r) }
  const people = []

  for (let i = 0; i < WALKERS && doors.length > 1; i++) {
    const id = `x${i}`
    const avatar = createAvatar(lookForPerson(id, i))
    avatar.userData.personId = id
    // A few start at the gate so the bus arrival lands in a busy campus.
    const from = i < 3 && gate ? gate : pick(doors)
    avatar.position.set(from.point.x + (Math.random() - 0.5) * 3, 0, from.point.z + (Math.random() - 0.5) * 3)
    group.add(avatar)
    people.push({ avatar, from, route: [], wait: i < 3 ? 0.2 + i * 0.6 : Math.random() * 3, speed: 1 + Math.random() * 0.5, clock: Math.random() * 10 })
  }

  // Sitters on the Quad's benches (dress.js), plus one on the stage step.
  const quad = campus.layout.buildings.find((building) => building.id === 'quad')
  if (quad) {
    // The left half of each bench, so there is room to sit down beside them.
    const seats = (campus.dressing?.benches || []).map((b) => [b.x - Math.cos(b.rot) * 0.32, b.z + Math.sin(b.rot) * 0.32, b.rot, BENCH_Y])
    seats.push([quad.cx - 0.45, quad.cz - 4.75, 0, 0.3]) // on the stage step, back to the stage
    for (let i = 0; i < Math.min(SITTERS, seats.length); i++) {
      const [x, z, facing, y] = seats[i]
      const id = [opts.roommate || 'zoe', 'aya', 'grace', 'tendai'][i]
      const avatar = createAvatar(lookForPerson(id, i + 9))
      avatar.userData.personId = id
      avatar.position.set(x, y, z)
      avatar.rotation.y = facing
      avatar.userData.pose = 'sit'
      group.add(avatar)
      people.push({ avatar, sitting: true, clock: Math.random() * 10 })
    }
  }

  // Nobody spawns alone (retention spec, item 1): while fewer than three real players
  // are online, students hang about on the Quad lawn in twos, chatting (setFill).
  // They can be talked to like anyone (x14-x19 in people.json).
  const fillers = []
  if (quad) {
    const spots = [[3.8, 1.6, 0.5], [-4.2, 2.4, -0.9], [0.6, 6.4, 1.9]]
    spots.forEach(([ox, oz, angle], g) => {
      for (let k = 0; k < 2; k++) {
        const id = `x${14 + g * 2 + k}`
        const avatar = createAvatar(lookForPerson(id, 14 + g * 2 + k))
        avatar.userData.personId = id
        const side = k ? 0.6 : -0.6
        avatar.position.set(quad.cx + ox + Math.sin(angle) * side, 0, quad.cz + oz + Math.cos(angle) * side)
        avatar.rotation.y = angle + (k ? Math.PI : 0)
        avatar.userData.pose = (g + k) % 2 ? 'talk' : 'stand'
        avatar.visible = false
        group.add(avatar)
        fillers.push({ avatar, sitting: true, standing: true, filler: true, clock: Math.random() * 10 })
      }
    })
  }
  // (only near the Quad: from across campus they'd cost a phone frames for nothing)
  function setFill(on, playerPos) {
    if (playerPos && quad && Math.hypot(playerPos.x - quad.cx, playerPos.z - quad.cz) > 32) on = false
    for (const f of fillers) {
      const i = people.indexOf(f)
      if (on && i < 0) { people.push(f); f.avatar.visible = true }
      if (!on && i >= 0 && !f.talking) { people.splice(i, 1); f.avatar.visible = false }
    }
  }

  // Each venue's lecturer outside their building, between lectures.
  for (const venue of Object.values(VENUES)) {
    const hall = campus.layout.buildings.find((b) => b.id === venue.id)
    if (!hall) continue
    const avatar = createAvatar(lookForPerson(venue.lecturer))
    avatar.userData.personId = venue.lecturer
    avatar.position.set(hall.x + 3.2, 0, hall.maxZ + 2.2)
    avatar.rotation.y = 0.4
    group.add(avatar)
    people.push({ avatar, sitting: true, standing: true, clock: 0 })
  }

  // The real players on this phone's campus: you and everyone else drawn here (scene.js passes them every frame).
  let real = []
  const playerNear = (pt, r) => real.some((p) => Math.hypot(p.x - pt.x, p.z - pt.z) < r)
  // How many NPCs are within NEAR_R of this player: everyone who can be seen, seated and queueing people too.
  const fixedNear = (p) => {
    let n = 0
    for (const o of people) if ((o.sitting || o.talking || o.avatar.userData.following) && o.avatar.visible && Math.hypot(o.avatar.position.x - p.x, o.avatar.position.z - p.z) < NEAR_R) n++
    for (const a of campus.dressing?.statics || []) if (a.visible && Math.hypot(a.position.x - p.x, a.position.z - p.z) < NEAR_R) n++
    return n
  }
  const moversNear = (p, r = NEAR_R) => people.filter((o) => !o.sitting && !o.talking && !o.avatar.userData.following && Math.hypot(o.avatar.position.x - p.x, o.avatar.position.z - p.z) < r)
  // Find a way with the ground round every player closed: a body's width normally, the whole 4 m circle of a
  // player who already has their three. (The walker's own cell stays open, or it could never set off.)
  function aroundPlayers(start, find, wide) {
    const grid = campus.grid
    const closed = []
    for (const p of real) {
      const r = wide && fixedNear(p) + moversNear(p).length >= NEAR_MAX ? NEAR_R + 0.6 : 1.5
      const c0 = cellOf(p.x - r, p.z - r)
      const c1 = cellOf(p.x + r, p.z + r)
      for (let rr = Math.max(0, c0.r); rr <= Math.min(grid.rows - 1, c1.r); rr++) {
        for (let cc = Math.max(0, c0.c); cc <= Math.min(grid.cols - 1, c1.c); cc++) {
          const i = rr * grid.cols + cc
          if (grid.blocked[i] || (cc === start.c && rr === start.r)) continue
          const mid = cellCenter(cc, rr)
          if (Math.hypot(mid.x - p.x, mid.z - p.z) > r + CELL * 0.5) continue
          grid.blocked[i] = 2
          closed.push(i)
        }
      }
    }
    try { return find() } finally { for (const i of closed) grid.blocked[i] = 0 }
  }
  // awayFrom: a player this walker is leaving (the door furthest from them is the way out).
  function nextTrip(person, awayFrom = null) {
    const here = person.avatar.position
    // (never to a door a player is standing at: that is how a queue of walkers built up round two players talking)
    let options = doors.filter((door) => door !== person.from && !playerNear(door.point, NEAR_R + 1.5))
    if (!options.length) options = doors.filter((door) => door !== person.from)
    const start = nearestOpen(campus.grid, here)
    const inside = playerNear(here, NEAR_R + 0.6) // (already beside a player: only their own body is closed, so there is a way out)
    let to = pick(options)
    if (awayFrom) to = options.reduce((best, d) => (Math.hypot(d.point.x - awayFrom.x, d.point.z - awayFrom.z) - Math.hypot(d.point.x - here.x, d.point.z - here.z) * 0.5 > Math.hypot(best.point.x - awayFrom.x, best.point.z - awayFrom.z) - Math.hypot(best.point.x - here.x, best.point.z - here.z) * 0.5 ? d : best), options[0])
    person.route = start ? aroundPlayers(start, () => findPath(campus.grid, start, to.cell), !inside) : []
    person.from = to
    person.anchor = null
    person.walkT = 0
    person.yielded = 0
    if (!person.route.length) person.wait = 2 // (no way round just now: stand a moment, then try another door)
  }
  // The rule: a player never has more than three NPCs within 4 m. Seated, queueing and chatting people count
  // towards the three and stay where they are; walkers past the count turn and go, and one about to step into a
  // full circle turns before it gets there.
  let ruleT = 0
  function keepRoom(dt) {
    ruleT -= dt
    if (ruleT > 0) return
    ruleT = 0.3
    for (const p of real) {
      const room = Math.max(0, NEAR_MAX - fixedNear(p))
      const inside = moversNear(p).sort((a, b) => Math.hypot(a.avatar.position.x - p.x, a.avatar.position.z - p.z) - Math.hypot(b.avatar.position.x - p.x, b.avatar.position.z - p.z))
      // (the nearest keep their place; the ones further out go)
      for (const o of inside.slice(room)) sendAway(o, p)
      if (inside.length >= room) {
        for (const o of moversNear(p, NEAR_R + 2)) {
          if (inside.includes(o) || !o.route.length || o.wait > 0 || o.leaving > 0) continue
          const next = o.route[0]
          const a = o.avatar.position
          // (walking towards them: turn round before the circle)
          if (Math.hypot(next.x - p.x, next.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z)) sendAway(o, p)
        }
      }
    }
  }
  function sendAway(person, p) {
    if (person.leaving > 0 && person.route.length) return
    person.leaving = 4 // s: no giving way and no pause until it is clear of them
    person.wait = 0
    person.resume = false
    nextTrip(person, p)
    if (!person.route.length) person.wait = 0.4
  }

  // Push a walker apart from everyone within SPACE (the player included).
  function separate(person, playerPos, dt) {
    const { avatar } = person
    let px = 0
    let pz = 0
    const others = people.map((other) => other.avatar.position).concat((campus.dressing?.statics || []).map((avatar) => avatar.position))
    if (playerPos) others.push(playerPos)
    for (const pos of others) {
      if (pos === avatar.position) continue
      const dx = avatar.position.x - pos.x
      const dz = avatar.position.z - pos.z
      const d = Math.hypot(dx, dz)
      if (d < SPACE && d > 1e-4) {
        px += (dx / d) * (SPACE - d)
        pz += (dz / d) * (SPACE - d)
      } else if (d <= 1e-4) px += 0.3
    }
    const k = Math.min(1, dt * 6)
    const nx = avatar.position.x + px * k
    const nz = avatar.position.z + pz * k
    if (!pointBlocked(campus.grid, nx, nz)) { avatar.position.x = nx; avatar.position.z = nz }
  }

  // Someone right in front on the path: give way for a moment.
  function yields(person, playerPos) {
    const next = person.route[0]
    if (!next || !playerPos) return false
    const { x, z } = person.avatar.position
    const dirX = next.x - x
    const dirZ = next.z - z
    const len = Math.hypot(dirX, dirZ) || 1
    const ox = playerPos.x - x
    const oz = playerPos.z - z
    const ahead = (ox * dirX + oz * dirZ) / len
    const side = Math.abs(ox * dirZ - oz * dirX) / len
    return ahead > 0 && ahead < 1.6 && side < 0.8
  }

  // A zone nobody walks into while the Day 1 car comes, waits and leaves (dropoff.js):
  // walkers inside are moved out, nobody steps in, a route that ends in it is dropped.
  let keepOut = null
  const inKeep = (x, z, pad = 0) => keepOut && x > keepOut.minX - pad && x < keepOut.maxX + pad && z > keepOut.minZ - pad && z < keepOut.maxZ + pad
  // A spot outside the zone that is walkable, clear of every solid and of other people.
  const spotFree = (x, z, except) => {
    if (inKeep(x, z, 1)) return false
    if (pointBlocked(campus.grid, x, z)) return false
    if (opts.solid?.(x, z)) return false
    return !people.some((o) => o !== except && !o.avatar.userData.following && Math.hypot(o.avatar.position.x - x, o.avatar.position.z - z) < 0.7)
  }
  // Move someone in the zone to the nearest free spot outside it, at once (no stepping
  // out: the way out is often behind a lodge, wall or fence).
  function evict(person) {
    const p = person.avatar.position
    for (let r = 0.5; r <= 60; r += 0.5) {
      const n = Math.max(12, Math.round(r * 8))
      const start = Math.random() * Math.PI * 2
      for (let i = 0; i < n; i++) {
        const a = start + (i / n) * Math.PI * 2
        const x = p.x + Math.cos(a) * r
        const z = p.z + Math.sin(a) * r
        if (!spotFree(x, z, person)) continue
        p.x = x
        p.z = z
        person.route = []
        person.wait = 1 + Math.random()
        person.walkT = 0
        person.anchor = null
        return true
      }
    }
    return false
  }
  function evictAll() {
    for (const person of people) {
      if (person.sitting || person.avatar.userData.following) continue
      if (inKeep(person.avatar.position.x, person.avatar.position.z)) evict(person)
    }
  }
  function setKeepOut(rect) { keepOut = rect || null; if (keepOut) evictAll() }

  let tick = 0
  function update(dt, playerPos, players = null) {
    tick += 1
    real = players && players.length ? players : playerPos ? [playerPos] : []
    keepRoom(dt)
    for (const person of people) {
      person.clock += dt
      if (person.leaving > 0) person.leaving -= dt
      // (how long this one has stood on one spot: read by tests, and the watchdog below)
      if (!person.sitting) {
        const a = person.avatar.position
        if (!person.stillAt || Math.hypot(a.x - person.stillAt.x, a.z - person.stillAt.z) > 0.4 || person.talking || person.avatar.userData.following) { person.stillAt = { x: a.x, z: a.z }; person.still = 0 } else person.still = (person.still || 0) + dt
        person.stillMax = Math.max(person.stillMax || 0, person.still)
        if (person.still > STILL_MAX) { person.still = 0; person.stillAt = null; person.wait = 0; person.resume = false; person.leaving = 3; nextTrip(person) }
      }
      // The Quad's chatting pairs only stand and talk: a third of the frames is plenty.
      if (person.filler && !person.talking && tick % 3) continue
      const { avatar } = person
      let walking = false
      // Someone you are talking to stands still and faces you.
      if (avatar.userData.following) continue // walking with the player (scene.js)
      if (person.talking) { poseAvatar(avatar, false, person.clock); continue }
      if (!person.sitting && inKeep(avatar.position.x, avatar.position.z)) {
        // (in the car's way, e.g. pushed in: out to the nearest free spot at once)
        evict(person)
        poseAvatar(avatar, false, person.clock)
        continue
      }
      if (!person.sitting) {
        if (person.route.length && person.wait <= 0 && !(person.leaving > 0) && real.some((p) => yields(person, p))) {
          person.wait = 0.5
          person.resume = true
          // Giving way to somebody who is not moving (two players talking) is not a way through: after a
          // moment the walker goes round them instead. (It used to give way for ever, and every walker whose
          // path crossed the spot ended up standing there: the pile-up of 11 Nov.)
          person.yielded = (person.yielded || 0) + 0.5
          if (person.yielded >= 1.5) { person.resume = false; person.wait = 0; nextTrip(person) }
        }
        if (person.wait > 0) {
          person.wait -= dt
          if (person.wait <= 0 && person.resume) person.resume = false
          else if (person.wait <= 0) nextTrip(person)
        } else if (person.route.length) {
          const step = followStep(campus.grid, { x: avatar.position.x, z: avatar.position.z }, person.route, person.speed * dt)
          if (inKeep(step.position.x, step.position.z, 0.8)) { person.route = []; person.wait = 1 + Math.random(); poseAvatar(avatar, false, person.clock); continue }
          const dx = step.position.x - avatar.position.x
          const dz = step.position.z - avatar.position.z
          if (dx || dz) avatar.rotation.y = Math.atan2(dx, dz)
          avatar.position.x = step.position.x
          avatar.position.z = step.position.z
          person.route = step.route
          walking = !step.done
          if (person.yielded && Math.hypot(dx, dz) > 0.01) person.yielded = Math.max(0, person.yielded - dt)
          if (step.done || step.blocked) person.wait = 1.5 + Math.random() * 4
          // Pressed against someone who stands still, the walk and the personal-space
          // push cancel out and the body shakes on the spot: a walk that has gone
          // nowhere in a second is dropped, and a new trip starts after a pause.
          person.walkT = (person.walkT || 0) + dt
          person.anchor ||= { x: avatar.position.x, z: avatar.position.z }
          if (person.walkT >= 1) {
            // (net, after the personal-space push: a walk is ~1.5 m a second)
            const net = Math.hypot(avatar.position.x - person.anchor.x, avatar.position.z - person.anchor.z)
            if (net < 0.3 && !step.done) { person.route = []; person.wait = 0.8 + Math.random() * 1.5; walking = false }
            person.anchor = null
            person.walkT = 0
          }
        } else {
          person.wait = 1 + Math.random() * 3
        }
      }
      if (!person.sitting) {
        const [bx, bz] = [avatar.position.x, avatar.position.z]
        separate(person, playerPos, dt)
        if (inKeep(avatar.position.x, avatar.position.z, 0.8)) { avatar.position.x = bx; avatar.position.z = bz }
      }
      poseAvatar(avatar, walking, person.clock)
    }
    group.userData.walking = people.filter((person) => !person.sitting && person.route.length && person.wait <= 0).length
  }

  function dispose() {
    for (const person of people) person.avatar.userData.disposed = true
    scene.remove(group)
  }

  // Keep the player out of everyone's personal space (sitters too).
  // The place's own people (stall vendor, campaigners, the queue) have personal space too.
  const statics = campus.dressing?.statics || []
  function pushOut(position, radius = 0.85) {
    for (const person of people.concat(statics.map((avatar) => ({ avatar })))) {
      if (person.avatar.userData.following) continue
      const pos = person.avatar.position
      const dx = position.x - pos.x
      const dz = position.z - pos.z
      const d = Math.hypot(dx, dz)
      if (d >= radius) continue
      const ux = d > 1e-4 ? dx / d : 1
      const uz = d > 1e-4 ? dz / d : 0
      const nx = pos.x + ux * radius
      const nz = pos.z + uz * radius
      if (!pointBlocked(campus.grid, nx, nz)) { position.x = nx; position.z = nz }
    }
  }

  // For tests (read only): every NPC of the crowd with how long it has stood on its spot, and how many NPCs each
  // real player has within 4 m.
  function report() {
    const kind = (o) => (o.filler ? 'filler' : o.sitting ? 'fixed' : 'walker')
    const list = people.filter((o) => o.avatar.visible).map((o) => ({ id: o.avatar.userData.personId, kind: kind(o), x: +o.avatar.position.x.toFixed(2), z: +o.avatar.position.z.toFixed(2), still: +(o.still || 0).toFixed(1), stillMax: +(o.stillMax || 0).toFixed(1), talking: Boolean(o.talking), leaving: o.leaving > 0 }))
    return { people: list, near: real.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), fixed: fixedNear(p), walkers: moversNear(p).length })), limit: NEAR_MAX, stillLimit: STILL_MAX }
  }

  return { group, people, update, pushOut, dispose, setFill, fillers, setKeepOut, report }
}
