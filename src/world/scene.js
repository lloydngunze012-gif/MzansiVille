import * as THREE from 'three'
import { actionState, actionsAt } from '../engine/sim.js'
import { homePlaceId } from '../engine/model.js'
import { loop as soundLoop } from '../audio.js'
import { createAvatar, gesture, lookOf, poseAvatar } from './avatar3d.js'
import { createActivities, SCRIPTS } from './activities.js'
import { genderOf, roommateOf } from '../avatar.js'
import { nameOf } from './cast.js'
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
    <p class="act-say" hidden></p>
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
    blocked: () => mapUi.isOpen() || actionLeft > 0 || acting || Boolean(talk) || Boolean(pendingAction) || !host.querySelector('.onboard').hidden,
    pickables: () => ({
      buildings: campus ? [campus.buildings] : [],
      ground: campus ? [campus.ground] : [],
      people: everyone(),
    }),
    onPerson: (avatar) => startTalk(avatar),
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

// ---------- Talking to people ----------
// Everyone tappable: the crowd, the places' own people (vendor, campaigners...).
function everyone() {
  if (!campus) return []
  return (crowd?.people.map((p) => p.avatar) || []).concat(campus.dressing?.statics || [])
}

// A close camera shot (talking, activities) overrides the follow camera.
let closeShot = null
let shotBlend = 0
const closeLook = new THREE.Vector3()
// A two-shot from the side: both people in profile, in the top half of a portrait
// screen (the conversation card covers the bottom). The distance comes from the
// screen's shape (portrait phones see a narrow slice), and the camera takes the
// side with a clear view (no table or stall in front).
const shotRay = new THREE.Raycaster()
// Is this mesh part of one of the two people talking? (Their own bodies don't block.)
function isPart(object, ...people) {
  let node = object
  while (node) {
    if (node === player || (talk && node === talk.avatar)) return true
    node = node.parent
  }
  void people
  return false
}
function overShoulder(from, to) {
  // High three-quarter view from behind the player (about 50 degrees down): it looks
  // over tables and counters, and both people fit across a narrow portrait screen.
  const mx = (from.x + to.x) / 2
  const mz = (from.z + to.z) / 2
  const dx = to.x - from.x
  const dz = to.z - from.z
  const d = Math.hypot(dx, dz) || 1
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const halfW = halfH * camera.aspect
  const dist = Math.max(5, Math.min(12, (d / 2 + 1.4) / halfW))
  let best = null
  // Try a few heights and sides; take the first with a clear view of them
  // (an awning or a table can hide someone from high up).
  const tries = []
  for (const deg of [34, 22, 50]) for (const side of [0.5, -0.5, 1.1, -1.1]) tries.push([THREE.MathUtils.degToRad(deg), side])
  for (const [tilt, side] of tries) {
    const ax = -dx / d
    const az = -dz / d
    const rx = Math.cos(side) * ax - Math.sin(side) * az
    const rz = Math.sin(side) * ax + Math.cos(side) * az
    const pos = new THREE.Vector3(mx + rx * dist * Math.cos(tilt), 1 + dist * Math.sin(tilt), mz + rz * dist * Math.cos(tilt))
    const mid = new THREE.Vector3(mx, 1.1, mz)
    const dir = pos.clone().sub(mid)
    shotRay.set(mid, dir.clone().normalize())
    shotRay.far = dir.length()
    const hits = shotRay.intersectObjects(crowd ? [campus.group, crowd.group] : [campus.group], true)
    const blocked = hits.some((hit) => hit.object.name !== 'ground' && !hit.object.isSprite && (hit.object.visible || hit.object.name === 'hit') && !isPart(hit.object))
    if (!blocked) { best = pos; break }
    if (!best) best = pos
  }
  // Aim at them, then tilt the view down so they sit about 30% from the top of the
  // screen (NDC y = +0.4): the conversation card covers the bottom half.
  const mid = new THREE.Vector3(mx, 0.9, mz)
  const dir = mid.clone().sub(best).normalize()
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
  const tiltDown = Math.atan(0.4 * halfH)
  dir.applyAxisAngle(right, -tiltDown)
  return { pos: best, look: best.clone().addScaledVector(dir, 10) }
}

let talk = null
function startTalk(avatar) {
  if (!player || talk || acting || actionLeft > 0) return
  const id = avatar.userData.personId
  const walker = crowd?.people.find((p) => p.avatar === avatar)
  if (walker) walker.talking = true
  talk = { avatar, id, walker }
  host.dataset.talking = id
  // Where to stand: in front of someone who stays put (seated, behind a counter),
  // otherwise a step away on your side.
  const fixed = !walker || walker.sitting
  const fwd = { x: Math.sin(avatar.rotation.y), z: Math.cos(avatar.rotation.y) }
  let tx
  let tz
  if (fixed) {
    // The place's own people may be behind a counter or table: stand a bit further out.
    const reach = walker ? 1.35 : 2.2
    tx = avatar.position.x + fwd.x * reach
    tz = avatar.position.z + fwd.z * reach
  } else {
    const dx = player.position.x - avatar.position.x
    const dz = player.position.z - avatar.position.z
    const d = Math.hypot(dx, dz) || 1
    tx = avatar.position.x + (dx / d) * 1.3
    tz = avatar.position.z + (dz / d) * 1.3
  }
  const cell = nearestOpen(campus.grid, { x: tx, z: tz })
  if (cell) { const c = cellCenter(cell.c, cell.r); tx = c.x; tz = c.z }
  let opened = false
  const open = () => {
    if (!talk || opened) return
    opened = true
    player.rotation.y = Math.atan2(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
    if (!fixed) avatar.rotation.y = Math.atan2(player.position.x - avatar.position.x, player.position.z - avatar.position.z)
    closeShot = overShoulder(player.position, avatar.position)
    gesture(avatar, 'interact-right')
    window.dispatchEvent(new CustomEvent('mzansi-talk', { detail: { id } }))
  }
  if (Math.hypot(tx - player.position.x, tz - player.position.z) < 0.5) open()
  else {
    walkTo(tx, tz, () => { snapTo = { x: tx, z: tz }; setTimeout(open, 250) })
    if (!route.length) open()
    setTimeout(() => { if (talk && !opened) { route = []; arrive = null; open() } }, 5000)
  }
}
// Tests: where someone is on screen, so a test can tap them like a player would.
window.mzansiTalkTo = (id) => { const a = everyone().find((x) => x.userData.personId === id); if (a) startTalk(a); return Boolean(a) }
window.mzansiPersonOnScreen = (id) => {
  const avatar = everyone().find((a) => a.userData.personId === id)
  if (!avatar || !camera) return null
  const p = new THREE.Vector3(avatar.position.x, avatar.position.y + 1.55, avatar.position.z).project(camera)
  const rect = renderer.domElement.getBoundingClientRect()
  return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height, behind: p.z > 1 }
}
window.addEventListener('mzansi-talk-react', (event) => {
  if (!talk) return
  const tone = event.detail?.tone
  gesture(talk.avatar, tone === 'bad' ? 'emote-no' : 'emote-yes')
  if (tone === 'good') setTimeout(() => player && gesture(player, 'emote-yes'), 500)
})
window.addEventListener('mzansi-talk-end', () => {
  if (!talk) return
  if (talk.walker) { talk.walker.talking = false; talk.walker.wait = 1 }
  // Back to the follow camera, swung round behind you so they stay in view.
  if (player) rig.turnBehind(player.rotation.y)
  talk = null
  closeShot = null
  delete host.dataset.talking
})

// Name tags over the people near you (so you can see who to tap).
const TAG_NEAR = 10
function nameTag(avatar) {
  if (avatar.userData.tag !== undefined) return avatar.userData.tag
  const name = nameOf(avatar.userData.personId)
  if (!name) { avatar.userData.tag = null; return null }
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.font = 'bold 34px sans-serif'
  const w = Math.min(248, ctx.measureText(name).width + 36)
  ctx.fillStyle = 'rgba(34,20,59,0.85)'
  ctx.beginPath()
  ctx.roundRect((256 - w) / 2, 8, w, 48, 22)
  ctx.fill()
  ctx.fillStyle = '#fff6e6'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 128, 33)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }))
  sprite.scale.set(1.6, 0.4, 1)
  sprite.position.y = 2.05
  sprite.name = 'name-tag'
  sprite.raycast = () => {}
  avatar.add(sprite)
  avatar.userData.tag = sprite
  return sprite
}
function updateTags() {
  for (const avatar of everyone()) {
    const d = Math.hypot(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
    const want = d < TAG_NEAR && !acting && !talk
    const tag = want ? nameTag(avatar) : avatar.userData.tag
    if (tag) tag.visible = want
  }
}

// Activities you can see (activities.js): at a dressed place the student plays
// the activity out before the result lands. The bar is only a small timer.
let acting = false
let activities = null
const BENCH_Y = 0.5
function activityApi() {
  const bar = () => host.querySelector('.act-bar')
  const sayNode = () => host.querySelector('.act-say')
  let held = null
  const standUp = () => {
    player.userData.pose = 'stand'
    player.rotation.x = 0
    player.position.y = 0
  }
  return {
    get player() { return player },
    get dressing() { return campus.dressing },
    spot: (place, id) => campus.dressing.spots[place]?.find((s) => s.id === id) || { x: 0, z: 0 },
    walkTo: (x, z, pace = WALK) => new Promise((resolve) => {
      walkTo(x, z, () => { snapTo = { x, z }; setTimeout(resolve, 250) })
      speed = pace
      if (!route.length) { snapTo = { x, z }; setTimeout(resolve, 400) }
    }),
    wait: (s) => new Promise((resolve) => setTimeout(resolve, s * 1000)),
    face: (x, z) => { player.rotation.y = Math.atan2(x - player.position.x, z - player.position.z) },
    gesture: (name) => gesture(player, name),
    gestureOf: (avatar, name) => avatar && gesture(avatar, name),
    pose: (p, y = 0) => {
      standUp()
      player.userData.pose = p
      if (p === 'sit') player.position.y = y
      if (p === 'lie') { player.rotation.x = -Math.PI / 2; player.position.y = 0.28 }
    },
    sitAt: (seat) => {
      player.position.set(seat.x, seat.y, seat.z)
      player.rotation.y = seat.rot
      player.userData.pose = 'sit'
    },
    stand: () => {
      standUp()
      player.position.x += Math.sin(player.rotation.y) * 0.9
      player.position.z += Math.cos(player.rotation.y) * 0.9
    },
    freeSeat: () => {
      const benches = campus.dressing.benches || []
      for (const b of benches) {
        const seat = { x: b.x + Math.cos(b.rot) * 0.32, z: b.z - Math.sin(b.rot) * 0.32, rot: b.rot, y: BENCH_Y }
        const neighbour = crowd?.people.find((p) => p.sitting && Math.hypot(p.avatar.position.x - b.x, p.avatar.position.z - b.z) < 1)?.avatar
        return { ...seat, neighbour }
      }
      return null
    },
    say: (text, who = 'you') => {
      const node = sayNode()
      node.innerHTML = who && who !== 'you' ? `<b>${who === 'friend' ? 'Friend' : who}</b>${text}` : text
      node.hidden = false
    },
    progress: (k) => { const span = bar().querySelector('span'); span.style.width = `${Math.round(Math.min(1, k) * 100)}%` },
    hold: (mesh) => {
      if (held) held.removeFromParent()
      held = mesh
      const hand = player.getObjectByName('arm-right')
      const rig = player.getObjectByName('rig')
      if (!mesh || !hand || !rig) return
      mesh.scale.setScalar(1 / rig.scale.x)
      mesh.position.set(-0.02, -0.16, 0.06)
      hand.add(mesh)
    },
    groove: (level) => {
      if (level == null) stopGroove('activity')
      else { startGroove('activity'); setGrooveLevel(level * 0.8) }
    },
    end: () => {
      if (held) { held.removeFromParent(); held = null }
      standUp()
      sayNode().hidden = true
      stopGroove('activity')
    },
  }
}

async function runActivity(detail) {
  acting = true
  host.dataset.activity = SCRIPTS[detail.actionId] || 'stand'
  host.dataset.activityStep = 'running'
  const bar = host.querySelector('.act-bar')
  bar.hidden = false
  bar.classList.add('small')
  bar.querySelector('span').style.width = '0%'
  if (!activities) activities = { api: activityApi() }
  activities.runner = activities.runner || createActivities(activities.api)
  try {
    await activities.runner.run(detail.actionId)
  } catch (error) {
    console.error(error)
  }
  activities.api.end()
  bar.hidden = true
  bar.classList.remove('small')
  acting = false
  host.dataset.activityStep = 'done'
  const before = currentRun ? { ...currentRun.stats } : null
  detail.commit()
  if (before && currentRun) showFloater(before, currentRun.stats)
}

function beginAction(detail) {
  if (!visible || !detail?.commit) return
  if (actionLeft > 0 || pendingAction || acting) return
  if (detail.placeId === 'quad' && detail.actionId && campus?.dressing?.spots?.quad) {
    runActivity(detail)
    return
  }
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
  activities = null
  if (campus) scene.remove(campus.group)
  crowd?.dispose()
  campus = createCampus(district, homeId)
  scene.add(campus.group)
  crowd = createCrowd(scene, campus, { roommate: roommateOf(currentRun?.character?.avatar).toLowerCase() })
  builtId = `${district.meta.id}|${homeId}|${genderOf(currentRun?.character?.avatar)}`
}

function respawn(district, run) {
  const homeId = homePlaceId(district, run.character?.residence)
  if (builtId !== `${district.meta.id}|${homeId}|${genderOf(run.character?.avatar)}`) rebuild(district, homeId)
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
  // ?facing=<radians> turns the player and camera (0 looks south, out of the gate).
  const facingParam = new URLSearchParams(location.search).get('facing')
  if (facingParam !== null && Number.isFinite(Number(facingParam))) {
    player.rotation.y = Number(facingParam)
    rig.facing = player.rotation.y
    rig.yaw = player.rotation.y + Math.PI
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

// A bubble over someone's head: its bottom edge sits at the head, kept on screen
// and below the HUD (pin() keeps prompts low on phones, which covers the player).
function pinAbove(node, x, y, z) {
  screenPoint.set(x, y, z).project(camera)
  const sx = (screenPoint.x * 0.5 + 0.5) * host.clientWidth
  const sy = (-screenPoint.y * 0.5 + 0.5) * host.clientHeight
  const half = node.offsetWidth / 2 + 8
  const hud = document.querySelector('.g-hud')
  const top = (hud ? hud.getBoundingClientRect().bottom : 120) + node.offsetHeight + 8
  node.style.left = `${Math.min(host.clientWidth - half, Math.max(half, sx))}px`
  node.style.top = `${Math.max(top, sy)}px`
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

// The place you are heading for keeps its name tag at any distance.
function destination() {
  if (currentRun?.lectureRoute) return 'smig'
  if (!routeGoal || !campus) return ''
  const hit = campus.layout.buildings.find((b) => Math.hypot(routeGoal.x - b.x, routeGoal.z - (b.maxZ + 5)) < 4)
  return hit?.id || ''
}

// Building doors swing open as you come up to them, and close behind you.
function swingDoors(dt) {
  for (const group of campus.buildings.children) {
    const hinge = group.getObjectByName('door-pivot')
    if (!hinge) continue
    const b = campus.layout.buildings.find((item) => item.id === group.userData.placeId)
    const near = b && Math.hypot(player.position.x - b.x, player.position.z - (b.maxZ + 1.5)) < 3.6
    const want = near ? -1.75 : 0
    hinge.rotation.y += (want - hinge.rotation.y) * Math.min(1, dt * 5)
  }
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
  if (!target) return
  host.dataset.walkingTo = `${place}:${spot}`
  // On arrival, face whoever (or whatever) the spot is about, camera behind you.
  walkTo(target.x, target.z, () => {
    // The place's own people (vendor, campaigners, performer) first, not someone passing by.
    const near = (campus.dressing?.statics || [])
      .map((a) => ({ a, d: Math.hypot(a.position.x - target.x, a.position.z - target.z) }))
      .filter((o) => o.d < 4.5 && o.d > 0.6)
      .sort((m, n) => m.d - n.d)[0]
    const focus = near ? near.a.position : { x: target.fx ?? 0, z: target.fz ?? 0 }
    player.rotation.y = Math.atan2(focus.x - player.position.x, focus.z - player.position.z)
    rig.turnBehind(player.rotation.y)
  })
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
    // While playing an activity (queueing, sitting beside someone) you stand close on purpose.
    if (!acting && !talk) crowd?.pushOut(player.position)
    const say = host.querySelector('.act-say')
    if (say && !say.hidden) pinAbove(say, player.position.x, 2.2, player.position.z)
    if (crowd) host.dataset.nearest = Math.min(99, ...crowd.people.map((p) => Math.hypot(p.avatar.position.x - player.position.x, p.avatar.position.z - player.position.z))).toFixed(2)
    host.dataset.crowd = String(crowd?.people.length || 0)
    host.dataset.crowdWalking = String(crowd?.group.userData.walking || 0)
    rig.apply(camera, player.position, dt, campus.buildings)
    if (closeShot) {
      // Ease from wherever the camera was into the close shot.
      shotBlend = Math.min(1, shotBlend + dt * 2.2)
      camera.position.lerp(closeShot.pos, shotBlend)
      closeLook.lerp(closeShot.look, shotBlend)
      camera.lookAt(closeLook)
    } else {
      shotBlend = 0
      closeLook.copy(player.position)
    }
    // Eye view looks out of the player's eyes: hide their own head and hair.
    const head = player.getObjectByName('head-mesh')
    if (head) head.visible = rig.mode !== 'eye'
    camera.updateMatrixWorld()
    fitLabels(campus.buildings, camera, dt, { x: player.position.x, z: player.position.z, dest: destination() })
    swingDoors(dt)
    sun.position.set(player.position.x + 22, 34, player.position.z + 12)
    sunTarget.position.set(player.position.x, 0, player.position.z)
    for (const beacon of campus.buildings.children) {
      const glow = beacon.getObjectByName('beacon')
      if (glow?.visible) glow.scale.setScalar(1 + Math.sin(clock * 5) * 0.18)
    }
    updateGuide()
    updateTags()
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
  if (builtId !== `${district.meta.id}|${homeId}|${genderOf(run.character?.avatar)}` || key !== spawnedKey || (run.at === 'gate' && gateDay !== String(run.day))) respawn(district, run)
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
