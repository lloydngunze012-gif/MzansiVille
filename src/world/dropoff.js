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
  function drive(points, seconds) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'catmullrom', 0.3)
    let t = 0
    return task((dt) => {
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
    player.position.set(stop.x - 1.5, 0, stop.z + 0.3)
    face(player, stop.x, stop.z - 3)
    player.visible = true
    parent.position.set(stop.x + 1.4, 0, stop.z - 0.4)
    parent.visible = true
    await walkPerson(parent, stop.x + 0.2, stop.z - 2.9)
    await walkPerson(parent, player.position.x + 0.15, player.position.z - 0.95)
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
    await walkPerson(parent, player.position.x + 0.2, player.position.z - 0.95, 0.8)
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
    await walkPerson(parent, stop.x + 0.2, stop.z - 2.9)
    await walkPerson(parent, stop.x + 1.4, stop.z - 0.4)
    parent.visible = false
    soundLoop('bus_engine', true)
    // a U-turn in front of the gate and away down the road
    await drive([stop, { x: stop.x + 0.6, z: stop.z - 2.2 }, { x: stop.x + 3.0, z: stop.z - 2.4 }, { x: stop.x + 3.6, z: stop.z + 1.5 }, { x: stop.x + 3.6, z: stop.z + 9 }, { x: stop.x + 3.6, z: enter.z + 6 }], 6)
    soundLoop('bus_engine', false)
    scene.remove(car)
    car = null
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
    stop() {
      for (const t of tasks) t.resolve()
      tasks.length = 0
      soundLoop('bus_engine', false)
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
