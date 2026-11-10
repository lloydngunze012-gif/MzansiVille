// SunnyBay, the city (City job A): its own scene, joined to the campus at the Main Gate by a short
// curtain. Walk out of the gate and you are here; walk back in through the gate and you are on campus.
// Inside the city there is no curtain: the five districts round the campus (Town centre, Suburbs,
// Beachfront, Township, Industrial) are one continuous world. The plan is data
// (data/campusville/sunnybay.json, src/city/plan.js), the still parts are built once and merged
// (src/world/citybuild.js). Doors show "Opening soon": City job B fills the places.
//
// Travel: walking always works and is free; a minibus taxi from any taxi stop (R15 next district, R25
// across the city, 25 game minutes, a moment of under 3 s); a car when the save has run.licence and
// run.car (instant, R8 petrol, parked outside where you drove). Spec: docs/world-designer/sunnybay.md.
// Tests and screenshots (read-mostly): window.mzansiCity.
import * as THREE from 'three'
import { loop as soundLoop } from '../audio.js'
import { SPEED as FAST } from '../speed.js'
import { smooth } from '../smooth.js'
import * as curtain from '../curtain.js'
import { onPoke, reportLocal, sendPoke, setArea } from '../presence.js'
import { appearNow, createAvatar, gesture, poseAvatar } from './avatar3d.js'
import { createCameraRig } from './camera.js'
import { bindInput } from './input.js'
import { createPlayer } from './player.js'
import { createOthers } from './others.js'
import { buildingLayout } from './layout.js'
import { loadModel } from './models.js'
import { skinFor } from './skinmix.js'
import { buildCity } from './citybuild.js'
import { createCityMap } from './map.js'
import { ringSpot } from './ring.js'
import { checkLowHint, drainWalking, setRacing, speedFactor } from '../engine/energy.js'
import { checkAway, noteOpen } from '../ui/minicard-state.js'
import { countdown, inviteToast, onInvite, resultCard, sendInvite } from './together.js'
import { BOUNDS, CITY, LOTS, PARTS, PIER, SPAWN, STOPS, WAVE2, atGate, canDrive, carAt, lotOf, moneyOf, nearestStop, offLimits, partAt, partOf, payDrive, payTaxi, stopOf, taxiFare } from '../city/plan.js'

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const DEBUG = Q.get('citydebug') === '1'
const BODY = 0.32
const G = 2 // the walk grid's cell (m)
const NPCS = 8

let opts = null
let host, uiRoot, renderer, scene, camera, rig, mover, input, hemi, sun
let player = null
let built = null // citybuild's result
let others = null
let mapUi = null
let running = false
let ready = false
let frame = 0
let last = 0
let clock = 0
let frameCount = 0
let enteredAt = 0
let part = PARTS[0]
let partSince = 0
let roomPart = ''
let pending = null // what to do when the walk ends: { lot } | { stop } | { ride: dest }
let card = null // the open card: { kind, id }
let carMesh = null
let npcs = []
let shot = null
let lastSave = 0
let rides = 0
let race = null // { withId, withName, startAt, mine, theirs, waitingShown }: Race to the pier (item 6)
const ray = new THREE.Raycaster()
const v3 = new THREE.Vector3()
const box3 = new THREE.Box3()

// ---------- what is solid, and the walk grid ----------
const HASH = 16
let buckets = new Map()
function hashSolids(solids) {
  buckets = new Map()
  for (const s of solids) {
    for (let i = Math.floor(s.minX / HASH); i <= Math.floor(s.maxX / HASH); i++) for (let j = Math.floor(s.minZ / HASH); j <= Math.floor(s.maxZ / HASH); j++) {
      const k = `${i},${j}`
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(s)
    }
  }
}
function inSolid(x, z, pad) {
  const list = buckets.get(`${Math.floor(x / HASH)},${Math.floor(z / HASH)}`)
  if (!list) return false
  for (const s of list) if (x > s.minX - pad && x < s.maxX + pad && z > s.minZ - pad && z < s.maxZ + pad) return true
  return false
}
const blockedAt = (x, z) => offLimits(x, z, 0.2) || inSolid(x, z, BODY)

let grid = null // { cols, rows, cells: Uint8Array }
function buildGrid() {
  const cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / G)
  const rows = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / G)
  const cells = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = BOUNDS.x0 + (c + 0.5) * G
    const z = BOUNDS.z0 + (r + 0.5) * G
    cells[r * cols + c] = offLimits(x, z, 0.9) || inSolid(x, z, 1.0) ? 1 : 0
  }
  grid = { cols, rows, cells }
}
const cellOf = (x, z) => [Math.min(grid.cols - 1, Math.max(0, Math.floor((x - BOUNDS.x0) / G))), Math.min(grid.rows - 1, Math.max(0, Math.floor((z - BOUNDS.z0) / G)))]
const centreOf = (c, r) => ({ x: BOUNDS.x0 + (c + 0.5) * G, z: BOUNDS.z0 + (r + 0.5) * G })
const open = (c, r) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.cells[r * grid.cols + c] === 0
function nearestOpen(x, z) {
  const [c0, r0] = cellOf(x, z)
  if (open(c0, r0)) return [c0, r0]
  for (let ring = 1; ring < 14; ring++) for (let dc = -ring; dc <= ring; dc++) for (let dr = -ring; dr <= ring; dr++) {
    if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue
    if (open(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr]
  }
  return null
}
// A straight line a body can walk (sampled against the true outlines, not the grid).
function clear(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z)
  const n = Math.ceil(d / 0.6)
  for (let i = 1; i < n; i++) { const t = i / n; if (blockedAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false }
  return true
}
// A* on the grid (a binary heap), then the corners that are not needed are dropped.
function route(from, to) {
  if (clear(from, to)) return [{ x: to.x, z: to.z }]
  const s = nearestOpen(from.x, from.z)
  const g = nearestOpen(to.x, to.z)
  if (!s || !g) return [{ x: to.x, z: to.z }]
  const { cols, rows } = grid
  const N = cols * rows
  const cost = new Float32Array(N).fill(Infinity)
  const came = new Int32Array(N).fill(-1)
  const shut = new Uint8Array(N)
  const heap = []
  const pushH = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p } }
  const popH = () => {
    const top = heap[0]
    const end = heap.pop()
    if (heap.length) {
      heap[0] = end
      let k = 0
      for (;;) { const l = k * 2 + 1; const r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m }
    }
    return top[1]
  }
  const si = s[1] * cols + s[0]
  const gi = g[1] * cols + g[0]
  const h = (i) => Math.hypot((i % cols) - g[0], Math.floor(i / cols) - g[1])
  cost[si] = 0
  pushH(si, h(si))
  let found = false
  for (let guard = 0; heap.length && guard < 120000; guard++) {
    const i = popH()
    if (shut[i]) continue
    shut[i] = 1
    if (i === gi) { found = true; break }
    const c = i % cols
    const r = Math.floor(i / cols)
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue
      const nc = c + dc
      const nr = r + dr
      if (!open(nc, nr)) continue
      if (dc && dr && (!open(c + dc, r) || !open(c, r + dr))) continue // (no cutting a corner)
      const ni = nr * cols + nc
      const nd = cost[i] + (dc && dr ? 1.4142 : 1)
      if (nd < cost[ni]) { cost[ni] = nd; came[ni] = i; pushH(ni, nd + h(ni)) }
    }
  }
  if (!found) return [{ x: to.x, z: to.z }]
  const pts = []
  for (let i = gi; i !== -1; i = came[i]) pts.unshift(centreOf(i % cols, Math.floor(i / cols)))
  pts.push({ x: to.x, z: to.z })
  const out = []
  let at = { x: from.x, z: from.z }
  let k = 0
  while (k < pts.length) {
    let far = k
    for (let j = Math.min(pts.length - 1, k + 40); j > k; j--) if (clear(at, pts[j])) { far = j; break }
    out.push(pts[far])
    at = pts[far]
    k = far + 1
  }
  return out
}
function freeNear(x, z) {
  if (!blockedAt(x, z)) return { x, z }
  for (let r = 0.6; r < 9; r += 0.6) for (let a = 0; a < 12; a++) {
    const px = x + Math.cos(a * Math.PI / 6) * r
    const pz = z + Math.sin(a * Math.PI / 6) * r
    if (!blockedAt(px, pz)) return { x: px, z: pz }
  }
  return null
}
// Meeting people (item 3): never inside each other. Every arrival point (spawn, a
// door, a taxi stop, a map pin) is a ring of spots (src/world/ring.js): the nearest
// one free of buildings AND of anyone else who has just arrived at the same point.
function arrivalSpot(x, z, radius = 5) {
  const taken = others ? others.nearbyPositions(x, z, radius) : []
  return ringSpot(x, z, (px, pz) => !blockedAt(px, pz), taken)
}
function walkTo(x, z, then = null) {
  const spot = freeNear(x, z)
  if (!spot) return false
  pending = then
  closeCard()
  mover.walkTo(route(player.position, spot), {
    near: 0.25,
    done: (how) => {
      const p = pending
      pending = null
      if (!p || how === 'cancelled') return
      if (Math.hypot(player.position.x - spot.x, player.position.z - spot.z) > 3.5) return
      arrived(p)
    },
  })
  host.dataset.walking = '1'
  return true
}
function arrived(p) {
  if (p.lot) openLot(p.lot)
  else if (p.ride) ride(p.from, p.ride)
  else if (p.stop) openStop(p.stop)
  save()
}

// ---------- taps ----------
function boxHit(minX, maxX, minY, maxY, minZ, maxZ) {
  box3.min.set(minX, minY, minZ)
  box3.max.set(maxX, maxY, maxZ)
  const hit = ray.ray.intersectBox(box3, v3)
  return hit ? hit.distanceTo(ray.ray.origin) : Infinity
}
// Meeting people (item 1): a tap on a real player (campus already does this; the city
// cut it to City job A's own report) opens their mini card. Within reach, you turn to
// face them first (item 4), same as the campus does on a tap.
function playerHit(ndc) {
  if (!others) return null
  ray.setFromCamera(ndc, camera)
  const hit = ray.intersectObjects(others.group.children, true).find((h) => h.object.name === 'hit')
  let node = hit?.object
  while (node && !node.userData.remote) node = node.parent
  return node ? { id: node.userData.remote, avatar: node } : null
}
function onTap(ndc) {
  if (!running || !player || !ready || uiBusy()) return
  ray.setFromCamera(ndc, camera)
  if (ray.intersectObject(player, true)[0]) { mover.stop(); pending = null; return }
  const other = playerHit(ndc)
  if (other) {
    smooth.tap()
    if ((player.userData.pose || 'stand') === 'stand' && Math.hypot(other.avatar.position.x - player.position.x, other.avatar.position.z - player.position.z) < 6) {
      player.rotation.y = Math.atan2(other.avatar.position.x - player.position.x, other.avatar.position.z - player.position.z)
    }
    noteOpen(other.id, player.position.x, player.position.z)
    window.dispatchEvent(new CustomEvent('mzansi-player-card', { detail: { id: other.id } }))
    return
  }
  smooth.tap()
  mover.noteTap()
  // a building, a billboard: the nearest one the finger is on
  let best = null
  let bestD = Infinity
  for (const lot of LOTS) {
    if (!lot.w) continue
    const d = boxHit(lot.x - lot.w / 2, lot.x + lot.w / 2, 0, lot.h + 1, lot.z - lot.d / 2, lot.z + lot.d / 2)
    if (d < bestD) { bestD = d; best = { lot } }
  }
  for (const b of built.boards) {
    const d = boxHit(b.x - 4.2, b.x + 4.2, 3.4, 7.8, b.z - 4.2, b.z + 4.2)
    if (d < bestD) { bestD = d; best = { board: b } }
  }
  let ground = null
  if (ray.ray.origin.y > 0 && ray.ray.direction.y < 0) ground = ray.ray.at(-ray.ray.origin.y / ray.ray.direction.y, new THREE.Vector3())
  if (best && (!ground || bestD < ground.distanceTo(ray.ray.origin))) {
    if (best.board) { openBoard(best.board); return }
    goLot(best.lot)
    return
  }
  if (!ground) return
  // a door, a plot's board, a taxi stop: within a few metres of the finger
  for (const lot of [...LOTS, ...WAVE2]) if (Math.hypot(lot.door.x - ground.x, lot.door.z - ground.z) < 3.5) { goLot(lot); return }
  for (const s of STOPS) if (Math.hypot(s.x - ground.x, s.z - ground.z) < 4.5) { const spot = arrivalSpot(s.x, s.z); walkTo(spot.x, spot.z, { stop: s.id }); return }
  walkTo(ground.x, ground.z)
}
function goLot(lot) {
  if (Math.hypot(player.position.x - lot.door.x, player.position.z - lot.door.z) < 2.2) { mover.stop(); openLot(lot.id); return }
  const spot = arrivalSpot(lot.door.x, lot.door.z)
  walkTo(spot.x, spot.z, { lot: lot.id })
}

// ---------- cards: a door, a taxi stop, a billboard ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
function uiBusy() { return Boolean(uiRoot?.querySelector('.city-ride:not([hidden])')) || mapUi?.isOpen() }
function showCard(kind, id, html) {
  const node = uiRoot.querySelector('.city-card')
  node.innerHTML = html
  node.hidden = false
  node.dataset.kind = kind
  node.dataset.id = id
  card = { kind, id }
  host.dataset.card = `${kind}:${id}`
}
function closeCard() {
  if (!card) return
  card = null
  uiRoot.querySelector('.city-card').hidden = true
  host.dataset.card = ''
}
function openLot(id) {
  const lot = lotOf(id)
  if (!lot) return
  const soon = CITY.soon
  const later = lot.wave === 2
  showCard('lot', id, `<p class="cc-kind">${esc(partOf(lot.part).name)}</p><h3>${lot.icon ? `${lot.icon} ` : ''}${esc(lot.name)}</h3>
    <p class="cc-tag">${esc(later ? soon.later : soon.title)}</p><p class="cc-line">${esc(fill(later ? soon.laterLine : soon.line, { name: lot.name }))}</p>
    <div class="cc-row"><button type="button" data-city="close">Okay</button></div>`)
}
function openStop(id) {
  const stop = stopOf(id)
  if (!stop) return
  const money = moneyOf(opts.run)
  const rows = STOPS.filter((s) => s.id !== id).map((s) => {
    const fare = taxiFare(stop.part, s.part)
    return `<button type="button" class="cc-go${fare > money ? ' short' : ''}" data-city="ride" data-stop="${s.id}"><span>${esc(s.name)}</span><b>R${fare} · ${CITY.travel.taxi.minutes} min</b></button>`
  }).join('')
  showCard('stop', id, `<p class="cc-kind">Taxi stop · ${esc(partOf(stop.part).name)}</p><h3>🚐 ${esc(stop.name)}</h3>
    <p class="cc-line">Where to? You have R${money}.</p><div class="cc-list">${rows}</div>
    <div class="cc-row"><button type="button" data-city="close">Not now</button></div>`)
}
function openBoard(b) {
  showCard('board', String(b.i), `<p class="cc-kind">Billboard</p><h3>${esc(b.ad.brand)}</h3>${b.ad.line ? `<p class="cc-line">${esc(b.ad.line)}</p>` : ''}
    <div class="cc-row">${b.ad.link ? `<a class="cc-link" href="${esc(b.ad.link)}" target="_blank" rel="noopener">Visit</a>` : ''}<button type="button" data-city="close">Okay</button></div>`)
}
function refuse(res, dest) {
  showCard('short', dest.id || '', `<p class="cc-kind">Minibus taxi</p><h3>🚐 ${esc(dest.name)}</h3>
    <p class="cc-line">${esc(fill(CITY.travel.lines.short, { fare: res.fare, money: res.money }))}</p>
    <div class="cc-row"><button type="button" data-city="walk" data-x="${dest.x}" data-z="${dest.z}" data-lot="${dest.lot || ''}">Walk there</button><button type="button" data-city="close">Okay</button></div>`)
  host.dataset.refused = String(Number(host.dataset.refused || 0) + 1)
}

// ---------- the taxi and the car ----------
const destOfStop = (s) => ({ id: s.id, name: s.name, part: s.part, x: s.x, z: s.z })
const destOfLot = (l) => ({ id: l.id, lot: l.id, name: l.name, part: l.part, x: l.door.x, z: l.door.z })
function place(x, z, facing) {
  const spot = arrivalSpot(x, z)
  mover.stop()
  pending = null
  player.position.set(spot.x, 0, spot.z)
  player.userData.lastPos?.set(spot.x, 0, spot.z)
  if (facing !== undefined) { player.rotation.y = facing; rig.turnBehind(facing); rig.yaw -= 0.45 }
  rig.apply(camera, player.position, 30, null)
  notePart(true)
}
// from: the stop you board at (id); dest: { name, part, x, z, lot? }. Under 3 s, start to finish.
async function ride(fromId, dest) {
  const from = stopOf(fromId) || nearestStop(player.position.x, player.position.z).stop
  const res = payTaxi(opts.run, from.part, dest.part)
  if (!res.ok) { refuse(res, dest); return false }
  closeCard()
  opts.onPay?.({ minutes: res.minutes, fare: res.fare, kind: 'taxi' })
  const veil = uiRoot.querySelector('.city-ride')
  veil.innerHTML = `<div><span class="cr-van">🚐</span><b>${esc(fill(CITY.travel.lines.ride, { from: from.name, to: dest.name }))}</b><small>R${res.fare} · ${res.minutes} min</small></div>`
  veil.hidden = false
  host.dataset.riding = '1'
  await new Promise((r) => setTimeout(r, Math.max(250, 1500 / FAST)))
  if (!running) return false
  place(dest.x, dest.z)
  await new Promise((r) => setTimeout(r, Math.max(150, 500 / FAST)))
  veil.hidden = true
  host.dataset.riding = '0'
  rides += 1
  host.dataset.rides = String(rides)
  host.dataset.fare = String(res.fare)
  if (dest.lot) openLot(dest.lot)
  save()
  return true
}
function parkSpot(lot) {
  // beside the door, a few metres along the wall, turned along it
  const side = { s: [1, 0], n: [-1, 0], e: [0, 1], w: [0, -1] }[lot.side] || [1, 0]
  const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[lot.side] || [0, 1]
  // (an open place, a beach or a yard: back from its entrance, toward the road)
  const back = lot.w ? 1.6 : 5.5
  for (const d of lot.w ? [5, -5, 8, -8, 11] : [3.2, -3.2, 6, -6]) {
    const x = lot.door.x + side[0] * d + out[0] * back
    const z = lot.door.z + side[1] * d + out[1] * back
    if (!blockedAt(x, z) && !blockedAt(x + side[0] * 1.5, z + side[1] * 1.5)) return { x, z, rot: Math.atan2(side[0], side[1]) }
  }
  return { x: lot.door.x + side[0] * 5, z: lot.door.z + side[1] * 5, rot: 0 }
}
function showCar() {
  const at = carAt(opts.run)
  const lot = at && at !== 'res' ? lotOf(at) : null
  if (!lot) { if (carMesh) carMesh.visible = false; host.dataset.car = ''; return }
  if (!carMesh) {
    carMesh = new THREE.Group()
    carMesh.name = 'my-car'
    loadModel('/models/cars/hatchback-sports.glb').then((src) => { const m = src.clone(true); m.scale.setScalar(1.6); m.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false } }); carMesh.add(m) }).catch(() => {})
  }
  if (carMesh.parent !== scene) scene.add(carMesh)
  const p = parkSpot(lot)
  carMesh.position.set(p.x, 0, p.z)
  carMesh.rotation.y = p.rot
  carMesh.visible = true
  host.dataset.car = `${lot.id}:${p.x.toFixed(1)},${p.z.toFixed(1)}`
}
// Drive to a lot (instant, R8). To campus: the scene is left through opts.onExit('res').
function drive(lotId) {
  if (lotId === 'res') {
    const res = payDrive(opts.run, 'res')
    if (!res.ok) return res
    opts.onPay?.({ minutes: 0, fare: res.fare, kind: 'car' })
    opts.onExit?.('res')
    return res
  }
  const lot = lotOf(lotId)
  if (!lot) return { ok: false }
  const res = payDrive(opts.run, lotId)
  if (!res.ok) return res
  opts.onPay?.({ minutes: 0, fare: res.fare, kind: 'car' })
  closeCard()
  place(lot.door.x, lot.door.z)
  showCar()
  openLot(lotId)
  host.dataset.drives = String(Number(host.dataset.drives || 0) + 1)
  save()
  return res
}
// From the map: a way to a pin. way: 'walk' | 'taxi' | 'drive'; target: a lot id, or 'campus'.
function travel(way, target) {
  const lot = target === 'campus' ? null : lotOf(target)
  const dest = lot ? destOfLot(lot) : { id: 'gate', name: 'Campus gate', part: 'campus', x: SPAWN.x, z: SPAWN.z }
  if (way === 'drive') return drive(lot ? lot.id : 'res')
  if (way === 'walk') { const spot = arrivalSpot(dest.x, dest.z); walkTo(spot.x, spot.z, lot ? { lot: lot.id } : null); return { ok: true } }
  const near = nearestStop(player.position.x, player.position.z)
  if (near.dist < 9) { ride(near.stop.id, dest); return { ok: true } }
  const stopSpot = arrivalSpot(near.stop.x, near.stop.z)
  walkTo(stopSpot.x, stopSpot.z, { ride: dest, from: near.stop.id })
  return { ok: true }
}

// ---------- Wave and Race to the pier (Meeting people, items 2, 4 and 6) ----------
// Someone waved or said hi at you (main.js's onPoke, via a 'mzansi-remote-gesture' and
// a 'mzansi-face-peer' it dispatches): their avatar on this phone plays the gesture,
// and you turn to face them first, the same as tapping them does.
function facePeer(id) {
  const avatar = others?.avatarOf(id)
  if (!player || !avatar || (player.userData.pose || 'stand') !== 'stand') return
  if (Math.hypot(avatar.position.x - player.position.x, avatar.position.z - player.position.z) > 8) return
  player.rotation.y = Math.atan2(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
}
window.addEventListener('mzansi-remote-gesture', (event) => others?.gestureOf(event.detail.id, event.detail.gesture || 'emote-yes'))
window.addEventListener('mzansi-face-peer', (event) => facePeer(event.detail.id))

// Race to the pier: invite -> accept -> 3-2-1 -> run there yourself -> whoever
// touches it first wins. A reusable invite/countdown/result flow (src/world/together.js);
// this file only knows where the pier is and when you've reached it.
function startRace(withId, withName) {
  if (!running || race) return
  facePeer(withId)
  race = { withId, withName, startAt: 0, mine: null, theirs: null, waitingShown: false }
  countdown(() => { if (running && race) { race.startAt = performance.now(); window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: '\u{1F3C1} Go! First to touch the pier wins.' } })) } })
}
// Touching down right at the pier often crosses into Beachfront the same moment: the
// district room switch (presence.js setArea) can drop the first race-finish poke while
// it reconnects, so this resends a few times rather than trusting a single send.
function finishRace() {
  if (!race || race.mine != null || !race.startAt) return
  const mine = race.mine = (performance.now() - race.startAt) / 1000
  const withId = race.withId
  gesture(player, 'emote-yes')
  let tries = 0
  const resend = () => {
    if (!race || race.mine !== mine || race.theirs != null) return
    sendPoke(withId, 'race-finish', { ms: mine })
    tries += 1
    if (tries < 7) setTimeout(resend, 700)
  }
  resend()
  setTimeout(() => { if (race && race.mine != null && race.theirs == null) maybeShowResult(true) }, 45000)
  maybeShowResult()
}
function endRace() { race = null; setRacing(false) }
function maybeShowResult(force = false) {
  if (!race || race.mine == null) return
  setRacing(false)
  if (race.theirs == null && !force) {
    if (!race.waitingShown) {
      race.waitingShown = true
      resultCard({ title: '\u{1F3C1} You touched the pier!', lines: [`Your time: ${race.mine.toFixed(1)}s`, `Waiting for ${race.withName}…`], onClose: endRace })
    }
    return
  }
  const withId = race.withId
  const withName = race.withName
  const solo = race.theirs == null
  const iWon = solo || race.mine <= race.theirs
  resultCard({
    title: iWon ? '\u{1F3C6} You win!' : `\u{1F3C1} ${withName} wins!`,
    lines: solo ? [`Your time: ${race.mine.toFixed(1)}s`, `${withName} didn’t finish.`] : [`You: ${race.mine.toFixed(1)}s`, `${withName}: ${race.theirs.toFixed(1)}s`],
    rematch: true,
    onRematch: () => { endRace(); sendInvite('race', withId, withName); window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: `Race invite sent to ${withName}. Waiting…` } })) },
    onClose: endRace,
  })
}
onInvite('race', (from, name, data, { accept, decline }) => {
  inviteToast({
    text: `${name} wants to race to the pier! \u{1F3C1}`,
    onAccept: () => { accept(); setRacing(true); startRace(from, name) },
    onDecline: decline,
  })
})
window.addEventListener('mzansi-together-accepted', (event) => { if (event.detail?.kind === 'race') { setRacing(true); startRace(event.detail.withId, event.detail.withName) } })
window.addEventListener('mzansi-together-declined', (event) => { if (event.detail?.kind === 'race') window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: `${event.detail.withName} said no thanks.` } })) })
window.addEventListener('mzansi-together-timeout', (event) => { if (event.detail?.kind === 'race') window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: `${event.detail.toName} didn’t answer.` } })) })
onPoke((payload) => { if (payload.kind === 'race-finish' && race && payload.from === race.withId) { race.theirs = payload.ms; maybeShowResult() } })

// ---------- people on the street (CAST RULE: skins from skinmix.js) ----------
function npcLook(i) {
  const female = i % 2 === 0
  const models = female ? ['female-b', 'female-d', 'female-f'] : ['male-a', 'male-d', 'male-f']
  const outfits = female ? ['hoodie', 'skirt', 'dress', 'shirt', 'jacket'] : ['hoodie', 'shirt', 'jacket']
  const tops = ['#2e8b57', '#ff8a3d', '#1d7fb8', '#e8497a', '#7b3fe4', '#f7f4ee', '#d9534f', '#2456a6']
  return { model: models[i % models.length], gender: female ? 'female' : 'male', skin: skinFor(i), outfit: outfits[(i * 5) % outfits.length], topColor: tops[(i * 7) % tops.length] }
}
// Pavement lines in a part: either side of each road that runs through it, trimmed to where a body is free.
function pavements(p) {
  const out = []
  for (const r of CITY.roads) {
    const [x0, z0, x1, z1] = r.rect
    const alongX = x1 - x0 > z1 - z0
    for (const side of [-1, 1]) {
      const line = alongX ? { z: side < 0 ? z0 - 1.9 : z1 + 1.9 } : { x: side < 0 ? x0 - 1.9 : x1 + 1.9 }
      let run = null
      const a0 = Math.max(alongX ? x0 : z0, alongX ? p.rect[0] : p.rect[1]) + 3
      const a1 = Math.min(alongX ? x1 : z1, alongX ? p.rect[2] : p.rect[3]) - 3
      for (let t = a0; t <= a1 + 0.01; t += 1.5) {
        const x = alongX ? t : line.x
        const z = alongX ? line.z : t
        const ok = !blockedAt(x, z) && partAt(x, z).id === p.id
        if (ok) { if (!run) run = { a: { x, z }, b: { x, z } }; else run.b = { x, z } } else if (run) { if (Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z) > 18) out.push(run); run = null }
      }
      if (run && Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z) > 18) out.push(run)
    }
  }
  return out
}
const pavementsOf = {}
function seatNpcs() {
  const lines = (pavementsOf[part.id] ||= pavements(part))
  if (!lines.length) { for (const n of npcs) n.avatar.visible = false; return }
  const px = player.position.x
  const pz = player.position.z
  const mid = (l) => Math.hypot((l.a.x + l.b.x) / 2 - px, (l.a.z + l.b.z) / 2 - pz)
  const nearest = [...lines].sort((a, b) => mid(a) - mid(b)).slice(0, NPCS)
  npcs.forEach((n, i) => {
    const l = nearest[i % nearest.length]
    const t = 0.15 + ((i * 0.37) % 0.7)
    n.line = l
    n.dir = i % 2 ? 1 : -1
    n.avatar.position.set(l.a.x + (l.b.x - l.a.x) * t, 0, l.a.z + (l.b.z - l.a.z) * t)
    n.avatar.userData.lastPos?.copy(n.avatar.position)
    n.avatar.visible = true
    n.wait = 0
  })
}
function npcTick(dt) {
  for (const n of npcs) {
    if (!n.line || !n.avatar.visible) continue
    const goal = n.dir > 0 ? n.line.b : n.line.a
    const p = n.avatar.position
    const dx = goal.x - p.x
    const dz = goal.z - p.z
    const d = Math.hypot(dx, dz)
    let moving = false
    if (n.wait > 0) n.wait -= dt
    else if (d < 0.4) { n.dir *= -1; n.wait = 1 + (n.i % 3) }
    else if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < 1.1) n.wait = 0.4 // (never through the player)
    else {
      const step = Math.min(d, n.speed * dt)
      p.x += (dx / d) * step
      p.z += (dz / d) * step
      const want = Math.atan2(dx, dz)
      n.avatar.rotation.y += Math.atan2(Math.sin(want - n.avatar.rotation.y), Math.cos(want - n.avatar.rotation.y)) * Math.min(1, dt * 8)
      moving = true
    }
    poseAvatar(n.avatar, moving, clock + n.i)
  }
}

// ---------- which district you are in: the chip, the room, the telemetry ----------
function notePart(force) {
  const now = partAt(player.position.x, player.position.z)
  if (now.id !== part.id || force) {
    part = now
    partSince = performance.now()
    host.dataset.part = part.id
    const chip = uiRoot.querySelector('.city-chip b')
    if (chip) chip.textContent = part.name
    seatNpcs()
  }
  // (the room follows once you have been in the district a moment: no flapping on a border)
  if (roomPart !== part.id && (force || performance.now() - partSince > 1500)) {
    roomPart = part.id
    setArea(part.id, part.name)
  }
}
function save() {
  if (!player || !running) return
  lastSave = performance.now()
  opts.onSave?.({ x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) })
}

// ---------- light ----------
function nightAt(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440
  if (m >= 7 * 60 && m <= 17 * 60) return 0
  if (m > 17 * 60 && m < 19 * 60) return (m - 17 * 60) / 120
  if (m > 5 * 60 && m < 7 * 60) return 1 - (m - 5 * 60) / 120
  return 1
}
const SKY = { day: new THREE.Color('#bfe3f5'), dusk: new THREE.Color('#f2a36b'), night: new THREE.Color('#141c3a') }
let nightNow = -1
function applyTime() {
  const forced = Number(Q.get('hour'))
  const minutes = forced > 0 ? forced * 60 : opts?.run?.minutes ?? 12 * 60
  const n = nightAt(minutes)
  if (Math.abs(n - nightNow) < 0.002) return
  nightNow = n
  const dusk = Math.max(0, 1 - Math.abs(n - 0.5) * 2)
  const sky = SKY.day.clone().lerp(SKY.night, n).lerp(SKY.dusk, dusk * 0.6)
  scene.background = sky
  scene.fog.color.copy(sky)
  sun.intensity = 1.5 * (1 - n) + 0.12 * n
  hemi.intensity = 1.15 * (1 - n) + 0.3 * n
  built?.applyNight(n)
  host.dataset.night = n.toFixed(2)
}

// ---------- UI ----------
function ui() {
  if (uiRoot) return
  const style = document.createElement('style')
  style.textContent = `
#city3d{position:fixed;inset:0;z-index:0;touch-action:none;background:#bfe3f5}
#city3d[hidden]{display:none}
#city3d canvas{display:block;width:100%;height:100%}
body[data-city="1"] #app{visibility:hidden;pointer-events:none}
body[data-city="1"] #app .g-hud,body[data-city="1"] #app .g-menu,body[data-city="1"] #app .g-scrim{visibility:visible;pointer-events:auto}
body[data-city="1"] #world{display:none}
.city-ui{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:Figtree,system-ui,sans-serif;--city-top:64px}
.city-ui[hidden]{display:none}
.city-ui button,.city-ui a{pointer-events:auto;font:800 14px Figtree,system-ui,sans-serif;border:0;cursor:pointer;min-height:44px}
.city-chip{position:absolute;left:12px;top:calc(var(--city-top) + 8px);display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:22px;background:#22143b;color:#fff;box-shadow:0 4px 14px #0006;font-size:14px}
.city-chip b{color:#f0c400;font-weight:800}
.city-chip small{font-size:12px;opacity:.85}
.city-cams{position:absolute;right:12px;top:calc(var(--city-top) + 8px);display:flex;gap:4px}
.city-cams button{padding:0 11px;border-radius:22px;background:#0009;color:#fff}
.city-cams button[aria-pressed="true"]{background:#f0c400;color:#1c1915}
.city-map{position:absolute;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);padding:0 18px;border-radius:24px;background:#f0c400;color:#1c1915;box-shadow:0 4px 14px #0006;min-height:48px!important;font-size:15px!important}
.city-stop{position:absolute;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);width:60px;height:60px;border-radius:50%;background:#d6452f;color:#fff;box-shadow:0 4px 14px #0006}
.city-stop[hidden]{display:none}
.city-card{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 78px);margin:0 auto;box-sizing:border-box;padding:16px 16px 14px;border-radius:18px;background:#fffaf0;color:#1c1915;border:1.5px solid #e2d4b8;box-shadow:0 10px 30px #0007;pointer-events:auto;max-height:62vh;overflow:auto}
.city-card[hidden]{display:none}
.city-card h3{margin:2px 0 6px;font:800 20px Graduate,Figtree,system-ui,sans-serif}
.city-card .cc-kind{margin:0;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#7b5a1e}
.city-card .cc-tag{display:inline-block;margin:0 0 8px;padding:4px 10px;border-radius:999px;background:#f0c400;color:#1c1915;font-size:14px;font-weight:800}
.city-card .cc-line{margin:0 0 12px;font-size:15px;line-height:1.4}
.city-card .cc-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.city-card .cc-row button,.city-card .cc-link{padding:0 18px;border-radius:22px;background:#22143b;color:#fff;display:inline-flex;align-items:center;text-decoration:none}
.city-card .cc-row button[data-city="walk"]{background:#f0c400;color:#1c1915}
.city-card .cc-list{display:flex;flex-direction:column;gap:6px;margin:0 0 12px}
.city-card .cc-go{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 14px;border-radius:14px;background:#f3e9d2;color:#1c1915;text-align:left;font-size:15px}
.city-card .cc-go b{font-size:14px;white-space:nowrap}
.city-card .cc-go.short{opacity:.6}
.city-ride{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#22143bf2;color:#fff;pointer-events:auto;text-align:center}
.city-ride[hidden]{display:none}
.city-ride div{display:flex;flex-direction:column;gap:8px;align-items:center;padding:0 24px}
.city-ride b{font:800 20px Graduate,Figtree,system-ui,sans-serif;color:#f0c400}
.city-ride small{font-size:15px}
.city-ride .cr-van{font-size:54px;animation:city-van 1.2s ease-in-out infinite alternate}
@keyframes city-van{from{transform:translateX(-26px)}to{transform:translateX(26px)}}
@media (prefers-reduced-motion:reduce){.city-ride .cr-van{animation:none}}
.city-debug{position:absolute;left:50%;transform:translateX(-50%);bottom:84px;background:#0009;color:#fff;border-radius:14px;padding:4px 10px;font-size:12px}`
  document.head.append(style)
  document.body.insertAdjacentHTML('beforeend', `<div class="city-ui" id="city-ui" hidden>
    <div class="city-chip"><span>📍</span><b></b><small data-city-online></small></div>
    <div class="city-cams">${['top', 'sims', 'eye'].map((m) => `<button type="button" data-cam="${m}" aria-pressed="false">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    <button class="city-map" type="button" data-city="map">🗺 SunnyBay map</button>
    <button class="city-stop" type="button" data-city="stop" aria-label="Stop walking" hidden>Stop</button>
    <div class="city-card" role="dialog" aria-live="polite" hidden></div>
    <div class="city-ride" hidden></div>
    ${DEBUG ? '<div class="city-debug" data-stats></div>' : ''}
  </div>`)
  uiRoot = document.getElementById('city-ui')
  uiRoot.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    const act = b.dataset.city
    if (b.dataset.cam) { rig.setMode(b.dataset.cam); syncCams(); measureBars(); window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: b.dataset.cam })) }
    else if (act === 'close') closeCard()
    else if (act === 'stop') { mover.stop(); pending = null }
    else if (act === 'map') mapUi.open()
    else if (act === 'ride') { const s = stopOf(b.dataset.stop); if (s) ride(card?.id, destOfStop(s)) }
    else if (act === 'walk') { const lot = b.dataset.lot; walkTo(Number(b.dataset.x), Number(b.dataset.z), lot ? { lot } : null) }
  })
  mapUi = createCityMap(document.body, {
    where: () => ({ x: player?.position.x || 0, z: player?.position.z || 0, facing: player?.rotation.y || 0, campus: false }),
    run: () => opts?.run,
    go: (way, target) => travel(way, target),
  })
}
function syncCams() { uiRoot.querySelectorAll('[data-cam]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cam === rig.mode))) }
// The game's top bar covers the top of the picture: the view is pushed down by half of it, so you stand in the
// middle of what is left and more of the street ahead shows (not in Eye view).
let shiftY = -1
function measureBars() {
  const hud = document.querySelector('.g-hud')
  const hb = hud && hud.getClientRects().length ? hud.getBoundingClientRect().bottom : 0
  uiRoot.style.setProperty('--city-top', `${Math.round(hb || 56)}px`)
  const want = rig.mode === 'eye' || shot ? 0 : Math.round(((hb || 56) + 52) * 0.5)
  if (want !== shiftY) {
    shiftY = want
    const W = window.innerWidth
    const H = window.innerHeight
    if (want) camera.setViewOffset(W, H, 0, -want, W, H)
    else camera.clearViewOffset()
  }
}

function build() {
  host = document.createElement('div')
  host.id = 'city3d'
  document.body.prepend(host)
  ui()
  renderer = new THREE.WebGLRenderer({ antialias: window.innerWidth >= 700, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.25))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.prepend(renderer.domElement)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.2, 1100)
  window.addEventListener('resize', () => {
    if (!renderer) return
    camera.aspect = window.innerWidth / window.innerHeight
    shiftY = -1
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    measureBars()
  })
  rig = createCameraRig()
  rig.setDistance('sims', 25)
  rig.setPitch(45)
  rig.setDistance('top', 105)
  mover = createPlayer({ blocked: (x, z) => blockedAt(x, z), onWalk: (e) => { if (e.type === 'start') smooth.walkStart(); else { smooth.walkEnd(e.how, e.left, e.x, e.z); if (host) host.dataset.walking = '0'; save() } } })
  input = bindInput(renderer.domElement, { cameraRig: rig, onTap, live: () => running && ready && !uiBusy() })
  window.addEventListener('mzansi-cam', (e) => { if (running && e.detail !== rig.mode) { rig.setMode(e.detail); syncCams() } })
}

function freshScene() {
  scene = new THREE.Scene()
  scene.name = 'city'
  scene.background = SKY.day.clone()
  scene.fog = new THREE.Fog(SKY.day.clone(), 150, 640)
  hemi = new THREE.HemisphereLight('#fff7ea', '#8a8f7a', 1.15)
  sun = new THREE.DirectionalLight('#fff1d6', 1.5)
  sun.position.set(-120, 220, 160)
  scene.add(hemi, sun)
  nightNow = -1
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (last || now)) / 1000) * FAST
  last = now
  clock += dt
  if (!scene || !player || !ready) return
  const s = uiBusy() ? null : input.stick()
  if (s) { mover.setStick(s.x, s.z, s.run, s.mag); pending = null } else mover.setStick(0, 0)
  mover.speedScale = speedFactor(opts.run)
  mover.update(dt)
  const stepping = mover.moving
  if (stepping) { smooth.moved(); drainWalking(opts.run, dt) }
  checkLowHint(opts.run)
  checkAway(player.position.x, player.position.z)
  if (race && race.mine == null && Math.hypot(player.position.x - PIER.x, player.position.z - PIER.z) < 3) finishRace()
  soundLoop('footsteps', stepping)
  poseAvatar(player, stepping, clock)
  npcTick(dt)
  others?.update(dt, camera, player.position, true, rig.mode === 'eye')
  if (shot) { camera.position.set(...shot.pos); camera.lookAt(...shot.look) } else rig.apply(camera, player.position, dt, null)
  for (const p of player.userData.headParts || []) p.visible = rig.mode !== 'eye'
  notePart(false)
  reportLocal({ a: 'campus', x: player.position.x, z: player.position.z, y: 0, h: player.rotation.y, p: player.userData.pose || 'stand' })
  uiRoot.querySelector('.city-stop').hidden = !stepping
  if (card && card.kind !== 'short' && stepping && frameCount % 20 === 0) {
    // (walking away from a door or a stop closes its card)
    const at = card.kind === 'lot' ? lotOf(card.id)?.door : card.kind === 'stop' ? stopOf(card.id) : null
    if (at && Math.hypot(at.x - player.position.x, at.z - player.position.z) > 7) closeCard()
  }
  if (frameCount % 30 === 0) { measureBars(); applyTime() }
  if (stepping && now - lastSave > 5000) save()
  // in through the gate: back on campus
  if (performance.now() - enteredAt > 900 && atGate(player.position.x, player.position.z)) { leave('gate'); return }
  host.dataset.px = player.position.x.toFixed(2)
  host.dataset.pz = player.position.z.toFixed(2)
  host.dataset.cam = rig.mode
  renderer.render(scene, camera)
  if (DEBUG && frameCount % 15 === 0) uiRoot.querySelector('[data-stats]').textContent = `${part.id} · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles / 1000)}k tris`
  frameCount++
  smooth.frame(now, 'city', part.id)
}

// ---------- start / leave ----------
let starting = false
let stopMark = 0
function leave(kind) {
  if (!running) return
  opts?.onExit?.(kind)
}

// options: run, district (the campus data pack, for the campus seen from outside), ads (billboards),
// spawn ({ kind: 'gate' } | { kind: 'at', x, z } | { kind: 'lot', id, drove }), intent ({ way, target } from
// the campus map), onExit(kind: 'gate' | 'res'), onPay({ minutes, fare, kind }), onSave({ x, z }).
export async function startCity(options) {
  opts = options
  if (starting || running) return
  const mark = stopMark
  starting = true
  try { await curtain.cover('Into SunnyBay…') } finally { starting = false }
  if (mark !== stopMark) return
  if (!renderer) build()
  host.hidden = false
  uiRoot.hidden = false
  host.dataset.on = '1'
  running = true
  ready = false
  host.dataset.ready = '0'
  host.dataset.card = ''
  freshScene()
  syncCams()
  try {
    const layout = options.district ? buildingLayout(options.district) : null
    built = await buildCity({ campus: layout, ads: options.ads || [] })
    if (!running) return
    scene.add(built.group)
    hashSolids(built.solids)
    buildGrid()
    for (const k of Object.keys(pavementsOf)) delete pavementsOf[k]
    player = createAvatar(opts.run?.character?.avatar)
    player.userData.isPlayer = true
    player.userData.pose = 'stand'
    scene.add(player)
    mover.attach(player)
    npcs = Array.from({ length: NPCS }, (_, i) => {
      const avatar = createAvatar(npcLook(i))
      avatar.userData.pose = 'stand'
      scene.add(avatar)
      return { i, avatar, speed: 1.15 + (i % 4) * 0.12, line: null, dir: 1, wait: 0 }
    })
    others = createOthers(scene)
    const sp = options.spawn || { kind: 'gate' }
    const lot = sp.kind === 'lot' ? lotOf(sp.id) : null
    if (lot) place(lot.door.x, lot.door.z)
    else if (sp.kind === 'at' && Number.isFinite(sp.x) && !offLimits(sp.x, sp.z, 0.5)) place(sp.x, sp.z)
    else place(SPAWN.x, SPAWN.z, 0)
    showCar()
    applyTime()
    measureBars()
    host.dataset.look = JSON.stringify(player.userData.look)
    if (!frame) frame = requestAnimationFrame(tick)
    await curtain.awaitPeople(scene, appearNow, 6000)
    await curtain.settle(renderer, scene, camera)
    ready = true
    enteredAt = performance.now()
    host.dataset.ready = '1'
    curtain.lift()
    if (lot && sp.drove) openLot(lot.id)
    save()
    if (options.intent) { const it = options.intent; setTimeout(() => { if (running) travel(it.way, it.target) }, 500) }
  } catch (e) {
    console.error(e)
    curtain.lift()
    ready = true
    leave('gate')
  }
}

export function stopCity() {
  stopMark++
  running = false
  ready = false
  soundLoop('footsteps', false)
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  mover?.stop()
  input?.clearKeys?.()
  mapUi?.close()
  closeCard()
  if (host) { host.hidden = true; host.dataset.on = '0'; host.dataset.ready = '0' }
  if (uiRoot) { uiRoot.hidden = true; uiRoot.querySelector('.city-ride').hidden = true }
  others?.dispose?.()
  others = null
  if (carMesh) carMesh.removeFromParent()
  built?.dispose()
  built = null
  scene = null
  player = null
  npcs = []
  pending = null
  shot = null
  roomPart = ''
  race = null
  setRacing(false)
  document.querySelector('.tg-invite')?.remove()
  document.querySelector('.tg-result')?.remove()
}

// Tests and screenshots (read-mostly).
if (typeof window !== 'undefined') {
  window.mzansiCity = {
    plan: { LOTS, WAVE2, STOPS, PARTS },
    info() {
      if (!scene || !player) return null
      renderer.info.reset()
      renderer.render(scene, camera)
      return { ready, part: part.id, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, total: built?.tris, cells: built?.cells, player: [player.position.x, player.position.z], cam: rig.mode, npcs: npcs.filter((n) => n.avatar.visible).length, money: moneyOf(opts.run), car: host.dataset.car || '' }
    },
    teleport: (x, z, facing) => { if (!player) return false; place(x, z, facing); return true },
    walkTo: (x, z) => walkTo(x, z),
    goLot: (id) => { const l = lotOf(id); if (l) goLot(l) },
    travel: (way, target) => travel(way, target),
    blocked: (x, z) => blockedAt(x, z),
    canDrive: () => canDrive(opts?.run),
    // a world point on the screen, in CSS px
    px(x, y, z) {
      const q = new THREE.Vector3(x, y, z).project(camera)
      return { x: (q.x * 0.5 + 0.5) * window.innerWidth, y: (-q.y * 0.5 + 0.5) * window.innerHeight, behind: q.z > 1 }
    },
    // (tests) is any of the picture a void below the horizon? samples the lower 44% of the screen
    coverage() {
      if (!scene || !camera) return null
      let hit = 0
      let n = 0
      for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 10; gx++) {
        ray.setFromCamera(new THREE.Vector2(((gx + 0.5) / 10) * 2 - 1, -(0.56 + ((gy + 0.5) / 16) * 0.44) * 2 + 1), camera)
        n++
        if (ray.intersectObject(built.group, true).length) hit++
      }
      return hit / n
    },
    shot: (pos, look, far) => { shot = pos ? { pos, look } : null; scene.fog.far = far || 640; scene.fog.near = far ? far * 0.8 : 150; measureBars() },
    cam: (mode) => { rig.setMode(mode); syncCams(); measureBars() },
    npcSkins: () => npcs.map((n) => n.avatar.userData.look?.skin),
    others: () => others?.report(camera) || [],
  }
}
