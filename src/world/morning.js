// Day 1 morning slice: wake in the O Block room, noodles at the kettle, walk to the
// bus stop, ride the bus to campus. Loaded lazily (own chunk) from main.js.
import * as THREE from 'three'
import { loop as soundLoop, sfx } from '../audio.js'
import { genderOf, roommateOf } from '../avatar.js'
import { createAvatar, gesture, markStandIn, poseAvatar } from './avatar3d.js'
import LINES from '../../data/campusville/day1_morning.json'

const WAKE = 7 * 60
const BUS_FIRST = 8 * 60 + 20
const BUS_EVERY = 15
const RIDE = 20
const BUS_DELAY = 25
const SNOOZE = 10
const SNOOZE_MAX = 3
let ROOMIE = 'Zanele'

// Named spots in the morning scene (same names as world-designer's morning.json anchors), as 3D [x, z].
export const ANCHORS = {
  bed: [-2.1, -1.1],
  kettle: [0.9, -1.85],
  noodle_shelf: [1.55, -2.55],
  roommate: [2.1, -0.4],
  door: [2.4, 1.2],
  arrive: [71.5, 5.0],
  bench: [16, 4.9],
  sign: [16, 4.6],
  waiting: [15.6, 4.6],
  bus_lane: [14, 7.4],
  bus_stop: [15.4, 6.2],
  campus: [70, 0],
}

// Lines come from data/campusville/day1_morning.json (keys checked by npm run check); the fallback keeps the game safe.
export function line(path, fallback, vars) {
  let text = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), LINES)
  if (text && typeof text === 'object' && typeof text.text === 'string') text = text.text
  if (typeof text !== 'string' || !text) text = fallback
  // Sipho has his own lines; anything he has no line for falls back to the swap.
  if (maleRoom && typeof LINES.sipho?.lines?.[path] === 'string') text = LINES.sipho.lines[path]
  text = forGender(text)
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text
}
// The lines are written for Zanele and a female student; swap names and words
// when the student (and so the roommate) is male.
let maleRoom = false
function forGender(text) {
  if (!maleRoom) return text
  return text
    .replace(/Zanele/g, ROOMIE)
    .replace(/\bShe\b/g, 'He').replace(/\bshe\b/g, 'he')
    .replace(/\bherself\b/g, 'himself').replace(/\bher\b/g, 'his')
    .replace(/\bmy girl\b/g, 'my boy')
}
const ON_TIME_BY = 9 * 60
const LECTURE = 9 * 60
const SPEED = 2.4

let cup, halo, kettleLight, fade
let host, renderer, scene, camera, player, roommate, kettle, steamGroup, bowl, packet, door, bus, busDoor, marker, sign
let opts = null
let running = false
let frame = 0
let last = 0
let clock = 0
let tasks = []
let camTarget = new THREE.Vector3()
let camOffset = new THREE.Vector3(0, 6.5, 7.5)
let camLook = new THREE.Vector3()
let walking = { player: false, roommate: false }
let tapHandler = null
let tapTargets = []
let idle = 0
let idleOn = false
let step = ''
const ray = new THREE.Raycaster()
const v = new THREE.Vector3()

function fmt(m) {
  const h = Math.floor(m / 60)
  const mm = Math.round(m % 60)
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// ---------- tiny task runner ----------
function task(update) {
  return new Promise((resolve) => tasks.push({ update, resolve }))
}
const wait = (s) => { let t = 0; return task((dt) => (t += dt) >= s) }
function tween(s, fn, ease = (x) => x * x * (3 - 2 * x)) {
  let t = 0
  return task((dt) => { t = Math.min(s, t + dt); fn(ease(t / s)); return t >= s })
}
function walk(who, pts, speed = SPEED) {
  const key = who === player ? 'player' : 'roommate'
  const path = pts.map(([x, z]) => new THREE.Vector3(x, 0, z))
  walking[key] = true
  return task((dt) => {
    let left = speed * dt
    while (left > 0 && path.length) {
      const to = path[0]
      const d = Math.hypot(to.x - who.position.x, to.z - who.position.z)
      if (d <= left) { who.position.x = to.x; who.position.z = to.z; path.shift(); left -= d; continue }
      const k = left / d
      const dx = (to.x - who.position.x) * k
      const dz = (to.z - who.position.z) * k
      who.position.x += dx
      who.position.z += dz
      who.rotation.y = Math.atan2(dx, dz)
      left = 0
    }
    if (!path.length) { walking[key] = false; return true }
    return false
  })
}
// Grid A* inside the room so people walk around beds, desk and counter.
const CELL = 0.2
const BLOCKS = [
  [-2.65, -1.55, -2.9, -0.65], [1.55, 2.65, -2.9, -0.65], // beds
  [-2.95, -1.45, 1.1, 1.9], [-1.6, -1.0, 1.2, 1.8], // desk, chair
  [0.45, 1.95, -3, -2.3], // counter
]
const PAD = 0.25
function inRoom(x, z) { return x > -3 && x < 3.8 && z > -3 && z < 3 }
function free(x, z) {
  if (x < -2.75 || z < -2.75 || z > 2.85) return false
  if (x > 2.7 && (z < 0.75 || z > 1.65)) return false // wall, except the doorway
  if (x > 3.8) return false
  return !BLOCKS.some(([a, b, c, d]) => x > a - PAD && x < b + PAD && z > c - PAD && z < d + PAD)
}
function roomPath(fx, fz, tx, tz) {
  const key = (i, j) => `${i},${j}`
  const ci = (x) => Math.round(x / CELL)
  const [si, sj, gi, gj] = [ci(fx), ci(fz), ci(tx), ci(tz)]
  const open = [[si, sj]]
  const g = new Map([[key(si, sj), 0]])
  const came = new Map()
  const h = (i, j) => Math.hypot(i - gi, j - gj)
  let guard = 0
  while (open.length && guard++ < 4000) {
    open.sort((a, b) => (g.get(key(...a)) + h(...a)) - (g.get(key(...b)) + h(...b)))
    const [i, j] = open.shift()
    if (i === gi && j === gj) {
      const out = []
      let k = key(i, j)
      while (k) { const [a, b] = k.split(',').map(Number); out.unshift([a * CELL, b * CELL]); k = came.get(k) }
      out[out.length - 1] = [tx, tz]
      // drop collinear points
      return out.filter((p, n) => n === 0 || n === out.length - 1 || (out[n + 1][0] - p[0]) * (p[1] - out[n - 1][1]) !== (out[n + 1][1] - p[1]) * (p[0] - out[n - 1][0])).slice(1)
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [ni, nj] = [i + di, j + dj]
      const goal = ni === gi && nj === gj
      if (!goal && (!free(ni * CELL, nj * CELL) || (di && dj && (!free(ni * CELL, j * CELL) || !free(i * CELL, nj * CELL))))) continue
      const cost = g.get(key(i, j)) + Math.hypot(di, dj)
      if (cost < (g.get(key(ni, nj)) ?? Infinity)) { g.set(key(ni, nj), cost); came.set(key(ni, nj), key(i, j)); open.push([ni, nj]) }
    }
  }
  return [[tx, tz]]
}
function walkTo(who, x, z, speed) {
  const p = who.position
  const pts = inRoom(p.x, p.z) && inRoom(x, z) ? roomPath(p.x, p.z, x, z) : [[x, z]]
  if (who === player) host.dataset.path = String(pts.length)
  return walk(who, pts, speed)
}
function face(who, x, z) { who.rotation.y = Math.atan2(x - who.position.x, z - who.position.z) }

// ---------- clock + stats ----------
function addMinutes(n, seconds = 0.8) {
  const run = opts.run
  const from = run.minutes
  let shown = from
  return tween(seconds, (k) => {
    const now = Math.round(from + n * k)
    if (now !== shown) { shown = now; run.minutes = now; opts.onUpdate() }
  }, (x) => x)
}
function changeStats(delta) {
  const run = opts.run
  const caps = { money: 1e9, energy: run.energyCap || 100, hunger: 100, grades: 100, social: 100 }
  for (const [k, d] of Object.entries(delta)) run.stats[k] = Math.max(0, Math.min(caps[k], (run.stats[k] || 0) + d))
  const words = { money: (d) => `${d > 0 ? '+' : '-'}R${Math.abs(d)}`, energy: (d) => `${d > 0 ? '+' : ''}${d} Energy`, hunger: (d) => `${d > 0 ? '+' : ''}${d} Fullness`, grades: (d) => `${d > 0 ? '+' : ''}${d} Grades`, social: (d) => `${d > 0 ? '+' : ''}${d} Social` }
  const parts = Object.entries(delta).filter(([, d]) => d).map(([k, d]) => `<span class="${d > 0 ? 'up' : 'down'}">${words[k](d)}</span>`)
  const node = uiq('.mm-float')
  node.innerHTML = parts.join(' ')
  node.hidden = false
  node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop')
  setTimeout(() => { node.hidden = true }, 1800)
  opts.onUpdate()
}

// ---------- UI in the host ----------
let uiRoot = null
const uiq = (sel) => uiRoot.querySelector(sel)
function ui() {
  if (uiRoot) return
  document.body.insertAdjacentHTML('beforeend', `<div class="mm-ui" id="morning-ui">
    <p class="mm-float" hidden></p>
    <p class="mm-bubble" hidden></p>
    <p class="mm-tag" hidden>${ROOMIE}</p>
    <p class="mm-clock" hidden></p>
    <p class="mm-sign" hidden></p>
    <div class="mm-bar" hidden></div>
    <div class="mm-card" hidden></div>
    <div class="mm-fade" hidden><p></p></div>
  </div>`)
  uiRoot = document.getElementById('morning-ui')
}
// Buttons vanish the instant they are tapped so a second tap can never fire twice.
function closeBar(bar) {
  bar.querySelectorAll('button').forEach((b) => { b.disabled = true; b.onclick = null })
  bar.hidden = true
  bar.innerHTML = ''
}
function prompt(label, onTap) {
  const bar = uiq('.mm-bar')
  if (!label) { closeBar(bar); return }
  bar.innerHTML = `<button type="button" class="mm-go" data-mm="go">${label}</button>`
  bar.hidden = false
  bar.querySelector('button').onclick = () => { closeBar(bar); onTap() }
}
function choices(title, list) {
  return new Promise((resolve) => {
    const bar = uiq('.mm-bar')
    bar.innerHTML = `<p class="mm-q">${title}</p>` + list.map((c, i) => `<button type="button" class="mm-go mm-choice" data-mm="choice" data-i="${i}">${c.label}${c.note ? `<small>${c.note}</small>` : ''}</button>`).join('')
    bar.hidden = false
    bar.querySelectorAll('button').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.i); closeBar(bar); resolve(i) } })
  })
}
function bubble(text, who) {
  const node = uiq('.mm-bubble')
  if (!text) { node.hidden = true; node.dataset.who = ''; return }
  node.textContent = ''
  if (who === roommate) {
    const name = document.createElement('b')
    name.className = 'mm-name'
    name.textContent = ROOMIE
    node.append(name)
  }
  node.append(document.createTextNode(text))
  node.dataset.who = who === roommate ? 'roommate' : 'player'
  node.hidden = false
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
// Say a line and wait for the tap.
async function talk(text, who) {
  bubble(text, who)
  await tapNext(uiq('.mm-bubble'))
  bubble('')
}
// Big alarm clock: the minutes roll over when you snooze.
function clockShow(on) {
  const node = uiq('.mm-clock')
  node.hidden = !on
  if (on) node.innerHTML = `<span class="mm-roll"><b>${fmt(opts.run.minutes)}</b></span>`
}
async function clockRoll(add) {
  const node = uiq('.mm-clock')
  const from = fmt(opts.run.minutes)
  const to = fmt(opts.run.minutes + add)
  node.innerHTML = `<span class="mm-roll rolling"><b>${from}</b><b>${to}</b></span>`
  host.dataset.rolled = to
  await addMinutes(add, 0.9)
  node.innerHTML = `<span class="mm-roll"><b>${to}</b></span>`
}
// Zanele: red top, yellow headwrap. Sipho (for a male student): blue jacket.
// The capsule arms and wrap are only the stand-in until the rigged model loads.
function makeZanele() {
  const z = createAvatar(maleRoom
    ? { model: 'male-a', skin: 'brown', outfit: 'jacket', topColor: '#1d7fb8', bottomColor: '#3a2f4f' }
    : { model: 'female-b', skin: 'deep', outfit: 'hoodie', topColor: '#d9534f', hairColor: '#f0c400', bottomColor: '#2b3a55' })
  z.name = maleRoom ? 'sipho' : 'zanele'
  const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xf0c400, roughness: 0.7 }))
  wrap.position.y = 1.5
  wrap.scale.set(1, 1.25, 1)
  markStandIn(wrap)
  z.add(wrap)
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }))
  bud.position.set(0.21, 1.42, 0.03)
  markStandIn(bud)
  z.add(bud)
  const armMat = z.userData.bob.material
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(0.3 * side, 1.12, 0)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 3, 6), armMat)
    arm.position.y = -0.26
    arm.castShadow = true
    pivot.add(arm)
    pivot.name = side > 0 ? 'arm-r' : 'arm-l'
    markStandIn(pivot)
    z.add(pivot)
  }
  return z
}
function wave(who, seconds = 1.6) {
  if (who.userData.rigged) {
    host.dataset.wave = '1'
    const length = gesture(who, 'interact-right')
    return wait(Math.max(seconds, length))
  }
  const arm = who.getObjectByName('arm-r')
  if (!arm) return Promise.resolve()
  host.dataset.wave = '1'
  return tween(seconds, (k) => {
    const up = Math.min(1, k * 5, (1 - k) * 5)
    arm.rotation.z = up * (2.6 + Math.sin(k * Math.PI * 8) * 0.35)
  }, (x) => x)
}
function pinTo(node, obj, y) {
  if (!node || node.hidden || !obj) return
  v.set(obj.position.x, y, obj.position.z).project(camera)
  const bar = document.querySelector('.g-goal') || document.querySelector('.g-hud')
  const floor = (bar ? bar.getBoundingClientRect().bottom : 200) + 10
  const half = node.offsetWidth / 2 + 8
  node.style.left = `${Math.max(half, Math.min(window.innerWidth - half, (v.x * 0.5 + 0.5) * window.innerWidth))}px`
  // the node is drawn above its anchor (translateY -100%), so its top edge is top - height
  node.style.top = `${Math.max(floor + node.offsetHeight, (-v.y * 0.5 + 0.5) * window.innerHeight)}px`
}

// Wait for the player to tap the 3D target (or the big button).
function tapOn(objects, label, where) {
  return new Promise((resolve) => {
    tapTargets = objects
    marker.visible = true
    marker.position.set(where[0], 0.03, where[1])
    idleOn = true
    const go = () => { tapHandler = null; tapTargets = []; marker.visible = false; idleOn = false; prompt(''); resolve() }
    tapHandler = go
    prompt(label, go)
  })
}

// ---------- props ----------
function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }) }
function box(w, h, d, color, x, y, z, parent = scene, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra))
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}
function textTexture(lines, bg = '#2a1846', fg = '#f0c400', w = 512, h = 256) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  g.fillStyle = bg; g.fillRect(0, 0, w, h)
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
  lines.forEach((line, i) => { g.font = `bold ${i ? 44 : 60}px system-ui, sans-serif`; g.fillText(line, w / 2, h / (lines.length + 1) * (i + 1)) })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat(0xb5774a))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  // walls: back (with window), left, right (with door). Front left open like a dollhouse.
  box(6, 3, 0.15, 0xf3e3c6, 0, 1.5, -3).material.side = THREE.DoubleSide
  box(0.15, 3, 6, 0xeedcbc, -3, 1.5, 0)
  box(0.15, 3, 3.6, 0xeedcbc, 3, 1.5, -1.2)
  box(0.15, 3, 1.2, 0xeedcbc, 3, 1.5, 2.4)
  box(0.15, 0.9, 1.2, 0xeedcbc, 3, 2.55, 1.2)
  // window with golden light
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ color: 0xffd08a }))
  glass.position.set(0, 1.9, -2.91)
  scene.add(glass)
  box(1.95, 0.08, 0.1, 0x5b3a22, 0, 1.33, -2.88)
  box(1.95, 0.08, 0.1, 0x5b3a22, 0, 2.47, -2.88)
  box(0.06, 1.1, 0.1, 0x5b3a22, 0, 1.9, -2.88)
  // beds
  for (const [x, cover] of [[-2.1, 0x6b3fa0], [2.1, 0x2f7a5a]]) {
    box(1.1, 0.4, 2.1, 0x7a4b2a, x, 0.2, -1.7)
    box(1.0, 0.16, 2.0, cover, x, 0.48, -1.7)
    box(0.8, 0.14, 0.4, 0xfaf4e8, x, 0.6, -2.45)
  }
  // desk + chair + lamp
  box(1.4, 0.08, 0.7, 0x8c5a33, -2.2, 0.78, 1.5)
  for (const [dx, dz] of [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]]) box(0.06, 0.78, 0.06, 0x6a4024, -2.2 + dx, 0.39, 1.5 + dz)
  box(0.5, 0.06, 0.5, 0x3d2a5c, -1.3, 0.48, 1.5)
  box(0.3, 0.2, 0.05, 0x1c1915, -2.4, 0.95, 1.3) // book
  const lamp = new THREE.PointLight(0xffc27a, 6, 5, 2)
  lamp.position.set(-2.6, 1.4, 1.4)
  scene.add(lamp)
  box(0.08, 0.5, 0.08, 0xf0c400, -2.6, 1.07, 1.4)
  // counter shelf with kettle and noodles
  box(1.4, 0.9, 0.55, 0x8c5a33, 1.2, 0.45, -2.6)
  box(1.4, 0.06, 0.6, 0xd9c7a5, 1.2, 0.93, -2.6)
  kettle = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.3, 14), mat(0xe8e4dc, { metalness: 0.3, roughness: 0.35 }))
  body.position.y = 0.15
  kettle.add(body)
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.18, 8), body.material)
  spout.position.set(0.18, 0.2, 0); spout.rotation.z = -0.9
  kettle.add(spout)
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x552222 }))
  light.position.set(0, 0.06, 0.18); light.name = 'led'
  kettle.add(light)
  kettle.position.set(0.85, 0.96, -2.55)
  kettle.scale.setScalar(1.8)
  kettleLight = new THREE.PointLight(0xffd24a, 0, 2.5, 2)
  kettleLight.position.set(0.85, 1.6, -2.2)
  scene.add(kettleLight)
  cup = new THREE.Group()
  const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.16, 16), mat(0xe2412f))
  cupBody.position.y = 0.08
  cup.add(cupBody)
  const cupBand = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.12, 0.04, 16), mat(0xf6f0e0))
  cupBand.position.y = 0.12
  cup.add(cupBand)
  const cupFill = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 16), mat(0xf2c35b))
  cupFill.position.y = 0.155; cupFill.name = 'fill'; cupFill.visible = false
  cup.add(cupFill)
  cup.position.set(1.25, 0.96, -2.45)
  cup.visible = false
  scene.add(cup)
  kettle.userData.tap = true
  scene.add(kettle)
  packet = box(0.22, 0.05, 0.16, 0xe2412f, 1.55, 0.99, -2.55)
  bowl = new THREE.Group()
  bowl.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 0.1, 14), mat(0xf4efe6)))
  const noodles = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 14), mat(0xf2c35b))
  noodles.position.y = 0.04
  bowl.add(noodles)
  bowl.visible = false
  scene.add(bowl)
  steamGroup = new THREE.Group()
  for (let i = 0; i < 10; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }))
    puff.userData.t = i / 10
    steamGroup.add(puff)
  }
  steamGroup.visible = false
  scene.add(steamGroup)
  // rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), mat(0xf0c400))
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.2)
  scene.add(rug)
  // door on a hinge at x=3, z=0.6..1.8
  door = new THREE.Group()
  door.position.set(3, 0, 0.6)
  const leaf = box(0.08, 2.1, 1.2, 0x6b3fa0, 0, 1.05, 0.6, door)
  leaf.userData.tap = true
  box(0.05, 0.05, 0.12, 0xf0c400, -0.06, 1.0, 1.05, door)
  scene.add(door)
}

function buildOutside() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 50), mat(0x7eae62))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(30, -0.01, 8)
  ground.receiveShadow = true
  scene.add(ground)
  // res block shell around the room (outer walls) + corridor/yard path
  box(10, 3.2, 0.3, 0xc9b28a, -2, 1.6, -3.3)
  box(0.3, 3.2, 7, 0xc9b28a, -3.3, 1.6, 0)
  const path = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), mat(0xd8c49a))
  path.rotation.x = -Math.PI / 2; path.position.set(9.5, 0.005, 1.2)
  scene.add(path)
  const path2 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6), mat(0xd8c49a))
  path2.rotation.x = -Math.PI / 2; path2.position.set(16, 0.006, 3.6)
  scene.add(path2)
  // block label
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), new THREE.MeshBasicMaterial({ map: textTexture(['O Block']) }))
  lab.position.set(4.5, 2.6, -3.1)
  scene.add(lab)
  // road
  const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 4), mat(0x4a4a52))
  road.rotation.x = -Math.PI / 2; road.position.set(30, 0.01, 8)
  scene.add(road)
  for (let x = -38; x < 100; x += 4) box(1.8, 0.01, 0.14, 0xf6f0e0, x, 0.02, 8)
  // trees
  for (const [x, z] of [[7, -2], [11, -1.5], [20, 2], [26, 3], [36, 3.5], [48, 3], [58, 3.2], [24, 24], [40, 23], [55, 24], [8, 22]]) {
    box(0.25, 1.2, 0.25, 0x6a4024, x, 0.6, z)
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), mat(0x3f7a3a))
    top.position.set(x, 1.8, z); top.castShadow = true
    scene.add(top)
  }
  // bus stop with shelter + sign
  box(2.6, 0.08, 1.2, 0x2a1846, 16, 2.4, 5.4)
  box(0.1, 2.4, 0.1, 0x2a1846, 14.8, 1.2, 5.0)
  box(0.1, 2.4, 0.1, 0x2a1846, 17.2, 1.2, 5.0)
  box(2.2, 0.1, 0.4, 0x8c5a33, 16, 0.5, 4.9)
  const stop = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: textTexture(['BUS', 'Westville Campus']) }))
  stop.position.set(16, 2.9, 5.45)
  scene.add(stop)
  sign = stop
  // campus gate at the far end
  box(0.6, 4, 0.6, 0xd9c7a5, 66, 2, 4.2)
  box(0.6, 4, 0.6, 0xd9c7a5, 74, 2, 4.2)
  box(8.6, 0.8, 0.6, 0x2a1846, 70, 4.2, 4.2)
  const gate = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), new THREE.MeshBasicMaterial({ map: textTexture(['Campus Gate'], '#2a1846', '#f0c400', 512, 96) }))
  gate.position.set(70, 4.2, 4.52)
  scene.add(gate)
  box(12, 2.6, 6, 0xb9a3d6, 70, 1.3, -1.5)
  // bus
  bus = new THREE.Group()
  box(7, 2.2, 2.3, 0x4b2a7a, 0, 1.45, 0, bus)
  box(7.02, 0.25, 2.32, 0xf0c400, 0, 0.9, 0, bus)
  for (let i = 0; i < 5; i++) box(1.0, 0.7, 2.34, 0xbfe3f5, -2.6 + i * 1.25, 1.95, 0, bus, { roughness: 0.2, metalness: 0.2 })
  busDoor = box(0.9, 1.6, 0.06, 0x1d1236, 2.4, 1.15, -1.17, bus)
  for (const x of [-2.4, 2.2]) for (const z of [-1.1, 1.1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), mat(0x1c1915))
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z)
    bus.add(w)
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.4), new THREE.MeshBasicMaterial({ map: textTexture(['Westville'], '#1d1236', '#f0c400', 512, 110) }))
  plate.position.set(3.52, 2.25, 0); plate.rotation.y = Math.PI / 2
  bus.add(plate)
  bus.position.set(-40, 0, 7.4)
  bus.userData.tap = true
  scene.add(bus)
  // tap marker
  marker = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.11, 10, 40), new THREE.MeshBasicMaterial({ color: 0xf0c400 }))
  marker.rotation.x = -Math.PI / 2
  marker.visible = false
  halo = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.position.z = 0.01
  marker.add(halo)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  beam.rotation.x = Math.PI / 2
  beam.position.z = -1.1
  marker.add(beam)
  scene.add(marker)
}

function build() {
  host = document.createElement('div')
  host.id = 'morning3d'
  document.body.prepend(host)
  ui()
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  host.prepend(renderer.domElement)
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf4c58e)
  scene.fog = new THREE.Fog(0xf4c58e, 30, 90)
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 200)
  scene.add(new THREE.HemisphereLight(0xffe7c4, 0x6a4a3a, 0.75))
  const sun = new THREE.DirectionalLight(0xffb36b, 2.2)
  sun.position.set(-6, 9, -14)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 })
  scene.add(sun)
  scene.add(sun.target)
  scene.userData.sun = sun
  const glow = new THREE.PointLight(0xffb86e, 8, 7, 2)
  glow.position.set(0, 1.9, -2.4)
  scene.add(glow)
  buildRoom()
  buildOutside()
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!tapHandler) return
    const r = renderer.domElement.getBoundingClientRect()
    ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera)
    const hits = ray.intersectObjects([...tapTargets, marker], true)
    if (hits.length) tapHandler()
  })
}

function setStep(name) {
  step = name
  host.dataset.step = name
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const real = (now - (last || now)) / 1000
  const dt = Math.min(0.05, real)
  last = now
  clock += dt
  tasks = tasks.filter((t) => { if (t.update(dt)) { t.resolve(); return false } return true })
  if (idleOn && opts) {
    idle += Math.min(real, 1)
    if (idle > 1.5) { idle = 0; opts.run.minutes += 1; opts.onUpdate() } // dawdling costs time
  }
  soundLoop('footsteps', walking.player && player?.visible)
  for (const [who, key] of [[player, 'player'], [roommate, 'roommate']]) {
    if (who) poseAvatar(who, walking[key], clock)
  }
  if (marker.visible) { marker.scale.setScalar(1 + Math.sin(clock * 5) * 0.12); halo.material.opacity = 0.25 + Math.sin(clock * 5) * 0.15 }
  if (kettleLight.userData.pulse) kettleLight.intensity = 3 + Math.sin(clock * 5) * 2
  if (steamGroup.visible) {
    for (const p of steamGroup.children) {
      p.userData.t = (p.userData.t + dt * 0.6) % 1
      p.position.set(Math.sin(p.userData.t * 9 + p.id) * 0.05, p.userData.t * 0.7, Math.cos(p.userData.t * 7) * 0.05)
      p.material.opacity = 0.7 * (1 - p.userData.t)
      p.scale.setScalar(0.6 + p.userData.t * 1.4)
    }
  }
  // camera follows its target smoothly
  const want = v.copy(camTarget).add(camOffset)
  camera.position.lerp(want, 1 - Math.exp(-dt * 3))
  camLook.lerp(camTarget, 1 - Math.exp(-dt * 4))
  camera.lookAt(camLook)
  const sun = scene.userData.sun
  sun.target.position.copy(camTarget)
  sun.position.set(camTarget.x - 6, 9, camTarget.z - 14)
  pinTo(uiq('.mm-float'), player.visible ? player : bus, 2.2)
  const b = uiq('.mm-bubble')
  pinTo(b, b.dataset.who === 'roommate' ? roommate : player, 2.1)
  // Zanele's name tag shows whenever she is in shot and not already talking.
  const tag = uiq('.mm-tag')
  v.set(roommate.position.x, 1.9, roommate.position.z).project(camera)
  tag.hidden = !roommate.visible || (!b.hidden && b.dataset.who === 'roommate') || Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1
  if (!tag.hidden) pinTo(tag, roommate, 1.95)
  host.dataset.px = player.position.x.toFixed(2)
  host.dataset.pz = player.position.z.toFixed(2)
  host.dataset.busx = bus.position.x.toFixed(2)
  host.dataset.door = door.rotation.y.toFixed(2)
  host.dataset.clock = fmt(opts.run.minutes)
  renderer.render(scene, camera)
}

function follow(obj, offset) {
  if (offset) camOffset.set(...offset)
  const t = task(() => { camTarget.set(obj.position.x, 0.8, obj.position.z); return !running || obj.userData.followEnd })
  obj.userData.followEnd = false
  return t
}
function stopFollow(obj) { obj.userData.followEnd = true }

// A framed shot: the camera keeps every listed person head to feet (and any props)
// in the clear band of a phone screen, between the HUD on top and the choice cards
// below, looking from `dir` (the room's open front). Ends with endFrame().
let frameId = 0
const UP = new THREE.Vector3(0, 1, 0)
const fr = { f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), c: new THREE.Vector3(), p: new THREE.Vector3() }
function frameOn(subjects, dir = [0.35, 0.75, 1]) {
  const id = ++frameId
  stopFollow(player)
  const d = new THREE.Vector3(...dir).normalize()
  fr.f.copy(d).negate()
  fr.r.crossVectors(fr.f, UP).normalize()
  fr.u.crossVectors(fr.r, fr.f)
  return task(() => {
    if (id !== frameId || !running) return true
    const pts = []
    for (const s of subjects()) {
      if (s.isObject3D) {
        if (!s.visible) continue
        const lying = s.userData.pose === 'lie'
        const base = lying ? s.position.y - 0.1 : s.position.y
        // a lying person spans the bed; a standing one spans feet to head
        if (lying) for (const dz of [-0.95, 0.95]) pts.push(new THREE.Vector3(s.position.x, base, s.position.z + dz), new THREE.Vector3(s.position.x, base + 0.45, s.position.z + dz))
        else for (const y of [0, 1.85]) for (const dx of [-0.3, 0.3]) pts.push(new THREE.Vector3(s.position.x + dx, base + y, s.position.z))
      } else pts.push(new THREE.Vector3(...s))
    }
    if (!pts.length) return false
    fr.c.set(0, 0, 0)
    for (const q of pts) fr.c.add(q)
    fr.c.divideScalar(pts.length)
    let w = 0, h = 0, depth = 0
    for (const q of pts) {
      fr.p.subVectors(q, fr.c)
      w = Math.max(w, Math.abs(fr.p.dot(fr.r)))
      h = Math.max(h, Math.abs(fr.p.dot(fr.u)))
      depth = Math.max(depth, fr.p.dot(d))
    }
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const th = tv * camera.aspect
    // Subjects fill 44% of the height (the band above the cards) and 86% of the width.
    const dist = Math.max(h * 1.12 / (tv * 0.44), w * 1.12 / (th * 0.86), 2.2) + depth
    // Lower the aim so the band sits above the screen's middle, clear of the cards.
    const half = (dist - depth) * tv
    camTarget.copy(fr.c).addScaledVector(fr.u, -half * 0.24)
    camOffset.copy(d).multiplyScalar(dist)
    return false
  })
}
function endFrame() { frameId++ }

// ---------- the scripted morning ----------
let cafBreakfast = false
async function play() {
  cafBreakfast = false
  const run = opts.run
  const q = new URLSearchParams(location.search)
  const roomieTakes = opts.forceRoommate ?? Math.random() < 0.35
  host.dataset.roommate = roomieTakes ? '1' : '0'
  const lateFlag = q.get('latebus')
  const lateBus = lateFlag === '1' ? true : lateFlag === '0' ? false : Math.random() < 0.25
  host.dataset.latebus = lateBus ? '1' : '0'
  // ?snooze=N taps Snooze N times by itself (tests and screenshots); without it the player chooses.
  const autoSnooze = q.has('snooze') ? Math.max(0, Math.min(SNOOZE_MAX, Number(q.get('snooze')) || 0)) : -1
  // 1. wake in bed
  setStep('wake')
  player.userData.pose = 'lie'
  player.position.set(-2.1, 0.62, -1.1)
  player.rotation.set(-Math.PI / 2, 0, 0)
  // The roommate stands at the foot of your bed, so one shot holds you both, head to feet.
  roommate.position.set(-0.85, 0, 0.15)
  face(roommate, ANCHORS.bed[0], ANCHORS.bed[1])
  frameOn(() => [player, roommate], [0.55, 0.85, 1])
  camTarget.set(-1.5, 0.6, -0.8)
  camera.position.set(1.2, 4.2, 4.2)
  camLook.copy(camTarget)
  run.minutes = Math.max(run.minutes, WAKE)
  opts.onUpdate()
  // Zanele says hi first.
  setStep('greet')
  await Promise.all([wave(roommate), talk(line('zanele.wave', 'Morning, roomie! I\u2019m Zanele \u{1F44B}'), roommate)])
  bubble(line('steps.wake.bubbles.0', '07:00. Alarm. Day one\u2026 snooze.'), player)
  setStep('wake')
  clockShow(true)
  let snoozes = 0
  for (;;) {
    const left = SNOOZE_MAX - snoozes
    let pick
    if (autoSnooze >= 0) { await wait(0.5); pick = snoozes < autoSnooze ? 0 : 1 }
    else {
      pick = await choices(line('steps.wake.question', 'Alarm! Get up?'), [
        ...(left > 0 ? [{ label: `\u{1F634} Snooze 10 min`, note: `${left} left` }] : []),
        { label: '\u2600\uFE0F Get up', note: '' },
      ])
      if (left <= 0) pick = 1
    }
    if (pick !== 0) break
    snoozes += 1
    host.dataset.snoozes = String(snoozes)
    setStep('snooze')
    bubble(line('steps.wake.bubbles.1', 'Zzz\u2026 snooze'), player)
    await clockRoll(SNOOZE)
  }
  host.dataset.snoozes = String(snoozes)
  if (snoozes >= SNOOZE_MAX) await talk(line('late_variants.snoozed_too_long.zanele', 'I let you sleep. I regret it. Run.'), roommate)
  else if (snoozes > 0) await talk(line('steps.wake.zanele', 'Mm. You snoozed {n} times. I counted.', { n: snoozes }), roommate)
  clockShow(false)
  walkTo(roommate, ANCHORS.roommate[0], ANCHORS.roommate[1], 1.6).then(() => face(roommate, ANCHORS.bed[0], ANCHORS.bed[1]))
  await talk(snoozes ? line('steps.wake.bubbles.2', 'Up, up, up!') : 'Up. Day one!', player)
  // sit up, then swing out of bed
  await tween(0.8, (k) => { player.rotation.x = -Math.PI / 2 * (1 - k); player.position.y = 0.62 + k * 0.1 })
  await tween(0.7, (k) => { player.position.x = -2.1 + k * 0.85; player.position.y = 0.72 * (1 - k); player.rotation.y = k * Math.PI / 2 })
  player.position.y = 0
  player.userData.pose = 'stand'
  bubble('')
  await addMinutes(2, 0.5)
  endFrame()
  camOffset.set(0, 5.2, 6.2)
  follow(player)
  // 2. kettle
  setStep('kettle')
  lookAtKettle(true)
  // Breakfast is a choice every morning: noodles in res, the tuck shop, the caf on
  // campus, or out the door hungry. Each costs something different.
  const OPT = {
    noodles: { label: line('steps.choice_breakfast.options.0.label', '\u{1F35C} Noodles in res'), note: line('steps.choice_breakfast.options.0.note', 'Free \u00b7 +35 Fullness \u00b7 15 min') },
    tuck: { label: line('steps.choice_breakfast.options.1.label', '\u{1F6D2} Tuck shop on the way'), note: line('steps.choice_breakfast.options.1.note', 'R12 \u00b7 +25 Fullness \u00b7 10 min') },
    caf: { label: line('steps.choice_breakfast.options.2.label', '\u{1F373} Caf breakfast on campus'), note: line('steps.choice_breakfast.options.2.note', 'R30 \u00b7 +40 Fullness \u00b7 10 min there') },
    hungry: { label: line('steps.choice_breakfast.options.3.label', '\u{1F6B6} Walk to the bus hungry'), note: line('steps.choice_breakfast.options.3.note', '\u221215 Fullness \u00b7 out the door now') },
  }
  const first = await choices(line('steps.choice_breakfast.title', 'Breakfast?'), [OPT.noodles, OPT.tuck, OPT.caf, OPT.hungry])
  let plan = ['noodles', 'tuck', 'caf', 'hungry'][first]
  setStep('kettle-walk')
  let rushOut = false
  if (plan === 'noodles' && roomieTakes) {
    // roommate gets there first
    walkTo(roommate, 1.55, -1.95, 2.6)
    await walkTo(player, 0.5, -1.8)
    face(player, 0.9, -2.55)
    setStep('roommate')
    face(roommate, 1.55, -2.55)
    await tween(0.5, (k) => { packet.position.set(1.55, 0.99 + k * 0.4, -2.55 + k * 0.4) })
    packet.visible = false
    face(roommate, player.position.x, player.position.z)
    await talk(line('steps.roommate.bubble', 'Sorry! Last packet \u{1F605} I\u2019ll buy more later.'), roommate)
    await talk(line('steps.roommate.bare', 'The shelf is bare. Your roommate got the last packet.'), player)
    walkTo(roommate, 2.1, -0.35, 1.8)
    lookAtKettle(false)
    const pick = await choices(line('steps.choice_no_noodles.title', 'No noodles left. What now?'), [OPT.tuck, OPT.caf, OPT.hungry])
    plan = ['tuck', 'caf', 'hungry'][pick]
  }
  host.dataset.choice = plan
  if (plan === 'tuck') {
    setStep('tuckshop')
    lookAtKettle(false)
    await walkTo(player, 2.3, 1.2)
    sfx('door')
    await tween(0.6, (k) => { door.rotation.y = -k * 1.4 })
    await walkTo(player, 3.6, 1.2)
    await walk(player, [[6.5, 1.2]])
    await fadeOut('\u{1F6D2} Tuck shop\u2026 R12 noodles')
    await addMinutes(10, 1.2)
    player.position.set(6.5, 0, 1.2)
    face(player, 2, 1.2)
    steamGroup.visible = true
    const held = holdBowl()
    await fadeIn()
    await walk(player, [[3.6, 1.2]])
    await walkTo(player, 2.2, 1.2)
    await tween(0.5, (k) => { door.rotation.y = -1.4 * (1 - k) })
    void held
    await eat()
    changeStats({ money: -12, hunger: 25 })
  } else if (plan === 'caf') {
    // Breakfast waits on campus: you eat at the caf when the bus drops you.
    setStep('caf-later')
    lookAtKettle(false)
    await talk(line('steps.caf_later.bubble', 'Caf pap on campus. Hold on, stomach.'), player)
    cafBreakfast = true
  } else if (plan === 'hungry') {
    // Straight out: no breakfast, no door prompt, the walk starts now.
    setStep('hungry')
    lookAtKettle(false)
    await talk(line('steps.hungry.bubble', 'No breakfast, no problem. Probably. Bus, here I come.'), player)
    changeStats({ hunger: -15 })
    rushOut = true
  } else {
    await walkTo(player, 0.8, -1.85)
    face(player, 0.9, -2.55)
    setStep('noodles')
    kettle.getObjectByName('led').material.color.set(0xff5533)
    soundLoop('kettle', true)
    steamGroup.visible = true
    steamGroup.position.set(1.15, 1.45, -2.55)
    // the cup appears on the counter
    cup.visible = true
    await tween(0.4, (k) => { cup.scale.setScalar(Math.max(0.01, k)) })
    host.dataset.cup = '1'
    // packet opens over the cup and is used up
    await tween(0.6, (k) => { packet.position.set(1.55 - k * 0.3, 0.99 + Math.sin(k * Math.PI) * 0.35 + k * 0.1, -2.55 + k * 0.1); packet.rotation.z = k * 1.2; packet.scale.setScalar(1 - k * 0.95) })
    packet.visible = false
    host.dataset.packet = 'used'
    await Promise.all([tween(0.5, (k) => { kettle.position.y = 0.96 + Math.sin(k * Math.PI * 6) * 0.015 }), addMinutes(4, 1.0)])
    // pour
    await tween(0.4, (k) => { kettle.rotation.z = -k * 0.7; kettle.position.x = 0.85 + k * 0.15; kettle.position.y = 0.96 + k * 0.15 })
    cup.getObjectByName('fill').visible = true
    steamGroup.position.set(1.25, 1.15, -2.45)
    await tween(0.4, (k) => { kettle.rotation.z = -0.7 * (1 - k); kettle.position.x = 1.0 - k * 0.15; kettle.position.y = 1.11 - k * 0.15 })
    await addMinutes(6, 1.0)
    kettle.getObjectByName('led').material.color.set(0x552222)
    soundLoop('kettle', false)
    cup.visible = false
    lookAtKettle(false)
    await eat()
    changeStats({ hunger: 35, energy: 5 })
  }
  // 3. out the door
  setStep('door')
  if (!rushOut) await tapOn([door], line('steps.door.prompt', '\u{1F6AA} Head out to the bus stop'), ANCHORS.door)
  setStep('exit')
  await walkTo(player, -0.9, 0.9)
  face(player, -2.2, 1.5)
  bubble('Quick shower, get dressed\u2026', player)
  await Promise.all([tween(1.2, (k) => { player.rotation.y = Math.PI * 4 * k }), addMinutes(15, 1.2), tapNext(uiq('.mm-bubble'))])
  bubble('')
  await walkTo(player, 2.3, 1.2)
  sfx('door')
  await tween(0.6, (k) => { door.rotation.y = -1.4 * Math.max(k, Math.abs(door.rotation.y) / 1.4) })
  camOffset.set(0, 6, 7)
  await walkTo(player, 3.7, 1.2)
  await walk(player, [[5.5, 1.2]])
  setStep('to-stop')
  await tapOn([sign], line('steps.to-stop.prompt', '\u{1F68F} Walk to the bus stop'), ANCHORS.sign)
  setStep('walk-stop')
  const walkStart = run.minutes
  await Promise.all([walk(player, [[9, 1.2], [15.4, 1.6], ANCHORS.waiting], 3.6), addMinutes(8, 3.2)])
  face(player, ANCHORS.bus_lane[0] + 2, ANCHORS.bus_lane[1])
  void walkStart
  // 4. bus
  setStep('stop')
  const due = Math.max(BUS_FIRST, BUS_FIRST + Math.ceil((run.minutes - BUS_FIRST) / BUS_EVERY) * BUS_EVERY)
  const missed = run.minutes > BUS_FIRST && due > BUS_FIRST
  const next = due + (lateBus ? BUS_DELAY : 0)
  const signNode = uiq('.mm-sign')
  signNode.hidden = false
  const showSign = () => {
    const left = Math.max(0, next - run.minutes)
    const missLine = missed ? `<em>${line('steps.stop.sign_missed', 'Missed the {time}.', { time: fmt(due - BUS_EVERY) })}</em> ` : ''
    signNode.innerHTML = lateBus
      ? `${missLine}Bus <b>${fmt(due)}</b> \u00b7 <em class="mm-delayed">Delayed</em>${run.minutes >= due ? ` \u00b7 ~${left} min` : ''}`
      : `${missLine}${line('steps.stop.sign_next', 'Next bus {time} \u00b7 in {min} min', { time: `<b>${fmt(next)}</b>`, min: left })}`
  }
  showSign()
  signNode.classList.toggle('late', lateBus)
  host.dataset.nextbus = fmt(next)
  if (lateBus) await talk(line('late_variants.bus_late.bubble', 'Come on, come on, come ON.'), player)
  camOffset.set(-6, 4.5, 8)
  await wait(0.8)
  const waitMin = next - run.minutes
  // clock runs forward while the bus drives in
  setStep('bus-arriving')
  soundLoop('bus_engine', true)
  await Promise.all([
    (async () => { const from = run.minutes; await tween(Math.max(1.2, Math.min(4, waitMin * 0.15)), (k) => { const m = Math.round(from + waitMin * k); if (m !== run.minutes) { run.minutes = m; showSign(); opts.onUpdate() } }, (x) => x) })(),
    (async () => { bus.position.x = -40; camTarget.set(8, 0.8, 6); await wait(Math.max(0, Math.min(4, waitMin * 0.15) - 2.4)); stopFollow(player); follow(bus, [-4, 5, 10]); await tween(2.4, (k) => { bus.position.x = -40 + 54 * (1 - (1 - k) * (1 - k)) }, (x) => x) })(),
  ])
  run.minutes = next
  opts.onUpdate()
  bubble('')
  signNode.hidden = true
  await tween(0.5, (k) => { busDoor.position.x = 2.4 - k * 0.95 })
  setStep('board')
  stopFollow(bus)
  follow(player, [-3, 4.5, 7])
  await tapOn([bus], line('steps.board.prompt', '\u{1F68C} Get on the bus'), ANCHORS.bus_stop)
  setStep('boarding')
  await walk(player, [ANCHORS.bus_stop])
  await tween(0.4, (k) => { player.scale.setScalar(1 - k * 0.9) })
  player.visible = false
  player.scale.setScalar(1)
  await tween(0.4, (k) => { busDoor.position.x = 1.45 + k * 0.95 })
  // 5. ride
  setStep('riding')
  stopFollow(player)
  follow(bus, [-6, 6, 8])
  const from = run.minutes
  await tween(3.2, (k) => {
    bus.position.x = 14 + 56 * k
    const m = Math.round(from + RIDE * k)
    if (m !== run.minutes) { run.minutes = m; opts.onUpdate() }
  })
  await tween(0.5, (k) => { busDoor.position.x = 2.4 - k * 0.95 })
  // 6. step off at the gate
  setStep('arrive')
  soundLoop('bus_engine', false)
  player.position.set(bus.position.x + 1.5, 0, 6.2)
  player.visible = true
  stopFollow(bus)
  follow(player, [0, 5, 8])
  await walk(player, [ANCHORS.arrive])
  face(player, ANCHORS.campus[0], ANCHORS.campus[1])
  if (cafBreakfast) {
    setStep('caf-breakfast')
    await fadeOut('\u{1F373} Caf breakfast\u2026 R30 pap and egg')
    await addMinutes(10, 1.2)
    steamGroup.visible = true
    const held = holdBowl()
    await fadeIn()
    void held
    await eat()
    changeStats({ money: -30, hunger: 40, energy: 5 })
  }
  const arrived = run.minutes
  const onTime = arrived <= ON_TIME_BY
  if (!onTime) changeStats({ grades: -2 })
  setStep('done')
  host.dataset.ontime = onTime ? '1' : '0'
  const card = uiq('.mm-card')
  const res = onTime ? 'on_time' : 'late'
  card.innerHTML = `<p class="mm-kind">${line(`steps.done.${res}.kind`, onTime ? 'On time' : 'Running late')}</p>
    <h2>${line(`steps.done.${res}.title`, onTime ? 'You made it to campus' : 'You made it\u2026 just')}</h2>
    <p class="mm-times"><span>Arrived <b>${fmt(arrived)}</b></span><span>Lecture <b>${fmt(LECTURE)}</b></span></p>
    <p>${onTime ? line('steps.done.on_time.line', '{min} minutes to find your venue and a seat.', { min: LECTURE - arrived }) : line('steps.done.late.line', 'You slip in after it started. \u22122 Grades.')}${lateBus ? ' The bus was delayed.' : ''}</p>
    <button type="button" class="mm-go" data-mm="continue">Continue to the lecture \u203a</button>`
  card.hidden = false
  await new Promise((resolve) => { card.querySelector('button').onclick = resolve })
  card.hidden = true
  opts.onDone({ arrived, onTime })
}

async function fadeOut(text) {
  const f = uiq('.mm-fade')
  f.querySelector('p').textContent = text
  f.hidden = false
  f.style.opacity = 0
  await tween(0.4, (k) => { f.style.opacity = k })
}
async function fadeIn() {
  const f = uiq('.mm-fade')
  await tween(0.4, (k) => { f.style.opacity = 1 - k })
  f.hidden = true
}
function holdBowl() {
  bowl.visible = true
  return task(() => {
    bowl.position.set(player.position.x + Math.sin(player.rotation.y) * 0.35, 1.0, player.position.z + Math.cos(player.rotation.y) * 0.35)
    if (steamGroup.visible) steamGroup.position.copy(bowl.position)
    return !bowl.visible
  })
}
function lookAtKettle(on) {
  if (on) { frameOn(() => [player, roommate, [0.9, 0.9, -2.55], [1.55, 0.9, -2.55]], [0.3, 0.8, 1]); kettleLight.userData.pulse = true }
  else { endFrame(); kettleLight.userData.pulse = false; kettleLight.intensity = 0; camOffset.set(0, 5.2, 6.2); follow(player) }
}

async function eat() {
  setStep('eating')
  bowl.visible = true
  steamGroup.visible = true
  const follower = task(() => {
    bowl.position.set(player.position.x + Math.sin(player.rotation.y) * 0.35, 1.0, player.position.z + Math.cos(player.rotation.y) * 0.35)
    steamGroup.position.copy(bowl.position)
    return !bowl.visible
  })
  bubble('Mmm\u2026 2-minute noodles.', player)
  await Promise.all([tween(2.0, (k) => { player.userData.bob.position.y = 0.78 + Math.sin(k * Math.PI * 6) * 0.03 }), tapNext(uiq('.mm-bubble'))])
  bubble('')
  bowl.visible = false
  steamGroup.visible = false
  await follower
}

export function startMorning(options) {
  opts = options
  if (!renderer) build()
  host.hidden = false
  uiRoot.hidden = false
  host.dataset.on = '1'
  if (running) return
  running = true
  tasks = []
  if (player) scene.remove(player)
  if (roommate) scene.remove(roommate)
  ROOMIE = roommateOf(opts.run.character?.avatar)
  maleRoom = genderOf(opts.run.character?.avatar) === 'male'
  host.dataset.roomie = ROOMIE
  uiq('.mm-tag').textContent = ROOMIE
  player = createAvatar(opts.run.character?.avatar)
  host.dataset.look = JSON.stringify(player.userData.look)
  player.userData.pose = 'stand'
  scene.add(player)
  roommate = makeZanele()
  roommate.userData.pose = 'stand'
  scene.add(roommate)
  packet.visible = true
  packet.scale.setScalar(1)
  packet.rotation.set(0, 0, 0)
  packet.position.set(1.55, 0.99, -2.55)
  cup.visible = false
  cup.getObjectByName('fill').visible = false
  kettle.rotation.set(0, 0, 0)
  kettle.position.set(0.85, 0.96, -2.55)
  door.rotation.y = 0
  bus.position.x = -40
  busDoor.position.x = 2.4
  for (const n of uiRoot.querySelectorAll('.mm-bar,.mm-card,.mm-sign,.mm-bubble,.mm-float,.mm-fade,.mm-clock,.mm-tag')) n.hidden = true
  uiq('.mm-bar').innerHTML = ''
  last = 0
  if (!frame) frame = requestAnimationFrame(tick)
  play().catch((e) => { console.error(e) }).finally(() => { running = false })
}

export function stopMorning() {
  running = false
  for (const name of ['footsteps', 'kettle', 'bus_engine']) soundLoop(name, false)
  tasks.forEach((t) => t.resolve())
  tasks = []
  tapHandler = null
  idleOn = false
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  if (host) { host.hidden = true; host.dataset.on = '0'; uiRoot.hidden = true }
}
