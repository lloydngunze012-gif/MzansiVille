import * as THREE from 'three'
import { hairs, outfits, SKIRTED, skins } from '../avatar.js'
import { createAvatar, CROWD_MODELS, poseAvatar } from './avatar3d.js'
import { doorPoint } from './layout.js'
import { cellCenter, findPath, followStep, nearestOpen, pointBlocked } from './nav.js'

// Other students: some walk between building doors, some sit on the Quad lawn.
// They use the same rigged model as the player with random looks.

const WALKERS = 9
const SITTERS = 4
// Seat height of a Kenney bench at the scale dress.js uses.
const BENCH_Y = 0.5
const TOPS = ['#2e8b57', '#ff8a3d', '#1d7fb8', '#e8497a', '#7b3fe4', '#f7f4ee', '#d9534f', '#2456a6', '#f0c400', '#1c1915']
const BOTTOMS = ['#2b3a55', '#244e78', '#3a2f4f', '#1c1915', '#5b4a3a', '#7b3fe4']

const pick = (list) => list[Math.floor(Math.random() * list.length)]
// Personal space: nobody stands closer than this to anyone else (metres).
const SPACE = 1.0

function randomLook(model) {
  const female = model.startsWith('female')
  const outfit = pick(outfits.filter((item) => female || !SKIRTED.has(item.id))).id
  const look = {
    model,
    gender: female ? 'female' : 'male',
    skin: pick(skins).id,
    hair: pick(hairs).id,
    outfit,
    bottomColor: pick(BOTTOMS),
  }
  // Organt stays the player's brand tee; everyone else gets a plain colour.
  if (outfit !== 'organt') look.topColor = pick(TOPS)
  return look
}

export function createCrowd(scene, campus) {
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
    const avatar = createAvatar(randomLook(CROWD_MODELS[i % CROWD_MODELS.length]))
    // A few start at the gate so the bus arrival lands in a busy campus.
    const from = i < 3 && gate ? gate : pick(doors)
    avatar.position.set(from.point.x + (Math.random() - 0.5) * 3, 0, from.point.z + (Math.random() - 0.5) * 3)
    group.add(avatar)
    people.push({ avatar, from, route: [], wait: i < 3 ? 0.2 + i * 0.6 : Math.random() * 3, speed: 2 + Math.random() * 1.2, clock: Math.random() * 10 })
  }

  // Sitters on the Quad's benches (dress.js), plus one on the stage step.
  const quad = campus.layout.buildings.find((building) => building.id === 'quad')
  if (quad) {
    // The left half of each bench, so there is room to sit down beside them.
    const seats = (campus.dressing?.benches || []).map((b) => [b.x - Math.cos(b.rot) * 0.32 + Math.sin(b.rot) * 0.05, b.z + Math.sin(b.rot) * 0.32 + Math.cos(b.rot) * 0.05, b.rot, BENCH_Y])
    seats.push([quad.cx + 1.6, quad.cz - 4.6, 0, 0.3])
    for (let i = 0; i < Math.min(SITTERS, seats.length); i++) {
      const [x, z, facing, y] = seats[i]
      const avatar = createAvatar(randomLook(CROWD_MODELS[(i + 3) % CROWD_MODELS.length]))
      avatar.position.set(x, y, z)
      avatar.rotation.y = facing
      avatar.userData.pose = 'sit'
      group.add(avatar)
      people.push({ avatar, sitting: true, clock: Math.random() * 10 })
    }
  }

  function nextTrip(person) {
    const options = doors.filter((door) => door !== person.from)
    const to = pick(options)
    const start = nearestOpen(campus.grid, person.avatar.position)
    person.route = start ? findPath(campus.grid, start, to.cell) : []
    person.from = to
    if (!person.route.length) person.wait = 2
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

  function update(dt, playerPos) {
    for (const person of people) {
      person.clock += dt
      const { avatar } = person
      let walking = false
      if (!person.sitting) {
        if (person.route.length && person.wait <= 0 && yields(person, playerPos)) {
          person.wait = 0.5
          person.resume = true
        }
        if (person.wait > 0) {
          person.wait -= dt
          if (person.wait <= 0 && person.resume) person.resume = false
          else if (person.wait <= 0) nextTrip(person)
          person.wait -= dt
          if (person.wait <= 0) nextTrip(person)
        } else if (person.route.length) {
          const step = followStep(campus.grid, { x: avatar.position.x, z: avatar.position.z }, person.route, person.speed * dt)
          const dx = step.position.x - avatar.position.x
          const dz = step.position.z - avatar.position.z
          if (dx || dz) avatar.rotation.y = Math.atan2(dx, dz)
          avatar.position.x = step.position.x
          avatar.position.z = step.position.z
          person.route = step.route
          walking = !step.done
          if (step.done || step.blocked) person.wait = 1.5 + Math.random() * 4
        } else {
          person.wait = 1 + Math.random() * 3
        }
      }
      if (!person.sitting) separate(person, playerPos, dt)
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

  return { group, people, update, pushOut, dispose }
}
