// Day 1, the drop-off at UMzansi's Main Gate (after world/home.js). Your parent's car
// comes up the gate road on a fixed path (never yours to steer) and stops inside the
// gate. A goodbye, a hug, money "for food, not for parties", and the car drives off.
// Then you roll your suitcase to your house door (gold dots), where your roommate meets
// you and the normal game begins. Driven by scene.js: start, update(dt), arrive().
import * as THREE from 'three'
import HOMES from '../../data/campusville/homes.json'
import { createAvatar, poseAvatar } from './avatar3d.js'
import { loadModel } from './models.js'
import { loop as soundLoop } from '../audio.js'

const AUTO_TALK = typeof location !== 'undefined' && new URLSearchParams(location.search).get('talk') === 'auto'

// ctx: { scene, host, player, run, gate: {x, minZ, maxZ}, door: {x, z}, house, roommate, onUpdate, onDone }
export function startDropOff(ctx) {
  const { scene, host, player, run } = ctx
  const style = HOMES.styles[run.dropOff?.style] || HOMES.styles[HOMES.default]
  const home = run.home || {}
  const call = home.call || style.parent.call
  const pocket = home.pocket || style.pocket
  const tasks = []
  const people = []
  let phase = 'arrive' // arrive -> goodbye -> leave -> walk -> door -> done
  let car = null
  let parent = null
  let roommate = null
  let suitcase = null
  let clock = 0
  const task = (update) => new Promise((resolve) => tasks.push({ update, resolve }))
  const wait = (s) => { let t = 0; return task((dt) => (t += dt) >= s) }
  const say = (s) => { host.dataset.dropoff = s; phase = s }

  // the stop: on the gate road, in the left lane, right in front of the Main Gate (the
  // gatehouse and its UMzansi sign ahead); you walk in through the gate from there
  const stop = { x: ctx.gate.x - 1.8, z: ctx.gate.maxZ + 4.5 }
  const enter = { x: ctx.gate.x - 1.8, z: ctx.gate.maxZ + 24 }

  // ---- the card (a dialog: while it's open you don't walk off) ----
  host.insertAdjacentHTML('beforeend', `<section class="dp-card" role="dialog" aria-label="The drop-off" hidden><b class="dp-name"></b><p class="dp-line"></p><div class="dp-acts"></div></section><p class="dp-caption" role="dialog" hidden></p><button type="button" class="mm-go dp-walk" hidden></button>`)
  const card = host.querySelector('.dp-card')
  const caption = host.querySelector('.dp-caption')
  const walkBtn = host.querySelector('.dp-walk')
  function line(name, text, buttons = []) {
    return new Promise((resolve) => {
      card.hidden = false
      card.querySelector('.dp-name').textContent = name
      card.querySelector('.dp-line').textContent = text
      const acts = card.querySelector('.dp-acts')
      acts.innerHTML = (buttons.length ? buttons : ['Next ›']).map((b, i) => `<button type="button" class="mm-go dp-go" data-i="${i}">${b}</button>`).join('')
      acts.querySelectorAll('button').forEach((b) => { b.onclick = () => { acts.innerHTML = ''; resolve(Number(b.dataset.i)) } })
      if (AUTO_TALK) setTimeout(() => acts.querySelector('button')?.click(), 1500) // (tests: long enough to catch each line)
    })
  }
  const closeCard = () => { card.hidden = true }

  function face(a, x, z) { a.rotation.y = Math.atan2(x - a.position.x, z - a.position.z) }
  function walkPerson(a, x, z, speed = 1.5) {
    a.userData.walking = true
    return task((dt) => {
      const dx = x - a.position.x
      const dz = z - a.position.z
      const d = Math.hypot(dx, dz)
      if (d < 0.05) { a.userData.walking = false; return true }
      const step = Math.min(d, speed * dt)
      a.position.x += (dx / d) * step
      a.position.z += (dz / d) * step
      a.rotation.y = Math.atan2(dx, dz)
      return false
    })
  }
  // Walking round the car: the car's box grown by 0.6 m is a no-go rectangle; between two
  // spots outside it the shortest way is straight, or by its corners (a tiny visibility graph).
  let carBox = null // the parked car's footprint (world, once it has stopped)
  const CLEAR = 0.9 // (0.6 m clear on a straight; the body turns in an arc at a corner and cuts it by up to ~0.4)
  const grown = () => ({ minX: carBox.minX - CLEAR, maxX: carBox.maxX + CLEAR, minZ: carBox.minZ - CLEAR, maxZ: carBox.maxZ + CLEAR })
  const inRect = (r, x, z) => x > r.minX + 1e-6 && x < r.maxX - 1e-6 && z > r.minZ + 1e-6 && z < r.maxZ - 1e-6
  function clearLine(r, a, b) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05)
    for (let i = 0; i <= n; i++) if (inRect(r, a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false
    return true
  }
  function routeAround(a, b) {
    const r = grown()
    if (clearLine(r, a, b)) return [b]
    const nodes = [a, { x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ }, b]
    const dist = nodes.map(() => Infinity)
    const prev = nodes.map(() => -1)
    const done = nodes.map(() => false)
    dist[0] = 0
    for (let k = 0; k < nodes.length; k++) {
      let u = -1
      nodes.forEach((_, i) => { if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i })
      if (u < 0 || dist[u] === Infinity) break
      done[u] = true
      nodes.forEach((v, i) => {
        if (done[i] || !clearLine(r, nodes[u], v)) return
        const d = dist[u] + Math.hypot(v.x - nodes[u].x, v.z - nodes[u].z)
        if (d < dist[i]) { dist[i] = d; prev[i] = u }
      })
    }
    const out = []
    for (let i = nodes.length - 1; i > 0 && i >= 0; i = prev[i]) { out.unshift(nodes[i]); if (prev[i] < 0) break }
    return out.length ? out : [b]
  }
  async function walkAround(a, x, z, speed) {
    for (const p of routeAround({ x: a.position.x, z: a.position.z }, { x, z })) await walkPerson(a, p.x, p.z, speed)
  }
  let keepRect = null
  let blocker = null
  let carHalf = { w: 1, l: 2.4 }
  // Anyone inside the car's footprint, stretched 2.5 m ahead and 0.5 m to each side.
  function pathBlocked() {
    if (!car || !ctx.walkers) return false
    const ry = car.rotation.y
    const fx = Math.sin(ry)
    const fz = Math.cos(ry)
    for (const w of ctx.walkers()) {
      const dx = w.x - car.position.x
      const dz = w.z - car.position.z
      const v = dx * fx + dz * fz
      const u = dx * fz - dz * fx
      if (Math.abs(u) < carHalf.w + 0.5 && v > -carHalf.l - 0.3 && v < carHalf.l + 2.5) { blocker = { x: w.x, z: w.z, u, v }; return true }
    }
    return false
  }
  function drive(points, seconds) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'catmullrom', 0.3)
    let t = 0
    let held = 0
    return task((dt) => {
      // Safety net: anyone in the car's path ahead, and it waits (never overlaps a person).
      if (pathBlocked()) {
        held += dt
        if (held > 2) { held = 0; ctx.keepOut?.(keepRect) } // (still there: move them out again)
        return false
      }
      held = 0
      t = Math.min(seconds, t + dt)
      const k = t / seconds
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
      const p = curve.getPointAt(e)
      const q = curve.getPointAt(Math.min(1, e + 0.01))
      car.position.copy(p)
      if (q.distanceTo(p) > 0.001) car.rotation.y = Math.atan2(q.x - p.x, q.z - p.z)
      return t >= seconds
    })
  }

  async function run_() {
    say('arrive')
    player.visible = false
    // (the camera rides behind the car, looking up the gate road at the gate)
    ctx.rig?.turnBehind(Math.PI)
    caption.hidden = false
    caption.textContent = `\u{1F697} Pulling up at UMzansi's Main Gate…`
    // the car and your parent (in your family's look)
    const model = await loadModel(`/models/cars/${style.street.familyCar}.glb`).catch(() => null)
    car = new THREE.Group()
    car.name = 'dropoff-car'
    if (model) { const body = model.clone(); body.scale.setScalar(1.9); car.add(body) }
    car.position.set(enter.x, 0, enter.z)
    car.rotation.y = Math.PI
    scene.add(car)
    // how big the car is (its swept area during the arrival, stop and U-turn is kept free of walkers)
    const local = new THREE.Box3().setFromObject(car)
    // (relative to the car: the box is in world coordinates, the car is at the gate road)
    const rel = { minX: local.min.x - car.position.x, maxX: local.max.x - car.position.x, minZ: local.min.z - car.position.z, maxZ: local.max.z - car.position.z }
    const reach = Math.max(Math.hypot(rel.minX, rel.minZ), Math.hypot(rel.maxX, rel.maxZ), 1.5) + 1.2
    const swept = [enter, { x: stop.x, z: stop.z + 7 }, stop, { x: stop.x + 3.6, z: stop.z - 2.4 }, { x: stop.x + 3.6, z: enter.z + 6 }]
    carHalf = { w: Math.max(0.8, (local.max.x - local.min.x) / 2), l: Math.max(1.5, (local.max.z - local.min.z) / 2) }
    keepRect = {
      minX: Math.min(...swept.map((p) => p.x)) - reach,
      maxX: Math.max(...swept.map((p) => p.x)) + reach,
      minZ: Math.min(...swept.map((p) => p.z)) - reach,
      maxZ: Math.max(...swept.map((p) => p.z)) + reach,
    }
    ctx.keepOut?.(keepRect)
    parent = createAvatar(home.parentLook || { gender: 'female', outfit: style.parent.outfit, topColor: style.parent.top })
    parent.name = 'parent'
    parent.visible = false
    parent.userData.pose = 'stand'
    scene.add(parent)
    people.push(parent)
    soundLoop('bus_engine', true)
    // the camera follows the car in (the player rides along, unseen)
    await drive([enter, { x: stop.x, z: stop.z + 7 }, stop], 4.5)
    soundLoop('bus_engine', false)
    caption.hidden = true
    // out of the car: you on the passenger side (left), your parent from the driver's side
    say('goodbye')
    car.updateMatrixWorld(true)
    const cb = new THREE.Box3().setFromObject(car)
    carBox = { minX: cb.min.x, maxX: cb.max.x, minZ: cb.min.z, maxZ: cb.max.z }
    // (the driver's door is on the right as you face the gate: a step clear of the car)
    const driver = { x: carBox.maxX + CLEAR + 0.05, z: (carBox.minZ + carBox.maxZ) / 2 - 0.2 }
    player.position.set(carBox.minX - CLEAR - 0.5, 0, (carBox.minZ + carBox.maxZ) / 2 + 0.3)
    face(player, player.position.x, stop.z - 3)
    player.visible = true
    parent.position.set(driver.x, 0, driver.z)
    parent.visible = true
    await walkAround(parent, player.position.x + 0.15, player.position.z - 0.95)
    face(parent, player.position.x, player.position.z)
    face(player, parent.position.x, parent.position.z)
    await line(call, style.lines.gate1)
    await line(call, style.lines.gate2)
    // the hug
    await line(call, 'Come here.', [`\u{1F917} Hug ${call}`])
    host.dataset.hug = '1'
    const mid = { x: (player.position.x + parent.position.x) / 2, z: (player.position.z + parent.position.z) / 2 }
    await Promise.all([walkPerson(parent, mid.x + (parent.position.x - mid.x) * 0.45, mid.z + (parent.position.z - mid.z) * 0.45, 0.8), wait(0.4)])
    face(parent, player.position.x, player.position.z)
    const sway = task((dt) => { clock += dt; parent.rotation.z = Math.sin(clock * 3) * 0.05; player.rotation.z = -Math.sin(clock * 3) * 0.05; return clock > 1.6 })
    await sway
    parent.rotation.z = 0
    player.rotation.z = 0
    await walkPerson(parent, player.position.x + 0.15, player.position.z - 0.95, 0.8)
    face(parent, player.position.x, player.position.z)
    // the money
    await line(call, style.lines.money.replace('{amount}', pocket), [`\u{1F4B5} Thanks, ${call}`])
    run.stats.money = (run.stats.money || 0) + pocket
    host.dataset.money = String(pocket)
    ctx.onMoney?.(pocket)
    ctx.onUpdate()
    await line(call, style.lines.gate3, [`\u{1F44B} Bye, ${call}`])
    closeCard()
    // back in the car, round the drop-off circle and out of the gate
    say('leave')
    await walkAround(parent, driver.x, driver.z)
    await walkPerson(parent, carBox.maxX - 0.2, driver.z, 0.8) // (steps in at the driver's door)
    parent.visible = false
    soundLoop('bus_engine', true)
    // a U-turn in front of the gate and away down the road
    await drive([stop, { x: stop.x + 0.6, z: stop.z - 2.2 }, { x: stop.x + 3.0, z: stop.z - 2.4 }, { x: stop.x + 3.6, z: stop.z + 1.5 }, { x: stop.x + 3.6, z: stop.z + 9 }, { x: stop.x + 3.6, z: enter.z + 6 }], 6)
    soundLoop('bus_engine', false)
    scene.remove(car)
    car = null
    carBox = null
    ctx.keepOut?.(null)
    ctx.rig?.turnBehind(Math.PI) // now campus is in front of you
    // your suitcase rolls along beside you
    suitcase = new THREE.Group()
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), new THREE.MeshStandardMaterial({ color: 0x2b4f8f, roughness: 0.5 }))
    box.position.y = 0.36
    box.castShadow = true
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), new THREE.MeshStandardMaterial({ color: 0x1c1915 }))
    pole.position.set(0, 0.88, -0.05)
    pole.rotation.x = 0.35
    suitcase.add(box, pole)
    suitcase.position.set(0.38, 0, -0.18)
    suitcase.name = 'suitcase'
    player.add(suitcase)
    say('walk')
    host.dataset.suitcase = '1'
    // walk there yourself (the dots), or this walks you there
    walkBtn.textContent = `\u{1F9F3} Take my bags to ${ctx.house}`
    walkBtn.hidden = false
    walkBtn.onclick = () => ctx.walkTo?.(ctx.door.x, ctx.door.z)
  }

  async function atDoor() {
    say('door')
    walkBtn.hidden = true
    if (suitcase) { player.remove(suitcase); suitcase = null }
    host.dataset.suitcase = '0'
    const look = ctx.roommate === 'Sipho'
      ? { model: 'male-a', skin: 'brown', outfit: 'jacket', topColor: '#1d7fb8', bottomColor: '#3a2f4f' }
      : { model: 'female-b', skin: 'deep', outfit: 'hoodie', topColor: '#d9534f', hairColor: '#f0c400', bottomColor: '#2b3a55' }
    roommate = createAvatar(look)
    roommate.name = 'roommate-door'
    roommate.userData.pose = 'stand'
    roommate.position.set(ctx.door.x + 1.1, 0, ctx.door.z - 0.2)
    face(roommate, player.position.x, player.position.z)
    face(player, roommate.position.x, roommate.position.z)
    scene.add(roommate)
    people.push(roommate)
    await line(ctx.roommate, `You must be my roommate! I'm ${ctx.roommate}. Welcome to ${ctx.house}. Drop your bags, we'll unpack later. You've got a 9:00 lecture!`, [`\u{1F44B} Hi, ${ctx.roommate}!`])
    closeCard()
    say('done')
    ctx.onDone()
  }

  const api = {
    get phase() { return phase },
    // (while the car comes and goes and while the card is up, you stay put)
    get holding() { return phase === 'arrive' || phase === 'goodbye' || phase === 'leave' || phase === 'door' },
    get wantsDoor() { return phase === 'walk' },
    update(dt) {
      for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].update(dt)) { tasks[i].resolve(); tasks.splice(i, 1) }
      for (const a of people) if (a.visible) poseAvatar(a, Boolean(a.userData.walking), performance.now() / 1000)
      if (car && !player.visible) { player.position.x = car.position.x; player.position.z = car.position.z }
    },
    arrive() { if (phase === 'walk') atDoor() },
    // (tests, read only) where the car and your parent are right now
    report() {
      let box = null
      if (car) { car.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(car); box = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z } }
      return { phase, car: box, keep: keepRect, blocker, carHalf, parent: parent && { x: parent.position.x, z: parent.position.z, visible: parent.visible } }
    },
    stop() {
      for (const t of tasks) t.resolve()
      tasks.length = 0
      soundLoop('bus_engine', false)
      ctx.keepOut?.(null)
      if (car) scene.remove(car)
      for (const a of people) scene.remove(a)
      if (suitcase) player.remove(suitcase)
      card.remove()
      caption.remove()
      walkBtn.remove()
      player.visible = true
    },
  }
  run_().catch((e) => console.error(e))
  return api
}
