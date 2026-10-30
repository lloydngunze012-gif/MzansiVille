// Day 1, 9:00 lecture in SMIG: walk in, pick a seat, one random moment, a choice,
// a result, the bell. Lines come from data/campusville/day1_lecture.json.
// Loaded lazily (own chunk) from main.js, like the morning.
import * as THREE from 'three'
import LINES from '../../data/campusville/day1_lecture.json'
import { genderOf, roommateOf } from '../avatar.js'
import { sfx, loop as soundLoop } from '../audio.js'
import { createAvatar, CROWD_MODELS, gesture, poseAvatar } from './avatar3d.js'

const LECTURE = 9 * 60
const SPEED = 2.6
const ROWS = 4
const SEATS = 6
const SEAT_GAP = 1.2
const ROW_GAP = 1.9
const AISLE_X = 4.6
const TOPS = ['#2e8b57', '#ff8a3d', '#1d7fb8', '#e8497a', '#7b3fe4', '#f7f4ee', '#d9534f', '#2456a6', '#1c1915']

let host, uiRoot, renderer, scene, camera, hemi, sun, board, boardCtx, boardTex
let frame = 0
let last = 0
let clock = 0
let tasks = []
let running = false
let opts = null
let player = null
let roommate = null
let lecturer = null
let students = []
let walkers = []
let clipboard = null
let hallDoor = null
// Up (or down) the stepped aisle one row at a time, never through the tiers.
function aisleTo(r) {
  const pts = [[AISLE_X, 0, 7]]
  for (let i = ROWS - 1; i >= r; i--) pts.push([AISLE_X, rowY(i), rowZ(i) + 0.95])
  return pts
}
const doorTo = (open) => tween(0.5, (k) => { hallDoor.rotation.y = open ? -1.6 * k : -1.6 * (1 - k) })
const camTarget = new THREE.Vector3()
const camWant = new THREE.Vector3()
// A set shot (position + look) overrides the follow camera: board, lecturer, you.
let shot = null
const HEMI = 2.3
const SUN = 2.4
const SHOTS = {
  board: { pos: [0.6, 3.6, 4.2], look: [-1, 3.4, -6.3] },
  lecturer: { pos: [1.6, 2.3, -1.2], look: [0, 1.5, -4.9] },
}
function setShot(name, custom) {
  const s = custom || SHOTS[name]
  shot = s ? { pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look) } : null
  // Set shots cut straight there; a glide would fly the camera through the desks.
  if (shot && camera) { camera.position.copy(shot.pos); camLook.copy(shot.look) }
  if (host) host.dataset.shot = s ? (name || 'custom') : 'follow'
}
const camLook = new THREE.Vector3()

// ---------- tiny task runner (same idea as the morning) ----------
function task(update) {
  return new Promise((resolve) => tasks.push({ update, resolve }))
}
const wait = (s) => { let t = 0; return task((dt) => (t += dt) >= s) }
function tween(s, fn) {
  let t = 0
  return task((dt) => { t = Math.min(s, t + dt); const k = t / s; fn(k * k * (3 - 2 * k)); return t >= s })
}
function walk(who, pts, speed = SPEED) {
  const path = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  who.userData.walking = true
  return task((dt) => {
    let left = speed * dt
    while (left > 0 && path.length) {
      const to = path[0]
      const d = who.position.distanceTo(to)
      if (d <= left) { who.position.copy(to); path.shift(); left -= d; continue }
      const step = to.clone().sub(who.position).multiplyScalar(left / d)
      who.position.add(step)
      if (Math.abs(step.x) + Math.abs(step.z) > 1e-4) who.rotation.y = Math.atan2(step.x, step.z)
      left = 0
    }
    if (!path.length) { who.userData.walking = false; return true }
    return false
  })
}

// ---------- lines ----------
let male = false
let roomie = 'Zanele'
function words(text) {
  if (!male || typeof text !== 'string') return text
  return text.replace(/Zanele/g, roomie)
    .replace(/\bShe\b/g, 'He').replace(/\bshe\b/g, 'he')
    .replace(/\bherself\b/g, 'himself').replace(/\bher\b/g, 'him')
}
const WHO = { lecturer: 'Lecturer', student: 'Student', narrator: '', player: 'You' }
// Sipho's own lecture lines (day1_lecture.json "sipho"), Zanele's otherwise.
function roomieLine(when) {
  if (male && LINES.sipho?.lines?.[when]) return { who: 'zanele', text: LINES.sipho.lines[when] }
  return LINES.zanele_lines.find((l) => l.when === when)
}
function seatFor(option) {
  if (!male || !LINES.sipho) return option
  if (option.id === 'zanele') return { ...option, ...LINES.sipho.seat }
  const other = LINES.sipho.seat_other?.[option.id]
  return other ? { ...option, zanele: { who: 'zanele', text: other } } : option
}
function nameOf(who) {
  if (who === 'zanele') return roomie
  return WHO[who] ?? ''
}

// ---------- UI ----------
const uiq = (sel) => uiRoot.querySelector(sel)
function ui() {
  if (uiRoot) return
  document.body.insertAdjacentHTML('beforeend', `<div class="mm-ui lc-ui" id="lecture-ui" hidden>
    <p class="lc-caption" hidden></p>
    <p class="lc-say" hidden></p>
    <p class="mm-float lc-float" hidden></p>
    <div class="mm-bar" hidden></div>
    <div class="mm-card" hidden></div>
  </div>`)
  uiRoot = document.getElementById('lecture-ui')
}
function caption(text) {
  const node = uiq('.lc-caption')
  node.hidden = !text
  node.textContent = words(text || '')
}
function say(line) {
  const node = uiq('.lc-say')
  if (!line) { node.hidden = true; return }
  node.textContent = ''
  const name = nameOf(line.who)
  if (name) {
    const b = document.createElement('b')
    b.className = 'mm-name'
    b.textContent = name
    node.append(b)
  }
  node.append(document.createTextNode(words(line.text)))
  node.dataset.who = line.who
  node.hidden = false
}
function closeBar(bar) {
  bar.querySelectorAll('button').forEach((b) => { b.disabled = true; b.onclick = null })
  bar.hidden = true
  bar.innerHTML = ''
}
function prompt(label) {
  return new Promise((resolve) => {
    const bar = uiq('.mm-bar')
    bar.innerHTML = `<button type="button" class="mm-go" data-lc="go">${label}</button>`
    bar.hidden = false
    bar.querySelector('button').onclick = () => { closeBar(bar); resolve() }
  })
}
function choose(title, list) {
  return new Promise((resolve) => {
    const bar = uiq('.mm-bar')
    bar.innerHTML = `<p class="mm-q">${words(title)}</p>` + list.map((c, i) => `<button type="button" class="mm-go mm-choice" data-lc="choice" data-i="${i}"${c.disabled ? ' disabled' : ''}>${words(c.label)}${c.note ? `<small>${words(c.note)}</small>` : ''}</button>`).join('')
    bar.hidden = false
    bar.querySelectorAll('button:not([disabled])').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.i); closeBar(bar); resolve(i) } })
  })
}
const STAT_WORDS = { money: (d) => `${d > 0 ? '+' : '-'}R${Math.abs(d)}`, energy: (d) => `${d > 0 ? '+' : ''}${d} Energy`, hunger: (d) => `${d > 0 ? '+' : ''}${d} Fullness`, grades: (d) => `${d > 0 ? '+' : ''}${d} Grades`, social: (d) => `${d > 0 ? '+' : ''}${d} Social` }
function deltaHtml(delta) {
  return Object.entries(delta || {}).filter(([, d]) => d).map(([k, d]) => `<span class="${d > 0 ? 'up' : 'down'}">${STAT_WORDS[k](d)}</span>`).join(' ')
}
function floatDelta(delta) {
  const html = deltaHtml(delta)
  if (!html) return
  const node = uiq('.lc-float')
  node.innerHTML = html
  node.hidden = false
  node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop')
  setTimeout(() => { node.hidden = true }, 1800)
}

// Lines stay until the player taps anywhere that is not a button (?talk=auto: tests).
const AUTO_TALK = new URLSearchParams(location.search).get('talk') === 'auto'
function tapNext(node) {
  node?.classList.add('tap')
  return new Promise((resolve) => {
    const done = () => { node?.classList.remove('tap'); window.removeEventListener('pointerup', onTap, true); resolve() }
    const onTap = (event) => {
      if (event.target.closest?.('button')) return
      if (performance.now() - since < 250) return
      done()
    }
    const since = performance.now()
    if (AUTO_TALK) { setTimeout(done, 700); return }
    window.addEventListener('pointerup', onTap, true)
  })
}

// ---------- room ----------
const rowY = (r) => r * 0.38
const rowZ = (r) => -2 + r * ROW_GAP
const seatX = (s) => -3.6 + s * SEAT_GAP

function boardText(lines, dark = false) {
  boardCtx.fillStyle = dark ? '#0b0f0b' : '#1f3d2b'
  boardCtx.fillRect(0, 0, 512, 256)
  boardCtx.fillStyle = dark ? '#33402f' : '#f4f1e6'
  boardCtx.font = 'bold 40px sans-serif'
  boardCtx.textAlign = 'center'
  lines.forEach((text, i) => boardCtx.fillText(text, 256, 80 + i * 60))
  boardTex.needsUpdate = true
}

function build() {
  host = document.createElement('div')
  host.id = 'lecture3d'
  document.body.prepend(host)
  ui()
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  host.prepend(renderer.domElement)
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf3e6cc)
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
  hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a7360, HEMI)
  scene.add(hemi)
  sun = new THREE.DirectionalLight(0xfff0d8, SUN)
  sun.position.set(-4, 10, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(sun)

  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  const box = (w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }
  box(14, 0.2, 16, 0xa07e58, 0, -0.1, 1)          // floor
  // Ceiling strip lights: the hall is bright except during load shedding.
  for (const z of [-3, 1, 5]) {
    const strip = box(6, 0.08, 0.4, 0xfffbe8, -0.6, 5.6, z)
    strip.material.emissive = new THREE.Color(0xfff6d8)
    strip.name = 'strip'
    const light = new THREE.PointLight(0xfff2dc, 9, 14, 1.6)
    light.position.set(-0.6, 5.2, z)
    light.name = 'strip-light'
    scene.add(light)
  }
  box(14, 6, 0.3, 0xf6ecd8, 0, 3, -6.5)          // front wall
  box(0.3, 6, 16, 0xeadcc2, -7, 3, 1)            // left wall
  box(0.3, 6, 16, 0xeadcc2, 7, 3, 1)             // right wall
  box(5, 0.5, 2, 0x6b4a33, -1, 0.25, -5)         // stage
  box(1.2, 1.1, 0.6, 0x5a3c28, 1.2, 1.05, -4.6)  // lectern
  // Tiered rows: a step, a desk and a bench per row.
  for (let r = 0; r < ROWS; r++) {
    if (r) box(12, rowY(r), ROW_GAP, 0x7a5a3e, -0.6, rowY(r) / 2, rowZ(r))
    box(8, 0.08, 0.5, 0xb88a5a, -0.6, rowY(r) + 0.95, rowZ(r) - 0.75)
    box(8, 0.12, 0.55, 0x4a3426, -0.6, rowY(r) + 0.5, rowZ(r) + 0.05)
  }
  // Door at the back right, on a hinge: it opens before anyone walks through.
  hallDoor = new THREE.Group()
  hallDoor.position.set(AISLE_X - 0.7, 0, 9)
  scene.add(hallDoor)
  const leaf = box(1.4, 2.6, 0.12, 0x6b3f22, 0.7, 1.3, 0)
  scene.remove(leaf)
  hallDoor.add(leaf)
  // Chalkboard with the day's title.
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  boardCtx = canvas.getContext('2d')
  boardTex = new THREE.CanvasTexture(canvas)
  boardTex.colorSpace = THREE.SRGBColorSpace
  board = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), new THREE.MeshBasicMaterial({ map: boardTex }))
  board.position.set(-1, 3.2, -6.3)
  scene.add(board)
  // The register clipboard for the "register" moment.
  clipboard = box(0.45, 0.04, 0.6, 0xf4f1e6, 0, -5, 0)
  window.addEventListener('resize', () => {
    if (!renderer) return
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  })
}

// Ceiling strips on (1) or off (0, load shedding).
function lights(level) {
  scene.traverse((node) => {
    if (node.name === 'strip-light') node.intensity = 9 * level
    if (node.name === 'strip') node.material.emissiveIntensity = level
  })
}

function seatPos(r, s) {
  return [seatX(s), rowY(r) + 0.12, rowZ(r)]
}

function place(avatar, r, s) {
  const [x, y, z] = seatPos(r, s)
  avatar.position.set(x, y, z)
  avatar.rotation.y = Math.PI
  avatar.userData.pose = 'sit'
}

function populate(late) {
  for (const s of students) scene.remove(s)
  students = []
  const free = new Set(['0:2', '3:0', '1:4'])
  if (late) free.delete('0:2') // late: the front row fills up
  const roomieSeat = '1:5'
  let n = 0
  for (let r = 0; r < ROWS; r++) {
    for (let s = 0; s < SEATS; s++) {
      const key = `${r}:${s}`
      if (free.has(key) || key === roomieSeat) continue
      if ((r * 7 + s * 3) % 5 === 0) continue // a few empty seats
      const model = CROWD_MODELS[n % CROWD_MODELS.length]
      const avatar = createAvatar({ model, gender: model.startsWith('female') ? 'female' : 'male', skin: ['sand', 'amber', 'brown', 'deep', 'ebony'][(n * 3) % 5], outfit: 'hoodie', topColor: TOPS[n % TOPS.length] })
      place(avatar, r, s)
      avatar.userData.seat = key
      scene.add(avatar)
      students.push(avatar)
      n += 1
    }
  }
  roommate = createAvatar(male
    ? { model: 'male-a', skin: 'brown', outfit: 'jacket', topColor: '#1d7fb8', bottomColor: '#3a2f4f' }
    : { model: 'female-b', skin: 'deep', outfit: 'hoodie', topColor: '#d9534f', hairColor: '#f0c400', bottomColor: '#2b3a55' })
  place(roommate, 1, 5)
  scene.add(roommate)
  students.push(roommate)
}

function setStep(name) {
  host.dataset.step = name
}

// ---------- the beats ----------
function pickWeighted(outcomes) {
  let roll = Math.random()
  for (const outcome of outcomes) {
    roll -= outcome.weight
    if (roll <= 0) return outcome
  }
  return outcomes[outcomes.length - 1]
}

function addDelta(total, delta) {
  for (const [k, v] of Object.entries(delta || {})) total[k] = (total[k] || 0) + v
}

async function playMoment(moment, mySeat) {
  const [pr, ps] = mySeat
  if (moment.id === 'cold_call') {
    // Close on the lecturer pointing at you while you decide.
    setShot('lecturer')
    gesture(lecturer, 'interact-right')
    void ps
  } else if (moment.id === 'load_shedding') {
    sfx('door')
    boardText(['', ''], true)
    await tween(0.8, (k) => { hemi.intensity = HEMI * (1 - k * 0.85); sun.intensity = SUN * (1 - k * 0.95); lights(1 - k) })
  } else if (moment.id === 'sleeper') {
    const sleeper = students.find((s) => s.userData.seat?.startsWith(`${Math.max(0, pr - 1)}:`)) || students[0]
    const p = sleeper.position
    setShot(null, { pos: [p.x + 1.4, p.y + 2.4, p.z + 3], look: [p.x, p.y + 1, p.z] })
    await tween(1.4, (k) => { sleeper.rotation.x = k * 0.5 })
  } else if (moment.id === 'pen') {
    const near = students.find((s) => s.userData.seat === `${pr}:${ps + 1}`) || students.find((s) => s.userData.seat === `${pr}:${ps - 1}`) || students[0]
    gesture(near, 'interact-left')
    await wait(0.6)
  } else if (moment.id === 'register') {
    const [x, y, z] = seatPos(pr, 0)
    clipboard.position.set(x - 1, y + 1, z - 0.7)
    await tween(1.6, (k) => { clipboard.position.x = x - 1 + (seatX(ps) - x + 1) * k })
  }
}

async function play() {
  const run = opts.run
  const late = run.minutes > LECTURE
  const total = {}
  boardText(['Welcome to SMIG', 'Lecture 1'])
  hemi.intensity = HEMI
  sun.intensity = SUN
  lights(1)
  setShot(null)
  clipboard.position.y = -5
  populate(late)
  lecturer = createAvatar({ model: 'male-d', skin: 'deep', outfit: 'jacket', topColor: '#5b4a3a', bottomColor: '#2b2b2b' })
  lecturer.position.set(0, 0.5, -4.9)
  scene.add(lecturer)
  player = createAvatar(run.character?.avatar)
  host.dataset.look = JSON.stringify(player.userData.look)
  player.position.set(AISLE_X, 0, 8.4)
  player.rotation.y = Math.PI
  scene.add(player)
  camTarget.set(AISLE_X, 1.2, 6)
  camera.position.set(AISLE_X + 1, 3.5, 12)
  camLook.copy(camTarget)

  // 1. walk in
  setStep('arrive')
  caption(LINES.arrive_venue.caption)
  say(LINES.arrive_venue.lecturer_line)
  sfx('door')
  const v = late ? LINES.walk_in.late : LINES.walk_in.on_time
  hallDoor.rotation.y = 0
  await doorTo(true)
  await walk(player, [[AISLE_X, 0, 6.5]])
  doorTo(false)
  setStep('walk-in')
  setShot('board')
  caption(v.caption)
  say(v.lecturer_line)
  gesture(lecturer, late ? 'emote-no' : 'interact-right')
  await tapNext(uiq('.lc-say'))
  say(v.student_line)
  await tapNext(uiq('.lc-say'))

  // 2. find a seat
  setStep('seat')
  const options = LINES.find_seat.options.map(seatFor)
  const pick = await choose(LINES.find_seat.prompt, options.map((o) => ({
    label: o.label,
    note: late && !o.available_late ? 'Taken' : o.note,
    disabled: late && !o.available_late,
  })))
  const seat = options[pick]
  host.dataset.seat = seat.id
  const mySeat = seat.id === 'front' ? [0, 2] : seat.id === 'back' ? [3, 0] : [1, 4]
  const [r, s] = mySeat
  const [x, y, z] = seatPos(r, s)
  caption(seat.line)
  say(null)
  setShot(null)
  // Up the stepped aisle, along the gap behind your row, then into the seat.
  await walk(player, [...aisleTo(r), [AISLE_X, rowY(r), z + 0.6], [x, rowY(r), z + 0.6], [x, y, z]])
  player.rotation.y = Math.PI
  player.userData.pose = 'sit'
  // Seated: over your shoulder, up toward the board and the lecturer.
  camTarget.set(x, y + 1.2, z)
  setShot(null, { pos: [x * 0.7, y + 3.2, z + 3], look: [-0.6, 3.2, -6] })
  addDelta(total, seat.deltas)
  floatDelta(seat.deltas)
  if (seat.id === 'zanele') say(seat.zanele)
  else say({ who: 'zanele', text: seat.zanele.text })
  await tapNext(uiq('.lc-say'))

  // 3. something happens
  // ?moment=<id> picks one (tests and screenshots); otherwise random.
  const forced = LINES.moments.find((m) => m.id === new URLSearchParams(location.search).get('moment'))
  const moment = forced || LINES.moments[Math.floor(Math.random() * LINES.moments.length)]
  host.dataset.moment = moment.id
  setStep('moment')
  caption(moment.caption)
  say(null)
  await playMoment(moment, mySeat)
  say(moment.line)
  await tapNext(uiq('.lc-say'))

  // 4. a choice and its result
  setStep('choice')
  const choice = moment.choices[await choose(moment.title, moment.choices)]
  const outcome = pickWeighted(choice.outcomes)
  host.dataset.tone = outcome.tone
  setStep('result')
  caption(outcome.text)
  addDelta(total, outcome.deltas)
  floatDelta(outcome.deltas)
  if (outcome.tone === 'good') gesture(player, 'emote-yes')
  else if (outcome.tone === 'bad') gesture(player, 'emote-no')
  const reaction = roomieLine(outcome.tone)
  if (seat.id === 'zanele' && reaction) say(reaction)
  else say(null)
  await tapNext(uiq(seat.id === 'zanele' && reaction ? '.lc-say' : '.lc-caption'))
  if (moment.id === 'load_shedding') {
    boardText(['Welcome to SMIG', 'Lecture 1'])
    await tween(0.6, (k) => { hemi.intensity = HEMI * (0.15 + k * 0.85); sun.intensity = SUN * (0.05 + k * 0.95); lights(k) })
  }
  clipboard.position.y = -5

  // 5. the bell
  setStep('end')
  setShot('board')
  caption(LINES.end_of_lecture.bell)
  say(LINES.end_of_lecture.lecturer_line)
  for (const student of students) student.userData.pose = 'stand'
  player.userData.pose = 'stand'
  // A few leave one after another: along their row, down the aisle, out the door.
  walkers = students.filter((s) => s !== roommate).slice(0, 5)
  doorTo(true)
  walkers.forEach((student, i) => {
    const [r2] = (student.userData.seat || '0:0').split(':').map(Number)
    const sx = student.position.x
    const sz = student.position.z
    const y = rowY(r2)
    wait(i * 0.9).then(() => walk(student, [[sx, y, sz + 0.6], [AISLE_X, y, sz + 0.6], ...aisleTo(r2).reverse(), [AISLE_X, 0, 9.6], [AISLE_X, 0, 11]], 2.2))
  })
  await tapNext(uiq('.lc-say'))
  const end = roomieLine(seat.id === 'zanele' ? 'end' : 'end_alone')
  say(end)
  await tapNext(uiq('.lc-say'))

  // Done card: what this lecture gave you (the normal lecture gain is added by the game).
  setStep('done')
  const card = uiq('.mm-card')
  card.innerHTML = `<p class="mm-kind">SMIG · 09:00</p><h2>${words(LINES.goal.done)}</h2>
    <p>${words(LINES.end_of_lecture.summary.line)}</p>
    <p class="lc-deltas">${deltaHtml(total) || 'No extras today.'}</p>
    <button type="button" class="mm-go" data-lc="done">Back to campus</button>`
  card.hidden = false
  caption('')
  say(null)
  await new Promise((resolve) => { card.querySelector('button').onclick = () => { card.hidden = true; resolve() } })
  opts.onDone({ seat: seat.id, moment: moment.id, tone: outcome.tone, deltas: total })
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now
  clock += dt
  tasks = tasks.filter((t) => { if (t.update(dt)) { t.resolve(); return false } return true })
  for (const who of [player, lecturer, ...students]) if (who) poseAvatar(who, Boolean(who.userData.walking), clock)
  soundLoop('footsteps', Boolean(player?.userData.walking))
  if (player) {
    if (player.userData.walking) camTarget.set(player.position.x, player.position.y + 1.2, player.position.z - 1)
    if (shot) camWant.copy(shot.pos)
    else camWant.set(camTarget.x + 1.2, camTarget.y + 3.4, camTarget.z + 6.8)
    camera.position.lerp(camWant, Math.min(1, dt * 2.5))
    camLook.lerp(shot ? shot.look : camTarget, Math.min(1, dt * 3))
    camera.lookAt(camLook)
  }
  renderer.render(scene, camera)
}

export function startLecture(options) {
  opts = options
  if (!renderer) build()
  host.hidden = false
  uiRoot.hidden = false
  if (running) return
  running = true
  tasks = []
  roomie = roommateOf(opts.run.character?.avatar)
  male = genderOf(opts.run.character?.avatar) === 'male'
  host.dataset.roomie = roomie
  for (const node of uiRoot.children) node.hidden = true
  for (const who of [player, lecturer]) if (who) scene.remove(who)
  last = 0
  if (!frame) frame = requestAnimationFrame(tick)
  play().catch((error) => console.error(error)).finally(() => { running = false })
}

export function stopLecture() {
  running = false
  tasks.forEach((t) => t.resolve())
  tasks = []
  soundLoop('footsteps', false)
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (host) { host.hidden = true; uiRoot.hidden = true }
}
