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
const camTarget = new THREE.Vector3()
const camWant = new THREE.Vector3()
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
  scene.background = new THREE.Color(0x3a2a22)
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
  hemi = new THREE.HemisphereLight(0xfff1dc, 0x4a3a30, 1.4)
  scene.add(hemi)
  sun = new THREE.DirectionalLight(0xfff0d8, 1.6)
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
  box(14, 0.2, 16, 0x8a6a4a, 0, -0.1, 1)          // floor
  box(14, 6, 0.3, 0xe9dcc4, 0, 3, -6.5)          // front wall
  box(0.3, 6, 16, 0xdcccb0, -7, 3, 1)            // left wall
  box(0.3, 6, 16, 0xdcccb0, 7, 3, 1)             // right wall
  box(5, 0.5, 2, 0x6b4a33, -1, 0.25, -5)         // stage
  box(1.2, 1.1, 0.6, 0x5a3c28, 1.2, 1.05, -4.6)  // lectern
  // Tiered rows: a step, a desk and a bench per row.
  for (let r = 0; r < ROWS; r++) {
    if (r) box(12, rowY(r), ROW_GAP, 0x7a5a3e, -0.6, rowY(r) / 2, rowZ(r))
    box(8, 0.08, 0.5, 0xb88a5a, -0.6, rowY(r) + 0.95, rowZ(r) - 0.75)
    box(8, 0.12, 0.55, 0x4a3426, -0.6, rowY(r) + 0.5, rowZ(r) + 0.05)
  }
  // Door at the back right.
  box(1.4, 2.6, 0.12, 0x6b3f22, AISLE_X, 1.3, 9)
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
    camTarget.set(seatX(ps), rowY(pr) + 1.2, rowZ(pr))
    gesture(lecturer, 'interact-right')
  } else if (moment.id === 'load_shedding') {
    sfx('door')
    boardText(['', ''], true)
    await tween(0.8, (k) => { hemi.intensity = 1.4 - k * 1.1; sun.intensity = 1.6 - k * 1.5 })
  } else if (moment.id === 'sleeper') {
    const sleeper = students.find((s) => s.userData.seat?.startsWith(`${Math.max(0, pr - 1)}:`)) || students[0]
    camTarget.copy(sleeper.position).add(new THREE.Vector3(0, 1, 0))
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
  hemi.intensity = 1.4
  sun.intensity = 1.6
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
  await walk(player, [[AISLE_X, 0, 6.5]])
  setStep('walk-in')
  caption(v.caption)
  say(v.lecturer_line)
  gesture(lecturer, late ? 'emote-no' : 'interact-right')
  await wait(1.6)
  say(v.student_line)
  await wait(1.2)

  // 2. find a seat
  setStep('seat')
  const options = LINES.find_seat.options
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
  await walk(player, [[AISLE_X, rowY(r), z + 0.6], [x, rowY(r), z + 0.6], [x, y, z]])
  player.rotation.y = Math.PI
  player.userData.pose = 'sit'
  // Seated: look past your row toward the lecturer and the board.
  camTarget.set(x * 0.5 - 0.5, y + 1.6, (z - 4.9) / 2)
  addDelta(total, seat.deltas)
  floatDelta(seat.deltas)
  if (seat.id === 'zanele') say(seat.zanele)
  else say({ who: 'zanele', text: seat.zanele.text })
  await wait(1.8)

  // 3. something happens
  const moment = LINES.moments[Math.floor(Math.random() * LINES.moments.length)]
  host.dataset.moment = moment.id
  setStep('moment')
  caption(moment.caption)
  say(null)
  await playMoment(moment, mySeat)
  say(moment.line)
  await wait(1.2)

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
  const reaction = LINES.zanele_lines.find((l) => l.when === outcome.tone)
  if (seat.id === 'zanele' && reaction) say(reaction)
  else say(null)
  if (moment.id === 'load_shedding') {
    await wait(1.4)
    boardText(['Welcome to SMIG', 'Lecture 1'])
    await tween(0.6, (k) => { hemi.intensity = 0.3 + k * 1.1; sun.intensity = 0.1 + k * 1.5 })
  } else await wait(2.2)
  clipboard.position.y = -5

  // 5. the bell
  setStep('end')
  caption(LINES.end_of_lecture.bell)
  say(LINES.end_of_lecture.lecturer_line)
  for (const student of students) student.userData.pose = 'stand'
  player.userData.pose = 'stand'
  walkers = students.slice(0, 6)
  for (const [i, student] of walkers.entries()) {
    const sx = student.position.x
    const sz = student.position.z
    walk(student, [[sx, student.position.y, sz + 0.6], [AISLE_X, student.position.y, sz + 0.6], [AISLE_X, 0, 9.5 + i * 0.1]], 2 + i * 0.2)
  }
  await wait(1.6)
  const end = seat.id === 'zanele' ? LINES.zanele_lines.find((l) => l.when === 'end') : LINES.zanele_lines.find((l) => l.when === 'end_alone')
  say(end)
  await wait(1.2)

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
    camWant.set(camTarget.x + 1.2, camTarget.y + 3.4, camTarget.z + 6.8)
    camera.position.lerp(camWant, Math.min(1, dt * 2.5))
    camLook.lerp(camTarget, Math.min(1, dt * 3))
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
