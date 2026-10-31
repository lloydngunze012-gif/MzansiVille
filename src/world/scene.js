import * as THREE from 'three'
import { actionState, actionsAt } from '../engine/sim.js'
import { homePlaceId } from '../engine/model.js'
import { loop as soundLoop } from '../audio.js'
import { createAvatar, gesture, lookOf, poseAvatar } from './avatar3d.js'
import { createActivities, sceneName } from './activities.js'
import { genderOf, roommateOf } from '../avatar.js'
import { lookForPerson, nameOf } from './cast.js'
import { buildRoom } from './rooms.js'
import { makeChair } from './furniture.js'
import { loadModel } from './models.js'
import { createCameraRig } from './camera.js'
import { applyNight, createCampus, fitLabels, markDoors } from './campus.js'
import { startGroove, stopGroove } from '../groove.js'
import { setGrooveLevel } from '../audio.js'
import { createCrowd } from './crowd.js'
import { bindCampusInput } from './interact.js'
import { doorPoint } from './layout.js'
import { createCampusMap } from './map.js'
import { cellCenter, findPath, followStep, nearestOpen, pointBlocked } from './nav.js'
import { venueFor } from '../venues.js'
import { SPEED, ms } from '../speed.js'

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

// Day-1 arrival: a glowing ground route from the player to your lecture venue's door, plus a pulsing marker.
function lectureVenue() {
  return venueFor(currentRun).id
}
function lectureDoor() {
  const hall = campus?.layout.buildings.find((building) => building.id === lectureVenue())
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

// The day-1 lecture is due: the 3D lecture opens however you get to SMIG.
function lectureDue() {
  const run = currentRun
  return Boolean(run && (run.lectureRoute || (run.day === 1 && run.phase === 'lecture' && !run.lectureResolved)))
}

function lectureArrive() {
  if (!lectureDue()) return false
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
  if (!player || !campus) return
  const door = lectureDoor()
  if (lectureDue() && !acting && door && Math.hypot(door.x - player.position.x, door.z - player.position.z) < 2.4) { lectureArrive(); return }
  if (!currentRun?.lectureRoute) { if (guide) clearGuide(); return }
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
    <button type="button" class="go-skip" hidden>\u23E9 Skip there</button>
    <div class="act-bar" hidden><span></span><em>Doing it</em></div>
    <p class="floater" hidden></p>
    <p class="act-say" hidden></p>
    <div class="scene-fade" hidden><p></p></div>
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
  mapUi.setGo((id) => goTo(id))

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

// Go to a place (from either map): walk there and open its sheet on arrival.
// While you walk, "Skip there" jumps you to the door; the clock moves on.
let going = null
function goTo(id) {
  const building = campus?.layout.buildings.find((item) => item.id === id)
  if (!building || !player) return
  const door = doorPoint(building)
  const skip = host.querySelector('.go-skip')
  going = { id, door }
  host.dataset.going = id
  skip.hidden = false
  skip.onclick = () => {
    if (!going) return
    const far = Math.hypot(going.door.x - player.position.x, going.door.z - player.position.z)
    window.dispatchEvent(new CustomEvent('mzansi-travel-skip', { detail: { minutes: Math.max(1, Math.round(far / 12)) } }))
    route = []
    arrive = null
    player.position.set(going.door.x, player.position.y, going.door.z)
    const id2 = going.id
    endGoing()
    openPlace(id2)
  }
  approach(id, () => { endGoing() })
}
function endGoing() {
  going = null
  delete host.dataset.going
  const skip = host.querySelector('.go-skip')
  if (skip) skip.hidden = true
}
window.mzansiGoTo = (id) => goTo(id)
window.addEventListener('mzansi-go-place', (event) => { if (visible) goTo(event.detail?.id) })

function approach(id, onArrive) {
  const building = campus?.layout.buildings.find((item) => item.id === id)
  if (!building) return
  const door = doorPoint(building)
  const dist = Math.hypot(door.x - player.position.x, door.z - player.position.z)
  if (dist < 2.2) { onArrive?.(); openPlace(id) }
  else walkTo(door.x, door.z, () => { onArrive?.(); openPlace(id) })
}

function openPlace(id) {
  if (id === lectureVenue() && lectureArrive()) return
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
  // Both possible crushes are built at the Quad; only yours is there.
  const crushId = currentRun?.crush?.id
  return (crowd?.people.map((p) => p.avatar) || []).concat((campus.dressing?.statics || []).filter((a) => {
    if (!a.userData.crush) return true
    a.visible = a.userData.personId === crushId
    return a.visible
  }))
}

// A close camera shot (talking, activities) overrides the follow camera.
let closeShot = null
let shotBlend = 0
const shotCam = new THREE.Vector3()
const closeLook = new THREE.Vector3()
// A two-shot from the side: both people in profile, in the top half of a portrait
// screen (the conversation card covers the bottom). The distance comes from the
// screen's shape (portrait phones see a narrow slice), and the camera takes the
// side with a clear view (no table or stall in front).
const shotRay = new THREE.Raycaster()
// Is this mesh part of one of the two people talking? (Their own bodies don't block.)
// (People never block a shot: you can see past someone. Only buildings and props do.)
function isPart(object) {
  let node = object
  while (node) {
    if (node === player || node.userData?.personId || node === tempGroup || (room && node === room.group)) return true
    node = node.parent
  }
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
  for (const deg of [34, 22, 50, 12]) for (const side of [0.5, -0.5, 1.1, -1.1, 1.6, -1.6]) tries.push([THREE.MathUtils.degToRad(deg), side])
  for (const [tilt, side] of tries) {
    const ax = -dx / d
    const az = -dz / d
    const rx = Math.cos(side) * ax - Math.sin(side) * az
    const rz = Math.sin(side) * ax + Math.cos(side) * az
    const pos = new THREE.Vector3(mx + rx * dist * Math.cos(tilt), 1 + dist * Math.sin(tilt), mz + rz * dist * Math.cos(tilt))
    // Clear sight lines from the camera to both of them, head and knees (cast from
    // the camera: roofs and awnings are one-sided and only face upwards).
    const blocked = [from, to].some((p) => [1.6, 0.5].some((y) => {
      const dir = new THREE.Vector3(p.x, y, p.z).sub(pos)
      shotRay.set(pos, dir.clone().normalize())
      shotRay.far = dir.length() - 0.35
      return shotRay.intersectObjects([campus.group], true).some((hit) => hit.object.name !== 'ground' && !hit.object.isSprite && hit.object.visible && !isPart(hit.object))
    }))
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
  // Vendors serve the queue: from outside the line, you are sent to the back of it.
  if ((id === 'auntie_pinky' || id === 'mam_gugu') && window.mzansiVendorReady !== id) {
    window.dispatchEvent(new CustomEvent('mzansi-vendor-tap', { detail: { id } }))
    return
  }
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
    // Talking poses: they gesture as they speak (seated people talk seated).
    talk.pose = avatar.userData.pose
    if (avatar.userData.pose !== 'sit') avatar.userData.pose = 'talk'
    window.dispatchEvent(new CustomEvent('mzansi-talk', { detail: { id } }))
  }
  if (Math.hypot(tx - player.position.x, tz - player.position.z) < 0.5) open()
  else {
    walkTo(tx, tz, () => { snapTo = { x: tx, z: tz }; setTimeout(open, ms(250)) })
    if (!route.length) open()
    setTimeout(() => { if (talk && !opened) { route = []; arrive = null; open() } }, ms(5000))
  }
}
// Tests: where someone is on screen, so a test can tap them like a player would.
// Tests: a world point on screen, and the glowing route to the lecture.
window.mzansiScreenOf = (x, z, y = 0) => {
  if (!camera) return null
  const p = new THREE.Vector3(x, y, z).project(camera)
  const rect = renderer.domElement.getBoundingClientRect()
  return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height, behind: p.z > 1 }
}
// Tests: aim the camera anywhere (look-tests of bodies, seats and queues), and where someone is.
window.mzansiCam = (pos, look) => { closeShot = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null }
window.mzansiPersonPos = (id) => { const a = everyone().find((x) => x.userData.personId === id); return a ? { x: a.position.x, y: a.position.y, z: a.position.z, rot: a.rotation.y, pose: a.userData.pose } : null }
window.mzansiPeople = () => everyone().map((a) => ({ id: a.userData.personId, x: +a.position.x.toFixed(2), y: +a.position.y.toFixed(2), z: +a.position.z.toFixed(2), pose: a.userData.pose || 'stand' }))
window.mzansiDoorOf = (id) => { const b = campus?.layout.buildings.find((x) => x.id === id); return b ? doorPoint(b) : null }
window.mzansiRoute = () => {
  const door = lectureDoor()
  if (!door || !player || !campus) return null
  const path = findPath(campus.grid, nearestOpen(campus.grid, player.position), nearestOpen(campus.grid, door))
  return { player: { x: player.position.x, z: player.position.z }, path: [...path, door] }
}
window.mzansiTalkTo = (id) => { const a = everyone().find((x) => x.userData.personId === id); if (a) startTalk(a); return Boolean(a) }
window.mzansiDebug = () => JSON.stringify({ cam: camera?.position.toArray().map((v) => +v.toFixed(2)), look: closeLook.toArray().map((v) => +v.toFixed(2)), shot: closeShot && { pos: closeShot.pos?.toArray?.(), look: closeShot.look?.toArray?.() }, focus: activityFocus && (activityFocus.position || activityFocus) })
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
  if (tone === 'good') setTimeout(() => player && gesture(player, 'emote-yes'), ms(500))
})
window.addEventListener('mzansi-talk-end', () => {
  if (!talk) return
  if (talk.walker) { talk.walker.talking = false; talk.walker.wait = 1 }
  if (talk.pose !== undefined) talk.avatar.userData.pose = talk.pose
  // Back to the follow camera, swung round behind you so they stay in view.
  if (player) rig.turnBehind(player.rotation.y)
  talk = null
  closeShot = null
  delete host.dataset.talking
})

// Name tags over the people near you (so you can see who to tap).
const TAG_NEAR = 10
function crushTagName(avatar) {
  return currentRun?.crush?.nameKnown ? currentRun.crush.name : '?'
}
function nameTag(avatar) {
  // The crush's tag is "?" until you learn their name.
  if (avatar.userData.crush && avatar.userData.tag && avatar.userData.tagName !== crushTagName(avatar)) {
    avatar.remove(avatar.userData.tag)
    avatar.userData.tag = undefined
  }
  if (avatar.userData.tag !== undefined) return avatar.userData.tag
  const name = avatar.userData.crush ? crushTagName(avatar) : nameOf(avatar.userData.personId)
  avatar.userData.tagName = name
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
  // 18 cm tall: always smaller than a head (about 25 cm), at any distance.
  sprite.scale.set(0.72, 0.18, 1)
  sprite.position.y = 1.98
  sprite.name = 'name-tag'
  sprite.raycast = () => {}
  avatar.add(sprite)
  avatar.userData.tag = sprite
  return sprite
}
function updateTags() {
  for (const avatar of everyone()) {
    const d = Math.hypot(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
    // In Eye view, someone right in front of you needs no label over their face.
    const want = d < TAG_NEAR && !acting && !talk && !(rig.mode === 'eye' && d < 2.2)
    const tag = want ? nameTag(avatar) : avatar.userData.tag
    if (tag) tag.visible = want
  }
}

// Activities you can see (activities.js): at a dressed place the student plays
// the activity out before the result lands. The bar is only a small timer.
let acting = false
let activities = null
const BENCH_Y = 0.45
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
    // Scene walks always finish: if the path is blocked, step into place after a while.
    walkTo: (x, z, pace = WALK) => new Promise((resolve) => {
      let done = false
      const finish = () => { if (done) return; done = true; snapTo = { x, z }; setTimeout(resolve, ms(250)) }
      walkTo(x, z, finish)
      speed = pace
      if (!route.length) finish()
      const far = Math.hypot(x - player.position.x, z - player.position.z)
      setTimeout(() => { if (!done) { route = []; arrive = null; finish() } }, ms(1500 + (far / pace) * 1800))
    }),
    wait: (s) => new Promise((resolve) => setTimeout(resolve, ms(s * 1000))),
    face: (x, z) => { player.rotation.y = Math.atan2(x - player.position.x, z - player.position.z) },
    gesture: (name) => gesture(player, name),
    gestureOf: (avatar, name) => avatar && gesture(avatar, name),
    pose: (p, y = 0) => {
      standUp()
      player.userData.pose = p
      if (p === 'sit') player.position.y = y
      if (p === 'lie') { player.rotation.x = -Math.PI / 2; player.position.y = 0.02 }
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
      const hand = player.getObjectByName('hand_r') || player.getObjectByName('arm-right')
      const rig = player.getObjectByName('rig')
      if (!mesh || !hand || !rig) return
      // Held in the right hand, at world size whatever the bone's scale.
      const s = new THREE.Vector3()
      hand.getWorldScale(s)
      mesh.scale.setScalar(1 / s.x)
      mesh.position.set(0.06 / s.x, 0.04 / s.x, 0)
      hand.add(mesh)
    },
    groove: (level) => {
      if (level == null) stopGroove('activity')
      else { startGroove('activity'); setGrooveLevel(level * 0.8) }
    },
    // --- scenes everywhere (activities.js) ---
    get campus() { return campus },
    placeInfo: (id) => {
      if (id === 'here' || !id) {
        const p = player.position
        return { id: 'here', x: p.x, z: p.z, door: { x: p.x, z: p.z }, front: { x: p.x, z: p.z - 2.6 }, open: true }
      }
      const b = campus.layout.buildings.find((item) => item.id === id)
      if (!b) return null
      const door = doorPoint(b)
      return { id, b, x: b.x, z: b.z, door, front: { x: b.x, z: b.maxZ + 1.4 }, open: Boolean(b.open) }
    },
    frame: (target) => { activityFocus = target || null; focusTimer = 0 },
    glide: (x, z, pace = 2.4) => new Promise((resolve) => { scriptMove = { x, z, pace, resolve } }),
    teleport: (x, z, rot) => {
      route = []
      arrive = null
      snapTo = null
      player.position.set(x, 0, z)
      if (rot !== undefined) player.rotation.y = rot
    },
    fade: (text = '') => new Promise((resolve) => {
      const node = host.querySelector('.scene-fade')
      node.querySelector('p').textContent = text
      node.hidden = false
      node.classList.remove('out')
      setTimeout(resolve, ms(text ? 900 : 350))
    }),
    unfade: () => new Promise((resolve) => {
      const node = host.querySelector('.scene-fade')
      node.classList.add('out')
      setTimeout(() => { node.hidden = true; node.classList.remove('out'); resolve() }, ms(350))
    }),
    npc: (id, x, z, rot = 0, { pose = 'stand', y = 0 } = {}) => {
      const avatar = createAvatar(lookForPerson(id, temps.length + 3))
      avatar.position.set(x, y, z)
      avatar.rotation.y = rot
      avatar.userData.pose = pose
      avatar.userData.personId = id
      tempGroup.add(avatar)
      temps.push(avatar)
      return avatar
    },
    moveNpc: (avatar, x, z, pace = 1.8) => new Promise((resolve) => { npcMoves.push({ avatar, x, z, pace, resolve }) }),
    prop: (url, x, z, { s = 2.2, rot = 0, y = 0 } = {}) => {
      const holder = new THREE.Group()
      holder.position.set(x, y, z)
      holder.rotation.y = rot
      tempGroup.add(holder)
      loadModel(url).then((src) => { const m = src.clone(true); m.scale.setScalar(s); holder.add(m) }).catch(() => {})
      return holder
    },
    chair: (x, z, rot = 0) => {
      const c = makeChair()
      c.position.set(x, 0, z)
      c.rotation.y = rot
      tempGroup.add(c)
      return c
    },
    box: (w, h, d, color, x, y, z, extra = {}) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }))
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      tempGroup.add(mesh)
      return mesh
    },
    sign: (lines, x, y, z, rot = 0, w = 2.4, h = 1.4) => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = Math.round((512 * h) / w)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#f4ecd8'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = '#4a3426'
      ctx.lineWidth = 14
      ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14)
      ctx.fillStyle = '#22143b'
      ctx.textBaseline = 'middle'
      lines.forEach((text, i) => {
        ctx.font = `bold ${i === 0 ? 44 : 32}px sans-serif`
        ctx.fillText(text, 30, (canvas.height / (lines.length + 1)) * (i + 1), canvas.width - 60)
      })
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
      plane.position.set(x, y, z)
      plane.rotation.y = rot
      tempGroup.add(plane)
      return plane
    },
    room: (kind) => {
      clearRoom()
      room = buildRoom(kind)
      scene.add(room.group)
      return room
    },
    clearTemps: () => { clearTemps(); clearRoom() },
    end: () => {
      if (held) { held.removeFromParent(); held = null }
      standUp()
      sayNode().hidden = true
      stopGroove('activity')
      activityFocus = null
      closeShot = null
      scriptMove = null
      clearTemps()
      clearRoom()
      host.querySelector('.scene-fade').hidden = true
    },
  }
}

// Temporary people, props and rooms made by a scene, removed when it ends.
const tempGroup = new THREE.Group()
tempGroup.name = 'scene-temps'
let temps = []
let npcMoves = []
let room = null
let scriptMove = null
let activityFocus = null
let focusTimer = 0
// Inside a room the camera looks in from the open corner (the room has two walls).
function roomShot(from, to) {
  const mx = (from.x + to.x) / 2
  const mz = (from.z + to.z) / 2
  const spread = Math.hypot(to.x - from.x, to.z - from.z)
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const halfW = halfH * camera.aspect
  const dist = Math.max(6.5, Math.min(11, (spread / 2 + 1.6) / halfW))
  const tilt = THREE.MathUtils.degToRad(40)
  const dir = new THREE.Vector3(0.55, 0, 0.83).normalize()
  const pos = new THREE.Vector3(mx + dir.x * dist * Math.cos(tilt), 0.8 + dist * Math.sin(tilt), mz + dir.z * dist * Math.cos(tilt))
  const look = new THREE.Vector3(mx, 0.8, mz).sub(pos).normalize()
  const right = new THREE.Vector3().crossVectors(look, new THREE.Vector3(0, 1, 0)).normalize()
  look.applyAxisAngle(right, -Math.atan(0.35 * halfH))
  return { pos, look: pos.clone().addScaledVector(look, 10) }
}

function clearTemps() {
  for (const a of temps) a.userData.disposed = true
  temps = []
  npcMoves = []
  tempGroup.clear()
}
function clearRoom() {
  if (room) { scene.remove(room.group); room = null }
}
function sceneTick(dt) {
  if (!tempGroup.parent) scene.add(tempGroup)
  const moving = new Set()
  for (let i = npcMoves.length - 1; i >= 0; i--) {
    const m = npcMoves[i]
    const a = m.avatar.position
    const dx = m.x - a.x
    const dz = m.z - a.z
    const d = Math.hypot(dx, dz)
    const step = m.pace * dt
    if (d <= step) { a.x = m.x; a.z = m.z; npcMoves.splice(i, 1); m.resolve(); continue }
    a.x += (dx / d) * step
    a.z += (dz / d) * step
    m.avatar.rotation.y = Math.atan2(dx, dz)
    moving.add(m.avatar)
  }
  for (const a of temps) poseAvatar(a, moving.has(a), clock)
  // The camera frames you and what you are doing, re-aimed as you move.
  if (acting && activityFocus) {
    focusTimer -= dt
    if (focusTimer <= 0) {
      focusTimer = 0.5
      const to = activityFocus.position || activityFocus
      closeShot = room ? roomShot(player.position, to) : overShoulder(player.position, { x: to.x, z: to.z })
    }
  }
}

async function runActivity(detail) {
  acting = true
  host.dataset.activity = sceneName(detail.actionId)
  host.dataset.activityStep = 'running'
  const bar = host.querySelector('.act-bar')
  bar.hidden = false
  bar.classList.add('small')
  bar.querySelector('span').style.width = '0%'
  if (!activities) activities = { api: activityApi() }
  activities.runner = activities.runner || createActivities(activities.api)
  // Sitting with someone: the real them steps out while the scene's them sits with you.
  const hidden = detail.sceneOpt?.hide ? everyone().find((a) => a.userData.personId === detail.sceneOpt.hide) : null
  if (hidden) hidden.visible = false
  try {
    await activities.runner.run(detail.actionId, detail.placeId, detail.sceneOpt)
  } catch (error) {
    console.error(error)
  }
  if (hidden) hidden.visible = true
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
  if (detail.actionId && campus) {
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
  // Standing and doing it (a gesture), not walking on the spot.
  if (player) gesture(player, 'interact-right')
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
  setTimeout(() => { node.hidden = true }, ms(1600))
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
  if (!near || near.dist > 2.2 || mapUi.isOpen() || acting || talk) {
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
  if (currentRun?.lectureRoute) return lectureVenue()
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
  const dt = (Math.min(0.05, (now - (tick.last || now)) / 1000 || 0)) * SPEED
  tick.last = now
  steering = null
  if (actionLeft <= 0) input.stick()
  walking = false
  if (player && campus) {
    if (actionLeft > 0) {
      actionLeft -= dt
      const bar = host.querySelector('.act-bar span')
      if (bar) bar.style.width = `${Math.min(100, (1.2 - Math.max(actionLeft, 0)) / 1.2 * 100)}%`
      if (actionLeft <= 0) {
        host.querySelector('.act-bar').hidden = true
        const commit = actionCommit
        actionCommit = null
        const before = currentRun ? { ...currentRun.stats } : null
        commit?.()
        if (before && currentRun) showFloater(before, currentRun.stats)
      }
    } else if (scriptMove) {
      const m = scriptMove
      const dx = m.x - player.position.x
      const dz = m.z - player.position.z
      const d = Math.hypot(dx, dz)
      const step = m.pace * dt
      if (d <= step) { player.position.x = m.x; player.position.z = m.z; scriptMove = null; m.resolve() } else {
        player.position.x += (dx / d) * step
        player.position.z += (dz / d) * step
        player.rotation.y = Math.atan2(dx, dz)
        walking = true
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
    sceneTick(dt)
    if (closeShot) {
      // Ease from wherever the camera was into the close shot, and follow it smoothly.
      // (rig.apply above moved the camera back to the follow view; keep our own copy.)
      if (shotBlend === 0) { shotCam.copy(camera.position); closeLook.copy(closeShot.look) }
      shotBlend = 1
      const k = 1 - Math.exp(-dt * 3.5)
      shotCam.lerp(closeShot.pos, k)
      closeLook.lerp(closeShot.look, k)
      camera.position.copy(shotCam)
      camera.lookAt(closeLook)
    } else {
      shotBlend = 0
      closeLook.copy(player.position)
    }
    // Eye view looks out of the player's eyes: hide their own head and hair.
    for (const part of player.userData.headParts || []) part.visible = rig.mode !== 'eye'
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
