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
import { guardRenderer } from './guard.js'
import { loop as soundLoop, sfx } from '../audio.js'
import { setSound } from '../soundscape.js'
import { SPEED as FAST } from '../speed.js'
import { formatMoney } from '../engine/format.js'
import { smooth } from '../smooth.js'
import * as curtain from '../curtain.js'
import { onPoke, reportLocal, sendPoke, setArea } from '../presence.js'
import { appearNow, createAvatar, gesture, poseAvatar } from './avatar3d.js'
import { createCameraRig } from './camera.js'
import { getCam } from '../cammode.js'
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
import { PLACES, SLOT_NAME, cityOf, folkSeed, openLine, openNow, opensAt, placeOf, rowState, runRow, slotOf } from '../city/places.js'
import { buildInterior } from './cityplace.js'
import { resultBody } from '../ui/result-card.js'

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
    const d = boxHit(b.x - 4.2, b.x + 4.2, 3.4, 7.8, b.z - 4.2, b.z + 4.2)
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
  const ms = Math.max(350, 1500 / FAST)
  const pill = uiRoot.querySelector('.city-doing')
  pill.innerHTML = `<b>${esc(row.name)}</b><i></i>`
  pill.style.setProperty('--ms', `${ms}ms`)
  pill.hidden = false
  gesture(player, 'emote-yes')
  const mine = ++doing
  await wait(ms)
  pill.hidden = true
  if (!running || mine !== doing) { busy = false; return }
  const res = runRow(opts.district, opts.run, place, row, { friends: friendsHere(place) })
  if (!res.ok) { busy = false; toast(res.error); openTodo(place); return }
  opts.onRow?.({ place, row, result: res })
  showResult(place, row, res)
}
function showResult(place, row, res) {
  const type = row.gig ? 'work' : row.fullness >= 8 ? 'food' : row.grades >= 3 ? 'study' : ['gym', 'stadium'].includes(place.id) ? 'gym' : row.social >= 5 ? 'social' : row.cost >= 15 ? 'shop' : 'other'
  const body = resultBody({ cardId: `city-${row.id}-${Date.now()}`, title: row.name, delta: res.delta, esc, line: row.result, type })
  const notes = []
  // (the place's own person has a word for you: docs/world-designer/social.md, in city_places.json)
  if (place.dress.staffName && place.dress.during) notes.push(`${place.dress.staffName}: “${place.dress.during}”`)
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
      return { avatar, i, staff: i === 0 }
    }),
  }
  host.dataset.folk = `${place.id}:${folk.list.length}`
}
// Near an open-ground place its people stand on the lot; walk away and they are put away again.
function folkNear() {
  if (inside) return
  const px = player.position.x
  const pz = player.position.z
  const near = PLACES.find((p) => p.template === 'open' && Math.hypot(p.lot.door.x - px, p.lot.door.z - pz) < 70)
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
    sfx('door')
    setSound({ inside: true })
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
async function ride(fromId, dest) {
  const from = stopOf(fromId) || nearestStop(player.position.x, player.position.z).stop
  const res = payTaxi(opts.run, from.part, dest.part)
  if (!res.ok) { refuse(res, dest); return false }
  closeCard()
  opts.onPay?.({ minutes: res.minutes, fare: res.fare, kind: 'taxi' })
  // A lot with no stop of its own: the van stops at the nearest stop and you walk on to the door (the fare is paid once, above).
  const near = dest.lot ? nearestStop(dest.x, dest.z) : null
  const stopTo = near && near.dist >= 9 ? near.stop : null
  const veil = uiRoot.querySelector('.city-ride')
  veil.innerHTML = `<div><span class="cr-van">🚐</span><b>${esc(fill(CITY.travel.lines.ride, { from: from.name, to: stopTo ? stopTo.name : dest.name }))}</b><small>R${res.fare} · ${res.minutes} min</small></div>`
  veil.hidden = false
  host.dataset.riding = '1'
  soundLoop('bus_engine', true) // (the taxi pulls up)
  await new Promise((r) => setTimeout(r, Math.max(250, 1500 / FAST)))
  if (!running) return false
  place(stopTo ? stopTo.x : dest.x, stopTo ? stopTo.z : dest.z)
  await new Promise((r) => setTimeout(r, Math.max(150, 500 / FAST)))
  veil.hidden = true
  host.dataset.riding = '0'
  soundLoop('bus_engine', false)
  sfx('door', 0.4)
  rides += 1
  host.dataset.rides = String(rides)
  host.dataset.fare = String(res.fare)
  host.dataset.rideStop = stopTo ? stopTo.id : ''
  if (stopTo) { const spot = arrivalSpot(dest.x, dest.z); walkTo(spot.x, spot.z, { lot: dest.lot }) }
  else if (dest.lot) openLot(dest.lot)
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
window.addEventListener('mzansi-city-walk', (event) => { const d = event.detail || {}; if (running && player && !inside && Number.isFinite(d.x) && Number.isFinite(d.z)) walkTo(d.x, d.z) })
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
  if (inside) return // (a room is in its lot's district)
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
    <button class="city-map" type="button" data-city="map">🗺 SunnyBay map</button>
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
    else if (act === 'ride') { const s = stopOf(b.dataset.stop); if (s) ride(card?.id, destOfStop(s)) }
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
  if (!inside) npcTick(dt)
  if (folk) for (const f of folk.list) poseAvatar(f.avatar, false, clock + f.i * 1.7)
  others?.update(dt, camera, player.position, true, rig.mode === 'eye')
  if (shot) { camera.position.set(...shot.pos); camera.lookAt(...shot.look) } else rig.apply(camera, inside ? roomView() : player.position, dt, inside ? null : built?.group)
  for (const p of player.userData.headParts || []) p.visible = rig.mode !== 'eye'
  notePart(false)
  setSound({ part: part.id, inside: Boolean(inside) }) // (the ambience and the music fade to the new district's as you cross the border)
  reportLocal({ a: 'campus', x: player.position.x, z: player.position.z, y: 0, h: player.rotation.y, p: player.userData.pose || 'stand' })
  uiRoot.querySelector('.city-stop').hidden = !stepping
  if (card && card.kind !== 'short' && stepping && frameCount % 20 === 0) {
    // (walking away from a door or a stop closes its card)
    const at = card.kind === 'lot' ? lotOf(card.id)?.door : card.kind === 'stop' ? stopOf(card.id) : null
    if (at && Math.hypot(at.x - player.position.x, at.z - player.position.z) > 7) closeCard()
  }
  if (todo && !inside && stepping && frameCount % 20 === 0 && Math.hypot(todo.lot.door.x - player.position.x, todo.lot.door.z - player.position.z) > 10) closeTodo()
  if (frameCount % 30 === 0) { measureBars(); applyTime(); folkNear() }
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
  }
}
