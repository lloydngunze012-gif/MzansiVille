import * as THREE from 'three'
import { hairs, outfits, SKIRTED, skins } from '../avatar.js'
import { createAvatar, CROWD_MODELS, poseAvatar } from './avatar3d.js'
import { doorPoint } from './layout.js'
import { cellCenter, findPath, followStep, nearestOpen } from './nav.js'

// Other students: some walk between building doors, some sit on the Quad lawn.
// They use the same rigged model as the player with random looks.

const WALKERS = 9
const SITTERS = 4
const TOPS = ['#2e8b57', '#ff8a3d', '#1d7fb8', '#e8497a', '#7b3fe4', '#f7f4ee', '#d9534f', '#2456a6', '#f0c400', '#1c1915']
const BOTTOMS = ['#2b3a55', '#244e78', '#3a2f4f', '#1c1915', '#5b4a3a', '#7b3fe4']

const pick = (list) => list[Math.floor(Math.random() * list.length)]

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

  // Sitters in pairs on the lawn just in front of the Quad, facing each other.
  const quad = campus.layout.buildings.find((building) => building.id === 'quad')
  if (quad) {
    const spots = [
      [quad.minX + 2, quad.maxZ + 2.2, 0.6], [quad.minX + 3.4, quad.maxZ + 2.2, -2.5],
      [quad.maxX - 3.4, quad.maxZ + 2.4, 2.5], [quad.maxX - 2, quad.maxZ + 2.4, -0.6],
    ]
    for (let i = 0; i < SITTERS; i++) {
      const [x, z, facing] = spots[i % spots.length]
      const avatar = createAvatar(randomLook(CROWD_MODELS[(i + 3) % CROWD_MODELS.length]))
      avatar.position.set(x, 0, z)
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

  function update(dt) {
    for (const person of people) {
      person.clock += dt
      const { avatar } = person
      let walking = false
      if (!person.sitting) {
        if (person.wait > 0) {
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
      poseAvatar(avatar, walking, person.clock)
    }
    group.userData.walking = people.filter((person) => !person.sitting && person.route.length && person.wait <= 0).length
  }

  function dispose() {
    for (const person of people) person.avatar.userData.disposed = true
    scene.remove(group)
  }

  return { group, people, update, dispose }
}
