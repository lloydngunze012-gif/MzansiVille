import * as THREE from 'three'
import { actionState, actionsAt } from '../engine/sim.js'
import { homePlaceId } from '../engine/model.js'
import { loop as soundLoop } from '../audio.js'
import { createAvatar, lookOf, poseAvatar } from './avatar3d.js'
import { createCameraRig } from './camera.js'
import { applyNight, createCampus, fitLabels, markDoors } from './campus.js'
import { startGroove, stopGroove } from '../groove.js'
import { setGrooveLevel } from '../audio.js'
import { createCrowd } from './crowd.js'
import { bindCampusInput } from './interact.js'
import { doorPoint } from './layout.js'
import { createCampusMap } from './map.js'
import { cellCenter, findPath, followStep, nearestOpen, pointBlocked } from './nav.js'

const WALK = 6.2
const host = document.getElementById('world')

let renderer
let scene
let camera
let rig
let input
let campus
let crowd = null
let player
let sun
let hemi
let ambient
let sunTarget
let mapUi
let frame = 0
let visible = false
let builtId = ''
let spawnedKey = ''
let route = []
let routeGoal = null
let arrive = null
let stuck = 0
let steering = null
let walking = false
let clock = 0
let frames = 0
let fpsStamp = 0
let currentRun = null
let currentDistrict = null
let actionLeft = 0
let actionCommit = null
let tourIndex = 0
let pendingAction = null
let snapTo = null
let gateDay = ''
let guide = null
let guideFrom = null

// Day-1 arrival: a glowing ground route from the player to the SMIG door, plus a pulsing marker.
function lectureDoor() {
  const hall = campus?.layout.buildings.find((building) => building.id === 'smig')
  return hall ? doorPoint(hall) : null
}

function clearGuide() {
  if (guide) scene.remove(guide)
  guide = null
  guideFrom = null
  if (host) host.dataset.route = '0'
}

function buildGuide() {
  const door = lectureDoor()
  if (!door || !player) return clearGuide()
  if (guide) scene.remove(guide)
  guide = new THREE.Group()
  guide.name = 'lecture-route'
  const path = findPath(campus.grid, nearestOpen(campus.grid, player.position), nearestOpen(campus.grid, door))
  const pts = [{ x: player.position.x, z: player.position.z }, ...path, door]
  const dotGeo = new THREE.CircleGeometry(0.32, 16)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 })
  let next = 0.8
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    for (; next < walked + len; next += 1.4) {
      const t = next - walked
      const dot = new THREE.Mesh(dotGeo, dotMat)
      dot.rotation.x = -Math.PI / 2
      dot.position.set(a.x + ((b.x - a.x) * t) / len, 0.06, a.z + ((b.z - a.z) * t) / len)
      dot.userData.k = guide.children.length
      guide.add(dot)
    }
    walked += len
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide }))
  ring.rotation.x = -Math.PI / 2
  ring.position.set(door.x, 0.08, door.z)
  ring.name = 'lecture-marker'
  guide.add(ring)
  scene.add(guide)
  guideFrom = { x: player.position.x, z: player.position.z }
  host.dataset.route = '1'
}

function lectureArrive() {
  if (!currentRun?.lectureRoute) return false
  currentRun.lectureRoute = false
  currentRun.lectureCard = true
  clearGuide()
  route = []
  routeGoal = null
  arrive = null
  window.dispatchEvent(new CustomEvent('mzansi-lecture-arrive'))
  return true
}

function updateGuide() {
  if (!currentRun?.lectureRoute || !player || !campus) { if (guide) clearGuide(); return }
  const door = lectureDoor()
  if (door && Math.hypot(door.x - player.position.x, door.z - player.position.z) < 2.4) { lectureArrive(); return }
  if (!guide || Math.hypot(player.position.x - guideFrom.x, player.position.z - guideFrom.z) > 4) buildGuide()
  for (const item of guide.children) {
    if (item.name === 'lecture-marker') item.scale.setScalar(1 + Math.sin(clock * 4) * 0.22)
    else item.material.opacity = 0.9
  }
  const ring = guide.getObjectByName('lecture-marker')
  if (ring) ring.material.opacity = 0.6 + Math.sin(clock * 4) * 0.3
}
let speed = WALK
const raycaster = new THREE.Raycaster()
const screenPoint = new THREE.Vector3()

const TOUR = [
  'Tap the ground to walk. On a keyboard, use W A S D or the arrow keys.',
  'Drag to turn the camera. Pinch or scroll to zoom in and out.',
  'Switch views with the Top, Sims, and Eye buttons. Keys 1, 2, and 3 do the same, and C cycles them.',
  'A glowing door means there is something to do there. Walk up and tap it. Each activity uses time and changes your stats.',
  'Open the Map to see every place. Walk here sends you to the door. The bars are Energy, Fullness, Grades, and Social. Fullness means how well you have eaten.',
]

function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.15 : 1.25)
}

function ensureHud() {
  if (host.querySelector('.door-prompt')) return
  host.insertAdjacentHTML('beforeend', `
    <p class="door-prompt" hidden></p>
    <div class="act-bar" hidden><span></span><em>Doing it</em></div>
    <p class="floater" hidden></p>
    <section class="onboard" hidden>
      <p class="step"></p>
      <div class="stack">
        <button type="button" data-tour="next">Next</button>
        <button type="button" data-tour="skip">Skip</button>
      </div>
    </section>
  `)
  host.addEventListener('click', (event) => {
    const tour = event.target.closest('[data-tour]')?.dataset.tour
    if (!tour) return
    if (tour === 'skip' || tourIndex >= TOUR.length - 1) finishTour()
    else {
      tourIndex += 1
      renderTour()
    }
  })
  host.querySelector('.door-prompt').addEventListener('click', () => enterNearest())
}

function renderTour() {
  const box = host.querySelector('.onboard')
  const last = tourIndex >= TOUR.length - 1
  box.querySelector('.step').textContent = TOUR[tourIndex]
  box.querySelector('[data-tour="next"]').textContent = last ? 'Done' : 'Next'
  box.hidden = false
}

function finishTour() {
  host.querySelector('.onboard').hidden = true
  try { localStorage.setItem('mzansiville.tour', '1') } catch { /* ignore */ }
}

function showTour(force) {
  if (!force && localStorage.getItem('mzansiville.tour') === '1') return
  if (new URLSearchParams(location.search).get('shot')) return
  tourIndex = 0
  renderTour()
}

function ensureRenderer() {
  if (renderer) return
  ensureHud()
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x9ecff0)
  host.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xc5e6f4, 70, 190)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 280)
  rig = createCameraRig()
  mapUi = createCampusMap(host)
  mapUi.setHandler((x, z) => walkTo(x, z))

  hemi = new THREE.HemisphereLight(0xfff6e4, 0x6ea85a, 0.9)
  ambient = new THREE.AmbientLight(0xfff1dc, 0.25)
  scene.add(hemi, ambient)
  sun = new THREE.DirectionalLight(0xffe2b0, 1.25)
  sun.castShadow = true
  sun.shadow.mapSize.set(512, 512)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 90
  sun.shadow.camera.left = -30
  sun.shadow.camera.right = 30
  sun.shadow.camera.top = 30
  sun.shadow.camera.bottom = -30
  sunTarget = new THREE.Object3D()
  scene.add(sunTarget)
  sun.target = sunTarget
  scene.add(sun)

  input = bindCampusInput(renderer.domElement, {
    camera,
    cameraRig: rig,
    raycaster,
    worldOn: () => visible && host.dataset.on === '1',
    blocked: () => mapUi.isOpen() || actionLeft > 0 || Boolean(pendingAction) || !host.querySelector('.onboard').hidden,
    pickables: () => ({
      buildings: campus ? [campus.buildings] : [],
      ground: campus ? [campus.ground] : [],
    }),
    onGround: (x, z) => walkTo(x, z),
    onBuilding: (id) => approach(id),
    onStick: (x, z) => {
      route = []
      routeGoal = null
      arrive = null
      steering = { x, z }
    },
  })

  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onWorldKey)
  window.addEventListener('mzansi-open-map', () => { if (visible) mapUi.open() })
  window.addEventListener('mzansi-close-map', () => mapUi?.close())
  window.addEventListener('mzansi-cam', (event) => rig?.setMode(event.detail))
  window.addEventListener('mzansi-help', () => { if (visible) showTour(true) })
  window.addEventListener('mzansi-act', (event) => beginAction(event.detail))
  // Used by tests and the map: walk to a building's door and enter it.
  window.addEventListener('mzansi-walk-to', (event) => { if (visible) approach(event.detail) })
}

function resize() {
  if (!renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function onWorldKey(event) {
  if (!visible || host.dataset.on !== '1') return
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (event.target?.closest?.('.sheet, .glass-card, .map-overlay, .onboard, .summary-panel')) return
  const key = event.key.toLowerCase()
  if (key === '1') rig.setMode('top')
  else if (key === '2') rig.setMode('sims')
  else if (key === '3') rig.setMode('eye')
  else if (key === 'c') rig.cycle()
  if ('123c'.includes(key)) {
    document.querySelectorAll('[data-act="cam"]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.mode === rig.mode ? 'true' : 'false')
    })
  }
  else if (key === 'm') mapUi.isOpen() ? mapUi.close() : mapUi.open()
  else if (key === 'e') enterNearest()
  else return
  event.preventDefault()
}

function activePlaces(district, run) {
  const ids = new Set()
  for (const place of district.places) {
    const list = actionsAt(district, run, place.id)
    if (list.some((action) => !actionState(district, run, action).hidden)) ids.add(place.id)
  }
  return ids
}

function walkTo(x, z, done) {
  if (!campus || !player || actionLeft > 0) return
  const goalCell = nearestOpen(campus.grid, { x, z })
  routeGoal = cellCenter(goalCell.c, goalCell.r)
  const start = nearestOpen(campus.grid, player.position)
  route = findPath(campus.grid, start, goalCell)
  if (route.length && Math.hypot(route[0].x - player.position.x, route[0].z - player.position.z) < 0.8) route.shift()
  arrive = done || null
  stuck = 0
  speed = WALK
}

function routeLength() {
  let len = 0
  let from = player.position
  for (const p of route) {
    len += Math.hypot(p.x - from.x, p.z - from.z)
    from = p
  }
  return len
}

function approach(id) {
  const building = campus?.layout.buildings.find((item) => item.id === id)
  if (!building) return
  const door = doorPoint(building)
  const dist = Math.hypot(door.x - player.position.x, door.z - player.position.z)
  if (dist < 2.2) openPlace(id)
  else walkTo(door.x, door.z, () => openPlace(id))
}

function openPlace(id) {
  if (id === 'smig' && lectureArrive()) return
  const next = `#/place/${id}`
  if (location.hash !== next) location.hash = next
}

function nearestDoor() {
  let best = null
  for (const building of campus?.layout.buildings || []) {
    const door = doorPoint(building)
    const dist = Math.hypot(door.x - player.position.x, door.z - player.position.z)
    if (!best || dist < best.dist) best = { building, dist }
  }
  return best
}

function enterNearest() {
  const near = nearestDoor()
  if (near && near.dist < 2.2) openPlace(near.building.id)
}

function repath() {
  if (!routeGoal) {
    route = []
    return
  }
  const start = nearestOpen(campus.grid, player.position)
  const goal = nearestOpen(campus.grid, routeGoal)
  route = findPath(campus.grid, start, goal)
  if (route.length) route.shift()
}

function follow(dt) {
  if (!route.length) {
    if (arrive) {
      const done = arrive
      arrive = null
      done()
    }
    return false
  }
  const step = followStep(campus.grid, { x: player.position.x, z: player.position.z }, route, speed * dt)
  if (step.blocked) {
    stuck += 1
    if (stuck >= 6) {
      stuck = 0
      repath()
    }
    return true
  }
  stuck = 0
  const dx = step.position.x - player.position.x
  const dz = step.position.z - player.position.z
  player.position.x = step.position.x
  player.position.z = step.position.z
  route = step.route
  if (dx || dz) player.rotation.y = Math.atan2(dx, dz)
  return true
}

function beginAction(detail) {
  if (!visible || !detail?.commit) return
  if (actionLeft > 0 || pendingAction) return
  const building = detail.placeId && campus?.layout.buildings.find((item) => item.id === detail.placeId)
  if (building && player) {
    const door = doorPoint(building)
    if (Math.hypot(door.x - player.position.x, door.z - player.position.z) > 0.6) {
      pendingAction = detail
      host.dataset.walk = 'walking'
      host.dataset.doorx = door.x.toFixed(2)
      host.dataset.doorz = door.z.toFixed(2)
      walkTo(door.x, door.z, () => {
        // Finish on the door anchor itself, not just the nearest grid cell.
        snapTo = { x: door.x, z: door.z }
        pendingAction = null
        host.dataset.walk = 'arrived'
        startBar(detail)
      })
      // Action walks are paced to land in about 2.5 s however far the door is.
      speed = Math.max(WALK, routeLength() / 2.5)
      return
    }
  }
  startBar(detail)
}

function startBar(detail) {
  actionLeft = 1.2
  actionCommit = detail.commit
  const bar = host.querySelector('.act-bar')
  bar.hidden = false
  bar.querySelector('span').style.width = '0%'
}

function showFloater(before, after) {
  const parts = []
  const words = [
    ['money', 'Money', (value) => `${value > 0 ? '+' : '-'}R${Math.abs(value)}`],
    ['energy', 'Energy', (value) => `${value > 0 ? '+' : ''}${value} Energy`],
    ['hunger', 'Fullness', (value) => `${value > 0 ? '+' : ''}${value} Fullness`],
    ['grades', 'Grades', (value) => `${value > 0 ? '+' : ''}${value} Grades`],
    ['social', 'Social', (value) => `${value > 0 ? '+' : ''}${value} Social`],
  ]
  for (const [key, , format] of words) {
    const delta = Math.round((after[key] || 0) - (before[key] || 0))
    if (delta) parts.push(format(delta))
  }
  const node = host.querySelector('.floater')
  node.textContent = parts.join('  ') || 'Done'
  node.hidden = false
  node.classList.remove('pop')
  void node.offsetWidth
  node.classList.add('pop')
  setTimeout(() => { node.hidden = true }, 1600)
}

function rebuild(district, homeId) {
  nightNow = -1
  if (campus) scene.remove(campus.group)
  crowd?.dispose()
  campus = createCampus(district, homeId)
  scene.add(campus.group)
  crowd = createCrowd(scene, campus)
  builtId = `${district.meta.id}|${homeId}`
}

function respawn(district, run) {
  const homeId = homePlaceId(district, run.character?.residence)
  if (builtId !== `${district.meta.id}|${homeId}`) rebuild(district, homeId)
  if (player) scene.remove(player)
  player = createAvatar(run.character?.avatar)
  host.dataset.look = JSON.stringify(player.userData.look)
  const home = campus.layout.buildings.find((building) => building.id === homeId) || campus.layout.buildings[0]
  const gate = run.at === 'gate' && campus.layout.buildings.find((building) => building.id === 'gate')
  const open = nearestOpen(campus.grid, gate ? { x: gate.x, z: gate.minZ - 12 } : doorPoint(home))
  const spot = cellCenter(open.c, open.r)
  player.position.set(spot.x, 0, spot.z)
  // ?spawn=<place id> starts at that place (tests and screenshots).
  const spawnAt = campus.layout.buildings.find((b) => b.id === new URLSearchParams(location.search).get('spawn'))
  if (spawnAt) {
    const cell = nearestOpen(campus.grid, doorPoint(spawnAt))
    const p = cellCenter(cell.c, cell.r)
    player.position.set(p.x, 0, p.z)
  }
  if (gate) {
    // Arriving by bus: stand inside the gate, facing the quad, camera behind.
    const quad = campus.layout.buildings.find((building) => building.id === 'quad') || { x: 0, z: 0 }
    player.rotation.y = Math.atan2(quad.x - spot.x, quad.z - spot.z)
    rig.facing = player.rotation.y
    rig.yaw = player.rotation.y + Math.PI
    gateDay = String(run.day)
  }
  host.dataset.spawn = gate ? 'gate' : 'home'
  host.dataset.facing = player.rotation.y.toFixed(2)
  scene.add(player)
  route = []
  routeGoal = null
  arrive = null
  clearGuide()
  spawnedKey = spawnKey(district, run)
  host.dataset.ready = '1'
}

function spawnKey(district, run) {
  return [district.meta.id, run.character?.residence, run.character?.name, JSON.stringify(lookOf(run.character?.avatar))].join('|')
}

function refreshMarkers() {
  if (!campus || !currentDistrict || !currentRun) return
  const active = activePlaces(currentDistrict, currentRun)
  markDoors(campus.buildings, active)
  mapUi.sync({
    buildings: campus.layout.buildings,
    paths: campus.layout.paths,
    district: currentDistrict,
    run: currentRun,
    active,
  })
}

function pin(node, x, y, z, lift = 0) {
  screenPoint.set(x, y, z).project(camera)
  if (screenPoint.z > 1) {
    node.style.left = '50%'
    node.style.top = '70%'
    return
  }
  const sx = (screenPoint.x * 0.5 + 0.5) * host.clientWidth
  const sy = (-screenPoint.y * 0.5 + 0.5) * host.clientHeight - lift
  const floor = host.clientWidth < 700 ? 460 : 120
  node.style.left = `${Math.min(host.clientWidth - 90, Math.max(90, sx))}px`
  node.style.top = `${Math.min(host.clientHeight - 160, Math.max(floor, sy))}px`
}

function promptDoor() {
  const node = host.querySelector('.door-prompt')
  const near = nearestDoor()
  if (!near || near.dist > 2.2 || mapUi.isOpen()) {
    node.hidden = true
    return
  }
  node.hidden = false
  node.textContent = `Tap to enter ${near.building.name}`
  pin(node, near.building.x, 2.6, near.building.maxZ + 0.4, 28)
}

function tryStep(dx, dz) {
  const x = player.position.x + dx
  const z = player.position.z + dz
  if (!pointBlocked(campus.grid, x, z)) {
    player.position.x = x
    player.position.z = z
    return
  }
  if (!pointBlocked(campus.grid, x, player.position.z)) player.position.x = x
  else if (!pointBlocked(campus.grid, player.position.x, z)) player.position.z = z
}

// Day and night follow the game clock (?hour=21 forces a time for screenshots).
const SKY = { day: new THREE.Color(0x9ecff0), dusk: new THREE.Color(0xf2a868), night: new THREE.Color(0x111a38) }
const FOG = { day: new THREE.Color(0xc5e6f4), dusk: new THREE.Color(0xe8b08a), night: new THREE.Color(0x141c38) }
const sky = new THREE.Color()
const fogColor = new THREE.Color()
const forcedHour = Number(new URLSearchParams(location.search).get('hour'))
export function nightAt(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440
  if (m >= 7 * 60 && m <= 17 * 60) return 0
  if (m > 17 * 60 && m < 19 * 60) return (m - 17 * 60) / 120
  if (m > 5 * 60 && m < 7 * 60) return 1 - (m - 5 * 60) / 120
  return 1
}
let nightNow = -1
function applyTime() {
  const minutes = Number.isFinite(forcedHour) && forcedHour > 0 ? forcedHour * 60 : currentRun?.minutes ?? 9 * 60
  const n = nightAt(minutes)
  if (Math.abs(n - nightNow) < 0.002) return
  nightNow = n
  const dusk = 1 - Math.abs(n - 0.5) * 2
  sky.copy(SKY.day).lerp(SKY.night, n).lerp(SKY.dusk, Math.max(0, dusk) * 0.6)
  fogColor.copy(FOG.day).lerp(FOG.night, n).lerp(FOG.dusk, Math.max(0, dusk) * 0.6)
  renderer.setClearColor(sky)
  scene.fog.color.copy(fogColor)
  // Night is properly dark (a little blue moonlight) so lamps and string lights carry it.
  sun.intensity = 1.25 * (1 - n) + 0.08 * n
  sun.color.setHSL(0.1 + 0.5 * n, 0.8 - 0.5 * n, 0.75 - dusk * 0.15)
  hemi.intensity = 0.9 * (1 - n) + 0.16 * n
  hemi.color.setHSL(0.6, 0.15 + 0.4 * n, 0.85 - n * 0.4)
  hemi.groundColor.setHSL(0.3, 0.3, 0.4 - n * 0.3)
  ambient.intensity = 0.25 * (1 - n) + 0.05 * n
  if (campus) applyNight(campus, n)
  host.dataset.night = n.toFixed(2)
}

// The sheet's "Spots here": how many people are at each spot, and walking there.
let spotTimer = 0
function countSpots() {
  const spots = campus?.dressing?.spots
  if (!spots) return
  const everyone = (crowd?.people.map((p) => p.avatar) || []).concat(campus.dressing.statics || [])
  const counts = {}
  for (const [place, list] of Object.entries(spots)) {
    for (const s of list) counts[`${place}:${s.id}`] = everyone.filter((a) => Math.hypot(a.position.x - s.x, a.position.z - s.z) < 4).length
  }
  host.dataset.spots = JSON.stringify(counts)
}
window.addEventListener('mzansi-walk-to', (event) => {
  const { place, spot } = event.detail || {}
  const target = campus?.dressing?.spots?.[place]?.find((s) => s.id === spot)
  if (target) { walkTo(target.x, target.z); host.dataset.walkingTo = `${place}:${spot}` }
})

// The Quad's open-mic speakers: the groove, louder the closer you are to the stage.
let quadMusic = false
function quadSound() {
  const quad = campus?.layout.buildings.find((b) => b.id === 'quad')
  if (!quad || !player) return
  const d = Math.hypot(player.position.x - quad.cx, player.position.z - (quad.cz - 5))
  const near = visible && d < 24
  if (near !== quadMusic) { quadMusic = near; near ? startGroove('quad') : stopGroove('quad') }
  if (near) setGrooveLevel(Math.max(0.08, 1 - d / 24) * 0.7)
}

function tick(now) {
  frame = requestAnimationFrame(tick)
  const dt = Math.min(0.05, (now - (tick.last || now)) / 1000 || 0)
  tick.last = now
  steering = null
  if (actionLeft <= 0) input.stick()
  walking = false
  if (player && campus) {
    if (actionLeft > 0) {
      actionLeft -= dt
      const bar = host.querySelector('.act-bar span')
      if (bar) bar.style.width = `${Math.min(100, (1.2 - Math.max(actionLeft, 0)) / 1.2 * 100)}%`
      walking = true
      if (actionLeft <= 0) {
        host.querySelector('.act-bar').hidden = true
        const commit = actionCommit
        actionCommit = null
        const before = currentRun ? { ...currentRun.stats } : null
        commit?.()
        if (before && currentRun) showFloater(before, currentRun.stats)
      }
    } else if (steering) {
      tryStep(steering.x * WALK * dt, steering.z * WALK * dt)
      player.rotation.y = Math.atan2(steering.x, steering.z)
      walking = true
    } else if (follow(dt)) {
      walking = true
    }
    if (snapTo) {
      const sx = snapTo.x - player.position.x
      const sz = snapTo.z - player.position.z
      const d = Math.hypot(sx, sz)
      const k = Math.min(1, (speed * dt) / Math.max(d, 1e-6))
      player.position.x += sx * k
      player.position.z += sz * k
      if (d > 0.02) { walking = true; player.rotation.y = Math.atan2(sx, sz) } else snapTo = null
    }
    if (rig.mode === 'eye') {
      const facing = rig.moveForward()
      player.rotation.y = Math.atan2(facing.x, facing.z)
    }
    clock += dt
    soundLoop('footsteps', walking)
    poseAvatar(player, walking, clock)
    applyTime()
    campus.dressing?.update(dt)
    quadSound()
    spotTimer -= dt
    if (spotTimer <= 0) { spotTimer = 1; countSpots() }
    crowd?.update(dt, player.position)
    crowd?.pushOut(player.position)
    if (crowd) host.dataset.nearest = Math.min(99, ...crowd.people.map((p) => Math.hypot(p.avatar.position.x - player.position.x, p.avatar.position.z - player.position.z))).toFixed(2)
    host.dataset.crowd = String(crowd?.people.length || 0)
    host.dataset.crowdWalking = String(crowd?.group.userData.walking || 0)
    rig.apply(camera, player.position, dt, campus.buildings)
    // Eye view looks out of the player's eyes: hide their own head and hair.
    const head = player.getObjectByName('head-mesh')
    if (head) head.visible = rig.mode !== 'eye'
    camera.updateMatrixWorld()
    fitLabels(campus.buildings, camera, dt)
    sun.position.set(player.position.x + 22, 34, player.position.z + 12)
    sunTarget.position.set(player.position.x, 0, player.position.z)
    for (const beacon of campus.buildings.children) {
      const glow = beacon.getObjectByName('beacon')
      if (glow?.visible) glow.scale.setScalar(1 + Math.sin(clock * 5) * 0.18)
    }
    updateGuide()
    promptDoor()
    const floater = host.querySelector('.floater')
    if (floater && !floater.hidden) pin(floater, player.position.x, 2.4, player.position.z)
    mapUi.frame({ x: player.position.x, z: player.position.z, facing: player.rotation.y })
    host.dataset.x = player.position.x.toFixed(1)
    host.dataset.z = player.position.z.toFixed(1)
    host.dataset.px = player.position.x.toFixed(2)
    host.dataset.pz = player.position.z.toFixed(2)
    host.dataset.cam = rig.mode
  }
  renderer.render(scene, camera)
  frames += 1
  if (now - fpsStamp > 500) {
    host.dataset.fps = String(Math.round((frames * 1000) / (now - fpsStamp)))
    frames = 0
    fpsStamp = now
  }
}

function start() {
  if (frame) return
  fpsStamp = performance.now()
  frame = requestAnimationFrame(tick)
}

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
  soundLoop('footsteps', false)
  if (quadMusic) { quadMusic = false; stopGroove('quad') }
  input?.clearKeys()
}

export function setVisible(on) {
  visible = on
  host.dataset.on = on ? '1' : '0'
  if (!on) {
    mapUi?.close()
    input?.clearKeys()
  }
  if (on) start()
  else stop()
}

export function showCampus(district, run) {
  if (!run) return
  ensureRenderer()
  currentDistrict = district
  currentRun = run
  const homeId = homePlaceId(district, run.character?.residence)
  const key = spawnKey(district, run)
  if (builtId !== `${district.meta.id}|${homeId}` || key !== spawnedKey || (run.at === 'gate' && gateDay !== String(run.day))) respawn(district, run)
  refreshMarkers()
  const shot = new URLSearchParams(location.search).get('shot') || ''
  if (shot === 'cam-top' || shot === 'cam-sims' || shot === 'cam-eye') rig.setMode(shot.slice(4))
  if (shot === 'map') mapUi.open()
  setVisible(true)
  // The first-load hint now lives in the shared UI (game.js ctaBar), so the old tour only opens from Help.
}

export function isWorldVisible() {
  return visible
}
