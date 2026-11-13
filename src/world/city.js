// SunnyBay, the city (City job A): its own scene, joined to the campus at the Main Gate by a short
// curtain. Walk out of the gate and you are here; walk back in through the gate and you are on campus.
// Inside the city there is no curtain: the five districts round the campus (Town centre, Suburbs,
// Beachfront, Township, Industrial) are one continuous world. The plan is data
// (data/campusville/sunnybay.json, src/city/plan.js), the still parts are built once and merged
// (src/world/citybuild.js). The 18 places are open (City job B): a door leads into a Room or a Hall, an open-ground
// place is its lot, and each has its Things to do (src/city/places.js, src/world/cityplace.js; "the places" below).
//
// Travel: walking always works and is free; a minibus taxi from any taxi stop (R15 next district, R25
// across the city, 25 game minutes, a moment of under 3 s); a car when the save has run.licence and
// run.car (instant, R8 petrol, parked outside where you drove). Spec: docs/world-designer/sunnybay.md.
// Tests and screenshots (read-mostly): window.mzansiCity.
import { followerCounts, followersText } from '../board.js'
import { waButton } from '../sharewa.js'
import * as THREE from 'three'
import { rideUp } from './rider.js'
import { guardRenderer } from './guard.js'
import { loop as soundLoop, sfx } from '../audio.js'
import { hootNow, setSound } from '../soundscape.js'
import STREET from '../../data/campusville/street_lines.json' with { type: 'json' }
import { SPEED as FAST } from '../speed.js'
import { formatMoney } from '../engine/format.js'
import { smooth } from '../smooth.js'
import * as curtain from '../curtain.js'
import { onPoke, reportLocal, sendPoke, setArea } from '../presence.js'
import { appearNow, createAvatar, gesture, poseAvatar, setPoseLod } from './avatar3d.js'
import { createCameraRig } from './camera.js'
import { getCam } from '../cammode.js'
import { bindInput } from './input.js'
import { createPlayer } from './player.js'
import { createOthers } from './others.js'
import { buildingLayout } from './layout.js'
import { loadModel } from './models.js'
import { skinFor } from './skinmix.js'
import { bakeModel, buildCity } from './citybuild.js'
import { createTraffic, crossLines } from './traffic.js'
import { createCityMap } from './map.js'
import { ringSpot } from './ring.js'
import { checkLowHint, drainWalking, setRacing, speedFactor } from '../engine/energy.js'
import { checkAway, noteOpen } from '../ui/minicard-state.js'
import { countdown, inviteToast, onInvite, resultCard, sendInvite } from './together.js'
import { BOUNDS, CITY, LOTS, PARTS, PIER, RIDE_EXTRA, RIDE_WAIT, SPAWN, STOPS, WAVE2, atGate, canDrive, carAt, lotOf, moneyOf, nearestStop, nextTaxi, offLimits, partAt, partOf, payDrive, payTaxi, stopOf, taxiFare } from '../city/plan.js'
import { PLACES, SLOT_NAME, cityOf, folkSeed, openLine, openNow, opensAt, placeOf, rowState, runRow, slotOf } from '../city/places.js'
import { buildInterior } from './cityplace.js'
import { createCityPlay } from './cityplay.js'
import { createCityCrowd } from './citycrowd.js'
import { resultBody } from '../ui/result-card.js'

const Q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
const DEBUG = Q.get('citydebug') === '1'
const BODY = 0.32
const G = 2 // the walk grid's cell (m)
const NPCS = 8
const CROSSERS = 2 // (Movement: street people who cross at the zebra crossings)

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
let cplay = null // (job K: the games and the doing-it moments, src/world/cityplay.js)
let ccrowd = null // (job J: the pavements and the beach full of people, src/world/citycrowd.js)
const greetings = [] // (job J, tests: the places whose staff greeted you)
const taxiLog = [] // (job I: rides, with the minutes waited and whether you asked for it, for tests)
const hoots = [] // (job I: the cars that hooted at you, for tests)
// Movement (owner, 11 Nov): the cars and kombis on the roads (src/world/traffic.js), and during a taxi ride the
// point the camera follows (the kombi you are in), else null.
let traffic = null
let trafficOn = true // (tests: off, to measure what the traffic costs)
let rideCam = null
const rideAt = new THREE.Vector3()
const rideLog = [] // (tests: every step of the last kombi ride, in order)
// (the models of the car kit face +Z: a car's heading is its rotation)
const CAR_FLIP = 0
let shot = null
let lastSave = 0
let rides = 0
let race = null // { withId, withName, startAt, mine, theirs, waitingShown }: Race to the pier (item 6)
// City job B: the places. inside: the Room or Hall you are in ({ place, room, lot }); todo: the place whose
// Things to do sheet is open; folk: the staff and patrons standing at a place ({ id, list }); busy: a door, a row
// or a result card is on screen (taps on the world wait).
let inside = null
let todo = null
let folk = null
let busy = false
let doing = 0
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
const blockedAt = (x, z) => (inside ? inside.room.blocked(x, z, BODY) : offLimits(x, z, 0.2) || inSolid(x, z, BODY))
// (job I: you can no longer walk through a car; one that stopped on top of you never traps you: stepping out is allowed)
const carIn = (x, z) => !inside && Boolean(traffic?.solidAt(x, z)) && !traffic.solidAt(player.position.x, player.position.z)
const pickLine = (list, k = Math.random()) => (list?.length ? list[Math.floor(k * list.length) % list.length] : '')

let grid = null // { x0, z0, g, cols, rows, cells: Uint8Array }: the city's, or the room's while you are inside one
let cityGrid = null
function buildGrid() {
  const cols = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / G)
  const rows = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / G)
  const cells = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = BOUNDS.x0 + (c + 0.5) * G
    const z = BOUNDS.z0 + (r + 0.5) * G
    cells[r * cols + c] = offLimits(x, z, 0.9) || inSolid(x, z, 1.0) ? 1 : 0
  }
  grid = cityGrid = { x0: BOUNDS.x0, z0: BOUNDS.z0, g: G, cols, rows, cells }
}
// A room's own walk grid (half-metre cells: the aisles between shelves are narrow).
function roomGrid(room) {
  const g = 0.5
  const cols = Math.ceil(room.W / g)
  const rows = Math.ceil(room.D / g)
  const cells = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells[r * cols + c] = room.blocked(room.bounds.minX + (c + 0.5) * g, room.bounds.minZ + (r + 0.5) * g, 0.42) ? 1 : 0
  return { x0: room.bounds.minX, z0: room.bounds.minZ, g, cols, rows, cells }
}
const cellOf = (x, z) => [Math.min(grid.cols - 1, Math.max(0, Math.floor((x - grid.x0) / grid.g))), Math.min(grid.rows - 1, Math.max(0, Math.floor((z - grid.z0) / grid.g)))]
const centreOf = (c, r) => ({ x: grid.x0 + (c + 0.5) * grid.g, z: grid.z0 + (r + 0.5) * grid.g })
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
  const n = Math.ceil(d / (inside ? 0.25 : 0.6))
  for (let i = 1; i < n; i++) { const t = i / n; const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t; if (blockedAt(x, z) || (routeCars && traffic.solidAt(x, z, 0.6))) return false }
  return true
}
// A* on the grid (a binary heap), then the corners that are not needed are dropped.
// Job I: cars are solid, so a walk is planned round the ones on the road near you now (a car standing for you at
// your side would otherwise block the very walk it is waiting for: neither moved). Their cells are closed for this
// route only; the one you stand in stays open.
let routeCars = false
function withCarsShut(fn) {
  if (inside || !traffic?.cars || grid !== cityGrid) return fn()
  const shut = []
  const px = player.position.x
  const pz = player.position.z
  for (const c of traffic.cars) {
    if (!c.on || Math.hypot(c.x - px, c.z - pz) > 60) continue
    const R = c.half + 1.5
    for (let x = c.x - R; x <= c.x + R; x += 1) for (let z = c.z - R; z <= c.z + R; z += 1) {
      if (!traffic.solidAt(x, z, 0.9) || Math.hypot(x - px, z - pz) < 1.2) continue
      const [cc, rr] = cellOf(x, z)
      const i = rr * grid.cols + cc
      if (grid.cells[i] === 0) { grid.cells[i] = 2; shut.push(i) }
    }
  }
  routeCars = true
  try { return fn() } finally { for (const i of shut) grid.cells[i] = 0; routeCars = false }
}
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
  for (let r = inside ? 0.3 : 0.6; r < 9; r += inside ? 0.3 : 0.6) for (let a = 0; a < 12; a++) {
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
  if (!inside) closeTodo()
  mover.walkTo(withCarsShut(() => route(player.position, spot)), {
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
// (job K) walk to a spot and resolve when there (or after a while, if something is in the way)
function walkNear(x, z, ms = 9000) {
  return new Promise((resolve) => {
    const spot = freeNear(x, z)
    if (!spot) { resolve(false); return }
    let done = false
    const fin = (ok) => { if (!done) { done = true; resolve(ok) } }
    mover.walkTo(withCarsShut(() => route(player.position, spot)), { near: 0.3, done: () => fin(true) })
    setTimeout(() => { mover.stop(); fin(false) }, Math.max(1500, ms / FAST))
  })
}
function arrived(p) {
  if (p.lot) openLot(p.lot)
  else if (p.ride) ride(p.from, p.ride)
  else if (p.stop) openStop(p.stop)
  else if (p.todo) openTodo(placeOf(p.todo))
  else if (p.leave) { leavePlace(); return }
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
  // (job K) during a kick-about every tap is a kick (the ball comes to you, so the finger is often on you)
  if (cplay?.kicking()) { cplay.tapBeach(); return }
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
  let ground = null
  if (ray.ray.origin.y > 0 && ray.ray.direction.y < 0) ground = ray.ray.at(-ray.ray.origin.y / ray.ray.direction.y, new THREE.Vector3())
  if (inside) { tapInside(ground); return }
  // (job K) the beach's ball: a tap on it starts a kick-about; during one, a tap kicks
  if (folk?.id === 'beach' && cplay?.tapBeach(ray, ground)) return
  // (job I) a person in the street or at an open-ground place: they stop, turn to you and say hello
  const who = personHit(ground)
  if (who) { greet(who); return }
  // the staff of an open-ground place: their list
  const keeper = folk?.list[0]?.avatar.position
  if (keeper && boxHit(keeper.x - 0.5, keeper.x + 0.5, 0, 1.9, keeper.z - 0.5, keeper.z + 0.5) < Infinity) { const pl = placeOf(folk.id); if (pl) { goLot(pl.lot); return } }
  // a building, a billboard: the nearest one the finger is on
  let best = null
  let bestD = Infinity
  for (const lot of LOTS) {
    if (!lot.w) continue
    const d = boxHit(lot.x - lot.w / 2, lot.x + lot.w / 2, 0, lot.h + 1, lot.z - lot.d / 2, lot.z + lot.d / 2)
    if (d < bestD) { bestD = d; best = { lot } }
  }
  for (const b of built.boards) {
    const d = b.wall ? boxHit(b.x - 3.4, b.x + 3.4, b.y - 1.7, b.y + 1.7, b.z - 3.4, b.z + 3.4) : boxHit(b.x - 4.2, b.x + 4.2, 3.4, 7.8, b.z - 4.2, b.z + 4.2)
    if (d < bestD) { bestD = d; best = { board: b } }
  }
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
// The street person or open-ground patron under the finger (not the one serving: they open the place's list).
function personHit(ground) {
  let best = null
  let bestD = Infinity
  const people = [...npcs.filter((n) => n.avatar.visible).map((n) => ({ n, a: n.avatar })), ...(folk && !inside ? folk.list.filter((f) => !f.staff && f.avatar.visible).map((f) => ({ f, a: f.avatar })) : [])]
  for (const p of people) {
    const q = p.a.position
    const d = boxHit(q.x - 0.45, q.x + 0.45, 0, 1.85, q.z - 0.45, q.z + 0.45)
    if (d < bestD) { bestD = d; best = p }
  }
  // (13 Nov) a walker steps on between the finger going down and the tap landing: a tap within 1 m of anybody's feet is them
  if (ground && (!best || bestD > ground.distanceTo(ray.ray.origin) + 0.6)) {
    best = null
    let near = 1.0
    for (const p of people) { const d = Math.hypot(p.a.position.x - ground.x, p.a.position.z - ground.z); if (d < near) { near = d; best = p } }
    return best
  }
  return best
}
function greet(p) {
  const a = p.a
  const near = Math.hypot(a.position.x - player.position.x, a.position.z - player.position.z)
  if (near > 9) { const spot = arrivalSpot(a.position.x + (player.position.x - a.position.x) / near * 1.6, a.position.z + (player.position.z - a.position.z) / near * 1.6); walkTo(spot.x, spot.z); return }
  mover.stop()
  pending = null
  const toYou = Math.atan2(player.position.x - a.position.x, player.position.z - a.position.z)
  a.rotation.y = toYou
  player.rotation.y = toYou + Math.PI
  if (p.n) p.n.wait = 3.5
  if (p.f) { p.f.wait = Math.max(p.f.wait || 0, 3.5); p.f.goal = null }
  gesture(a, 'emote-yes')
  const line = pickLine(STREET.greet, ((a.userData.look?.seed || 0) + clock) % 1)
  greeted.push({ line, at: Math.round(clock * 10) / 10 })
  toast(`\u{1F44B} \u201C${line}\u201D`)
}
const greeted = [] // (for tests)
function goLot(lot) {
  if (Math.hypot(player.position.x - lot.door.x, player.position.z - lot.door.z) < 2.2) { mover.stop(); openLot(lot.id); return }
  const spot = arrivalSpot(lot.door.x, lot.door.z)
  walkTo(spot.x, spot.z, { lot: lot.id })
}

// ---------- cards: a door, a taxi stop, a billboard ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
function uiBusy() { return busy || Boolean(uiRoot?.querySelector('.city-ride:not([hidden])')) || mapUi?.isOpen() }
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
function openStop(id) {
  const stop = stopOf(id)
  if (!stop) return
  const money = moneyOf(opts.run)
  const rows = STOPS.filter((s) => s.id !== id).map((s) => {
    const fare = taxiFare(stop.part, s.part)
    return `<button type="button" class="cc-go${fare > money ? ' short' : ''}" data-city="ride" data-stop="${s.id}"><span>${esc(s.name)}</span><b>R${fare} · ${CITY.travel.taxi.minutes} min</b></button>`
  }).join('')
  const next = nextTaxi(id, opts.run?.minutes)
  showCard('stop', id, `<p class="cc-kind">Taxi stop · ${esc(partOf(stop.part).name)}</p><h3>🚐 ${esc(stop.name)}</h3>
    <p class="cc-next" data-next="${next.wait}"><b>Wait for the next taxi (${next.wait} min)</b><small>Next taxi ${next.at}</small></p>
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

// ---------- the places (City job B): doors, Things to do, the rooms ----------
// A door (or the entrance of an open-ground place) opens the place: a Room or a Hall is walked into (its own
// room, built from data: src/world/cityplace.js), an open-ground place is the lot itself. Either way the Things to
// do sheet lists that place's ten rows (src/city/places.js runs them). Spec: docs/world-designer/sunnybay.md, Places.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const toast = (text) => window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text } }))
const signed = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)
const roomOrigin = (place) => ({ x: 2000 + PLACES.indexOf(place) * 160, z: 2000 }) // (far off the map: each place its own spot)

// How many other players are in this place with you ("Better with friends here": any other player counts, NPCs never).
function friendsHere(place) {
  if (!others || !place) return 0
  if (inside) {
    if (inside.place.id !== place.id) return 0
    const r = inside.room
    return others.nearbyPositions(r.centre.x, r.centre.z, Math.hypot(r.W, r.D) / 2 + 1).length
  }
  const lot = place.lot
  if (lot.area) {
    const [x0, z0, x1, z1] = lot.area
    return others.nearbyPositions((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 14).filter((p) => p.x > x0 - 12 && p.x < x1 + 12 && p.z > z0 - 12 && p.z < z1 + 12).length
  }
  return others.nearbyPositions(lot.door.x, lot.door.z, 25).length
}

function soonCard(lot) {
  const soon = CITY.soon
  const later = lot.wave === 2
  showCard('lot', lot.id, `<p class="cc-kind">${esc(partOf(lot.part).name)}</p><h3>${lot.icon ? `${lot.icon} ` : ''}${esc(lot.name)}</h3>
    <p class="cc-tag">${esc(later ? soon.later : soon.title)}</p><p class="cc-line">${esc(fill(later ? soon.laterLine : soon.line, { name: lot.name }))}</p>
    <div class="cc-row"><button type="button" data-city="close">Okay</button></div>`)
}
// Outside its hours the door says when it opens (and, if that is later today, lets you wait for it).
function closedCard(place) {
  const o = opensAt(opts.district.meta, opts.run, place)
  const lot = place.lot
  showCard('closed', place.id, `<p class="cc-kind">${esc(partOf(lot.part).name)}</p><h3>${lot.icon ? `${lot.icon} ` : ''}${esc(place.name)}</h3>
    <p class="cc-tag">Closed now</p><p class="cc-line">Opens ${o.today ? '' : 'tomorrow, '}${esc(o.name)} ${esc(o.time)}. Open: ${esc(openLine(place))}.</p>
    <div class="cc-row">${o.today && opts.onWait ? `<button type="button" data-city="wait" data-phase="${o.phase}">Skip to ${esc(o.name)} ${esc(o.time)}</button>` : ''}<button type="button" data-city="close">Okay</button></div>`)
}
function openLot(id) {
  const lot = lotOf(id)
  if (!lot) return
  const place = placeOf(id)
  if (!place) { soonCard(lot); return }
  if (inside) { if (inside.place.id === id) openTodo(place); return }
  if (!openNow(opts.run, place)) { closedCard(place); return }
  if (place.template === 'open') { seatFolk(place); openTodo(place); return }
  goInside(place)
}

// ---- Things to do: the sheet ----
function todoHtml(place) {
  const run = opts.run
  const friends = friendsHere(place)
  const c = cityOf(run)
  const rows = place.rows.map((row) => {
    const st = rowState(opts.district, run, place, row, { friends })
    const fx = [[row.energy, 'Energy'], [row.fullness, 'Fullness'], [row.grades, 'Grades'], [st.social, 'Social']].filter(([v]) => v).map(([v, label]) => `<small class="${v > 0 ? 'up' : 'down'}">${signed(v)} ${label}</small>`).join('')
    const price = row.gig ? `<b class="ct-pay">+${formatMoney(row.money)}</b>` : row.cost ? `<b>${formatMoney(row.cost)}</b>` : '<b class="ct-free">Free</b>'
    const tags = [row.quick ? '<small class="tag">Quick</small>' : '', row.gig ? '<small class="tag gig">Gig</small>' : '', row.showoff ? '<small class="tag flex">Show-off</small>' : '',
      row.friends ? `<small class="tag ${friends ? 'with' : 'alone'}">${friends ? '\u{1F465} Friends here' : '\u{1F465} Half Social alone'}</small>` : ''].join('')
    return `<button type="button" class="ct-row${st.disabled ? ' off' : ''}" data-city="row" data-row="${row.id}" data-why="${st.why}" aria-disabled="${st.disabled}">
      <span class="ct-top"><strong>${esc(row.name)}</strong>${price}</span>
      <span class="ct-meta">${row.minutes} min${tags}</span>
      ${fx ? `<span class="ct-fx">${fx}</span>` : ''}
      ${st.disabled ? `<span class="ct-why">${esc(st.reason)}</span>` : ''}
    </button>`
  }).join('')
  const lot = place.lot
  return `<header><div><p class="cc-kind">${esc(partOf(lot.part).name)} · Things to do</p><h3>${lot.icon ? `${lot.icon} ` : ''}${esc(place.name)}</h3></div><button type="button" class="ct-x" data-city="todo-close" aria-label="Close">✕</button></header>
    <p class="ct-feel">${esc(place.feel)}</p>
    ${place.id === 'bank' ? `<p class="ct-balance">Your balance <b data-balance>${formatMoney(moneyOf(run))}</b></p>` : ''}
    ${place.dress.staffName ? `<p class="ct-staff"><b>${esc(place.dress.staffName)}</b> <span>“${esc(place.dress.greet || '')}”</span></p>` : ''}
    <p class="ct-slots">${SLOT_NAME[slotOf(run)]} · ${run.slotsLeft} of ${run.slotsTotal} slots left${c.thirds ? ` · ${c.thirds} more quick one${c.thirds > 1 ? 's' : ''} fit in this slot` : ''}</p>
    <div class="ct-list">${rows}</div>`
}
function openTodo(place) {
  if (!place || !running) return
  closeCard()
  const node = uiRoot.querySelector('.city-todo')
  node.innerHTML = todoHtml(place)
  node.setAttribute('aria-label', `Things to do at ${place.name}`)
  node.hidden = false
  todo = place
  host.dataset.card = `todo:${place.id}`
  host.dataset.friends = String(friendsHere(place))
}
function closeTodo() {
  if (!todo) return
  todo = null
  uiRoot.querySelector('.city-todo').hidden = true
  if (host.dataset.card.startsWith('todo:')) host.dataset.card = ''
}

// ---- picking a row: a moment of doing it, then the result card ----
async function pickRow(rowId) {
  const place = todo
  const row = place?.rows.find((r) => r.id === rowId)
  if (!row || busy) return
  const st = rowState(opts.district, opts.run, place, row, { friends: friendsHere(place) })
  if (st.disabled) { toast(st.reason); return }
  busy = true
  closeTodo()
  mover.stop()
  pending = null
  const to = folk?.id === place.id ? folk.list[0]?.avatar.position : null
  if (to && Math.hypot(to.x - player.position.x, to.z - player.position.z) < 12) player.rotation.y = Math.atan2(to.x - player.position.x, to.z - player.position.z)
  // (job K) a game (bowling, the racing cabinet, the library's focus, a gym set, the swim) or a few seconds of your
  // student doing it, each with its own sound; a game's score can set what the row gives
  const mine = ++doing
  const pill = uiRoot.querySelector('.city-doing')
  const game = Boolean(cplay?.kindOf(row))
  if (!game) {
    pill.innerHTML = `<b>${esc(row.name)}</b><i></i>`
    pill.style.setProperty('--ms', `${Math.max(350, 3000 / FAST)}ms`)
    pill.hidden = false
  }
  let extra = {}
  try { extra = (await cplay?.playRow(place, row)) || {} } catch (e) { console.error(e) }
  pill.hidden = true
  if (!running || mine !== doing) { busy = false; return }
  const res = runRow(opts.district, opts.run, place, row, { friends: friendsHere(place), adjust: extra.adjust })
  if (!res.ok) { busy = false; toast(res.error); openTodo(place); return }
  opts.onRow?.({ place, row, result: res })
  showResult(place, row, res, extra.note)
}
// Job I (the Arcade's card said "Shopping done"): what kind of thing you did, by place. A gig is a shift and a real
// meal is a meal anywhere; everything else is named for the place, with the picture that fits it.
const PLACE_KIND = {
  arcade: ['other', 'Game done'], bank: ['other', 'Banking done'], clinic: ['other', 'Clinic visit done'], barber: ['shop', 'Salon visit done'],
  lifecup: ['food', 'Café stop done'], lounge: ['social', 'Hangout done'], gym: ['gym', 'Workout done'], church: ['social', 'Church visit done'],
  dealership: ['shop', 'Showroom visit done'], mall: ['shop', 'Shopping done'], greenway_city: ['shop', 'Shopping done'], city_library: ['study', 'Study done'],
  beach: ['social', 'Beach time done'], park: ['social', 'Park time done'], taxi_rank: ['other', 'Taxi rank stop done'], petrol: ['other', 'Petrol stop done'],
  stadium: ['gym', 'Stadium visit done'], driving_school: ['study', 'Lesson done'],
}
function showResult(place, row, res, gameNote = '') {
  const [kindType, eyebrow] = PLACE_KIND[place.id] || []
  const meal = row.fullness >= 8
  const type = row.gig ? 'work' : meal ? 'food' : kindType || (row.grades >= 3 ? 'study' : row.social >= 5 ? 'social' : 'other')
  const body = resultBody({ cardId: `city-${row.id}-${Date.now()}`, title: row.name, delta: res.delta, esc, line: row.result, type, eyebrow: row.gig || meal ? '' : eyebrow || '' })
  const notes = []
  if (gameNote) notes.push(gameNote) // (job K: how the game went)
  // (the place's own person has a word for you: docs/world-designer/social.md, in city_places.json)
  if (place.dress.staffName && place.dress.during) notes.push(`${place.dress.staffName}: “${place.dress.during}”`)
  if (place.id === 'bank') notes.push(`\u{1F3E6} Your balance: ${formatMoney(moneyOf(opts.run))}`) // (job I: the bank shows your money)
  if (res.half) notes.push('\u{1F465} On your own this time, so half the Social. It pays in full with another player here.')
  if (res.granted === 'yard') notes.push('\u{1F6A6} Yard lesson done. The road lesson is next.')
  if (res.granted === 'road') notes.push('\u{1F6A6} Road lesson done. You can take the licence test now.')
  if (res.granted === 'licence') notes.push("\u{1FAAA} Your driver's licence. A car is next: SunnyBay Cars, in the Suburbs.")
  if (res.granted.startsWith('car:')) notes.push('\u{1F697} It is parked outside. Drive from the SunnyBay map: R8 a trip.')
  else if (res.showoff) notes.push('✨ It shows on your player card now.')
  for (const g of res.goals || []) notes.push(`\u{1F3AF} Goal done: ${g}`)
  const node = uiRoot.querySelector('.city-result')
  node.className = `g-result rc city-result${body.big ? ' big' : ''}`
  node.setAttribute('aria-label', row.name)
  node.innerHTML = `${body.html}${notes.map((n) => `<p class="cr-note">${esc(n)}</p>`).join('')}<button type="button" class="g-go block" data-city="result-ok">Continue</button>`
  node.hidden = false
  uiRoot.querySelector('.city-scrim').hidden = false
  node.dataset.place = place.id
  host.dataset.card = `result:${row.id}`
  host.dataset.result = row.id
  host.dataset.granted = res.granted || ''
}
function closeResult() {
  const node = uiRoot.querySelector('.city-result')
  if (node.hidden) return
  const place = placeOf(node.dataset.place)
  node.hidden = true
  node.className = 'city-result' // (a .g-result only while it shows: launch.js calm() looks for one anywhere in the page)
  uiRoot.querySelector('.city-scrim').hidden = true
  host.dataset.card = ''
  busy = false
  if (!inside) showCar()
  // (back to the list: the next thing, or a look at what the day still has room for)
  if (place && (inside ? inside.place.id === place.id : Math.hypot(place.lot.door.x - player.position.x, place.lot.door.z - player.position.z) < 14)) openTodo(place)
}

// ---- the staff and the patrons of a place (CAST RULE: skins from skinmix.js, through npcLook) ----
function clearFolk() {
  if (!folk) return
  if (folk.id === 'beach') cplay?.dropBall()
  for (const f of folk.list) { f.avatar.userData.disposed = true; scene?.remove(f.avatar) }
  folk = null
  if (host) host.dataset.folk = ''
}
function seatFolk(place) {
  if (folk?.id === place.id) return
  clearFolk()
  const d = place.dress
  const seed = folkSeed(place)
  const spots = inside ? [inside.room.staff, ...inside.room.people] : [d.staff, ...(d.people || [])].filter(Boolean).map(([x, z, rot = 0]) => {
    const p = freeNear(place.lot.door.x + x, place.lot.door.z + z) || { x: place.lot.door.x + x, z: place.lot.door.z + z }
    return { x: p.x, z: p.z, rot: (rot * Math.PI) / 180 }
  })
  folk = {
    id: place.id,
    list: spots.map((s, i) => {
      const avatar = createAvatar(npcLook(seed + i))
      avatar.userData.pose = 'stand'
      avatar.position.set(s.x, 0, s.z)
      avatar.rotation.y = s.rot
      scene.add(avatar)
      return { avatar, i, staff: i === 0, state: 'browse', goal: null, wait: 1.5 + i * 0.7, left: 0 }
    }),
  }
  host.dataset.folk = `${place.id}:${folk.list.length}`
  if (place.id === 'beach' && !inside) cplay?.beachBall(place) // (job K: a ball on the sand)
}
// Movement (owner, 11 Nov): inside a place the patrons (everybody but the one serving) live on a loop instead of
// standing still: browse (walk to a spot and look at what is there), queue (in line in front of the staff),
// and now and then leave through the door and come back in a little later. The staff stays at the counter.
const PATRON_SPEED = 1.05
// (job J) the chairs of a room, worked out from its tables exactly as cityprops.js lays them out: round tables have
// theirs on a 1.05 m ring, long tables theirs either side. Each faces its table.
function roomChairs(place, room) {
  const out = []
  const c = room.centre
  for (const o of place.dress?.props || []) {
    for (let i = 0; i < (o.n || 1); i++) {
      const x = c.x + o.x + (o.dx || 0) * i
      const z = c.z + o.z + (o.dz || 0) * i
      if (o.k === 'round' && o.chairs) for (let k = 0; k < o.chairs; k++) { const a = ((k / o.chairs) * 360 + 45) * Math.PI / 180; out.push({ x: x + Math.sin(a) * 1.05, z: z + Math.cos(a) * 1.05, rot: a + Math.PI, y: 0.46 }) }
      if (o.k === 'longtable' && o.chairs) { const each = Math.ceil(o.chairs / 2); const w = o.w || 3; for (let k = 0; k < each; k++) { const t = -w / 2 + (k + 0.5) * (w / each); out.push({ x: x + t, z: z - 0.95, rot: 0, y: 0.46 }, { x: x + t, z: z + 0.95, rot: Math.PI, y: 0.46 }) } }
    }
  }
  return out
}
const EATS = new Set(['lifecup', 'lounge', 'mall', 'greenway_city'])
function patronPlan(f) {
  const room = inside?.room
  if (!room) return
  const clear = room.people.filter((p) => Math.hypot(p.x - room.focus.x, p.z - room.focus.z) > 1.7)
  const spots = clear.length ? clear : room.people.length ? room.people : [room.focus]
  if (f.state === 'out') { f.state = 'in'; f.goal = spots[(f.i + (f.round || 0)) % spots.length]; return }
  // (each patron goes round browse, queue, browse, leave, starting at a different place in the round)
  f.round = (f.round ?? f.i) + 1
  room.chairs ||= roomChairs(inside.place, room)
  const next = ['browse', 'queue', 'sit', 'browse', 'leave'][f.round % 5]
  if (next === 'leave') { f.state = 'leave'; f.goal = { x: room.exit.x, z: room.exit.z - 0.6 }; return }
  if (next === 'sit') {
    // (job J) a free chair: walk up to it, sit (eating, in a cafe), stand up later
    const chair = room.chairs.find((ch) => !folk.list.some((o) => o.chair === ch))
    if (chair) { f.state = 'toChair'; f.chair = chair; f.goal = { x: chair.x - Math.sin(chair.rot) * 0.6, z: chair.z - Math.cos(chair.rot) * 0.6, face: chair.rot }; return }
  }
  if (next === 'queue') {
    // (in line: one behind the other in front of the counter)
    const inLine = folk.list.filter((o) => o !== f && o.state === 'queue').length
    const sx = Math.sin(room.staff.rot)
    const sz = Math.cos(room.staff.rot)
    f.state = 'queue'
    f.goal = { x: room.focus.x + sx * inLine * 0.9, z: room.focus.z + sz * inLine * 0.9, face: Math.atan2(-sx, -sz) }
    return
  }
  let s = spots[(f.i * 3 + f.round) % spots.length]
  // (job J: never bunched up: a spot nobody else is at or heading for, if there is one)
  for (let k = 0; k < spots.length; k++) { const c = spots[(f.i * 3 + f.round + k) % spots.length]; if (!folk.list.some((o) => o !== f && Math.hypot((o.goal?.x ?? o.avatar.position.x) - c.x, (o.goal?.z ?? o.avatar.position.z) - c.z) < 1.3)) { s = c; break } }
  f.state = 'browse'
  f.goal = { x: s.x + (((f.i * 37) % 7) - 3) * 0.15, z: s.z + (((f.i * 53) % 7) - 3) * 0.15, face: s.rot }
}
function patronTick(dt) {
  for (const f of folk.list) {
    if (f.staff) continue
    const a = f.avatar
    if (f.state === 'sit') {
      f.wait -= dt
      if (f.wait <= 0) { a.userData.pose = 'stand'; a.userData.eating = false; a.position.set(f.chair.x - Math.sin(f.chair.rot) * 0.6, 0, f.chair.z - Math.cos(f.chair.rot) * 0.6); a.userData.lastPos?.copy(a.position); f.chair = null; f.state = 'browse'; f.goal = null }
      poseAvatar(a, false, clock + f.i * 1.7)
      continue
    }
    if (f.wait > 0) {
      f.wait -= dt
      if (f.state === 'out') { a.visible = false; if (f.wait <= 0) { a.visible = true; a.position.set(inside.room.exit.x, 0, inside.room.exit.z - 0.4); a.userData.lastPos?.copy(a.position); patronPlan(f) } continue }
      poseAvatar(a, false, clock + f.i * 1.7)
      continue
    }
    if (!f.goal) { patronPlan(f); continue }
    const dx = f.goal.x - a.position.x
    const dz = f.goal.z - a.position.z
    const d = Math.hypot(dx, dz)
    // (never through you: wait a moment)
    const close = Math.hypot(player.position.x - a.position.x, player.position.z - a.position.z) < 0.9
    // (going out with you standing by the door: out past you, the door is right there)
    const out = f.state === 'leave' && close && d < 2.5
    if (d < 0.15 || close) {
      if (close && !out) { f.held = (f.held || 0) + 0.4; f.wait = 0.4; if (f.held > 1.2) { f.held = 0; f.goal = null } continue }
      f.held = 0
      if (f.goal.face !== undefined) a.rotation.y = f.goal.face
      f.goal = null
      if (f.state === 'leave') { f.state = 'out'; f.wait = 5 + (f.i % 3) * 3; a.visible = false; f.left = (f.left || 0) + 1; continue }
      if (f.state === 'toChair') {
        const ch = f.chair
        a.userData.standAt = { x: a.position.x, z: a.position.z, yaw: a.rotation.y }
        a.position.set(ch.x, ch.y, ch.z)
        a.rotation.y = ch.rot
        a.userData.seat = ch
        a.userData.pose = 'sit'
        a.userData.eating = EATS.has(inside.place.id)
        f.state = 'sit'
        f.wait = 10 + (f.i % 4) * 3
        continue
      }
      f.wait = f.state === 'queue' ? 4 + (f.i % 3) : 3 + ((f.i * 5) % 6)
      if (f.state === 'queue') gesture(a, 'talk')
      continue
    }
    const step = Math.min(d, PATRON_SPEED * dt)
    a.position.x += (dx / d) * step
    a.position.z += (dz / d) * step
    const want = Math.atan2(dx, dz)
    a.rotation.y += Math.atan2(Math.sin(want - a.rotation.y), Math.cos(want - a.rotation.y)) * Math.min(1, dt * 8)
    poseAvatar(a, true, clock + f.i)
  }
}

// Job I (owner: "NPCs bunch up and stand silent at the bowling alley and the beach"): at an open-ground place the
// patrons wander round their own spot, stop a few seconds to chat or look about, and move on; never two on one spot,
// never through you. The one serving stays, and greets now and then.
const OPEN_ROAM = { beach: 11, park: 7, stadium: 7 }
function openTick(dt) {
  const roam = OPEN_ROAM[folk.id] || 4.5
  for (const f of folk.list) {
    const a = f.avatar
    f.home ||= { x: a.position.x, z: a.position.z }
    if (f.staff) { f.wait = (f.wait || 0) - dt; if (f.wait <= 0) { f.wait = 7 + (f.i % 3) * 2; gesture(a, 'talk') } poseAvatar(a, false, clock); continue }
    if (f.wait > 0) { f.wait -= dt; poseAvatar(a, false, clock + f.i * 1.7); continue }
    if (!f.goal) {
      // (a spot in reach of home, clear of walls and of where the others are heading)
      for (let k = 0; k < 8 && !f.goal; k++) {
        const ang = Math.random() * Math.PI * 2
        const r = roam * (0.35 + Math.random() * 0.65)
        const x = f.home.x + Math.cos(ang) * r
        const z = f.home.z + Math.sin(ang) * r
        if (blockedAt(x, z)) continue
        if (folk.list.some((o) => o !== f && Math.hypot((o.goal?.x ?? o.avatar.position.x) - x, (o.goal?.z ?? o.avatar.position.z) - z) < 1.8)) continue
        f.goal = { x, z }
      }
      if (!f.goal) { f.wait = 1.5; continue }
    }
    const dx = f.goal.x - a.position.x
    const dz = f.goal.z - a.position.z
    const d = Math.hypot(dx, dz)
    const close = Math.hypot(player.position.x - a.position.x, player.position.z - a.position.z) < 1.1
    if (close) { f.held = (f.held || 0) + dt; if (f.held > 1.2) { f.goal = null; f.held = 0 } poseAvatar(a, false, clock + f.i); continue }
    f.held = 0
    if (d < 0.2) {
      f.goal = null
      f.wait = 3 + ((f.i * 7 + Math.floor(clock)) % 5)
      if ((f.i + Math.floor(clock)) % 2) gesture(a, 'talk')
      continue
    }
    const step = Math.min(d, 0.95 * dt)
    a.position.x += (dx / d) * step
    a.position.z += (dz / d) * step
    const want = Math.atan2(dx, dz)
    a.rotation.y += Math.atan2(Math.sin(want - a.rotation.y), Math.cos(want - a.rotation.y)) * Math.min(1, dt * 8)
    poseAvatar(a, true, clock + f.i)
  }
}

// Near an open-ground place its people stand on the lot; walk away and they are put away again.
function folkNear() {
  if (inside) return
  const px = player.position.x
  const pz = player.position.z
  const dist = (p) => Math.hypot(p.lot.door.x - px, p.lot.door.z - pz)
  let near = null
  for (const p of PLACES) if (p.template === 'open' && dist(p) < 70 && (!near || dist(p) < dist(near))) near = p
  // (keep the people you are with unless another place is clearly nearer)
  const now = folk && placeOf(folk.id)
  if (near && now && now.id !== near.id && dist(now) < 80 && dist(now) < dist(near) + 20) near = now
  if (near) seatFolk(near)
  else if (folk) { const p = placeOf(folk.id); if (!p || Math.hypot(p.lot.door.x - px, p.lot.door.z - pz) > 100) clearFolk() }
}

// ---- in through the door, and back out to the same door ----
// What the camera follows in a room: you, held back from the walls so the picture is the room and not the dark past
// its edge (most of all near the door, where the camera looks in from behind you). Eye view follows you as it is.
const viewAt = new THREE.Vector3()
function roomView() {
  if (rig.mode === 'eye') return player.position
  const b = inside.room.bounds
  const side = Math.min(3, (b.maxX - b.minX) / 2)
  const south = Math.min(6.5, (b.maxZ - b.minZ) * 0.5)
  return viewAt.set(Math.min(b.maxX - side, Math.max(b.minX + side, player.position.x)), 0, Math.min(b.maxZ - south, Math.max(b.minZ + 2.5, player.position.z)))
}
function indoorLight() {
  const bg = new THREE.Color('#191226')
  scene.background = bg
  scene.fog.color.copy(bg)
  sun.intensity = 0.95
  hemi.intensity = 1.5
}
function syncBar() {
  const on = Boolean(inside)
  uiRoot.querySelector('.city-map').hidden = on
  uiRoot.querySelector('.city-leave').hidden = !on
  uiRoot.querySelector('.city-do').hidden = !on
  const chip = uiRoot.querySelector('.city-chip b')
  if (chip) chip.textContent = on ? inside.place.name : part.name
}
function veil(html) {
  const node = uiRoot.querySelector('.city-ride')
  if (html) { node.innerHTML = html; node.hidden = false } else node.hidden = true
}
async function goInside(place) {
  if (busy || inside || !running) return
  busy = true
  mover.stop()
  pending = null
  closeCard()
  closeTodo()
  veil(`<div><span class="cr-van still">${place.lot.icon || '\u{1F6AA}'}</span><b>${esc(place.name)}</b></div>`)
  try {
    const o = roomOrigin(place)
    const [room] = await Promise.all([buildInterior(place, o.x, o.z), wait(Math.max(150, 450 / FAST))])
    if (!running) return
    built.group.visible = false
    for (const n of npcs) n.avatar.visible = false
    if (carMesh) carMesh.visible = false
    clearFolk()
    scene.add(room.group)
    inside = { place, room, lot: place.lot }
    cplay?.enterRoom(place, room)
    // (job J) the one serving looks up, waves and greets you
    setTimeout(() => {
      const s = folk?.id === place.id ? folk.list[0] : null
      if (!s || !inside || inside.place !== place) return
      s.avatar.rotation.y = Math.atan2(player.position.x - s.avatar.position.x, player.position.z - s.avatar.position.z)
      gesture(s.avatar, 'emote-yes')
      if (place.dress?.greet) { ccrowd?.say(s.avatar.position.x, s.avatar.position.z, `${place.dress.staffName ? `${place.dress.staffName}: ` : ''}“${place.dress.greet}”`); greetings.push(place.id) }
    }, Math.max(200, 900 / FAST))
    sfx('door')
    setSound({ inside: true, place: place.id }) // (job L: the bowling and arcade hall has its own music)
    grid = roomGrid(room)
    indoorLight()
    rig.setDistance('sims', room.cam)
    rig.setPitch(40)
    rig.setDistance('top', room.top)
    // (never inside each other: the ring of spots just inside the door, clear of whoever came in before you)
    const spot = ringSpot(room.spawn.x, room.spawn.z, (x, z) => !room.blocked(x, z, BODY) && z < room.exit.z - 0.9, others ? others.nearbyPositions(room.spawn.x, room.spawn.z, 5) : [])
    player.position.set(spot.x, 0, spot.z)
    player.userData.lastPos?.set(spot.x, 0, spot.z)
    player.rotation.y = Math.PI
    rig.turnBehind(Math.PI)
    rig.apply(camera, roomView(), 30, null)
    seatFolk(place)
    document.body.dataset.cityPlace = place.id
    host.dataset.place = place.id
    syncBar()
    await curtain.awaitPeople(scene, appearNow, 2500)
  } catch (e) {
    console.error(e)
  } finally {
    veil('')
    busy = false
  }
  if (!running) return
  save()
  openTodo(place) // (if the room could not be built, the list still opens at the door)
}
// Put the room away and the city back (no fade, no walking: stopCity and leavePlace share it).
function exitRoom() {
  if (!inside) return null
  const { room, lot } = inside
  closeTodo()
  scene?.remove(room.group)
  room.dispose()
  clearFolk()
  cplay?.leaveRoom()
  inside = null
  setSound({ inside: false })
  grid = cityGrid
  if (built) built.group.visible = true
  delete document.body.dataset.cityPlace
  if (host) host.dataset.place = ''
  rig.setDistance('sims', 25)
  rig.setDistance('top', 105)
  rig.setPitch(45)
  return lot
}
async function leavePlace() {
  if (!inside || busy) return
  busy = true
  mover.stop()
  pending = null
  veil(`<div><span class="cr-van still">\u{1F6AA}</span><b>${esc(partOf(inside.lot.part).name)}</b></div>`)
  await wait(Math.max(120, 300 / FAST))
  const lot = exitRoom()
  if (running) sfx('door')
  if (running && lot) {
    nightNow = -1
    applyTime()
    // (the camera looks at the door from the street side, so you and the door are in the picture; you face the street)
    const into = { s: Math.PI, n: 0, e: -Math.PI / 2, w: Math.PI / 2 }[lot.side] ?? Math.PI
    place(lot.door.x, lot.door.z, into)
    player.rotation.y = into + Math.PI
    showCar()
    syncBar()
    save()
  }
  veil('')
  busy = false
}
// A tap while you are inside: the mat by the door leaves, the staff (or the counter in front of them) opens the
// list, anywhere else on the floor walks there.
function tapInside(ground) {
  const { room, place } = inside
  const st = room.staff
  if (boxHit(st.x - 0.5, st.x + 0.5, 0, 1.9, st.z - 0.5, st.z + 0.5) < Infinity || (ground && Math.hypot(ground.x - st.x, ground.z - st.z) < 1.6)) {
    if (Math.hypot(player.position.x - room.focus.x, player.position.z - room.focus.z) < 2.6) { mover.stop(); openTodo(place); return }
    walkTo(room.focus.x, room.focus.z, { todo: place.id })
    return
  }
  if (!ground) return
  if (Math.abs(ground.x - room.exit.x) < 1.6 && ground.z > room.exit.z - 0.9) { walkTo(room.exit.x, room.exit.z, { leave: true }); return }
  walkTo(Math.min(room.bounds.maxX - 0.5, Math.max(room.bounds.minX + 0.5, ground.x)), Math.min(room.bounds.maxZ - 0.5, Math.max(room.bounds.minZ + 0.5, ground.z)))
}

// ---------- the taxi and the car ----------
const destOfStop = (s) => ({ id: s.id, name: s.name, part: s.part, x: s.x, z: s.z })
// (job I) each stop's board: "NEXT TAXI 07:42", redrawn when the game's minute moves on
let boardsAt = -1
function paintStopBoards() {
  const m = Math.floor(opts.run?.minutes ?? 720)
  if (m === boardsAt || !built?.stopBoards) return
  boardsAt = m
  for (const [id, b] of Object.entries(built.stopBoards)) b.paint(nextTaxi(id, m).at)
}
// "Request a ride" (job I, from the menu or the map): a taxi comes to where you stand, a little dearer, after a short wait.
function openRequest(to = '') {
  if (inside) { const out = exitRoom(); nightNow = -1; applyTime(); place(out.door.x, out.door.z); syncBar() }
  const money = moneyOf(opts.run)
  const herePart = partAt(player.position.x, player.position.z).id
  const opts2 = [{ id: 'campus', name: 'UMzansi (campus gate)', part: 'campus' }, ...STOPS.filter((s) => s.id !== 'gate').map((s) => ({ id: s.id, name: s.name, part: s.part }))]
  const rows = opts2.map((o) => {
    const fare = taxiFare(herePart, o.part) + RIDE_EXTRA
    return `<button type="button" class="cc-go${fare > money ? ' short' : ''}${o.id === to ? ' on' : ''}" data-city="request-go" data-to="${o.id}"><span>${esc(o.name)}</span><b>R${fare}</b></button>`
  }).join('')
  showCard('request', 'here', `<p class="cc-kind">Request a ride</p><h3>\u{1F695} A taxi to you</h3>
    <p class="cc-next"><b>Comes to you in about ${RIDE_WAIT} min</b><small>R${RIDE_EXTRA} more than at a stop</small></p>
    <p class="cc-line">Where to? You have R${money}.</p><div class="cc-list">${rows}</div>
    <div class="cc-row"><button type="button" data-city="close">Not now</button></div>`)
}
window.addEventListener('mzansi-city-request', () => { if (running && ready) openRequest() })
const destOfLot = (l) => ({ id: l.id, lot: l.id, name: l.name, part: l.part, x: l.door.x, z: l.door.z })
function place(x, z, facing) {
  const spot = arrivalSpot(x, z)
  mover.stop()
  pending = null
  player.position.set(spot.x, 0, spot.z)
  player.userData.lastPos?.set(spot.x, 0, spot.z)
  if (facing !== undefined) { player.rotation.y = facing; rig.turnBehind(facing); rig.yaw -= 0.45 }
  // (every arrival: Sims at the city's tilt, turned to an angle with no building between the camera and you)
  if (!inside && built) host.dataset.start = JSON.stringify(rig.startClear(player.position, built.group, 45))
  rig.apply(camera, player.position, 30, null)
  notePart(true)
}
// from: the stop you board at (id); dest: { name, part, x, z, lot? }. Under 3 s, start to finish.
// how (job I): { wait } minutes for the next taxi at a stop, or { request: true }: a taxi comes to where you stand.
async function ride(fromId, dest, how = {}) {
  const here = how.request ? { id: 'here', name: 'where you stood', part: partAt(player.position.x, player.position.z).id, x: player.position.x, z: player.position.z } : null
  const from = here || stopOf(fromId) || nearestStop(player.position.x, player.position.z).stop
  const extra = how.request ? RIDE_EXTRA : 0
  const res = payTaxi(opts.run, from.part, dest.part, extra)
  if (!res.ok) { refuse(res, dest); return false }
  closeCard()
  const waited = how.request ? RIDE_WAIT : Number(how.wait) || 0
  opts.onPay?.({ minutes: res.minutes + waited, fare: res.fare, kind: 'taxi' })
  taxiLog.push({ from: from.id, to: dest.id || dest.lot || dest.name, fare: res.fare, waited, request: Boolean(how.request) })
  if (waited) {
    const veilW = uiRoot.querySelector('.city-ride')
    veilW.innerHTML = `<div><span class="cr-van still">\u{1F690}</span><b>${how.request ? 'A taxi is on its way to you…' : 'Waiting for the next taxi…'}</b><small>${waited} min</small></div>`
    veilW.hidden = false
    await new Promise((r) => setTimeout(r, Math.max(200, 1200 / FAST)))
    if (!running) return false
    veilW.hidden = true
  }
  // A lot with no stop of its own: the van stops at the nearest stop and you walk on to the door (the fare is paid once, above).
  // (Social C, "Go to" a friend: always to the stop nearest them, then on foot, stopping 2 m short)
  const near = dest.lot || dest.walkOn ? nearestStop(dest.x, dest.z) : null
  const stopTo = near && (near.dist >= 9 || dest.walkOn) ? near.stop : null
  const veil = uiRoot.querySelector('.city-ride')
  veil.innerHTML = `<div><span class="cr-van">🚐</span><b>${esc(fill(CITY.travel.lines.ride, { from: from.name, to: stopTo ? stopTo.name : dest.name }))}</b><small>R${res.fare} · ${res.minutes} min</small></div>`
  host.dataset.riding = '1'
  soundLoop('bus_engine', true) // (the taxi pulls up)
  const to = stopTo || dest
  // Movement (owner, 11 Nov): a kombi pulls up at the stop, you get in, it pulls off with the camera following it
  // for a few seconds, then a cut to it pulling in at your stop and you stepping out. Without the traffic (it has not
  // loaded, or you are inside a place) the old short card is the ride.
  if (traffic?.ready && !inside && await kombiRide(from, to, veil)) { /* done */ } else {
    veil.hidden = false
    await new Promise((r) => setTimeout(r, Math.max(250, 1500 / FAST)))
    if (!running) return false
    place(to.x, to.z)
    await new Promise((r) => setTimeout(r, Math.max(150, 500 / FAST)))
  }
  if (!running) return false
  veil.hidden = true
  host.dataset.riding = '0'
  soundLoop('bus_engine', false)
  sfx('door', 0.4)
  rides += 1
  host.dataset.rides = String(rides)
  host.dataset.fare = String(res.fare)
  host.dataset.rideStop = stopTo ? stopTo.id : ''
  if (stopTo && dest.walkOn) { const spot = shortOf(dest.x, dest.z); walkTo(spot.x, spot.z) }
  else if (stopTo) { const spot = arrivalSpot(dest.x, dest.z); walkTo(spot.x, spot.z, { lot: dest.lot }) }
  else if (dest.lot) openLot(dest.lot)
  save()
  return true
}
// The kombi ride itself. Wall-clock waits are scaled by the game's speed (tests run it fast). Returns false if the
// kombi never came (the old card takes over).
const waitFor = async (test, ms) => { const end = performance.now() + ms / FAST; while (running && !test() && performance.now() < end) await new Promise((r) => setTimeout(r, 50)); return running && test() }
async function kombiRide(from, to, veil) {
  rideLog.length = 0
  new MutationObserver((list, obs) => { const v = host.dataset.ride; if (v && rideLog.at(-1) !== v) rideLog.push(v); if (!v) obs.disconnect() }).observe(host, { attributes: true, attributeFilter: ['data-ride'] })
  host.dataset.ride = 'coming'
  const k = traffic.pullUp(from.x, from.z)
  if (!(await waitFor(() => k.arrived, 9000))) { traffic.release(); host.dataset.ride = ''; return false }
  // you get in: off the pavement and into the kombi
  mover.stop()
  pending = null
  host.dataset.ride = 'in'
  sfx('door', 0.4)
  player.visible = false
  await new Promise((r) => setTimeout(r, Math.max(120, 450 / FAST)))
  // it pulls off, the camera following it
  host.dataset.ride = 'off'
  rideCam = true
  traffic.pullOff()
  await new Promise((r) => setTimeout(r, Math.max(400, 3800 / FAST)))
  if (!running) return true
  // cut: it pulls in at your stop
  veil.hidden = false
  await new Promise((r) => setTimeout(r, Math.max(120, 600 / FAST)))
  const arrive = traffic.pullUp(to.x, to.z, 0)
  rideAt.set(arrive.x, 0, arrive.z)
  place(to.x, to.z)
  rideCam = null
  veil.hidden = true
  host.dataset.ride = 'out'
  player.visible = true
  await new Promise((r) => setTimeout(r, Math.max(120, 500 / FAST)))
  traffic.release(player.position.x, player.position.z)
  host.dataset.ride = ''
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
// Two metres short of a point, on the line from where you stand to it (Social C: you stop beside a friend, not on them).
function shortOf(x, z) {
  const dx = x - player.position.x
  const dz = z - player.position.z
  const d = Math.hypot(dx, dz)
  const k = d > 2.2 ? (d - 2) / d : 0
  return freeNear(player.position.x + dx * k, player.position.z + dz * k) || { x: player.position.x, z: player.position.z }
}
// "Go to" a friend (src/findme.js): d = { x, z, part, name }. The same district: walk. Another: a taxi to the stop
// nearest them (the fare as usual; too little money gets the usual friendly line), then on foot.
function goToPoint(d) {
  if (!Number.isFinite(d?.x) || !Number.isFinite(d?.z) || host?.dataset.riding === '1') return { ok: false } // (never a second taxi while one is taking you)
  if (inside) { const out = exitRoom(); nightNow = -1; applyTime(); place(out.door.x, out.door.z); syncBar() }
  const to = d.part === 'gate' ? 'campus' : d.part
  if (to === partAt(player.position.x, player.position.z).id) { const spot = shortOf(d.x, d.z); walkTo(spot.x, spot.z); return { ok: true } }
  const dest = { id: 'friend', name: String(d.name || 'your friend').slice(0, 24), part: to, x: d.x, z: d.z, walkOn: true }
  const near = nearestStop(player.position.x, player.position.z)
  if (near.dist < 9) { ride(near.stop.id, dest); return { ok: true } }
  const stopSpot = arrivalSpot(near.stop.x, near.stop.z)
  walkTo(stopSpot.x, stopSpot.z, { ride: dest, from: near.stop.id })
  return { ok: true }
}
function travel(way, target) {
  if (target && typeof target === 'object') return goToPoint(target)
  // (job I: from the campus gate's sheet) 'stop': to that taxi stop, whose card asks where to; 'out': just out of the gate
  if (way === 'out') return { ok: true }
  if (way === 'request') { const l = target === 'campus' ? null : lotOf(target); return ride(null, l ? destOfLot(l) : { id: 'gate', name: 'Campus gate', part: 'campus', x: SPAWN.x, z: SPAWN.z }, { request: true }) }
  if (way === 'stop') { const st = stopOf(target) || nearestStop(player.position.x, player.position.z).stop; const spot = arrivalSpot(st.x, st.z); walkTo(spot.x, spot.z, { stop: st.id }); return { ok: true } }
  if (inside) { const out = exitRoom(); nightNow = -1; applyTime(); place(out.door.x, out.door.z); syncBar() } // (from the map while you are in a place: out of its door first)
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
// Walk together (src/walk.js): a walk or a taxi to a place, and walking at someone's side.
window.addEventListener('mzansi-city-travel', (event) => { const d = event.detail || {}; if (running && player && d.target) travel(d.way === 'taxi' ? 'taxi' : 'walk', d.target) })
// Social C: go to a friend's spot; and walk back in through the gate once you stand at it.
window.addEventListener('mzansi-city-goto', (event) => { if (running && player && ready && !busy) goToPoint(event.detail || {}) })
window.addEventListener('mzansi-city-leave', () => { if (running && player && ready && !inside && !busy) leave('gate') })
window.addEventListener('mzansi-city-walk', (event) => { const d = event.detail || {}; if (running && player && !inside && Number.isFinite(d.x) && Number.isFinite(d.z)) walkTo(d.x, d.z) })
// (job L) SunnyBay Eats: the rider rides up to you on the street (inside a place the food just arrives)
window.addEventListener('mzansi-rider', (event) => { const d = event.detail; if (!d || d.taken || !running || !player || !scene || inside) return; d.taken = true; rideUp(scene, () => player.position, d.done) })
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
    // (Loops: a WhatsApp share with words.md's line for a win or a loss)
    share: waButton(iWon ? 'won' : 'lost'),
    rematch: true,
    onRematch: () => { endRace(); sendInvite('race', withId, withName); window.dispatchEvent(new CustomEvent('mzansi-toast', { detail: { text: `Race invite sent to ${withName}. Waiting…` } })) },
    onClose: endRace,
  })
  window.dispatchEvent(new CustomEvent('mzansi-race-done', { detail: { won: iWon } })) // (main.js: the Pier Starter badge)
  // (Social B: the other racer's follower count on the result)
  followerCounts([withId]).then((c) => { const n = c.ids[withId]; const row = document.querySelector('.tg-result .tg-row'); if (n !== undefined && row) row.insertAdjacentHTML('beforebegin', `<p class="tg-fol">${esc(withName)} · ${followersText(Number(n))}</p>`) })
}
onInvite('race', (from, name, data, { accept, decline }) => {
  if (inside) { decline(); return } // (the race only shows outdoors: City job B)
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
  // (Movement: two of them cross the road at the zebra crossings nearest you, in this district)
  const zebras = crossLines.filter((c) => partAt(c.a.x, c.a.z).id === part.id && !blockedAt(c.a.x, c.a.z) && !blockedAt(c.b.x, c.b.z))
    .sort((a, b) => Math.hypot(a.a.x - px, a.a.z - pz) - Math.hypot(b.a.x - px, b.a.z - pz))
  npcs.forEach((n, i) => {
    const l = i >= NPCS - CROSSERS && zebras.length ? zebras[(i - (NPCS - CROSSERS)) % zebras.length] : nearest[i % nearest.length]
    const t = 0.15 + ((i * 0.37) % 0.7)
    n.line = l
    n.dir = i % 2 ? 1 : -1
    n.avatar.position.set(l.a.x + (l.b.x - l.a.x) * t, 0, l.a.z + (l.b.z - l.a.z) * t)
    n.avatar.userData.lastPos?.copy(n.avatar.position)
    n.avatar.visible = true
    n.wait = 0
  })
}
// Everybody on foot the cars must stop for: you (when you are out of the kombi), the street people, the players here.
function onFoot() {
  const list = []
  if (player.visible) list.push({ x: player.position.x, z: player.position.z })
  for (const n of npcs) if (n.avatar.visible) list.push({ x: n.avatar.position.x, z: n.avatar.position.z })
  if (others) list.push(...others.nearbyPositions(player.position.x, player.position.z, 60))
  return list
}
function npcTick(dt) {
  for (const n of npcs) {
    if (!n.line || !n.avatar.visible) continue
    // (a crosser at the kerb waits while anything is driving at the crossing; the cars stop for them once they are on it)
    if (n.line.cross && n.wait <= 0 && traffic) {
      const p0 = n.avatar.position
      const atKerb = Math.min(Math.hypot(p0.x - n.line.a.x, p0.z - n.line.a.z), Math.hypot(p0.x - n.line.b.x, p0.z - n.line.b.z)) < 0.5
      if (atKerb && traffic.movingNear((n.line.a.x + n.line.b.x) / 2, (n.line.a.z + n.line.b.z) / 2, 9)) { n.waitingCar = true; poseAvatar(n.avatar, false, clock + n.i); continue }
      n.waitingCar = false
    }
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
  if (inside) return // (a room is in its lot's district)
  const now = partAt(player.position.x, player.position.z)
  if (now.id !== part.id || force) {
    const moved = now.id !== part.id
    part = now
    partSince = performance.now()
    host.dataset.part = part.id
    const chip = uiRoot.querySelector('.city-chip b')
    if (chip) chip.textContent = part.name
    // (job I: back out of a place in the same district, the street people are where they were; it was every one
    // re-placed, which looked like the one you had just tapped vanishing)
    if (moved || !npcs.some((n) => n.line)) seatNpcs()
    else for (const n of npcs) if (n.line) n.avatar.visible = true
  }
  // (the room follows once you have been in the district a moment: no flapping on a border)
  if (roomPart !== part.id && (force || performance.now() - partSince > 1500)) {
    roomPart = part.id
    setArea(part.id, part.name)
    window.dispatchEvent(new CustomEvent('mzansi-city-part', { detail: { id: part.id } })) // (main.js: District Hopper)
  }
}
function save() {
  if (!player || !running) return
  lastSave = performance.now()
  const at = inside ? inside.lot.door : player.position // (left inside a place, you come back at its door)
  opts.onSave?.({ x: +at.x.toFixed(1), z: +at.z.toFixed(1) })
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
  if (inside) return // (a room keeps its own light)
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
.city-chip{position:absolute;left:12px;top:calc(var(--city-top) + 8px);display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:22px;background:#1c1915;color:#fff;box-shadow:0 4px 14px #0006;font-size:14px}
.city-chip b{color:#fff;font-weight:800}
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
.cb-bubble{position:fixed;left:0;top:0;z-index:30;max-width:220px;padding:7px 11px;border-radius:14px;background:#fffaf0;color:#1c1915;font:700 14px/1.3 Figtree,system-ui,sans-serif;box-shadow:0 4px 14px #0004;pointer-events:none;transition:opacity .2s}
.cb-bubble::after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-top-color:#fffaf0;border-bottom:0}
.city-card .cc-next{margin:0 0 10px;padding:10px 12px;border-radius:12px;background:#1c1915;color:#f0c400;display:flex;flex-direction:column;gap:2px}.city-card .cc-next b{font-size:16px}.city-card .cc-next small{color:#fff;font-size:14px;font-weight:600}
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
.city-card .cc-row button[data-city="wait"]{background:#f0c400;color:#1c1915}
.city-ride .cr-van.still{animation:none}
.city-leave,.city-do{position:absolute;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);padding:0 16px;border-radius:24px;box-shadow:0 4px 14px #0006;min-height:48px!important;font-size:15px!important;white-space:nowrap}
.city-leave{left:12px;background:#22143b;color:#fff}
.city-do{left:118px;background:#f0c400;color:#1c1915}
.city-leave[hidden],.city-do[hidden],.city-map[hidden]{display:none}
.city-todo{position:absolute;left:0;right:0;bottom:0;margin:0 auto;box-sizing:border-box;max-height:60vh;display:flex;flex-direction:column;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 12px);border-radius:20px 20px 0 0;background:#fffaf0;color:#1c1915;border:1.5px solid #e2d4b8;border-bottom:0;box-shadow:0 -10px 30px #0006;pointer-events:auto}
.city-todo[hidden]{display:none}
.city-todo header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.city-todo h3{margin:2px 0 4px;font:800 20px Graduate,Figtree,system-ui,sans-serif}
.city-todo .cc-kind{margin:0;font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#7b5a1e}
.city-todo .ct-x{width:44px;height:44px;flex:none;border-radius:50%;background:#f3e9d2;color:#1c1915;font-size:16px}
.city-todo .ct-feel{margin:0 0 4px;font-size:14px;line-height:1.35;color:#4a4033}
.city-todo .ct-slots{margin:0 0 8px;font-size:14px;font-weight:800;color:#7b5a1e}
.city-todo .ct-list{overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.ct-row{display:flex;flex-direction:column;gap:4px;align-items:stretch;text-align:left;flex:none;padding:9px 12px;border-radius:14px;background:#f3e9d2;color:#1c1915;min-height:56px!important}
.ct-row .ct-top{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.ct-row strong{font-size:15px;font-weight:800;line-height:1.25}
.ct-row .ct-top b{font-size:14px;white-space:nowrap}
.ct-row .ct-pay{color:#126b3b}
.ct-row .ct-meta{font-size:14px;font-weight:600;color:#4a4033;display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
.ct-row small{font-size:12px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}
.ct-row small.tag{background:#22143b;color:#fff}
.ct-row small.gig{background:#126b3b}.ct-row small.flex{background:#b7791f}.ct-row small.with{background:#c2247e}.ct-row small.alone{background:#7a7064}
.ct-row .ct-fx{display:flex;flex-wrap:wrap;gap:4px}
.ct-row small.up{background:#1f9d5a22;color:#126b3b}.ct-row small.down{background:#d0303018;color:#9b1f1f}
.ct-row.off{background:#ece6da;cursor:default}
.ct-row.off strong,.ct-row.off .ct-meta,.ct-row.off .ct-top b{color:#857b6e}
.ct-row.off .ct-fx,.ct-row.off small.tag{opacity:.5}
.ct-row .ct-why{font-size:14px;font-weight:800;color:#9b1f1f}
.city-doing{position:absolute;left:0;right:0;top:36%;margin:0 auto;width:max-content;max-width:min(calc(100% - 24px),420px);box-sizing:border-box;padding:12px 18px 15px;border-radius:18px;background:#22143bf2;color:#fff;font-size:15px;text-align:center;box-shadow:0 8px 24px #0007;overflow:hidden}
.city-doing[hidden]{display:none}
.city-doing i{position:absolute;left:0;bottom:0;height:4px;width:100%;background:#f0c400;transform-origin:left;animation:city-doing var(--ms,1200ms) linear forwards}
@keyframes city-doing{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.city-scrim{position:absolute;inset:0;background:#1c191555;pointer-events:auto}
.city-scrim[hidden]{display:none}
.city-ui .city-result{pointer-events:auto;z-index:2}
.city-ui .city-result[hidden]{display:none}
.city-result .cr-note{margin:8px 0 0;font-size:14px;line-height:1.35;font-weight:600}
.city-result .g-go{margin-top:12px}
.city-debug{position:absolute;left:50%;transform:translateX(-50%);bottom:84px;background:#0009;color:#fff;border-radius:14px;padding:4px 10px;font-size:12px}`
  document.head.append(style)
  document.body.insertAdjacentHTML('beforeend', `<div class="city-ui" id="city-ui" hidden>
    <div class="city-chip"><span>📍</span><b></b><small data-city-online></small></div>
    <div class="city-cams">${['top', 'sims', 'eye'].map((m) => `<button type="button" data-cam="${m}" aria-pressed="false">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
    <button class="city-map" type="button" data-city="map">🗺 Map</button>
    <button class="city-stop" type="button" data-city="stop" aria-label="Stop walking" hidden>Stop</button>
    <button class="city-leave" type="button" data-city="leave" hidden>← Leave</button>
    <button class="city-do" type="button" data-city="todo" hidden>✨ Things to do</button>
    <div class="city-card" role="dialog" aria-live="polite" hidden></div>
    <div class="city-todo" role="dialog" hidden></div>
    <div class="city-doing" role="status" hidden></div>
    <div class="city-scrim" data-city="result-ok" hidden></div>
    <aside class="city-result" role="dialog" hidden></aside>
    <div class="city-ride" hidden></div>
    ${DEBUG ? '<div class="city-debug" data-stats></div>' : ''}
  </div>`)
  uiRoot = document.getElementById('city-ui')
  uiRoot.addEventListener('click', (e) => {
    const b = e.target.closest('button, .city-scrim')
    if (!b) return
    const act = b.dataset.city
    if (b.dataset.cam) { rig.setMode(b.dataset.cam); syncCams(); measureBars(); window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: b.dataset.cam })) }
    else if (act === 'close') closeCard()
    else if (act === 'row') { if (b.getAttribute('aria-disabled') === 'true') toast(b.querySelector('.ct-why')?.textContent || 'Not now'); else pickRow(b.dataset.row) }
    else if (act === 'todo-close') closeTodo()
    else if (act === 'todo') { if (inside) openTodo(inside.place) }
    else if (act === 'leave') leavePlace()
    else if (act === 'result-ok') closeResult()
    else if (act === 'wait') { const id = card?.id; opts.onWait?.(b.dataset.phase); closeCard(); applyTime(); if (id) openLot(id) }
    else if (act === 'stop') { mover.stop(); pending = null }
    else if (act === 'map') mapUi.open()
    else if (act === 'ride') { const s = stopOf(b.dataset.stop); if (s) ride(card?.id, destOfStop(s), { wait: nextTaxi(card?.id, opts.run?.minutes).wait }) }
    else if (act === 'request-go') { const t = b.dataset.to; const dest = t === 'campus' ? { id: 'gate', name: 'Campus gate', part: 'campus', x: SPAWN.x, z: SPAWN.z } : stopOf(t) ? destOfStop(stopOf(t)) : lotOf(t) ? destOfLot(lotOf(t)) : null; if (dest) ride(null, dest, { request: true }) }
    else if (act === 'walk') { const lot = b.dataset.lot; walkTo(Number(b.dataset.x), Number(b.dataset.z), lot ? { lot } : null) }
  })
  mapUi = createCityMap(document.body, {
    where: () => (inside ? { x: inside.lot.door.x, z: inside.lot.door.z, facing: 0, campus: false } : { x: player?.position.x || 0, z: player?.position.z || 0, facing: player?.rotation.y || 0, campus: false }),
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
  // (Chat sprint: with the Chat sheet open the picture moves up instead, so you stand between the bar and the sheet)
  const chatTop = Number(document.body.dataset.chatTop) || 0
  const want = rig.mode === 'eye' || shot ? 0 : chatTop ? -Math.round(window.innerHeight * 0.5 - ((hb || 56) + chatTop) * 0.5) : Math.round(((hb || 56) + 52) * 0.5)
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
  guardRenderer(renderer, 'city')
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
  mover = createPlayer({ blocked: (x, z) => blockedAt(x, z) || carIn(x, z), onWalk: (e) => { if (e.type === 'start') smooth.walkStart(); else { smooth.walkEnd(e.how, e.left, e.x, e.z); if (host) host.dataset.walking = '0'; save() } } })
  input = bindInput(renderer.domElement, { cameraRig: rig, onTap, live: () => running && ready && !uiBusy() })
  window.addEventListener('mzansi-cam', (e) => { if (running && e.detail !== rig.mode) { rig.setMode(e.detail); syncCams() } })
}

function freshScene() {
  scene = new THREE.Scene()
  scene.name = 'city'
  // (job I: feet sank into the street: the pavement, road, kerb and zebra layers are drawn 2-5 cm up, pulled further
  // forward by their polygonOffset, while everybody stood at y 0. Soles now rest on a floor 6 cm up (avatar3d soleLift).)
  scene.userData.floorAt = () => 0.06
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
  if (!inside) npcTick(dt)
  if (traffic && trafficOn) {
    traffic.setVisible(!inside)
    if (!inside) {
      traffic.update(dt, player.position.x, player.position.z, onFoot())
      traffic.tidyRide(player.position.x, player.position.z)
      // (job I: a car that has stood for you a second hoots, and the driver calls out; cars still never hit you)
      if (frameCount % 10 === 0 && player.visible) {
        const h = traffic.hootFor(player.position.x, player.position.z)
        if (h) { hootNow(); hoots.push({ id: h.id, at: Math.round(clock * 10) / 10 }); toast(`\u{1F697} \u201C${pickLine(STREET.driver)}\u201D`) }
      }
    }
  }
  if (inside && folk) patronTick(dt)
  cplay?.update(dt / FAST) // (real time: a kick has to be tappable)
  ccrowd?.update(dt, clock, player.position.x, player.position.z, part.id, Boolean(inside))
  setPoseLod(scene, camera, player.position)
  if (folk && !inside) openTick(dt)
  else if (folk) poseAvatar(folk.list[0].avatar, false, clock) // (the one serving; the patrons move in patronTick)
  others?.update(dt, camera, player.position, true, rig.mode === 'eye')
  if (rideCam) { const k = traffic?.cars.find((c) => c.ride); if (k) rideAt.set(k.x, 0, k.z) }
  if (shot) { camera.position.set(...shot.pos); camera.lookAt(...shot.look) } else rig.apply(camera, rideCam ? rideAt : inside ? roomView() : player.position, dt, inside ? null : built?.group)
  for (const p of player.userData.headParts || []) p.visible = rig.mode !== 'eye'
  notePart(false)
  setSound({ part: part.id, inside: Boolean(inside), place: inside?.place?.id || null }) // (the ambience and the music fade to the new district's as you cross the border)
  reportLocal({ a: 'campus', x: player.position.x, z: player.position.z, y: 0, h: player.rotation.y, p: player.userData.pose || 'stand' })
  uiRoot.querySelector('.city-stop').hidden = !stepping
  if (card && card.kind !== 'short' && stepping && frameCount % 20 === 0) {
    // (walking away from a door or a stop closes its card)
    const at = card.kind === 'lot' ? lotOf(card.id)?.door : card.kind === 'stop' ? stopOf(card.id) : null
    if (at && Math.hypot(at.x - player.position.x, at.z - player.position.z) > 7) closeCard()
  }
  if (todo && !inside && stepping && frameCount % 20 === 0 && Math.hypot(todo.lot.door.x - player.position.x, todo.lot.door.z - player.position.z) > 10) closeTodo()
  if (frameCount % 30 === 0) { measureBars(); applyTime(); folkNear(); paintStopBoards() }
  // (inside a place: stepping onto the mat by the door takes you back out)
  if (inside && !busy && player.position.z > inside.room.exit.z - 0.3 && Math.abs(player.position.x - inside.room.exit.x) < 1.3) { leavePlace(); return }
  if (stepping && now - lastSave > 5000) save()
  // in through the gate: back on campus
  if (!inside && performance.now() - enteredAt > 900 && atGate(player.position.x, player.position.z)) { leave('gate'); return }
  host.dataset.px = player.position.x.toFixed(2)
  host.dataset.pz = player.position.z.toFixed(2)
  host.dataset.cam = rig.mode
  renderer.render(scene, camera)
  if (DEBUG && frameCount % 15 === 0) uiRoot.querySelector('[data-stats]').textContent = `${inside ? inside.place.id : part.id} · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles / 1000)}k tris`
  frameCount++
  smooth.frame(now, 'city', inside ? `in.${inside.place.id}` : part.id)
}

export { cityActivities } from '../city/places.js'

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
  host.dataset.place = ''
  host.dataset.folk = ''
  busy = false
  syncBar()
  freshScene()
  rig.setMode(getCam()) // (this visit's view, chosen on campus or in the Caf; Sims at the start of a visit)
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
    cplay = createCityPlay({ scene, player: () => player, inside: () => inside, folk: () => folk, walkNear, toast, run: () => opts.run, save: () => save(), clock: () => clock })
    traffic = createTraffic({ scene, bake: (url) => bakeModel(url), flip: CAR_FLIP })
    ccrowd = createCityCrowd({
      scene, parasols: built.parasols || [], tower: built.tower, uiRoot, free: (x, z) => !blockedAt(x, z) && !offLimits(x, z, 0.8) && !CITY.roads.some((r) => x > r.rect[0] - 0.6 && x < r.rect[2] + 0.6 && z > r.rect[1] - 0.6 && z < r.rect[3] + 0.6),
      linesFor: (id) => (pavementsOf[id] ||= pavements(partOf(id))),
      doorsFor: (id) => LOTS.filter((l) => l.part === id).map((l) => l.door),
      project: (x, y, z) => { const q = new THREE.Vector3(x, y, z).project(camera); return { x: (q.x * 0.5 + 0.5) * window.innerWidth, y: (-q.y * 0.5 + 0.5) * window.innerHeight, behind: q.z > 1 } },
    })
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
  soundLoop('bus_engine', false)
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  mover?.stop()
  input?.clearKeys?.()
  mapUi?.close()
  closeCard()
  doing++
  exitRoom()
  clearFolk()
  closeTodo()
  busy = false
  grid = cityGrid = null
  if (uiRoot) { for (const sel of ['.city-result', '.city-scrim', '.city-doing', '.city-todo']) uiRoot.querySelector(sel).hidden = true; uiRoot.querySelector('.city-result').className = 'city-result' }
  if (host) { host.hidden = true; host.dataset.on = '0'; host.dataset.ready = '0' }
  if (uiRoot) { uiRoot.hidden = true; uiRoot.querySelector('.city-ride').hidden = true }
  others?.dispose?.()
  others = null
  ccrowd?.dispose()
  ccrowd = null
  traffic?.dispose()
  traffic = null
  rideCam = null
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
    view: () => (player ? { ...rig.check(camera, player.position, inside ? [] : built?.group), start: host.dataset.start || '' } : null),
    teleport: (x, z, facing) => { if (!player) return false; place(x, z, facing); return true },
    // (tests: drag the view like a finger would; the tilt in degrees)
    tilt: (dy) => { rig.drag(0, dy); return rig.pitchDeg },
    camera: () => ({ pitch: rig.pitchDeg, y: camera.position.y, mode: rig.mode }),
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
    // City job B (read-mostly): the place you are in or at, its people, and what each row would do now
    place() {
      const p = inside?.place || todo
      return { inside: inside?.place.id || '', todo: todo?.id || '', friends: p ? friendsHere(p) : 0, folk: folk ? { id: folk.id, n: folk.list.length, skins: folk.list.map((f) => f.avatar.userData.look?.skin), at: folk.list.map((f) => [+f.avatar.position.x.toFixed(1), +f.avatar.position.z.toFixed(1)]) } : null, room: inside ? { w: inside.room.W, d: inside.room.D, tris: inside.room.tris, focus: inside.room.focus, exit: inside.room.exit, staff: inside.room.staff } : null }
    },
    rows(id) {
      const p = placeOf(id)
      return p ? p.rows.map((r) => ({ id: r.id, name: r.name, ...rowState(opts.district, opts.run, p, r, { friends: friendsHere(p) }) })) : []
    },
    places: () => PLACES.map((p) => ({ id: p.id, name: p.name, template: p.template, rows: p.rows.length, door: p.lot.door, part: p.lot.part })),
    openLot: (id) => openLot(id),
    others: () => others?.report(camera) || [],
    // Movement (read only): the traffic, the street people who cross, the patrons in the place you are in
    traffic: () => (traffic ? { ...traffic.info(), ride: host.dataset.ride || '', following: Boolean(rideCam), rideLog: [...rideLog] } : null),
    // (job I) the street people (where, seen), the people at the open-ground place near you, hoots and hellos
    people: () => npcs.map((n) => ({ i: n.i, x: +n.avatar.position.x.toFixed(2), z: +n.avatar.position.z.toFixed(2), visible: n.avatar.visible })),
    folk: () => (folk ? { id: folk.id, list: folk.list.map((f) => ({ staff: f.staff, x: +f.avatar.position.x.toFixed(2), z: +f.avatar.position.z.toFixed(2), visible: f.avatar.visible, moving: Boolean(f.goal) && !(f.wait > 0) })) } : null),
    hoots: () => [...hoots],
    play: () => cplay?.info() || null,
    crowd: () => ccrowd?.info() || null,
    greetings: () => [...greetings],
    boards: () => (built?.boards || []).map((b) => ({ i: b.i, wall: Boolean(b.wall), brand: b.ad?.brand, feature: Boolean(b.ad?.feature), empty: Boolean(b.ad?.empty) })),
    sitters: () => (folk ? folk.list.filter((f) => f.state === 'sit').length : 0),
    taxis: () => [...taxiLog],
    nextTaxi: (id) => nextTaxi(id, opts.run?.minutes),
    greeted: () => [...greeted],
    carAt: (x, z) => Boolean(traffic?.solidAt(x, z)),
    crossers: () => npcs.filter((n) => n.line?.cross && n.avatar.visible).map((n) => ({ x: +n.avatar.position.x.toFixed(2), z: +n.avatar.position.z.toFixed(2), waiting: Boolean(n.waitingCar), a: n.line.a, b: n.line.b })),
    patrons: () => (folk ? folk.list.filter((f) => !f.staff).map((f) => ({ state: f.state, x: +f.avatar.position.x.toFixed(2), z: +f.avatar.position.z.toFixed(2), visible: f.avatar.visible, left: f.left || 0 })) : []),
    // (tests: stand somewhere without walking there)
    trafficOn: (on) => { trafficOn = Boolean(on); traffic?.setVisible(trafficOn && !inside); return trafficOn },
    putPlayer: (x, z) => { if (!player) return false; mover.stop(); player.position.set(x, 0, z); player.userData.lastPos?.set(x, 0, z); return true },
  }
}
