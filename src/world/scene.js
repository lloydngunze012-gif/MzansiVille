import * as THREE from 'three'
import { signMesh } from './text.js'
import { actionState, actionsAt } from '../engine/sim.js'
import { homePlaceId, houseOf } from '../engine/model.js'
import { FENCE_R, canDrive, carAt } from '../city/plan.js'
import { loop as soundLoop, sfx } from '../audio.js'
import { setSound } from '../soundscape.js'
import { appearNow, createAvatar, gesture, inTransition, layDown, lookOf, measureBody, poseAvatar, standSpotFor, holdIn } from './avatar3d.js'
import { createActivities, sceneName } from './activities.js'
import { genderOf } from '../avatar.js'
import { roommateFor, roommateLook } from '../roommates.js'
import { countryOf, countryWelcome } from '../from.js'
import { lookForPerson, nameOf } from './cast.js'
import { buildRoom } from './rooms.js'
import { makeChair } from './furniture.js'
import { loadModel } from './models.js'
import { createCameraRig } from './camera.js'
import { headOf, SHOT_EASE, SHOT_RANGE, twoShot } from './twoshot.js'
import { createBubbles } from './bubbles.js'
import { mountChat } from '../ui/chat.js'
import { onChat } from '../chat.js'
import { applyNight, createCampus, fitLabels, markDoors } from './campus.js'
import { startGroove, stopGroove } from '../groove.js'
import { setGrooveLevel } from '../audio.js'
import { createCrowd } from './crowd.js'
import { createOthers } from './others.js'
import { onlineCount, reportLocal, peersOnCampus, sendPoke } from '../presence.js'
import { bindInput } from './input.js'
import { createPlayer, WALK } from './player.js'
import { createDust } from './dust.js'
import { createPlayerState } from './player-state.js'
import { bodyReport, depthIn, resolveBodies } from './bodies.js'
import { collidersOf } from './colliders.js'
import { doorPoint, frontOf, frontPoint, WORLD_MAX, WORLD_MIN } from './layout.js'
import { reportError } from '../errors.js'
import { createCampusMap, createCityMap, takeCampusGoal } from './map.js'
import { boxBlocked, boxPath, cellCenter, cellOf, findPath, nearestOpen, pointBlocked } from './nav.js'
import { venueFor } from '../venues.js'
import { startDropOff } from './dropoff.js'
import { guardRenderer } from './guard.js'
import * as curtain from '../curtain.js'
import { createWalks } from './walks.js'
import { smooth } from '../smooth.js'
import { SPEED, ms } from '../speed.js'
import { checkLowHint, drainWalking, speedFactor } from '../engine/energy.js'
import { checkAway, noteOpen } from '../ui/minicard-state.js'

const host = document.getElementById('world')

let renderer
let scene
let camera
let rig
let input
let campus
let crowd = null
let others = null // the other real students (others.js, presence.js)
let player
let sun
let hemi
let ambient
let sunTarget
let mapUi
let cityMap = null
let frame = 0
let visible = false
let builtId = ''
// (what the campus was built for: a new roommate is a new person on the first Quad bench)
const buildKey = (district, homeId, run) => `${district.meta.id}|${homeId}|${genderOf(run?.character?.avatar)}|${roommateFor(run?.character).id}`
let spawnedKey = ''
let forcedSteer = null // tests: hold the stick in one direction (mzansiSteer)
let walking = false
let clock = 0
let frames = 0
let fpsStamp = 0
const fpsSeen = [] // the frame rate every half second, the last 10 s
let currentRun = null
let currentDistrict = null
let actionLeft = 0
let actionCommit = null
let tourIndex = 0
let ps = null // the player's one state (player-state.js)
let stopButton = null // shown while you move: tap it and you stop, whatever was going on
let houseBar = null // in a common room: Head out, Things to do
let chatUi = null // Piece 3: the Talk button and the chat panel (ui/chat.js)
let bubbles = null // speech bubbles over heads (bubbles.js)
let hudTop = 140 // the HUD's bottom edge on screen (bubbles stay under it)
let frameFrom = null // where the player was before this frame's step
let against = 0 // seconds walking at something without going anywhere
let againstFrames = 0
let gateDay = ''
let dropOff = null // day 1: the car at the Main Gate, then your bags to your door (dropoff.js)
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

// Day 1 after the drop-off: your own house's door, with your suitcase.
function homeDoor() {
  const id = currentRun && currentDistrict ? homePlaceId(currentDistrict, currentRun.character?.residence) : ''
  const b = campus?.layout.buildings.find((building) => building.id === id)
  return b ? doorPoint(b) : null
}
function buildGuide(door = lectureDoor()) {
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
  mover.stop()
  window.dispatchEvent(new CustomEvent('mzansi-lecture-arrive'))
  return true
}

let doorRetry = 0
function updateGuide() {
  if (!player || !campus) return
  if (dropOff?.wantsDoor) {
    const home = homeDoor()
    if (!home) return
    if (!paused() && Math.hypot(home.x - player.position.x, home.z - player.position.z) < 2.4) { clearGuide(); mover.stop(); dropOff.arrive(); return }
    // ("Take my bags": a walk that gave up short of the door sets off again after a moment)
    if (!paused() && !mover.target && clock - doorRetry > 1.5) { doorRetry = clock; dropOff.again() }
    if (!guide || Math.hypot(player.position.x - guideFrom.x, player.position.z - guideFrom.z) > 4) buildGuide(home)
    const mark = guide?.getObjectByName('lecture-marker')
    if (mark) { mark.scale.setScalar(1 + Math.sin(clock * 4) * 0.22); mark.material.opacity = 0.6 + Math.sin(clock * 4) * 0.3 }
    return
  }
  const door = lectureDoor()
  if (lectureDue() && !paused() && !acting && door && Math.hypot(door.x - player.position.x, door.z - player.position.z) < 2.4) { lectureArrive(); return }
  if (!currentRun?.lectureRoute) { if (guide) clearGuide(); return }
  if (!guide || Math.hypot(player.position.x - guideFrom.x, player.position.z - guideFrom.z) > 4) buildGuide()
  for (const item of guide.children) {
    if (item.name === 'lecture-marker') item.scale.setScalar(1 + Math.sin(clock * 4) * 0.22)
    else item.material.opacity = 0.9
  }
  const ring = guide.getObjectByName('lecture-marker')
  if (ring) ring.material.opacity = 0.6 + Math.sin(clock * 4) * 0.3
}
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
  // (a lost context during the day-1 drop-off: skip to arrival at the gate, nothing blank)
  guardRenderer(renderer, 'campus', { onLost: () => { if (!dropOff) return false; window.dispatchEvent(new CustomEvent('mzansi-dropoff-skip', { detail: { reload: true } })); return true } })
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x9ecff0)
  host.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.name = 'campus'
  scene.fog = new THREE.Fog(0xc5e6f4, 70, 190)
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 280)
  rig = createCameraRig()
  ps = createPlayerState({ host, onExit: leaveState, alive: stateAlive })
  mapUi = createCampusMap(host)
  // (the map is an order: whatever you were doing, you leave it and go)
  mapUi.setHandler((x, z) => { interrupt(); walkTo(x, z, null, { arrive: true }) })
  mapUi.setGo((id) => { interrupt(); goTo(id) })
  // The city view (City job A): the same map module, opened from the campus map's "SunnyBay" button.
  cityMap = createCityMap(document.body, {
    where: () => ({ x: player?.position.x || 0, z: player?.position.z || 0, facing: player?.rotation.y || 0, campus: true }),
    run: () => currentRun,
    go: (way, target) => window.dispatchEvent(new CustomEvent('mzansi-city-go', { detail: { way, target } })),
    campusMap: () => mapUi.open(),
    goCampus: (id) => { interrupt(); goTo(id) }, // (job I: a campus place picked on the whole map)
  })
  mapUi.setCity(() => cityMap.open())
  window.addEventListener('mzansi-open-city-map', () => { if (visible) cityMap.open() })

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

  // Phones get a thumbstick (the minimap moves up to the top right).
  // The Stop button: bottom right while you move, above everything. It stops you from
  // any state, a scene's walk or a queue walk too (that scene ends).
  stopButton = document.createElement('button')
  stopButton.type = 'button'
  stopButton.className = 'stop-btn'
  stopButton.setAttribute('aria-label', 'Stop')
  stopButton.innerHTML = '<span>■</span>Stop'
  stopButton.hidden = true
  host.append(stopButton)
  stopButton.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    interrupt()
    stopHere()
    stopButton.hidden = true
  })
  stopButton.addEventListener('click', (event) => event.stopPropagation())
  // Piece 3: talking to each other. The Talk button and panel; what's said near you shows
  // as a bubble over the speaker's head (yours too).
  chatUi = mountChat(host)
  bubbles = createBubbles(host)
  onChat((m) => bubbles.show(m.me ? 'me' : m.id, m.me ? String(currentRun?.character?.name || 'You').split(' ')[0] : String(m.name).split(' ')[0], m.text, m.me, m.me ? currentRun?.character?.handle || '' : m.handle || ''))
  window.addEventListener('mzansi-block', (event) => { bubbles.hide(event.detail?.id); chatUi.repaint() })
  // In a house's common room: the way out, and what there is to do here.
  host.insertAdjacentHTML('beforeend', '<div class="house-bar" hidden><button type="button" class="house-out">🚪 Head out</button><button type="button" class="house-do">Things to do</button></div>')
  houseBar = host.querySelector('.house-bar')
  host.querySelector('.house-out').addEventListener('click', (event) => { event.stopPropagation(); leaveHouse() })
  host.querySelector('.house-do').addEventListener('click', (event) => { event.stopPropagation(); if (inHouse) openPlace(inHouse.building.id) })
  input = bindInput(renderer.domElement, { cameraRig: rig, onTap: tapped, live: () => visible && host.dataset.on === '1' && !paused() })

  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onWorldKey)
  window.addEventListener('mzansi-open-map', () => { if (visible) mapUi.open() })
  window.addEventListener('mzansi-close-map', () => mapUi?.close())
  window.addEventListener('mzansi-cam', (event) => rig?.setMode(event.detail))
  window.addEventListener('mzansi-help', () => { if (visible) showTour(true) })
  window.addEventListener('mzansi-act', (event) => beginAction(event.detail))
  // Piece 1a: you wave at a player (turn to them, wave); a player waves at you.
  window.addEventListener('mzansi-wave', (event) => {
    if (!player) return
    const at = others?.positionOf(event.detail.id)
    if (at && (player.userData.pose || 'stand') === 'stand') player.rotation.y = Math.atan2(at.x - player.position.x, at.z - player.position.z)
    gesture(player, event.detail.gesture || 'emote-yes')
  })
  // Piece 3: a conversation with a real player ends (their card closed, the chat closed);
  // the chat opens (the nearest person within 4 m gets the two-shot with you).
  window.addEventListener('mzansi-convo-end', () => endConvo())
  window.addEventListener('mzansi-chat-open', (event) => {
    // (already talking, from their card: re-aimed above the chat panel, now it's up)
    if (convo) { const c = convo; requestAnimationFrame(() => { if (convo === c) aimConvo(true) }); return }
    if (!visible) return
    const id = event.detail?.id
    const them = id ? { kind: 'player', id, avatar: others?.avatarOf(id) } : nearestToTalk()
    if (them?.avatar) startConvo(them.kind, them.id, them.avatar)
  })
  window.addEventListener('mzansi-remote-gesture', (event) => others?.gestureOf(event.detail.id, event.detail.gesture || 'emote-yes'))
  // Meeting people, item 4: a wave or a hi you received turns you to face them, same as
  // tapping them does.
  window.addEventListener('mzansi-face-peer', (event) => {
    const avatar = others?.avatarOf(event.detail.id)
    if (!player || !avatar || (player.userData.pose || 'stand') !== 'stand') return
    if (Math.hypot(avatar.position.x - player.position.x, avatar.position.z - player.position.z) > 8) return
    player.rotation.y = Math.atan2(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
  })
  // Used by tests and the map: walk to a building's door and enter it.
  window.addEventListener('mzansi-walk-to', (event) => { if (visible && typeof event.detail === 'string') approach(event.detail) })
}

// The top panel (stats card, goal pill, Leave button) covers the top of the 3D view: the
// follow camera shifts the picture down by half of what the panel covers beyond a fifth
// of the screen, so the player stands in the clear area below it, not under it. Not in
// Eye view or in a two-shot / close shot (those frame heads between the bars themselves).
let viewShift = 0
function keepClearOfHud(dt) {
  const rect = host.getBoundingClientRect()
  const h = window.innerHeight
  let want = 0
  if (rig.mode !== 'eye' && !closeShot && !convo && !easingOut() && !inHouse) {
    const bottom = Math.max(0, ...[...document.querySelectorAll('.g-hud, .g-nowrow, .ps-leave')].filter((el) => el.getClientRects().length && !el.hidden).map((el) => el.getBoundingClientRect().bottom - rect.top))
    // (the player sits at the screen centre: it needs the centre to be a margin below the panel)
    want = Math.max(0, Math.min(h * 0.18, bottom + 60 - h * 0.5))
    // Chat sprint: the Chat sheet covers the bottom of the screen: the picture moves up, so you stand in the
    // middle of the strip between the top bar and the sheet and can see where you walk.
    const chatTop = Number(document.body.dataset.chatTop) || 0
    if (chatTop) want = -Math.round(h * 0.5 - (bottom + chatTop) * 0.5)
  }
  viewShift += (want - viewShift) * (1 - Math.exp(-dt * 6))
  if (Math.abs(viewShift - (camera.view?.offsetY ? -camera.view.offsetY : 0)) < 0.5) return
  if (Math.abs(viewShift) < 0.5 && want === 0) camera.clearViewOffset()
  else camera.setViewOffset(window.innerWidth, h, 0, -viewShift, window.innerWidth, h)
}

function resize() {
  if (!renderer) return
  camera.clearViewOffset()
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

// The one pause: movement stops only while a card or sheet is open (a chat, a place,
// an event, the map, the day summary). Nothing else ever holds the stick or taps.
function paused() {
  if (mapUi?.isOpen()) return true
  if (dropOff?.holding) return true
  // (on screen: a sheet slid away below the screen as its action starts doesn't count)
  for (const el of document.querySelectorAll('[role="dialog"]')) {
    const r = el.getBoundingClientRect()
    if (r.width && r.height && r.top < window.innerHeight - 4 && r.bottom > 4) return true
  }
  return false
}
// The player moves (the stick, a tap somewhere): whatever was playing out stops. An
// action, a scripted move, a walk to a place or a person, a seat: all cancelled.
function interrupt() {
  if (actionLeft > 0) {
    actionLeft = 0
    actionCommit = null
    host.querySelector('.act-bar').hidden = true
  }
  scriptMove?.resolve()
  scriptMove = null
  if (running) running.quit()
  if (!ps.open) ps.leave('moved')
  endGoing()
  const d = player?.userData
  if (d && (d.pose === 'sit' || d.pose === 'lie' || d.sitMove)) {
    d.pose = 'stand'
    d.sitMove = null
    d.recline = 1
    d.seatFloor = undefined
    player.rotation.x = 0
    player.position.y = 0
  }
}
// Stop on the spot: the stick was touched, or you tapped yourself.
function stopHere() {
  if (!player) return
  mover.stop()
  endGoing()
  if (player.userData.pose === 'run') player.userData.pose = 'stand'
}
// Is this screen point on the player (feet to head, a body's width)?
function onSelf(x, y) {
  if (!player || !camera) return false
  const rect = renderer.domElement.getBoundingClientRect()
  const at = (h) => {
    const p = new THREE.Vector3(player.position.x, player.position.y + h, player.position.z).project(camera)
    return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height, behind: p.z > 1 }
  }
  const feet = at(0)
  const head = at(1.8)
  if (feet.behind || head.behind) return false
  const half = Math.max(22, Math.abs(feet.y - head.y) * 0.22)
  const top = Math.min(feet.y, head.y) - 8
  const bottom = Math.max(feet.y, head.y) + 8
  const mid = (feet.x + head.x) / 2
  return y >= top && y <= bottom && Math.abs(x - mid) <= half
}
// A tap on the world: yourself (stop), a person (talk), a vendor's stall (her queue),
// a building (go in), or the ground (walk there).
// What's under a point on screen: yourself, a person, a vendor's stall, a building, or
// the ground (and where on it).
function pick(point, x, y) {
  if (!player || !campus) return null
  const hitOf = (hits, key) => {
    for (let node = hits[0]?.object; node; node = node.parent) if (node.userData?.[key]) return node
    return null
  }
  raycaster.setFromCamera(point, camera)
  // A real player (others.js): their card. (Standing on the same spot as you, they win
  // the tap while you stand still; walking, a tap on yourself still stops you.)
  const playerHit = () => {
    if (!others || inHouse) return null
    const hit = raycaster.intersectObjects(others.group.children, true).find((h) => h.object.name === 'hit')
    let node = hit?.object
    while (node && !node.userData.remote) node = node.parent
    return node ? { kind: 'player', id: node.userData.remote } : null
  }
  if (onSelf(x, y)) return (!mover.hasTarget && playerHit()) || { kind: 'self' }
  // The glowing ring at your lecture's door: a tap on it walks you there, all the way.
  const ring = guide?.getObjectByName('lecture-marker')
  if (ring && lectureVenue() && raycaster.intersectObject(ring, false).length) return { kind: 'building', id: lectureVenue() }
  const other = playerHit()
  if (other) return other
  if (inHouse && room) {
    const hit = raycaster.intersectObjects(room.group.children, true)[0]
    if (hit?.object.name === 'room-exit') return { kind: 'exit' }
    const floor = raycaster.intersectObject(room.group.getObjectByName('room-floor'), false)[0]
    return floor ? { kind: 'ground', x: floor.point.x, z: floor.point.z } : null
  }
  const person = hitOf(raycaster.intersectObjects(everyone(), true).filter((hit) => hit.object.name === 'hit'), 'personId')
  if (person) return { kind: 'person', node: person }
  const stall = hitOf(raycaster.intersectObjects(campus.dressing?.vendorTaps || [], true), 'vendor')
  if (stall) return { kind: 'vendor', id: stall.userData.vendor }
  const building = raycaster.intersectObjects([campus.buildings], true)[0]
  const ground = raycaster.intersectObjects([campus.ground], true)[0]
  const place = building && (!ground || building.distance <= ground.distance + 0.05) && hitOf([building], 'placeId')
  if (place) return { kind: 'building', id: place.userData.placeId }
  if (ground) return { kind: 'ground', x: ground.point.x, z: ground.point.z }
  // Past the lawn only the road out of the Main Gate is somewhere to go (SunnyBay: City job A).
  const ray = raycaster.ray
  if (ray.direction.y >= 0) return null
  const t = -ray.origin.y / ray.direction.y
  const gx = ray.origin.x + ray.direction.x * t
  const gz = ray.origin.z + ray.direction.z * t
  return gz > 70 && Math.abs(gx) < 45 && Math.hypot(gx, gz) < 140 ? { kind: 'ground', x: gx, z: gz } : null
}
// A tap: yourself (stop), a person (talk), a vendor's stall (her queue), a building (go
// in), or the ground (walk there).
function tapped(point, x, y) {
  const hit = pick(point, x, y)
  // (mid-scene, a tap on yourself or on nothing, as in a room off the map, ends it)
  if (acting && (!hit || hit.kind === 'self')) { interrupt(); return }
  if (!hit) return
  window.mzansiLastTap = hit.kind === 'person' ? { kind: 'person', id: hit.node.userData.personId } : { ...hit }
  if (hit.kind === 'player') {
    // (within 4 m: a conversation, and its two-shot, starts as their card slides up)
    startConvo('player', hit.id, others?.avatarOf(hit.id))
    if (player) noteOpen(hit.id, player.position.x, player.position.z)
    window.dispatchEvent(new CustomEvent('mzansi-player-card', { detail: { id: hit.id } }))
    return
  }
  if (hit.kind === 'self') stopHere()
  else if (hit.kind === 'exit') walkTo(room.anchors.door.x, room.anchors.door.z, () => leaveHouse(), { always: true })
  else if (hit.kind === 'person') startTalk(hit.node)
  else if (hit.kind === 'vendor') { const a = everyone().find((p) => p.userData.personId === hit.id); if (a) startTalk(a) }
  else if (hit.kind === 'building') { interrupt(); approach(hit.id) }
  else {
    smooth.tap(); mover.noteTap(); interrupt()
    // (a tap past the fence by the Main Gate: out of the gate, into SunnyBay)
    if (!inHouse && hit.z > 70 && Math.abs(hit.x) < 45 && Math.hypot(hit.x, hit.z) > FENCE_R - 1.5) walkTo(GATE_OUT.x, GATE_OUT.z)
    else walkTo(hit.x, hit.z)
  }
}

// Walk to a spot: a route round the buildings on the grid, ending exactly where asked.
// done() runs on arrival (or held up close by: within a metre and a half of it; held
// up anywhere with opts.always); the stick or another tap on the way cancels it. The
// other opts go to the mover (pace, near, solid).
function walkTo(x, z, done, opts = {}) {
  if (!campus || !player) return
  if (inHouse && room) {
    const pts = boxPath(room.blocks.concat(roomSolids), room.bounds, player.position, { x, z }, { pad: 0.34 })
    const pace = mover.walkTo(pts.length ? pts : [{ x, z }], { ...opts, done: (how) => { if (how === 'arrived' || (how === 'stalled' && (opts.always || Math.hypot(x - player.position.x, z - player.position.z) < 1.5))) done?.() } })
    host.dataset.walkSeconds = (mover.remaining() / pace).toFixed(1)
    return
  }
  const start = nearestOpen(campus.grid, player.position)
  const goal = nearestOpen(campus.grid, { x, z })
  const points = peopleInTheWay([start, goal], () => findPath(campus.grid, start, goal))
  if (points.length && Math.hypot(points[0].x - player.position.x, points[0].z - player.position.z) < 0.8) points.shift()
  points.pop()
  points.push(pointBlocked(campus.grid, x, z) ? cellCenter(goal.c, goal.r) : { x, z })
  const pace = mover.walkTo(points, {
    ...opts,
    done: (how) => {
      const left = Math.hypot(x - player.position.x, z - player.position.z)
      // (owner, 6 Nov) A walk to a marker or a place goes all the way: held up on the way
      // (a bench, someone stepping in), it finds a new route from where you are and
      // carries on, up to 8 times, instead of stopping there. Only a walk that makes no
      // progress at all ends where it stopped.
      if (how === 'stalled' && opts.arrive && left > 1.5) {
        const tries = (opts.tries || 0) + 1
        const progress = opts.lastLeft === undefined || left < opts.lastLeft - 0.3
        if (tries <= 8 && (progress || tries <= 3)) {
          requestAnimationFrame(() => walkTo(x, z, done, { ...opts, tries, lastLeft: left }))
          return
        }
      }
      if (how === 'arrived' || (how === 'stalled' && (opts.always || left < 1.5))) done?.()
    },
  })
  host.dataset.walkSeconds = (mover.remaining() / pace).toFixed(1)
  host.dataset.walkTries = String(opts.tries || 0)
}
// People are in the way too: while a route is found, the cells they stand in are closed
// (the grid itself only knows buildings and props), so it goes round them, never
// through. Where you start and where you're going stay open. Your companion and the
// other real players (others.js) aren't obstacles.
function peopleInTheWay(keep, find) {
  const grid = campus.grid
  const closed = []
  for (const b of campusBodies()) {
    const a = b.avatar
    if (a === player || a === companion?.avatar || !a.visible) continue
    const cell = cellOf(a.position.x, a.position.z)
    if (cell.c < 0 || cell.r < 0 || cell.c >= grid.cols || cell.r >= grid.rows) continue
    const i = cell.r * grid.cols + cell.c
    if (grid.blocked[i] || keep.some((k) => k && k.c === cell.c && k.r === cell.r)) continue
    grid.blocked[i] = 2
    closed.push(i)
  }
  try { return find() } finally { for (const i of closed) grid.blocked[i] = 0 }
}
// Is a body standing here inside something? Solid: every prop's outline, as a plain
// box; otherwise only the map's edge and the buildings (scripted walks onto seats).
// (BODY, a body's half-width, is defined with hitsSolid below)
// The campus fence is solid (City job A): the only way out is the Main Gate, and past it is SunnyBay.
const GATE_HALF = 4.4
const fenced = (x, z) => Math.hypot(x, z) > FENCE_R - 0.5 && !(Math.abs(x) < GATE_HALF && z > 0)
function blockedAt(x, z, solid = true) {
  if (room && x > room.bounds.minX - 1 && x < room.bounds.maxX + 1 && z > room.bounds.minZ - 1 && z < room.bounds.maxZ + 1) {
    return solid && room.blocks.concat(roomSolids).some((b) => x > b.minX - BODY && x < b.maxX + BODY && z > b.minZ - BODY && z < b.maxZ + BODY)
  }
  if (!solid) return pointBlocked(campus.grid, x, z)
  if (fenced(x, z) && !dropOff) return true
  if ((boxesNear(x, z) || []).some((b) => x > b.minX - BODY && x < b.maxX + BODY && z > b.minZ - BODY && z < b.maxZ + BODY)) return true
  const cell = cellOf(x, z)
  return !(cell.c >= 0 && cell.r >= 0 && cell.c < campus.grid.cols && cell.r < campus.grid.rows)
}
// (walks started and walks held up, for the smoothness reports: src/smooth.js)
let dust = null
const mover = createPlayer({ blocked: blockedAt, onGear: () => { if (scene && player) (dust ||= createDust(scene)).burst(player.position.x, player.position.z) }, onWalk: (e) => (e.type === 'start' ? smooth.walkStart() : smooth.walkEnd(e.how, e.left, e.x, e.z)) })

// Go to a place (from either map): walk there and open its sheet on arrival.
// While you walk, "Skip there" jumps you to the door; the clock moves on.
let going = null
function goTo(id) {
  const building = campus?.layout.buildings.find((item) => item.id === id)
  if (!building || !player) return
  if (inHouse) {
    if (inHouse.building === building) { openPlace(id); return }
    leaveHouse()
  }
  const door = doorPoint(building)
  const skip = host.querySelector('.go-skip')
  going = { id, door }
  host.dataset.going = id
  skip.hidden = false
  skip.onclick = () => {
    if (!going) return
    const far = Math.hypot(going.door.x - player.position.x, going.door.z - player.position.z)
    window.dispatchEvent(new CustomEvent('mzansi-travel-skip', { detail: { minutes: Math.max(1, Math.round(far / 12)) } }))
    mover.stop()
    player.position.set(going.door.x, player.position.y, going.door.z)
    const id2 = going.id
    endGoing()
    if (building.house) enterHouse(building, { sheet: true })
    else openPlace(id2)
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
// Walk together (src/walk.js): walk at someone's side, to where they are.
window.addEventListener('mzansi-walk-xz', (event) => { const d = event.detail || {}; if (visible && player && !paused() && Number.isFinite(d.x) && Number.isFinite(d.z)) { if (inHouse) leaveHouse(); walkTo(d.x, d.z) } })

function approach(id, onArrive) {
  const building = campus?.layout.buildings.find((item) => item.id === id)
  if (!building) return
  if (inHouse && inHouse.building !== building) leaveHouse()
  const door = doorPoint(building)
  const dist = Math.hypot(door.x - player.position.x, door.z - player.position.z)
  // (a house: through its door into the common room, its sheet over it)
  const viaMap = Boolean(going) // (the map's "go there" still opens the place sheet)
  const there = () => {
    onArrive?.()
    if (building.house) { enterHouse(building, { sheet: true }); return }
    faceTo = { x: building.x, z: building.z }
    if (id === 'cafeteria' && !viaMap && cafScene()) { enterCaf(); return }
    openPlace(id)
  }
  if (dist < 2.2) there()
  // (held up on the way: a new route and on again; only if it truly can't get there does
  // the place open where you stopped, never nothing)
  else walkTo(door.x, door.z, there, { always: true, arrive: true })
}
// Arrived: turn on the spot to face the place (the body turns, the feet stay put).
let keyWalk = false // (job I: this frame the keys are steering)
let faceTo = null

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

// The Caf door opens the Caf as its own scene (world/caf.js); ?caf=sheet keeps the old place sheet.
const cafScene = () => new URLSearchParams(location.search).get('caf') !== 'sheet'
function enterCaf() {
  mover.stop()
  sfx('door')
  window.dispatchEvent(new CustomEvent('mzansi-enter-caf'))
}
function enterNearest() {
  const near = nearestDoor()
  if (!near || near.dist >= 2.2) return
  if (near.building.house) { enterHouse(near.building, { sheet: true }); return }
  if (near.building.id === 'cafeteria' && cafScene()) { enterCaf(); return }
  openPlace(near.building.id)
}

// ---------- A house's common room (houses.json) ----------
// Every house door opens into its common room: a room you walk about in (taps on the
// floor), its housemates on the couch, the door out on the side wall. You start the
// game in your own house's. Leaving (the door, Head out, the map or another place)
// puts you on campus outside its door.
let inHouse = null // { building, house, folk: [avatars] }
function enterHouse(building, opts = {}) {
  if (!building?.house || !player) return
  const house = building.house
  clearRoom()
  mover.stop()
  scriptMove = null
  room = buildRoom('common', { house })
  scene.add(room.group)
  roomSolids = collidersOf(room.group)
  const built = room
  setTimeout(() => { if (room === built) roomSolids = collidersOf(room.group) }, 2500)
  // Housemates: two on the couch, one at the kettle (a different few in each house).
  const folk = []
  const seed = [...house.id].reduce((t, ch) => t + ch.charCodeAt(0), 0)
  const spots = room.anchors.seats.slice(0, 2).map((s) => ({ ...s, pose: 'sit' })).concat(room.anchors.stand.map((s) => ({ ...s, y: 0, pose: 'stand' })))
  spots.forEach((s, i) => {
    const id = `x${(seed + i * 5) % 20}`
    const a = createAvatar(lookForPerson(id, seed + i))
    a.position.set(s.x, s.y || 0, s.z)
    a.rotation.y = s.rot
    a.userData.pose = s.pose
    room.group.attach(a)
    folk.push(a)
  })
  inHouse = { building, house, folk }
  if (!opts.spawn) sfx('door')
  setSound({ inside: true })
  const at = opts.spawn ? room.anchors.spawn : room.anchors.door
  player.position.set(at.x, 0, at.z)
  player.userData.lastPos?.set(at.x, 0, at.z)
  player.userData.pose = 'stand'
  player.rotation.y = Math.atan2(room.anchors.look.x - at.x, room.anchors.look.z - at.z)
  // (the camera looks in through the open corner)
  rig.yaw = 0.85
  rig.facing = player.rotation.y
  host.dataset.house = house.id
  host.querySelector('.house-bar').hidden = false
  if (opts.sheet) openPlace(building.id)
}
function leaveHouse(opts = {}) {
  if (!inHouse) return
  const { building } = inHouse
  inHouse = null
  setSound({ inside: false })
  if (!opts.stay) sfx('door')
  clearRoom()
  mover.stop()
  delete host.dataset.house
  host.querySelector('.house-bar').hidden = true
  if (opts.stay) return
  const door = doorPoint(building)
  player.position.set(door.x, 0, door.z)
  player.userData.lastPos?.set(door.x, 0, door.z)
  player.userData.pose = 'stand'
  player.rotation.y = 0 // facing out, away from the door
  rig.yaw = Math.PI
  rig.facing = 0
}
window.mzansiInHouse = () => (inHouse ? { id: inHouse.house.id, name: inHouse.house.name, place: inHouse.building.id } : null)

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
const shotCam = new THREE.Vector3()
const closeLook = new THREE.Vector3()
// What the camera showed last frame, and the ease from it: a two-shot (ease: true) eases
// in over SHOT_EASE and back out to the follow view when it ends; the activities' shots
// follow as before (a smooth chase), and end with a cut back.
const shown = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ready: false }
const easeFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }
const goalQuat = new THREE.Quaternion()
const lookMatrix = new THREE.Matrix4()
let easeGoal = null
let easeT = 1
let easeOut = false
let lastEased = false
let aimedAt = 0
let easeCount = 0 // (tests: how many times the camera set off for a new shot)
function easingOut() { return easeOut && easeT < 1 }
function aimCamera(dt) {
  // (the 0.4 s ease runs on the wall clock: a slow frame, as the card appears, doesn't
  // stretch it; ?fast=1 speeds it up with everything else)
  const now = performance.now()
  const real = Math.min(0.5, (now - (aimedAt || now)) / 1000) * SPEED
  aimedAt = now
  // (rig.apply has just put the camera at the follow view)
  if (!shown.ready) { shown.pos.copy(camera.position); shown.quat.copy(camera.quaternion); shown.ready = true }
  const shot = closeShot
  if (shot !== easeGoal) {
    easeFrom.pos.copy(shown.pos)
    easeFrom.quat.copy(shown.quat)
    easeOut = !shot && lastEased
    easeT = 0
    if (shot && !shot.ease) {
      // (a chase shot starts from what was on screen, looking where it looked)
      shotCam.copy(shown.pos)
      closeLook.copy(shown.pos).add(new THREE.Vector3(0, 0, -1).applyQuaternion(shown.quat).multiplyScalar(Math.max(1, shown.pos.distanceTo(shot.look))))
    }
    easeGoal = shot
    easeCount += 1
  }
  if (shot && !shot.ease) {
    const k = 1 - Math.exp(-dt * 3.5)
    shotCam.lerp(shot.pos, k)
    closeLook.lerp(shot.look, k)
    camera.position.copy(shotCam)
    camera.lookAt(closeLook)
    lastEased = false
  } else if (shot || easingOut()) {
    easeT = Math.min(1, easeT + real / SHOT_EASE)
    const x = easeT
    const t = x * x * (3 - 2 * x)
    if (shot) {
      lookMatrix.lookAt(shot.pos, shot.look, camera.up)
      goalQuat.setFromRotationMatrix(lookMatrix)
      camera.position.lerpVectors(easeFrom.pos, shot.pos, t)
      lastEased = true
    } else {
      // (back to the follow view, wherever it is now)
      goalQuat.copy(camera.quaternion)
      camera.position.lerpVectors(easeFrom.pos, camera.position, t)
      if (easeT >= 1) lastEased = false
    }
    camera.quaternion.slerpQuaternions(easeFrom.quat, goalQuat, t)
  } else {
    lastEased = false
    closeLook.copy(player.position)
  }
  shown.pos.copy(camera.position)
  shown.quat.copy(camera.quaternion)
}
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
  // Further round them, and closer in, when buildings crowd the usual spots.
  for (const k of [1, 0.7]) for (const deg of [34, 22, 50, 12]) for (const side of [0.5, -0.5, 1.1, -1.1, 1.6, -1.6, 2.3, -2.3, Math.PI]) tries.push([THREE.MathUtils.degToRad(deg), side, k])
  let outside = null
  for (const [tilt, side, k] of tries) {
    const ax = -dx / d
    const az = -dz / d
    const rx = Math.cos(side) * ax - Math.sin(side) * az
    const rz = Math.sin(side) * ax + Math.cos(side) * az
    const r = dist * k
    const pos = new THREE.Vector3(mx + rx * r * Math.cos(tilt), 1 + r * Math.sin(tilt), mz + rz * r * Math.cos(tilt))
    // Clear sight lines from the camera to both of them, head and knees (cast from
    // the camera: roofs and awnings are one-sided and only face upwards).
    const blocked = [from, to].some((p) => [1.6, 0.5].some((y) => {
      const dir = new THREE.Vector3(p.x, y, p.z).sub(pos)
      shotRay.set(pos, dir.clone().normalize())
      shotRay.far = dir.length() - 0.35
      return shotRay.intersectObjects([campus.group], true).some((hit) => hit.object.name !== 'ground' && !hit.object.isSprite && hit.object.visible && !isPart(hit.object))
    }))
    // Never inside a building (rays cast from inside a wall don't see it).
    const inside = campus.layout.buildings.some((b) => pos.x > b.minX - 0.6 && pos.x < b.minX + b.w + 0.6 && pos.z > b.minZ - 0.6 && pos.z < b.minZ + b.d + 0.6 && pos.y < (b.h || 12) + 1)
    if (!blocked && !inside) { best = pos; break }
    if (!inside && !outside) outside = pos
  }
  // Nothing fully clear: the first spot outside any building, never one inside.
  if (!best) best = outside || new THREE.Vector3(mx - dx / d * 6, 5, mz - dz / d * 6)
  // Aim at them, then tilt the view down so they sit about 30% from the top of the
  // screen (NDC y = +0.4): the conversation card covers the bottom half.
  const mid = new THREE.Vector3(mx, 0.9, mz)
  const dir = mid.clone().sub(best).normalize()
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
  const tiltDown = Math.atan(0.4 * halfH)
  dir.applyAxisAngle(right, -tiltDown)
  // Both heads (and feet) in the strip above the card: pull back along the same line
  // until they fit (people far apart, one behind the other, need a wider shot).
  const probe = camera.clone()
  for (const scale of [1, 1.25, 1.55, 1.9, 2.4]) {
    const pos = mid.clone().addScaledVector(best.clone().sub(mid), scale)
    probe.position.copy(pos)
    probe.lookAt(pos.clone().addScaledVector(dir, 10))
    probe.updateMatrixWorld()
    const fits = [from, to].every((p) => [1.85, 0.05].every((y) => {
      const q = new THREE.Vector3(p.x, y, p.z).project(probe)
      return q.z < 1 && Math.abs(q.x) < 0.9 && q.y < 0.82 && q.y > -0.08
    }))
    if (fits || scale === 2.4) return { pos, look: pos.clone().addScaledVector(dir, 10) }
  }
  return { pos: best, look: best.clone().addScaledVector(dir, 10) }
}

// ---------- Piece 3: the conversation camera ----------
// Talking to someone within 4 m (a person here, a real player): the two-shot (twoshot.js),
// both heads between the HUD and the card, in every camera mode. It eases in over 0.4 s
// and back out to the view you had when the conversation ends.
// The strip of screen the heads go in (NDC y): under the HUD's bars, above the card.
function shotBand() {
  const rect = renderer.domElement.getBoundingClientRect()
  const ndc = (px) => 1 - ((px - rect.top) / rect.height) * 2
  // (the Goodbye / Leave button floats just under the HUD)
  const bars = [...document.querySelectorAll('.g-hud, .g-nowrow, .g-goal, .ps-leave')].filter((el) => el.getClientRects().length && !el.hidden).map((el) => el.getBoundingClientRect().bottom)
  const topPx = (bars.length ? Math.max(...bars) : rect.top + rect.height * 0.12) + 6
  const cards = [...document.querySelectorAll('.g-talk, .chat-panel:not([hidden])')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect().top)
  const bottomPx = cards.length ? Math.min(...cards) - 6 : rect.top + rect.height * 0.55
  const top = Math.min(0.9, ndc(topPx))
  // (a tall card: the heads keep at least a third of the screen, partly behind it)
  const bottom = Math.min(ndc(bottomPx), top - 0.34)
  return { top, bottom }
}
function shotFree(pos) {
  if (!onCampus(pos)) return false
  if (campus.layout.buildings.some((b) => pos.x > b.minX - 0.6 && pos.x < b.minX + b.w + 0.6 && pos.z > b.minZ - 0.6 && pos.z < b.minZ + b.d + 0.6 && pos.y < (b.h || 12) + 1)) return false
  if ((boxesNear(pos.x, pos.z) || []).some((b) => depthIn(pos.x, pos.z, b, 0.25) > 0)) return false
  // (never inside anyone's body: the crowd, the places' people, the real players)
  const bodies = everyone().concat(temps, others?.group.children || [])
  return !bodies.some((a) => a.visible !== false && Math.hypot(a.position.x - pos.x, a.position.z - pos.z) < 0.5)
}
// Nothing between the camera and that head, both ways (compact-bar job, owner 10 Nov:
// "the camera must not sit inside signs or roofs"). A mesh the follow camera has faded
// see-through still counts: it is only faded while it hides you from the far camera, and
// the two-shot stands much closer, inside or behind it. The ray runs from the head to
// the camera as well, because a ray that starts inside a sign or a roof sees none of its
// faces: from the head it meets that sign's outside first.
function shotSolid(hit) {
  return hit.object.name !== 'ground' && !hit.object.isSprite && hit.object.visible && !isPart(hit.object)
}
function shotClear(pos, head) {
  const dir = head.clone().sub(pos)
  const len = dir.length()
  dir.normalize()
  shotRay.set(pos, dir)
  shotRay.far = Math.max(0, len - 0.3)
  if (shotRay.intersectObjects([campus.group], true).some(shotSolid)) return false
  shotRay.set(head.clone().addScaledVector(dir, -0.3), dir.clone().negate())
  shotRay.far = Math.max(0, len - 0.3)
  return !shotRay.intersectObjects([campus.group], true).some(shotSolid)
}
// The two-shot of you and them, or null (too far, or nowhere to stand the camera).
function conversationShot(them) {
  if (!player || !them || !campus || inHouse) return null
  if (Math.hypot(them.position.x - player.position.x, them.position.z - player.position.z) > SHOT_RANGE) return null
  const a = headOf(player)
  const b = headOf(them)
  const ground = Math.min(campus.floor?.at(player.position.x, player.position.z) ?? 0, campus.floor?.at(them.position.x, them.position.z) ?? 0)
  return twoShot({ camera, a, b, band: shotBand(), free: shotFree, clear: shotClear, ground, facing: player.rotation.y, faces: them.rotation.y })
}
// A conversation with a real player (their card, then the chat), or with whoever is
// nearest when you open the chat: { kind: 'player' | 'npc', id, avatar, from, to }.
let convo = null
function convoAvatar(c) {
  if (!c) return null
  if (c.kind === 'player') return others?.avatarOf(c.id) || null
  return c.avatar?.parent ? c.avatar : null
}
function startConvo(kind, id, avatar) {
  if (!player || !avatar) return false
  if (Math.hypot(avatar.position.x - player.position.x, avatar.position.z - player.position.z) > SHOT_RANGE) return false
  interrupt()
  // (you turn to them; seated, you stay as you sit)
  if ((player.userData.pose || 'stand') === 'stand') player.rotation.y = Math.atan2(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
  // (aimed on the next frame, once the card or chat is drawn and the band is known; the
  // re-aim every half second waits until then)
  const c = { kind, id, avatar, from: null, to: null, timer: Infinity }
  convo = c
  host.dataset.convo = kind
  requestAnimationFrame(() => { if (convo === c) { aimConvo(true); c.timer = 0.5 } })
  return true
}
function aimConvo(force) {
  if (!convo) return
  const them = convoAvatar(convo)
  const far = !them || Math.hypot(them.position.x - player.position.x, them.position.z - player.position.z) > SHOT_RANGE + 1
  if (far) { if (closeShot?.convo) closeShot = null; return }
  const moved = !convo.from || Math.hypot(player.position.x - convo.from.x, player.position.z - convo.from.z) > 0.35 || Math.hypot(them.position.x - convo.to.x, them.position.z - convo.to.z) > 0.35
  if (!force && !moved && closeShot?.convo) return
  const shot = conversationShot(them)
  convo.from = { x: player.position.x, z: player.position.z }
  convo.to = { x: them.position.x, z: them.position.z }
  // (a new spot only if it's really somewhere else: no restarting the ease for nothing)
  if (shot && !(closeShot?.convo && closeShot.pos.distanceTo(shot.pos) < 0.3 && closeShot.look.distanceTo(shot.look) < 0.6)) closeShot = { ...shot, convo: true }
}
function endConvo() {
  if (!convo) return
  convo = null
  delete host.dataset.convo
  if (closeShot?.convo) closeShot = null
}
// Where a speaker's head is, for their bubble: you, or a real player drawn here.
function speakerHead(id) {
  if (id === 'me') return player ? headOf(player) : null
  const a = others?.avatarOf(id)
  return a ? headOf(a) : null
}
window.mzansiBubbles = () => bubbles?.report() || []
// Tests (seats, read only): everyone seated here, the seat of their trousers against the
// real furniture straight under their hips (a ray down, people ignored). gap < 0: sinking.
window.mzansiSeats = () => {
  const ray = new THREE.Raycaster()
  const solids = [campus?.group, room?.group, tempGroup].filter(Boolean)
  const pool = [player, ...everyone(), ...temps, ...(inHouse?.folk || [])]
  return pool.filter((a, i) => a && pool.indexOf(a) === i && a.userData.pose === 'sit' && !a.userData.sitMove && a.userData.rigged).map((a) => {
    const m = measureBody(a)
    const hips = a.getObjectByName('Hips') || a.userData.bones?.Hips
    const at = hips ? hips.getWorldPosition(new THREE.Vector3()) : a.getWorldPosition(new THREE.Vector3())
    ray.set(new THREE.Vector3(at.x, (m.seatOfPants ?? at.y) + 0.4, at.z), new THREE.Vector3(0, -1, 0))
    ray.far = 2
    const person = (o) => { for (let n = o; n; n = n.parent) if (n.userData?.personId || n.userData?.isPlayer || n.userData?.remote || n.userData?.rigged) return true; return false }
    const hit = ray.intersectObjects(solids, true).find((h) => h.object.visible && h.object.isMesh && !h.object.isSprite && !person(h.object) && h.object.name !== 'hit' && h.object.name !== 'room-floor')
    return { id: a.userData.isPlayer ? 'player' : a.userData.personId || 'extra', sop: m.seatOfPants, seatTop: hit ? +hit.point.y.toFixed(3) : null, gap: hit && m.seatOfPants != null ? +(m.seatOfPants - hit.point.y).toFixed(3) : null, on: hit?.object.name || hit?.object.parent?.name || null, at: [+at.x.toFixed(2), +at.z.toFixed(2)] }
  })
}
// Opening the chat: the nearest real player within 4 m, else the nearest person here.
function nearestToTalk() {
  if (!player) return null
  const dist = (a) => Math.hypot(a.position.x - player.position.x, a.position.z - player.position.z)
  let best = null
  for (const a of others?.group.children || []) if (a.userData.remote && dist(a) <= SHOT_RANGE && (!best || dist(a) < dist(best.avatar))) best = { kind: 'player', id: a.userData.remote, avatar: a }
  if (best) return best
  for (const a of everyone()) if (a.visible !== false && dist(a) <= SHOT_RANGE && (!best || dist(a) < dist(best.avatar))) best = { kind: 'npc', id: a.userData.personId, avatar: a }
  return best
}

let talk = null
// Tapping someone: walk up to them (a walk like any other: tap elsewhere and it's off),
// then the chat opens and the player is 'talking' until goodbye.
function startTalk(avatar) {
  if (!player || talk) return
  const id = avatar.userData.personId
  // Vendors serve the queue: from outside the line, you are sent to the back of it.
  if ((id === 'mama_liz' || id === 'mam_gugu') && window.mzansiVendorReady !== id) {
    window.dispatchEvent(new CustomEvent('mzansi-vendor-tap', { detail: { id } }))
    return
  }
  interrupt()
  const walker = crowd?.people.find((p) => p.avatar === avatar)
  // (a walker waits for you to come up; they carry on if you go elsewhere)
  if (walker && !walker.sitting) { walker.wait = Math.max(walker.wait || 0, 4); walker.resume = Boolean(walker.route?.length) }
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
  // The chat opens at once; if they're a few steps off, you walk up as it opens.
  const face = () => {
    player.rotation.y = Math.atan2(avatar.position.x - player.position.x, avatar.position.z - player.position.z)
    if (!fixed) avatar.rotation.y = Math.atan2(player.position.x - avatar.position.x, player.position.z - avatar.position.z)
    // (Piece 3: the two-shot; the old high shot only where no two-shot spot works)
    const shot = conversationShot(avatar)
    closeShot = shot ? { ...shot, talk: true } : overShoulder(player.position, avatar.position)
    talkAim = { a: { x: player.position.x, z: player.position.z }, b: { x: avatar.position.x, z: avatar.position.z }, timer: 0.5 }
  }
  const open = () => {
    if (talk) return
    if (walker) walker.talking = true
    talk = { avatar, id, walker }
    host.dataset.talking = id
    ps.set('talking')
    gesture(avatar, 'interact-right')
    // Talking poses: they gesture as they speak (seated people talk seated).
    talk.pose = avatar.userData.pose
    if (avatar.userData.pose !== 'sit') avatar.userData.pose = 'talk'
    // The card first; the camera shot (a few dozen sight lines) on the next frame.
    window.dispatchEvent(new CustomEvent('mzansi-talk', { detail: { id } }))
    requestAnimationFrame(() => { if (talk?.avatar === avatar) face() })
  }
  // Out of reach: walk up to them (a walk, not a jog) and the chat opens on arrival
  // (or wherever something holds you up). The stick or another tap calls it off.
  if (Math.hypot(avatar.position.x - player.position.x, avatar.position.z - player.position.z) > TALK_REACH) {
    walkTo(tx, tz, open, { pace: WALK, near: 0.3, always: true })
    return
  }
  open()
}
const TALK_REACH = 2.6
// The two-shot of a chat follows the pair: someone walking through them shoves them aside,
// and a shot left where it was shows a shoulder or nothing. Every half second, if either has
// moved 0.2 m, a new shot (as aimConvo does for a chat with a real player).
let talkAim = null
function reaimTalk(dt) {
  if (!talk || !talkAim || !closeShot?.talk) return
  talkAim.timer -= dt
  if (talkAim.timer > 0) return
  talkAim.timer = 0.5
  const them = talk.avatar
  if (Math.hypot(player.position.x - talkAim.a.x, player.position.z - talkAim.a.z) < 0.2 && Math.hypot(them.position.x - talkAim.b.x, them.position.z - talkAim.b.z) < 0.2) return
  talkAim.a = { x: player.position.x, z: player.position.z }
  talkAim.b = { x: them.position.x, z: them.position.z }
  const shot = conversationShot(them)
  if (shot && !(closeShot.pos.distanceTo(shot.pos) < 0.3 && closeShot.look.distanceTo(shot.look) < 0.6)) closeShot = { ...shot, talk: true }
}
// The chat is over (goodbye, or an action that ends it): the camera comes back, the
// person carries on, and the player is free.
function endTalkHere() {
  if (!talk) return null
  talkAim = null
  if (talk.walker) { talk.walker.talking = false; talk.walker.wait = 1 }
  if (talk.pose !== undefined) talk.avatar.userData.pose = talk.pose
  const them = talk.avatar
  talk = null
  closeShot = null
  delete host.dataset.talking
  leaveLines()
  if (ps.state === 'talking') ps.free()
  return them
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
window.mzansiPlayerRot = () => player?.rotation.y ?? 0
window.mzansiFloorAt = (x, z) => campus?.floor.at(x, z) ?? 0
// Tests (reliability): break the next scene wait inside an activity, lose the campus.
window.mzansiFailNextWait = false
window.mzansiBreakCampus = () => { if (campus) scene.remove(campus.group) }

// ---------- Never stuck: back on campus, the watchdog, the reload card ----------
// On the campus map (not lost where a room was, or nowhere at all)?
function onCampus(p) {
  return Number.isFinite(p.x) && Number.isFinite(p.z) && p.x > WORLD_MIN + 2 && p.x < WORLD_MAX - 2 && p.z > WORLD_MIN + 2 && p.z < WORLD_MAX - 2
}
function nearestPlace() {
  let best = null
  for (const b of campus?.layout.buildings || []) {
    const d = doorPoint(b)
    const dist = Math.hypot(d.x - player.position.x, d.z - player.position.z)
    if (!best || dist < best.dist || !Number.isFinite(best.dist)) best = { b, dist: Number.isFinite(dist) ? dist : 1e9 }
  }
  return best?.b
}
// Put the player back at a place's door, standing, nothing half-done.
function respawnAt(b) {
  const door = b ? doorPoint(b) : { x: 0, z: 6 }
  mover.stop()
  scriptMove = null
  player.rotation.x = 0
  player.userData.pose = 'stand'
  player.userData.sitMove = null
  player.userData.noCollide = false
  player.position.set(door.x, 0, door.z)
  player.userData.lastPos?.set(door.x, 0, door.z)
}
// After an activity (one that broke off inside a room too): back on campus at the
// place, never left where a room used to be, and never behind a black fade.
function backOnCampus(placeId) {
  if (!player || !campus) return
  const fade = host.querySelector('.scene-fade')
  if (fade && !fade.hidden) { fade.hidden = true; fade.classList.remove('out') }
  if (onCampus(player.position)) return
  respawnAt(campus.layout.buildings.find((x) => x.id === placeId) || nearestPlace())
}
// The scene itself has failed (the campus gone, the 3D view broken): a card offers a
// reload (the save is kept), never an empty field.
let failedShown = false
function failed(reason, error) {
  if (failedShown) return
  failedShown = true
  reportError('watchdog', error || reason, { reason })
  const card = document.createElement('div')
  card.className = 'world-fail'
  card.innerHTML = '<p>Something went wrong.</p><button type="button" class="btn">Tap to reload</button><small>Your progress is saved.</small>'
  card.querySelector('button').addEventListener('click', () => location.reload())
  host.append(card)
}
// Every few seconds: the campus is built and the player is on it (or in the room of
// the activity they're doing). Lost: back at the nearest place.
function watch() {
  if (!visible || document.hidden || failedShown) return
  if (!campus || !campus.group?.parent || !campus.layout?.buildings?.length) { failed('the campus is missing'); return }
  if (!player) return
  if (lastFrame && performance.now() - lastFrame > 8000) { failed('the 3D view stopped'); return }
  const inRoom = acting && room && player.position.x > room.bounds.minX - 2 && player.position.x < room.bounds.maxX + 2 && player.position.z > room.bounds.minZ - 2 && player.position.z < room.bounds.maxZ + 2
  const inCommon = inHouse && room && player.position.x > room.bounds.minX - 2 && player.position.x < room.bounds.maxX + 2 && player.position.z > room.bounds.minZ - 2 && player.position.z < room.bounds.maxZ + 2
  if (inRoom || inCommon || onCampus(player.position)) return
  reportError('watchdog', 'player outside the map', { at: [player.position.x, player.position.z].map((v) => Number.isFinite(v) ? +v.toFixed(1) : String(v)), acting })
  respawnAt(nearestPlace())
}
setInterval(watch, 3000)
window.mzansiWalkTo = (x, z) => walkTo(x, z)
window.mzansiWalkPace = () => ({ goal: mover.target, now: +mover.speed.toFixed(2), speed: +mover.pace.toFixed(2), route: +mover.remaining().toFixed(1), pose: player?.userData.pose })
// Tests (nobody inside furniture): how deep any part of a body is inside a chair,
// table, bench, counter or wall near them (box parts exactly, model parts by their
// boxes), and for a seated body, which way it faces against the chair under it.
// How deep a point (in a mesh's own space) is inside the mesh's closed surface: straight
// up from it, the first face it meets faces up (it's inside) at that distance; 0 if not.
const upRay = new THREE.Ray()
const triA = new THREE.Vector3()
const triB = new THREE.Vector3()
const triC = new THREE.Vector3()
const hitAt = new THREE.Vector3()
function insideModel(b, p) {
  // (inside only if, straight down too, the first face below faces down: a table top
  // with no underside doesn't make the space under it "inside")
  return Math.min(firstFace(b, p, 1), firstFace(b, p, -1))
}
function firstFace(b, p, dir) {
  const pos = b.m.geometry.attributes.position
  const index = b.m.geometry.index
  const n = index ? index.count : pos.count
  upRay.set(p, new THREE.Vector3(0, dir, 0))
  let best = Infinity
  let facesUp = false
  for (let i = 0; i < n; i += 3) {
    const ia = index ? index.getX(i) : i
    const ib = index ? index.getX(i + 1) : i + 1
    const ic = index ? index.getX(i + 2) : i + 2
    triA.fromBufferAttribute(pos, ia)
    triB.fromBufferAttribute(pos, ib)
    triC.fromBufferAttribute(pos, ic)
    if (!upRay.intersectTriangle(triA, triB, triC, false, hitAt)) continue
    const d = (hitAt.y - p.y) * dir
    if (d < best) {
      best = d
      facesUp = triB.clone().sub(triA).cross(triC.clone().sub(triA)).y * dir > 0
    }
  }
  return facesUp && Number.isFinite(best) ? best : 0
}
window.mzansiInside = (ids = ['player']) => {
  const groups = campus ? [campus.dressing.group, tempGroup, ...(room ? [room.group] : [])] : []
  const boxes = []
  const inv = new THREE.Matrix4()
  for (const g of groups) g.traverse((m) => {
    if (!m.isMesh || !m.visible || m.isSkinnedMesh || m.isSprite || m.material?.transparent) return
    let n = m
    while (n && !n.userData?.personId && !n.userData?.isPlayer && n.name !== 'player') n = n.parent
    if (n) return // (people)
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    const bb = m.geometry.boundingBox
    const size = bb.getSize(new THREE.Vector3())
    if (size.y <= 0.09 && m.position.y < 0.12) return // (floors, rugs, the plaza, the deck: the feet checks cover those)
    m.updateMatrixWorld()
    let kind = ''
    for (let k = m; k && !kind; k = k.parent) kind = k.userData?.kind || ''
    // (a tree's leaves are soft and the soil at its foot is ground: its trunk is what you walk into)
    boxes.push({ m, bb, inv: inv.clone().copy(m.matrixWorld).invert(), name: kind || m.parent?.name || m.name || 'mesh', exact: m.geometry.type === 'BoxGeometry', scale: m.getWorldScale(new THREE.Vector3()).x, trunkOnly: /tree/.test(kind) })
  })
  const out = []
  const v = new THREE.Vector3()
  const l = new THREE.Vector3()
  for (const a of [player, ...everyone(), ...temps].filter((x, i, all) => all.indexOf(x) === i)) {
    const id = a.userData.isPlayer ? 'player' : a.userData.personId
    if (!a.visible || !ids.includes(id)) continue
    const near = boxes.filter((b) => b.m.getWorldPosition(new THREE.Vector3()).distanceTo(a.position) < 3)
    let worst = 0
    let what = null
    a.traverse((node) => {
      if (!node.isSkinnedMesh || !node.visible) return
      const count = node.geometry.attributes.position.count
      const step = Math.max(1, Math.floor(count / 250))
      for (let i = 0; i < count; i += step) {
        node.getVertexPosition(i, v)
        node.localToWorld(v)
        for (const b of near) {
          if (b.trunkOnly && (v.y > 0.8 || v.y < 0.3)) continue // (trunk: above the mound of soil at its foot)
          l.copy(v).applyMatrix4(b.inv)
          const d = Math.min(l.x - b.bb.min.x, b.bb.max.x - l.x, l.y - b.bb.min.y, b.bb.max.y - l.y, l.z - b.bb.min.z, b.bb.max.z - l.z)
          if (d <= 0) continue
          // (scaled models: depth in world units; a model counts only inside its surfaces)
          const depth = b.exact ? d * b.scale : insideModel(b, l) * b.scale
          if (depth > worst) {
            worst = depth
            const c = b.m.getWorldPosition(new THREE.Vector3())
            const sz = b.bb.getSize(new THREE.Vector3()).multiply(b.m.getWorldScale(new THREE.Vector3()))
            what = `${b.name}${b.exact ? '' : ' (model box)'} at ${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)} size ${sz.x.toFixed(2)}x${sz.y.toFixed(2)}x${sz.z.toFixed(2)}, body point ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`
          }
        }
      }
    })
    // Seated on a chair: the body should face where the chair faces (its back behind).
    let facing = null
    if (a.userData.pose === 'sit') {
      let chair = null
      for (const g of groups) g.traverse((c) => { if (c.name === 'chair' && c.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(a.position.x, 0, a.position.z)) < 0.35) chair = c })
      if (chair) {
        const body = a.getObjectByName('rig').getWorldQuaternion(new THREE.Quaternion())
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(body)
        const cf = new THREE.Vector3(0, 0, 1).applyQuaternion(chair.getWorldQuaternion(new THREE.Quaternion()))
        facing = +(Math.acos(Math.max(-1, Math.min(1, fwd.x * cf.x + fwd.z * cf.z))) * 180 / Math.PI).toFixed(1)
      }
    }
    out.push({ id, pose: a.userData.pose || 'stand', phase: a.userData.sitMove ? a.userData.sitPhase : null, inside: +worst.toFixed(3), what, facing, at: [+a.position.x.toFixed(2), +a.position.z.toFixed(2)], step: host.dataset.activityStep || host.dataset.activity || null, activity: host.dataset.activity || null, noCollide: Boolean(a.userData.noCollide), say: host.querySelector('.act-say')?.textContent?.slice(0, 40) || null })
  }
  return out
}
// Tests (heads in frame): for the player and the given people, is each head's box fully
// on screen, not hidden behind a building or prop, and not around the camera itself?
window.mzansiHeads = (ids = []) => {
  const out = []
  const ray = new THREE.Raycaster()
  const blockers = campus ? [campus.buildings, campus.dressing.group, ...(room ? [room.group] : []), tempGroup] : []
  // ('near': everyone within 2.5 m of you, like the scene's own copy of a friend in a room)
  const near = (x) => x !== player && x.visible && Math.hypot(x.position.x - player.position.x, x.position.z - player.position.z) < 2.5
  const pool = [...everyone(), ...temps, ...(others?.group.children || [])]
  for (const a of [player, ...pool.filter((x, i) => pool.indexOf(x) === i && (ids.includes(x.userData.personId) || ids.includes(x.userData.remote) || (ids.includes('near') && near(x))))]) {
    if (!a?.visible) continue
    const head = a.getObjectByName('Head')
    if (!head) continue
    const c = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0))
    let inside = true
    const ndc = { x0: 9, x1: -9 }
    for (const dx of [-0.13, 0.13]) for (const dy of [-0.14, 0.16]) for (const dz of [-0.13, 0.13]) {
      const p = c.clone().add(new THREE.Vector3(dx, dy, dz)).project(camera)
      ndc.x0 = Math.min(ndc.x0, p.x); ndc.x1 = Math.max(ndc.x1, p.x)
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) inside = false
    }
    // (the HUD covers the top of the screen: a head under it counts as out of view)
    const top = c.clone().add(new THREE.Vector3(0, 0.16, 0)).project(camera)
    const hud = document.querySelector('.g-hud')?.getBoundingClientRect().bottom || 0
    const underHud = (1 - top.y) / 2 * window.innerHeight < hud
    const dist = camera.position.distanceTo(c)
    ray.set(camera.position, c.clone().sub(camera.position).normalize())
    ray.far = dist - 0.25
    const hit = ray.intersectObjects(blockers, true).find((h) => h.object.visible && !h.object.userData.standIn && !h.object.userData.seeThrough && h.object.name !== 'beacon' && h.object.name !== 'badge' && h.object.type === 'Mesh')
    out.push({ id: a.userData.isPlayer ? 'player' : a.userData.personId || a.userData.remote, inside, ndc, underHud, dist: +dist.toFixed(2), hidden: hit ? (hit.object.name || hit.object.parent?.name || 'mesh') : null, shown: a === player ? (player.userData.headParts || []).every((p) => p.visible) : true })
  }
  return { mode: rig.mode, close: Boolean(closeShot), heads: out }
}
// Tests (Piece 3, read only): the camera now, the close shot it is in or easing to, and
// the conversation (who with), with the camera's distance and height from the pair.
window.mzansiView = () => (player && campus ? { ...rig.check(camera, player.position, [campus.buildings, campus.dressing.group, ...(room ? [room.group] : [])]), start: host.dataset.start || '', house: Boolean(inHouse) } : null)
window.mzansiShot = () => {
  if (!camera || !player) return null
  const them = convoAvatar(convo) || (talk?.avatar ?? null)
  const mid = them ? { x: (them.position.x + player.position.x) / 2, z: (them.position.z + player.position.z) / 2 } : null
  return {
    mode: rig.mode,
    cam: camera.position.toArray().map((v) => +v.toFixed(3)),
    close: Boolean(closeShot),
    eased: Boolean(closeShot?.ease),
    easing: closeShot ? easeT < 1 : easingOut(),
    eases: easeCount,
    easeT: +easeT.toFixed(3),
    convo: convo ? { kind: convo.kind, id: convo.id } : null,
    talk: talk?.id || null,
    back: mid ? +Math.hypot(camera.position.x - mid.x, camera.position.z - mid.z).toFixed(2) : null,
    height: +(camera.position.y - (campus?.floor?.at(camera.position.x, camera.position.z) ?? 0)).toFixed(2),
    apart: them ? +Math.hypot(them.position.x - player.position.x, them.position.z - player.position.z).toFixed(2) : null,
    // (in a two-shot: both heads in plain view from where the camera is, nothing between, the camera inside nothing)
    clearView: closeShot && them && campus ? shotClear(camera.position.clone(), headOf(player)) && shotClear(camera.position.clone(), headOf(them)) : null,
    // (where both heads are on screen, in CSS pixels: you, then them)
    heads: them ? [headOf(player), headOf(them)].map((h) => { const r = renderer.domElement.getBoundingClientRect(); const q = h.project(camera); return [Math.round(r.left + (q.x + 1) / 2 * r.width), Math.round(r.top + (1 - q.y) / 2 * r.height)] }) : null,
  }
}
window.mzansiQueue = (which = 'stall') => { const q = campus?.dressing.queue?.[which]; return q && { front: q.front, back: q.slot(q.line.order.length), people: q.people.length, order: q.line.order.map((a) => (a.userData.isPlayer ? 'player' : a.userData.personId)), serving: q.line.serving ? (q.line.serving.userData.isPlayer ? 'player' : q.line.serving.userData.personId) : null, vendor: q.vendor && { x: q.vendor.position.x, z: q.vendor.position.z } } }
// Tests (read only): a queue's people right now: where each stands, which way they face,
// how many walks they have (never more than one), and when the line last changed.
window.mzansiQueueWalks = (which = 'stall') => {
  const q = campus?.dressing.queue?.[which]
  const walks = campus?.dressing.walks
  if (!q || !walks) return null
  return {
    changed: q.line.changed, now: performance.now(), maxPer: walks.maxPer, endings: walks.endings, slots: [0, 1, 2, 3, 4, 5].map((i) => q.slot(i)),
    npcs: q.line.members.map((a) => ({ id: a.userData.personId, x: +a.position.x.toFixed(3), z: +a.position.z.toFixed(3), rot: +a.rotation.y.toFixed(3), walks: walks.count(a), inLine: q.line.order.includes(a), place: q.line.order.indexOf(a) })),
  }
}
window.mzansiLookAt = (x, z) => { if (!player || !rig) return; const a = Math.atan2(x - player.position.x, z - player.position.z); rig.facing = a; player.rotation.y = a }
window.mzansiRefit = () => { if (player) player.userData.sitFit = null }
window.mzansiPlayerData = () => player && { pose: player.userData.pose, prev: player.userData.prevPose, move: player.userData.sitMove && { ...player.userData.sitMove }, phase: player.userData.sitPhase, fit: Boolean(player.userData.sitFit), y: player.position.y, players: window.mzansiBodies('campus', 'player').length }
window.mzansiPlayerPose = () => player?.userData.pose || 'stand'
window.mzansiSmoothPlace = () => smoothPlace() // (tests, read only) the place the smoothness reports file this frame under
window.mzansiPlayerPos = () => player && { x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2) }
window.mzansiPeople = () => everyone().map((a) => ({ id: a.userData.personId, x: +a.position.x.toFixed(2), y: +a.position.y.toFixed(2), z: +a.position.z.toFixed(2), pose: a.userData.pose || 'stand' }))
window.mzansiPlaceOf = (id) => { const b = campus?.layout.buildings.find((x) => x.id === id); return b ? { x: b.x, z: b.z, door: doorPoint(b) } : null }
window.mzansiHomeId = () => (currentDistrict && currentRun ? homePlaceId(currentDistrict, currentRun.character?.residence) : null)
// Tests (no mirrored text): every sign with words on it, and whether it reads back to
// front (a mirror in its transform, or seen through a two-sided face) or upside down.
window.mzansiSigns = () => {
  const out = []
  scene?.traverse((m) => {
    if (!m.isMesh || m.isSprite || !m.material?.map?.isCanvasTexture || m.name === 'sign-back') return
    m.updateMatrixWorld()
    const up = new THREE.Vector3(0, 1, 0).transformDirection(m.matrixWorld)
    const mirrored = m.matrixWorld.determinant() < 0 || (m.material.side === THREE.DoubleSide && !m.children.some((c) => c.name === 'sign-back'))
    out.push({ name: m.name || m.parent?.name || 'mesh', at: m.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(1)), mirrored, upsideDown: up.y < -0.2, flat: Math.abs(up.y) < 0.2 })
  })
  return out
}
window.mzansiDoorOf = (id) => { const b = campus?.layout.buildings.find((x) => x.id === id); return b ? doorPoint(b) : null }
window.mzansiRoute = () => {
  const door = lectureDoor()
  if (!door || !player || !campus) return null
  const path = findPath(campus.grid, nearestOpen(campus.grid, player.position), nearestOpen(campus.grid, door))
  return { player: { x: player.position.x, z: player.position.z }, path: [...path, door] }
}
// Tests (shoes check): a row of people beside the player, one per look.
let lineup = []
window.mzansiLineup = (looks) => {
  for (const a of lineup) { a.userData.disposed = true; scene.remove(a) }
  lineup = looks.map((look, i) => {
    const a = createAvatar(look)
    a.userData.personId = `lineup${i}`
    a.position.set(player.position.x + (i - (looks.length - 1) / 2) * 0.75, 0, player.position.z + 3)
    scene.add(a)
    return a
  })
  return Promise.all(lineup.map((a) => a.userData.ready)).then(() => lineup.length)
}
// The opening page's stills (scripts/opening-stills.mjs, a one-off asset job; the game never calls
// this): one student standing on the campus, photographed in three passes the script puts together:
// the campus without anybody (blurred there for depth of field), then the student alone over black
// and over white (the difference is their outline). A sunset sky, warm haze, a key and a rim light.
window.mzansiPortrait = async (look, o) => {
  const av = createAvatar(look)
  await av.userData.ready
  av.position.set(o.at[0], campus.floor.at(o.at[0], o.at[1]), o.at[1])
  av.rotation.y = o.rot
  av.userData.pose = 'stand'
  scene.add(av)
  for (let t = 0; t <= (o.time || 2); t += 0.05) poseAvatar(av, false, t)
  appearNow(av)
  for (const [name, r] of Object.entries(o.bones || {})) { const b = av.getObjectByName(name); if (b) { b.rotation.x += r[0]; b.rotation.y += r[1]; b.rotation.z += r[2] } }
  av.updateMatrixWorld(true)
  const size = renderer.getSize(new THREE.Vector2())
  const ratio = renderer.getPixelRatio()
  renderer.setPixelRatio(1)
  renderer.setSize(o.w, o.h, false)
  const cam = new THREE.PerspectiveCamera(o.fov, o.w / o.h, 0.1, 1500)
  cam.position.set(...o.cam)
  cam.lookAt(...o.look)
  const was = scene.children.map((c) => [c, c.visible])
  const tags = []
  scene.traverse((n) => { if ((n.isSprite || n.name === 'beacon' || n.name === 'badge') && n.visible) { tags.push(n); n.visible = false } }) // (place labels, markers)
  const people = new Set([player, ...everyone(), ...lineup])
  const fog = [scene.fog.near, scene.fog.far]
  const grab = () => { renderer.render(scene, cam); return renderer.domElement.toDataURL('image/png') }
  // 1. the place: nobody in it, a sunset sky from plum down to gold at the horizon, warm haze
  const c = document.createElement('canvas'); c.width = 4; c.height = 1024
  const g = c.getContext('2d'); const grad = g.createLinearGradient(0, 0, 0, 1024)
  for (const [at, col] of o.sky) grad.addColorStop(at, col)
  g.fillStyle = grad; g.fillRect(0, 0, 4, 1024)
  const skyTex = new THREE.CanvasTexture(c); skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.generateMipmaps = false; skyTex.minFilter = THREE.LinearFilter
  scene.background = skyTex
  scene.fog.color.set(o.haze); scene.fog.near = o.fog[0]; scene.fog.far = o.fog[1]
  sun.color.set(o.sun[0]); sun.intensity = o.sun[1]; hemi.color.set(o.hemi[0]); hemi.groundColor.set(o.hemi[1]); hemi.intensity = o.hemi[2]
  for (const p of people) if (p) p.visible = false
  av.visible = false
  // (o.hide: things by name left out of the photo, e.g. 'far-city', the plain blocks that stand in for SunnyBay)
  const left = (o.hide || []).map((name) => scene.getObjectByName(name)).filter((n) => n?.visible)
  for (const n of left) n.visible = false
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x1a0d10, transparent: true, opacity: 0.45, depthWrite: false, fog: false }))
  blob.rotation.x = -Math.PI / 2; blob.scale.set(1.1, 0.6, 1); blob.rotation.z = o.shadow || 0
  blob.position.set(av.position.x, av.position.y + 0.1, av.position.z)
  scene.add(blob)
  // (the sea is 300 m east and flat: from chest height it would be a hair on the horizon, so for the
  // photo it tilts up a touch, a band of water where the real sea is)
  let sea = null
  if (o.sea) { sea = new THREE.Mesh(new THREE.PlaneGeometry(1500, 3000), new THREE.MeshBasicMaterial({ color: o.sea[0] })); sea.rotation.set(-Math.PI / 2, o.sea[1], 0, 'YXZ'); sea.rotation.order = 'XYZ'; sea.rotation.set(-Math.PI / 2, -o.sea[1], 0); sea.position.set(296 + 750, 750 * Math.tan(o.sea[1]) - 0.3, 0); scene.add(sea) }
  const back = grab()
  scene.remove(blob)
  if (sea) scene.remove(sea)
  // 2. the student alone: the key light low and warm from the camera's side, the rim from behind
  for (const ch of scene.children) ch.visible = Boolean(ch.isLight)
  av.visible = true
  scene.background = null; scene.fog.near = 1e5; scene.fog.far = 2e5
  const lights = [o.key, o.rim, o.fill].filter(Boolean).map(([col, power, x, y, z]) => { const l = new THREE.DirectionalLight(col, power); l.position.set(av.position.x + x, y, av.position.z + z); l.target = av; scene.add(l); return l })
  sun.intensity = 0
  renderer.setClearColor(0x000000); const black = grab()
  renderer.setClearColor(0xffffff); const white = grab()
  const head = (av.getObjectByName('Head') || av).getWorldPosition(new THREE.Vector3()).project(cam)
  // back as it was
  for (const l of lights) scene.remove(l)
  scene.remove(av); av.userData.disposed = true
  for (const [ch, v] of was) ch.visible = v
  for (const n of tags) n.visible = true
  for (const n of left) n.visible = true
  scene.fog.near = fog[0]; scene.fog.far = fog[1]
  nightNow = -1; applyTime()
  renderer.setPixelRatio(ratio); renderer.setSize(size.x, size.y)
  return { back, black, white, head: [(head.x + 1) / 2, (1 - head.y) / 2] }
}
// Tests (collisions): hold the stick, and every box nobody may walk into.
window.mzansiSteer = (x, z) => { forcedSteer = x || z ? { x, z } : null }
window.mzansiObstacles = () => ({
  buildings: campus?.layout.obstacles || [],
  props: campus?.dressing?.obstacles || [],
  room: room ? room.blocks : [],
})
// (job K, tests) what you hold, and whether you are eating at a table
window.mzansiHeld = () => ({ held: player?.userData.held?.name || '', eating: Boolean(player?.userData.eating), pose: player?.userData.pose || '' })
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
window.addEventListener('mzansi-talk-end', (event) => {
  const them = endTalkHere()
  if (!them) return
  if (event.detail?.away && player && campus) {
    // A goodbye you can see: they wave, you turn and walk a few steps off.
    gesture(them, 'emote-yes')
    const dx = player.position.x - them.position.x
    const dz = player.position.z - them.position.z
    const d = Math.hypot(dx, dz) || 1
    let goal = null
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const ux = (dx / d) * Math.cos(turn) - (dz / d) * Math.sin(turn)
      const uz = (dx / d) * Math.sin(turn) + (dz / d) * Math.cos(turn)
      const c = { x: player.position.x + ux * 4, z: player.position.z + uz * 4 }
      if (!pointBlocked(campus.grid, c.x, c.z)) { goal = c; break }
    }
    host.dataset.walkAway = 'walking'
    if (goal) {
      walkTo(goal.x, goal.z, () => { host.dataset.walkAway = 'done'; rig.turnBehind(player.rotation.y) }, { pace: WALK * 0.6 })
      if (!mover.hasTarget) host.dataset.walkAway = 'done'
    } else host.dataset.walkAway = 'done'
    return
  }
  // Back to the follow camera, swung round behind you so they stay in view.
  if (player) rig.turnBehind(player.rotation.y)
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
    if (tag) {
      tag.visible = want
      // Over the head, not over where the head would be standing: a seated person's
      // origin is the seat, so their head is only ~0.9 m above it.
      tag.position.y = avatar.userData.pose === 'sit' && !avatar.userData.sitMove ? 1.15 : 1.98
    }
  }
}

// Activities you can see (activities.js): at a dressed place the student plays
// the activity out before the result lands. The bar is only a small timer.
let acting = false
let activities = null
// Resolves once a sit-down or stand-up has finished (it starts on the next frame).
const settledOf = (a) => new Promise((resolve) => {
  let frames = 0
  const check = () => { ps?.busy(0.3); if (++frames > 2 && !inTransition(a)) resolve(); else requestAnimationFrame(check) }
  requestAnimationFrame(check)
})
const BENCH_Y = 0.45
function activityApi() {
  const bar = () => host.querySelector('.act-bar')
  const sayNode = () => host.querySelector('.act-say')
  let held = null
  const standUp = () => {
    player.userData.pose = 'stand'
    player.userData.recline = 1
    player.userData.seatFloor = undefined
    player.rotation.x = 0
    player.position.y = 0
  }
  // Getting into and out of bed: sit on the edge, then swing the legs up and lie
  // back (and the reverse), instead of snapping between poses.
  const ease = (k) => k * k * (3 - 2 * k)
  const turnTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k
  const recline = (from, to, seconds, up) => new Promise((resolve) => {
    const start = performance.now()
    const step = () => {
      const k = Math.min(1, ((performance.now() - start) / 1000) * SPEED / seconds)
      const r = up ? 1 - ease(k) : ease(k)
      layDown(player, turnTo(from.rot, to.rot, ease(k)), r)
      player.position.set(from.x + (to.x - from.x) * ease(k), from.y + (to.y - from.y) * ease(k), from.z + (to.z - from.z) * ease(k))
      if (k < 1) requestAnimationFrame(step); else resolve()
    }
    step()
  })
  const api = {
    get player() { return player },
    get dressing() { return campus.dressing },
    spot: (place, id) => campus.dressing.spots[place]?.find((s) => s.id === id) || { x: 0, z: 0 },
    // Scene walks always finish: if the path is blocked, step into place after a while.
    // (no pace given: a brisk walk, or a jog past 15 m, like any trip)
    walkTo: async (x, z, pace) => {
      if (inTransition(player)) await settledOf(player)
      // (a walk asked for while the payment bar runs would be dropped: wait for it)
      while (actionLeft > 0) await new Promise((r) => setTimeout(r, 100))
      return new Promise((resolve) => {
      let done = false
      const finish = () => { if (done) return; done = true; resolve() }
      // (onto the exact spot, through the props: a scene's walk ends on a seat or a mark)
      walkTo(x, z, finish, { pace, near: 0.05, solid: false })
      if (!mover.hasTarget) finish()
      // (ends when you stop moving for a while: blocked by something or someone; going
      // round a counter can take you further from the end for a bit, which is fine;
      // judged on movement, not a clock, so a slow phone still gets there)
      let last = { x: player.position.x, z: player.position.z }
      let since = performance.now()
      const run = running
      const check = () => {
        if (done || running !== run) return
        if (Math.hypot(player.position.x - last.x, player.position.z - last.z) > 0.15) { last = { x: player.position.x, z: player.position.z }; since = performance.now() }
        if (performance.now() - since > ms(2500)) { mover.stop(); finish(); return }
        setTimeout(check, 300)
      }
      check()
    }) },
    wait: (s) => {
      if (window.mzansiFailNextWait) { window.mzansiFailNextWait = false; return Promise.reject(new Error('test: an activity broke off inside a room')) }
      ps.busy(s / SPEED + 0.5)
      return new Promise((resolve) => setTimeout(resolve, ms(s * 1000)))
    },
    // What the player is doing now, for the leave button: in the queue, seated, in bed.
    state: (name) => ps.set(name === 'base' ? running?.base || 'doing' : name),
    face: (x, z) => { player.rotation.y = Math.atan2(x - player.position.x, z - player.position.z) },
    gesture: (name) => gesture(player, name),
    gestureOf: (avatar, name) => avatar && gesture(avatar, name),
    pose: (p, y = 0, floor) => {
      standUp()
      if (running) ps.set(p === 'sit' ? 'seated' : p === 'lie' ? 'sleeping' : running.base)
      player.userData.pose = p
      if (p === 'sit') { player.position.y = y; player.userData.seatFloor = floor }
      if (p === 'lie') { layDown(player, player.rotation.y); player.position.y = 0.02 }
      return settledOf(player)
    },
    settled: (a = player) => settledOf(a),
    // bed: { x, z, lieY, rot (0 = head towards -z) }; edge: the seat on its side { x, z, y, rot }.
    lieDown: async (bed, edge) => {
      standUp()
      ps.set('sleeping')
      player.position.set(edge.x, edge.y, edge.z)
      player.rotation.y = edge.rot
      player.userData.pose = 'sit'
      player.userData.seatFloor = 0
      // Sit down on the edge first (it plays out: turn round, lower), then lie back.
      await settledOf(player)
      await new Promise((resolve) => setTimeout(resolve, ms(150)))
      await recline({ ...edge }, { x: bed.x, y: bed.lieY, z: bed.z, rot: bed.rot }, 0.8, false)
    },
    getUp: async (bed, edge) => {
      ps.set('seated')
      await recline({ x: bed.x, y: bed.lieY, z: bed.z, rot: bed.rot }, { ...edge }, 0.8, true)
      standUp()
      player.position.set(edge.x, edge.y, edge.z)
      player.rotation.y = edge.rot
      player.userData.pose = 'sit'
      player.userData.seatFloor = 0
    },
    // Sitting down and standing up play out (avatar3d); these resolve once they have.
    sitAt: (seat) => {
      ps.set('seated')
      player.position.set(seat.x, seat.y, seat.z)
      player.rotation.y = seat.rot
      player.userData.pose = 'sit'
      return settledOf(player)
    },
    stand: () => {
      standUp()
      if (running) ps.set(running.base)
      return settledOf(player)
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
    // (job K: avatar3d holdIn finds the rig's real wrist bone; until now nothing held ever showed)
    // (job K) real players within r metres of a point (a Caf table), and telling them they shared it
    playersNear: (x, z, r) => peersOnCampus().filter((p) => Math.hypot(p.x - x, p.z - z) < r).map((p) => ({ id: p.id, name: String(p.meta?.name || 'Someone').split(' ')[0] })),
    shareWith: (list) => { for (const p of list) sendPoke(p.id, 'share') },
    eating: (on) => { player.userData.eating = Boolean(on) },
    hold: (mesh) => {
      if (held) held.removeFromParent()
      held = mesh
      holdIn(player, mesh)
    },
    groove: (level) => {
      if (level == null) stopGroove('activity')
      else { startGroove('activity'); setGrooveLevel(level * 0.8) }
    },
    // --- scenes everywhere (activities.js) ---
    get campus() { return campus },
    // The person coming along with you (startCompanion), if anyone.
    companion: () => companion?.avatar || null,
    seatCompanion: (seat) => seatCompanion(seat),
    // Wait until whoever came with you has walked to their seat and sat down.
    companionSettled: () => new Promise((resolve) => {
      const start = performance.now()
      const check = () => { ps.busy(0.3); return (!companion?.settling && !(companion && inTransition(companion.avatar))) || performance.now() - start > 20000 ? resolve() : setTimeout(check, 100) }
      check()
    }),
    hideCompanion: (hidden) => {
      if (!companion) return
      companion.avatar.visible = !hidden
      if (!hidden) seatCompanion(null)
    },
    placeInfo: (id) => {
      if (id === 'here' || !id) {
        const p = player.position
        return { id: 'here', x: p.x, z: p.z, door: { x: p.x, z: p.z }, front: { x: p.x, z: p.z - 2.6 }, open: true }
      }
      const b = campus.layout.buildings.find((item) => item.id === id)
      if (!b) return null
      const door = doorPoint(b)
      return { id, b, x: b.x, z: b.z, door, front: frontPoint(b, 1.4), open: Boolean(b.open) }
    },
    frame: (target) => { activityFocus = target || null; focusTimer = 0 },
    // A fixed shot (from, at): for scenes that know exactly where to look from.
    // Is this ground free to stand on, and can a camera there see these points?
    openAt: (x, z) => !pointBlocked(campus.grid, x, z),
    clearView: (from, points) => {
      const pos = new THREE.Vector3(...from)
      if (campus.layout.buildings.some((b) => pos.x > b.minX - 0.6 && pos.x < b.minX + b.w + 0.6 && pos.z > b.minZ - 0.6 && pos.z < b.minZ + b.d + 0.6)) return false
      return points.every(([x, y, z]) => {
        const dir = new THREE.Vector3(x, y, z).sub(pos)
        shotRay.set(pos, dir.clone().normalize())
        shotRay.far = dir.length() - 0.3
        return !shotRay.intersectObjects([campus.group], true).some((hit) => hit.object.name !== 'ground' && !hit.object.isSprite && hit.object.visible && !isPart(hit.object))
      })
    },
    shot: (from, at) => { activityFocus = null; closeShot = { pos: new THREE.Vector3(...from), look: new THREE.Vector3(...at) } },
    // A short walk; inside a room it goes around the furniture (boxPath).
    glide: async (x, z, pace = 1.6) => {
      const inside = (p) => room && p.x > room.bounds.minX && p.x < room.bounds.maxX && p.z > room.bounds.minZ && p.z < room.bounds.maxZ
      const pts = inside(player.position) && inside({ x, z }) ? boxPath(room.blocks, room.bounds, player.position, { x, z }) : [{ x, z }]
      mover.stop()
      for (const p of pts) await new Promise((resolve) => { scriptMove = { x: p.x, z: p.z, pace, resolve } })
    },
    // Walk up to a seat (beside it if a table is in front), then settle into it.
    walkToSeat: async (seat) => {
      const f = { x: Math.sin(seat.rot), z: Math.cos(seat.rot) }
      const r = { x: Math.cos(seat.rot), z: -Math.sin(seat.rot) }
      const inRoom = room && seat.x > room.bounds.minX && seat.x < room.bounds.maxX && seat.z > room.bounds.minZ && seat.z < room.bounds.maxZ
      const open = (p) => (inRoom ? !boxBlocked(room.blocks, p.x, p.z, 0.2) : !pointBlocked(campus.grid, p.x, p.z))
      const spots = [[0, 0.6], [-0.6, 0], [0.6, 0], [0, -0.65]].map(([a, b]) => ({ x: seat.x + r.x * a + f.x * b, z: seat.z + r.z * a + f.z * b })).filter(open)
      spots.sort((p, q) => Math.hypot(p.x - player.position.x, p.z - player.position.z) - Math.hypot(q.x - player.position.x, q.z - player.position.z))
      const spot = spots[0]
      if (spot && Math.hypot(spot.x - player.position.x, spot.z - player.position.z) > 0.3) {
        if (inRoom) await api.glide(spot.x, spot.z)
        else {
          await api.walkTo(spot.x, spot.z, WALK)
          if (Math.hypot(spot.x - player.position.x, spot.z - player.position.z) > 1) await api.walkTo(spot.x, spot.z, WALK)
        }
      }
      // Not there yet (the walk stopped short): the rest of the way by the paths first.
      const stand = standSpotFor(player, seat)
      if (Math.hypot(stand.x - player.position.x, stand.z - player.position.z) > 1.2) {
        if (inRoom) await api.glide(stand.x, stand.z)
        else await api.walkTo(stand.x, stand.z, WALK)
      }
      // (the last step goes in among the furniture: beside the chair, between it and the table)
      player.userData.noCollide = 'in'
      player.userData.noCollideAt = performance.now()
      mover.stop()
      // Up to the spot in front of the seat (a step, not a shuffle); sitting down turns
      // round and lowers (avatar3d).
      await new Promise((resolve) => { scriptMove = { x: stand.x, z: stand.z, pace: 1.4, resolve } })
    },
    teleport: (x, z, rot) => {
      mover.stop()
      player.position.set(x, 0, z)
      if (rot !== undefined) player.rotation.y = rot
    },
    fade: (text = '') => new Promise((resolve) => {
      ps.busy(1.5)
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
    // (one walk per person, walks.js: a new one replaces the old, which settles 'replaced')
    moveNpc: (avatar, x, z, pace = 1.8) => npcWalks.start(avatar, x, z, pace),
    prop: (url, x, z, { s = 2.2, rot = 0, y = 0 } = {}) => {
      const holder = new THREE.Group()
      holder.position.set(x, y, z)
      holder.rotation.y = rot
      tempGroup.add(holder)
      loadModel(url).then((src) => {
        const m = src.clone(true)
        m.scale.setScalar(s)
        holder.add(m)
        tempSolidsDirty = true
      }).catch(() => {})
      return holder
    },
    chair: (x, z, rot = 0) => {
      const c = makeChair()
      c.position.set(x, 0, z)
      c.rotation.y = rot
      tempGroup.add(c)
      tempSolidsDirty = true
      return c
    },
    box: (w, h, d, color, x, y, z, extra = {}) => {
      const mesh = new THREE.Mesh(extra.ball ? new THREE.SphereGeometry(w / 2, 20, 14) : new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...(({ ball, ...rest }) => rest)(extra) }))
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      tempGroup.add(mesh)
      tempSolidsDirty = true // (solid from its shape: colliders.js)
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
      const plane = signMesh(new THREE.PlaneGeometry(w, h), texture)
      plane.position.set(x, y, z)
      plane.rotation.y = rot
      tempGroup.add(plane)
      return plane
    },
    room: (kind) => {
      clearRoom()
      room = buildRoom(kind)
      scene.add(room.group)
      // (the room's furniture from its shapes, and again once its models have loaded)
      roomSolids = collidersOf(room.group)
      const built = room
      setTimeout(() => { if (room === built) roomSolids = collidersOf(room.group) }, 2500)
      return room
    },
    clearTemps: () => { clearTemps(); clearRoom() },
    end: () => {
      if (player) player.userData.eating = false // (job K: never left eating after an activity is cut short)
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
  // Leaving the activity breaks off whatever it is waiting on.
  for (const key of ['walkTo', 'wait', 'pose', 'settled', 'lieDown', 'getUp', 'sitAt', 'stand', 'companionSettled', 'glide', 'walkToSeat', 'fade', 'unfade', 'moveNpc']) {
    const plain = api[key]
    api[key] = (...args) => abortable(plain(...args))
  }
  return api
}

// Temporary people, props and rooms made by a scene, removed when it ends.
const tempGroup = new THREE.Group()
tempGroup.name = 'scene-temps'
let temps = []
let tempSolids = [] // colliders of what an activity built (benches, steps, stalls, props)
let tempSolidsDirty = false
let roomSolids = []
const npcWalks = createWalks() // an activity's people walking (moveNpc)
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
  tempSolids = []
  tempSolidsDirty = false
  npcWalks.drop() // (their people are gone: nothing waits on these walks)
  tempGroup.clear()
}
function clearRoom() {
  if (room) { scene.remove(room.group); room = null }
}
// Someone coming along with you (eat together, study together, walk with me):
// the real person leaves what they were doing and walks your trail a step behind.
let companion = null
function startCompanion(id) {
  stopCompanion()
  const avatar = everyone().find((a) => a.userData.personId === id)
  if (!avatar || !player) return null
  const walker = crowd?.people.find((p) => p.avatar === avatar)
  if (walker) walker.talking = false
  companion = { avatar, walker, home: { x: avatar.position.x, y: avatar.position.y, z: avatar.position.z, rot: avatar.rotation.y, pose: avatar.userData.pose === 'talk' ? 'stand' : avatar.userData.pose }, trail: [{ x: player.position.x, z: player.position.z }], seat: null }
  avatar.userData.following = true
  avatar.userData.pose = 'stand'
  avatar.position.y = 0
  avatar.visible = true
  host.dataset.companion = id
  return companion
}
function stopCompanion() {
  if (!companion) return
  const { avatar, walker, home } = companion
  avatar.visible = true
  if (walker && !walker.sitting) {
    // A walker carries on from where they are.
    avatar.userData.following = false
    walker.route = []
    walker.wait = 1.5
    avatar.userData.pose = 'stand'
  } else {
    // Someone with a spot of their own (a seat, a stall) walks back to it.
    avatar.userData.pose = 'stand'
    avatar.position.y = 0
    returners.push({ avatar, home, route: null })
  }
  companion = null
  delete host.dataset.companion
}
// Put them on a seat (beside you at a table): they walk to it and sit down. No seat:
// they get up where they are and fall in beside you.
function seatCompanion(seat) {
  if (!companion) return
  const a = companion.avatar
  companion.seat = seat
  if (seat) {
    // Up to the chair from an open side (behind it at a table), then into it.
    const f = { x: Math.sin(seat.rot), z: Math.cos(seat.rot) }
    const r = { x: Math.cos(seat.rot), z: -Math.sin(seat.rot) }
    // (a table's footprint takes in its chairs, so only rule out spots right inside it)
    const spots = [[0, 0.6], [-0.6, 0], [0.6, 0], [0, -0.65]].map(([u, v]) => ({ x: seat.x + r.x * u + f.x * v, z: seat.z + r.z * u + f.z * v })).filter((p) => !hitsSolid(p.x, p.z, -0.15))
    spots.sort((p, q) => Math.hypot(p.x - a.position.x, p.z - a.position.z) - Math.hypot(q.x - a.position.x, q.z - a.position.z))
    companion.settling = { ...seat, pose: seat.pose || 'sit', via: spots[0] || null }
    return
  }
  companion.settling = null
  a.userData.pose = 'stand'
  a.position.y = 0
  companion.trail = [{ x: player.position.x, z: player.position.z }]
}

// Walking people (a friend beside you, someone heading back to their seat) keep to
// the open ground: the route grid for long ways, real outlines for each step.
function stepAvatar(a, tx, tz, pace, dt, free = false) {
  const dx = tx - a.position.x
  const dz = tz - a.position.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-4) return 0
  const step = Math.min(d, pace * dt)
  const nx = a.position.x + (dx / d) * step
  const nz = a.position.z + (dz / d) * step
  if (free || !hitsSolid(nx, nz) || hitsSolid(a.position.x, a.position.z)) { a.position.x = nx; a.position.z = nz } // (inside an outline, just up from a chair: walk out)
  else if (!hitsSolid(nx, a.position.z)) a.position.x = nx
  else if (!hitsSolid(a.position.x, nz)) a.position.z = nz
  a.rotation.y = Math.atan2(dx, dz)
  return d
}
// Is there a building, table or counter between two points (sampled every 0.3 m)?
function lineBlocked(p, q) {
  const d = Math.hypot(q.x - p.x, q.z - p.z)
  const n = Math.ceil(d / 0.3)
  for (let i = 1; i <= n; i++) if (hitsSolid(p.x + ((q.x - p.x) * i) / n, p.z + ((q.z - p.z) * i) / n)) return true
  return false
}
const returners = []
function returnersTick(dt) {
  for (let i = returners.length - 1; i >= 0; i--) {
    const r = returners[i]
    const a = r.avatar
    if (a.userData.disposed || !campus) { returners.splice(i, 1); continue }
    a.userData.following = true // (the crowd leaves them to us until they're back)
    if (Math.hypot(r.home.x - a.position.x, r.home.z - a.position.z) > 1.2) {
      if (!r.route) {
        const from = nearestOpen(campus.grid, a.position)
        r.route = from ? findPath(campus.grid, from, nearestOpen(campus.grid, r.home)) : []
      }
      if (!r.route.length) r.route = [{ x: r.home.x, z: r.home.z }]
      const next = r.route[0]
      if (stepAvatar(a, next.x, next.z, 1.3, dt) < 0.15) r.route.shift()
      poseAvatar(a, true, clock)
      continue
    }
    // The last step straight onto the spot, then sit (or stand) as before.
    if (stepAvatar(a, r.home.x, r.home.z, 0.9, dt) > 0.05) { poseAvatar(a, true, clock); continue }
    a.position.set(r.home.x, r.home.y, r.home.z)
    a.rotation.y = r.home.rot
    a.userData.pose = r.home.pose
    a.userData.following = false
    poseAvatar(a, false, clock)
    returners.splice(i, 1)
  }
}
function companionTick(dt) {
  returnersTick(dt)
  if (!companion) return
  const a = companion.avatar
  if (!a.visible) { poseAvatar(a, false, clock); return }
  // Walking to the seat they were given, then sitting down.
  const st = companion.settling
  if (st) {
    if (st.via) {
      if (stepAvatar(a, st.via.x, st.via.z, 2, dt, true) > 0.1) { poseAvatar(a, true, clock); return }
      st.via = null
    }
    // Up to the spot in front of the seat; sitting down turns round and lowers (avatar3d).
    const stand = st.pose === 'sit' ? standSpotFor(a, st) : st
    if (!st.via && a.userData.noCollide !== 'in') { a.userData.noCollide = 'in'; a.userData.noCollideAt = performance.now() } // (stepping in to the seat)
    if (stepAvatar(a, stand.x, stand.z, 0.9, dt, true) > 0.05) { poseAvatar(a, true, clock); return }
    a.position.set(st.x, st.y || 0, st.z)
    a.rotation.y = st.rot
    a.userData.pose = st.pose
    companion.settling = null
  }
  if (companion.seat) { poseAvatar(a, false, clock); return }
  const trail = companion.trail
  const last = trail[trail.length - 1]
  if (Math.hypot(player.position.x - last.x, player.position.z - last.z) > 0.3) {
    trail.push({ x: player.position.x, z: player.position.z })
    if (trail.length > 300) trail.shift()
  }
  // Beside you: level with you, a shoulder's width to the side they're already on.
  // Where that's blocked (a doorway, a narrow path), they drop in behind on your trail.
  const fx = Math.sin(player.rotation.y)
  const fz = Math.cos(player.rotation.y)
  if (companion.side === undefined) companion.side = (a.position.x - player.position.x) * fz - (a.position.z - player.position.z) * fx > 0 ? 1 : -1
  // (aimed a moment ahead while you walk, so they keep level instead of trailing)
  const lead = walking ? Math.max(mover.speed, WALK) * 0.3 : 0
  let target = { x: player.position.x + fz * 0.85 * companion.side + fx * lead, z: player.position.z - fx * 0.85 * companion.side + fz * lead }
  if (hitsSolid(target.x, target.z)) {
    let gap = 1.2
    let from = { x: player.position.x, z: player.position.z }
    target = from
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]
      const d = Math.hypot(p.x - from.x, p.z - from.z)
      if (d >= gap) { target = { x: from.x + ((p.x - from.x) * gap) / d, z: from.z + ((p.z - from.z) * gap) / d }; break }
      gap -= d
      from = p
      target = p
    }
  }
  const d = Math.hypot(target.x - a.position.x, target.z - a.position.z)
  // Left far behind (a scene moved you somewhere else): catch up out of sight.
  if (d > 25) { a.position.x = target.x; a.position.z = target.z }
  const moving = d > 0.15 && d <= 25
  if (moving) {
    // Keep pace with you, a little quicker to close a gap, easing in as they arrive.
    // Something in the way (a counter, a table): take the route grid round it.
    const pace = Math.min(Math.max(mover.speed, WALK) * 1.5, 0.8 + d * 2.2)
    if (lineBlocked(a.position, target)) {
      companion.reroute = (companion.reroute || 0) - dt
      if (!companion.route?.length || companion.reroute <= 0) {
        const from = nearestOpen(campus.grid, a.position)
        companion.route = from ? findPath(campus.grid, from, nearestOpen(campus.grid, target)) : []
        companion.reroute = 1
      }
      const next = companion.route[0]
      if (next) { if (stepAvatar(a, next.x, next.z, Math.max(pace, 1.4), dt) < 0.3) companion.route.shift() } else stepAvatar(a, target.x, target.z, pace, dt)
    } else {
      companion.route = null
      stepAvatar(a, target.x, target.z, pace, dt)
    }
    if (d < 0.6 && walking) a.rotation.y = player.rotation.y // stride along with you
  } else if (Math.hypot(player.position.x - a.position.x, player.position.z - a.position.z) < 3) {
    a.rotation.y = walking ? player.rotation.y : Math.atan2(player.position.x - a.position.x, player.position.z - a.position.z)
  }
  poseAvatar(a, moving, clock)
}
window.addEventListener('mzansi-companion', (event) => { if (event.detail?.id) startCompanion(event.detail.id); else stopCompanion() })
window.mzansiCompanion = () => companion && { id: companion.avatar.userData.personId, x: +companion.avatar.position.x.toFixed(2), z: +companion.avatar.position.z.toFixed(2), pose: companion.avatar.userData.pose, visible: companion.avatar.visible, settling: companion.settling && { x: +companion.settling.x.toFixed(2), z: +companion.settling.z.toFixed(2), via: companion.settling.via }, seat: Boolean(companion.seat) }

function sceneTick(dt) {
  if (!tempGroup.parent) scene.add(tempGroup)
  const moving = npcWalks.step(dt)
  if (npcWalks.size || scriptMove) ps.busy(0.4)
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

// The activity playing now: leaving it (the button, the watchdog) breaks off every
// wait and walk it is in, and it ends with nothing gained.
let running = null
class Left extends Error {}
function abortable(promise) {
  // (a scene still going after you left it gets nowhere: every call it makes fails)
  if (!running) { promise?.catch?.(() => {}); return Promise.reject(new Left('no activity')) }
  return Promise.race([promise, running.left])
}
async function runActivity(detail) {
  // (scenes start at the place's door: from a common room, step out first, and come
  // back into it when the activity is over)
  const fromHouse = inHouse?.building || null
  if (fromHouse) leaveHouse()
  acting = true
  let quit
  running = { left: new Promise((resolve, reject) => { quit = reject }), base: detail.actionId === 'talk_queue' ? 'queueing' : 'doing' }
  running.left.catch(() => {})
  running.quit = () => quit(new Left('left the activity'))
  ps.set(running.base)
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
  // Doing it together: they come along (walk your trail) for the whole scene.
  const friend = detail.sceneOpt?.with
  if (friend && companion?.avatar.userData.personId !== friend) startCompanion(friend)
  let left = false
  try {
    // What they said to your reply, as the scene starts.
    if (detail.sceneOpt?.answer) {
      activities.api.say(detail.sceneOpt.answer, detail.sceneOpt.name || 'friend')
      await activities.api.wait(1.6)
    }
    const job = activities.runner.run(detail.actionId, detail.placeId, detail.sceneOpt)
    job.catch(() => {})
    await abortable(job)
  } catch (error) {
    if (error instanceof Left) left = true
    else {
      console.error(error)
      reportError('activity', error, { action: detail.actionId, place: detail.placeId })
    }
  }
  running = null
  if (hidden) hidden.visible = true
  if (companion && (left || !detail.sceneOpt?.keep)) stopCompanion()
  activities.api.end()
  backOnCampus(detail.placeId)
  if (fromHouse) enterHouse(fromHouse)
  bar.hidden = true
  bar.classList.remove('small')
  acting = false
  ps.free()
  host.dataset.activityStep = left ? 'left' : 'done'
  window.dispatchEvent(new CustomEvent('mzansi-activity-end', { detail: { actionId: detail.actionId, left } }))
  if (left) return
  const before = currentRun ? { ...currentRun.stats } : null
  detail.commit()
  if (before && currentRun) showFloater(before, currentRun.stats)
}

// Leaving a state (its button, the watchdog, the map): whatever was playing out stops.
function leaveState(state, why) {
  host.dataset.leftState = `${state}:${why}`
  if (state === 'talking') {
    // The chat card closes too (main.js), and we're free even if it doesn't answer.
    window.dispatchEvent(new CustomEvent('mzansi-talk-leave'))
    endTalkHere()
    return
  }
  if (running) { running.quit(); ps.free(); return }
  if (actionLeft > 0) {
    actionLeft = 0
    actionCommit = null
    host.querySelector('.act-bar').hidden = true
  }
  player.userData.pose = 'stand'
  ps.free()
}
// Is something visibly happening in this state (beyond the waits that say so)?
function stateAlive(state) {
  if (!player) return false
  if (inTransition(player)) return true
  if (state === 'talking') return Boolean(talk && document.querySelector('.g-talk'))
  if (state === 'queueing') return queueBusy()
  return false
}
// Out of every counter's line (your order is done, or you walked off).
function leaveLines() {
  for (const q of Object.values(campus?.dressing?.queue || {})) if (q?.line?.hasPlayer()) q.line.leave(player)
}
// Still in a line with nothing to do with it (free, no chat with her coming): out of it.
let lineIdle = 0
function lineTick(dt) {
  const inLine = Object.values(campus?.dressing?.queue || {}).some((q) => q?.line?.hasPlayer())
  lineIdle = inLine && (ps.state === 'free' || ps.state === 'running') && !acting ? lineIdle + dt / SPEED : 0
  if (lineIdle > 3) { lineIdle = 0; leaveLines() }
}
function queueBusy() {
  const qs = campus?.dressing?.queue || {}
  return Object.values(qs).some((q) => q?.line?.hasPlayer?.() && q.line.active())
}

function beginAction(detail) {
  if (!visible || !detail?.commit) return
  if (acting) return
  if (detail.actionId && campus) {
    runActivity(detail)
    return
  }
  const building = detail.placeId && campus?.layout.buildings.find((item) => item.id === detail.placeId)
  if (building && player) {
    const door = doorPoint(building)
    if (Math.hypot(door.x - player.position.x, door.z - player.position.z) > 0.6) {
      host.dataset.walk = 'walking'
      host.dataset.doorx = door.x.toFixed(2)
      host.dataset.doorz = door.z.toFixed(2)
      // (a walk like any other: the stick or a tap somewhere else on the way calls it off)
      walkTo(door.x, door.z, () => {
        host.dataset.walk = 'arrived'
        startBar(detail)
      })
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
  ps.set('doing')
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
  others?.dispose()
  campus = createCampus(district, homeId)
  scene.add(campus.group)
  scene.userData.floorAt = campus.floor.at // soles rest on paths, plazas and decks (avatar3d)
  crowd = createCrowd(scene, campus, { roommate: roommateFor(currentRun?.character).id, solid: (x, z) => blockedAt(x, z) })
  others = createOthers(scene)
  builtId = buildKey(district, homeId, currentRun)
}

function respawn(district, run) {
  leaveHouse({ stay: true })
  const homeId = homePlaceId(district, run.character?.residence)
  if (builtId !== buildKey(district, homeId, run)) rebuild(district, homeId)
  if (player) scene.remove(player)
  player = createAvatar(run.character?.avatar)
  player.userData.isPlayer = true
  host.dataset.look = JSON.stringify(player.userData.look)
  const home = campus.layout.buildings.find((building) => building.id === homeId) || campus.layout.buildings[0]
  const gate = run.at === 'gate' && campus.layout.buildings.find((building) => building.id === 'gate')
  // (owner, 6 Nov) You start where people are: at the Quad. Straight after the morning
  // you're at your own house's door (you walked out of it); the common room is somewhere
  // you choose to go.
  const quadB = campus.layout.buildings.find((building) => building.id === 'quad')
  const atDoor = Boolean(run.outDoor)
  const startAt = gate ? { x: gate.x, z: gate.minZ - 12 } : atDoor || !quadB ? doorPoint(home) : doorPoint(quadB)
  const open = nearestOpen(campus.grid, startAt)
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
  // You start in your own house's common room (build plan, Piece 0), among
  // housemates; off the bus you're at the gate; ?spawn=<place> at that place (tests).
  const homeBuilding = campus.layout.buildings.find((building) => building.id === homeId)
  const spawnKind = gate ? 'gate' : spawnAt ? 'place' : atDoor ? 'door' : quadB ? 'quad' : 'home'
  // Out of your door: facing away from it, towards the Quad.
  if (atDoor && !spawnAt && quadB) {
    player.rotation.y = Math.atan2(quadB.x - player.position.x, quadB.z - player.position.z)
    rig.facing = player.rotation.y
    rig.yaw = player.rotation.y + Math.PI
  }
  host.dataset.spawn = spawnKind
  host.dataset.facing = player.rotation.y.toFixed(2)
  scene.add(player)
  mover.attach(player)
  clearGuide()
  // Day 1: dropped off at the gate by your parent (dropoff.js); campus proper starts at your door.
  dropOff?.stop()
  dropOff = null
  if (run.dropOff && gate && homeBuilding) {
    dropOff = startDropOff({
      scene, host, player, run, gate,
      door: doorPoint(homeBuilding),
      house: homeBuilding.name,
      roommate: roommateFor(run.character).name,
      roommateLook: roommateLook(roommateFor(run.character)),
      welcome: countryWelcome(countryOf(run.character)),
      // "Swap roommate": launch.js shows the four cards and answers with the one picked (or null); main.js keeps the pick for later
      swapRoommate: () => new Promise((resolve) => window.dispatchEvent(new CustomEvent('mzansi-swap-roommate', { detail: { done: (r) => resolve(r ? { name: r.name, look: roommateLook(r) } : null) } }))),
      boom: campus.buildings.getObjectByName('boom'),
      walkTo: (x, z) => walkTo(x, z, null, { arrive: true }),
      rig,
      keepOut: (rect) => crowd?.setKeepOut(rect),
      walkers: () => (crowd?.people || []).filter((p) => p.avatar.visible).map((p) => p.avatar.position),
      // (job I: other players already at the drop-off: your car pulls up behind theirs)
      peers: () => peersOnCampus().map((p) => ({ x: p.x, z: p.z })),
      onUpdate: () => window.dispatchEvent(new CustomEvent('mzansi-dropoff-update')),
      onDone: () => { const d = dropOff; dropOff = null; d?.stop(); window.dispatchEvent(new CustomEvent('mzansi-dropoff-done')) },
    })
  }
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
  // Below the HUD and the chips under it (the right-now row, the goal line).
  const bars = [...document.querySelectorAll('.g-hud, .g-nowrow, .g-goal')].map((el) => el.getBoundingClientRect().bottom)
  const top = (bars.length ? Math.max(...bars) : 120) + node.offsetHeight + 8
  const right = host.clientWidth
  node.style.left = `${Math.min(right - half, Math.max(half, sx))}px`
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
  // (only standing still: while you walk it would catch taps meant for the ground)
  if (!near || near.dist > 2.2 || mapUi.isOpen() || ps.state !== 'free') {
    node.hidden = true
    return
  }
  node.hidden = false
  node.textContent = `Tap to enter ${near.building.name}`
  { const f = frontPoint(near.building, 0.4); pin(node, f.x, 2.6, f.z, 28) }
  clearOfButtons(node)
}
// The way into a place (and home: "Tap to enter Thekwini House") is always in plain view and takes a tap: never
// under the round map, the Talk or Stop button or the view buttons (owner, 11 Nov: it sat under the map, where the
// prompt is clamped on a phone). It is lifted above whatever fixed button it would overlap, and kept on screen.
let fixedRects = []
let fixedAt = -1
function clearOfButtons(node) {
  // (the buttons' boxes are read a few times a second, not every frame)
  if (frames - fixedAt > 20 || fixedAt < 0) {
    fixedAt = frames
    fixedRects = [...host.querySelectorAll('.minimap, .chat-btn, .stop-btn, .ps-leave'), ...document.querySelectorAll('#app .g-views, #app .tb, #app .g-cta, #app .g-bar')]
      .filter((el) => !el.hidden && el.offsetParent !== null)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
  }
  const w = node.offsetWidth
  const h = node.offsetHeight
  if (!w || !h) return
  const W = host.clientWidth
  let cx = Math.min(W - w / 2 - 8, Math.max(w / 2 + 8, parseFloat(node.style.left) || W / 2))
  let top = parseFloat(node.style.top) || 0
  // (its box: centred on left, its bottom 30% of its height above top: translate(-50%, -130%))
  for (let pass = 0; pass < 4; pass++) {
    const x0 = cx - w / 2
    const y0 = top - h * 1.3
    const hit = fixedRects.find((r) => x0 < r.right + 6 && x0 + w > r.left - 6 && y0 < r.bottom + 6 && y0 + h > r.top - 6)
    if (!hit) break
    if (hit.top - 8 - h > 90) top = hit.top - 8 + h * 0.3 // (above it)
    else top = hit.bottom + 8 + h * 1.3 // (a bar at the top of the screen: below it)
  }
  node.style.left = `${cx}px`
  node.style.top = `${top}px`
}

// Walking with the stick: up to the real outline of buildings, tables and stalls
// (a body's half-width away), sliding along them; never through. (The route grid is
// coarser: it would stop you a metre or two short, like an invisible wall.)
// Solid boxes around a point (bodies.js): in a room its furniture and walls, outside the
// buildings, the places' tables, counters, benches and stalls, and an activity's own.
function boxesNear(x, z) {
  if (!campus) return null
  if (room && x > room.bounds.minX - 1 && x < room.bounds.maxX + 1 && z > room.bounds.minZ - 1 && z < room.bounds.maxZ + 1) return room.blocks.concat(roomSolids)
  if (tempSolidsDirty) { tempSolids = collidersOf(tempGroup); tempSolidsDirty = false }
  const all = campus.layout.obstacles.concat(campus.dressing?.obstacles || [], campus.colliders || [], tempSolids)
  return all.filter((b) => x > b.minX - 1.5 && x < b.maxX + 1.5 && z > b.minZ - 1.5 && z < b.maxZ + 1.5)
}
// Everyone in the campus scene, for the collision pass: the people who can be pushed and
// those who can't (the places' own people at their posts, an activity's people).
function campusBodies() {
  const list = [{ avatar: player, fixed: false }]
  for (const p of crowd?.people || []) list.push({ avatar: p.avatar, fixed: false })
  for (const a of campus?.dressing?.statics || []) list.push({ avatar: a, fixed: !campus.dressing.isMoving?.(a) })
  for (const a of temps) list.push({ avatar: a, fixed: true })
  if (companion) list.push({ avatar: companion.avatar, fixed: false })
  for (const r of returners) list.push({ avatar: r.avatar, fixed: false })
  return list.filter((b, i) => b.avatar && list.findIndex((c) => c.avatar === b.avatar) === i)
}
// Tests (read only): is this spot open ground you can stand on (no building, prop or wall)?
window.mzansiOpen = (x, z) => Boolean(campus) && !pointBlocked(campus.grid, x, z) && !hitsSolid(x, z)
// Tests (read only): the real students drawn on this phone.
window.mzansiOthers = () => others?.report(camera) || []
// Tests (read only): the crowd's NPCs, how long each has stood still, and how many each real player has within 4 m.
window.mzansiCrowd = () => crowd?.report() || null
window.mzansiCollisions = () => bodyReport(campusBodies(), boxesNear)
window.mzansiNear = () => { const p = player.position; return { at: [+p.x.toFixed(2), +p.z.toFixed(2)], nc: player.userData.noCollide || null, pose: player.userData.pose, boxes: (boxesNear(p.x, p.z) || []).map((b) => ({ kind: b.kind || 'aabb', depth: +depthIn(p.x, p.z, b, 0.25).toFixed(3), b: b.rot === undefined ? [b.minX, b.maxX, b.minZ, b.maxZ].map((v) => +v.toFixed(2)) : [b.cx, b.cz, b.hx, b.hz, b.rot].map((v) => +v.toFixed(2)) })).filter((b) => b.depth > 0 || /step|stage|tree/.test(b.kind)) } }
// Tests: every collider (kind, middle, half-size, turn) and how many of each kind.
window.mzansiColliders = () => (campus?.colliders || []).map((c) => ({ kind: c.kind, cx: +c.cx.toFixed(2), cz: +c.cz.toFixed(2), hx: +c.hx.toFixed(2), hz: +c.hz.toFixed(2), rot: +c.rot.toFixed(2) }))
// Tests: every building's door spot: inside the fence, on open ground, and the route from the
// arrival spot inside the gate to it (the walk graph the ring and dots use).
window.mzansiDoorAudit = () => {
  const gateB = campus.layout.buildings.find((b) => b.id === 'gate')
  const from = nearestOpen(campus.grid, { x: gateB.x, z: gateB.minZ - 16 })
  return campus.layout.buildings.map((b) => {
    const d = doorPoint(b)
    const cell = cellOf(d.x, d.z)
    const route = findPath(campus.grid, from, cell)
    return { id: b.id, facing: +(b.facing || 0).toFixed(2), x: +d.x.toFixed(2), z: +d.z.toFixed(2), radius: +Math.hypot(d.x, d.z).toFixed(1), solid: hitsSolid(d.x, d.z), blocked: pointBlocked(campus.grid, d.x, d.z), reach: route.length > 0, ends: route.length ? +Math.hypot(route[route.length - 1].x - d.x, route[route.length - 1].z - d.z).toFixed(2) : null }
  })
}
window.mzansiDropoff = () => dropOff?.report() || null
// (tests) put n walkers inside the drop-off zone, next to solids (lodges, walls, fences), and set the zone again
window.mzansiDropWalkers = (n = 6) => {
  const keep = dropOff?.report().keep
  if (!keep || !crowd) return []
  const spots = []
  for (let i = 0; i < 20000 && spots.length < n; i++) {
    const x = keep.minX + Math.random() * (keep.maxX - keep.minX)
    const z = keep.minZ + Math.random() * (keep.maxZ - keep.minZ)
    if (blockedAt(x, z)) continue
    if (!(boxesNear(x, z) || []).some((b) => x > b.minX - 1.1 && x < b.maxX + 1.1 && z > b.minZ - 1.1 && z < b.maxZ + 1.1)) continue
    spots.push({ x, z })
  }
  const walkers = crowd.people.filter((p) => !p.sitting && !p.avatar.userData.following)
  spots.forEach((s, i) => { const p = walkers[i]?.avatar.position; if (p) { p.x = s.x; p.z = s.z } })
  crowd.setKeepOut(keep)
  return spots
}
// Tests: stand the player somewhere, facing a point.
window.mzansiPlace = (x, z, fx, fz) => { if (!player) return; mover.stop(); player.position.set(x, 0, z); player.rotation.y = Math.atan2(fx - x, fz - z); player.userData.lastPos?.set(x, 0, z) }
const BODY = 0.3
function hitsSolid(x, z, r = BODY) {
  const solids = campus.layout.obstacles.concat(campus.dressing?.obstacles || [])
  if (solids.some((b) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r)) return true
  const cell = cellOf(x, z)
  return !(cell.c >= 0 && cell.r >= 0 && cell.c < campus.grid.cols && cell.r < campus.grid.rows)
}
// Nothing hides the player: a sign, a menu board, a wall or a tree between the camera
// and you turns see-through, and solid again once it's out of the way.
const seeRay = new THREE.Raycaster()
const faded = new Map() // mesh -> frames left see-through
function seeThrough() {
  const hits = new Set()
  if (rig.mode !== 'eye' || closeShot) {
    for (const y of [1.65, 1.1, 0.5]) {
      const to = new THREE.Vector3(player.position.x, player.position.y + y, player.position.z)
      const dir = to.clone().sub(camera.position)
      const far = dir.length() - 0.4
      seeRay.set(camera.position, dir.normalize())
      seeRay.far = far
      for (const hit of seeRay.intersectObject(campus.group, true)) {
        const m = hit.object
        if (!m.isMesh || m.isSprite || m.name === 'ground' || !m.visible || isPart(m)) continue
        hits.add(m)
      }
    }
  }
  for (const m of hits) {
    if (!faded.has(m)) {
      m.userData.solidMat = m.material
      const see = (mat) => { const c = mat.clone(); c.transparent = true; c.opacity = Math.min(mat.opacity ?? 1, 0.22); c.depthWrite = false; return c }
      m.material = Array.isArray(m.material) ? m.material.map(see) : see(m.material)
      m.userData.seeThrough = true
    }
    faded.set(m, 12)
  }
  for (const [m, left] of faded) {
    if (hits.has(m)) continue
    if (left > 1) { faded.set(m, left - 1); continue }
    m.material = m.userData.solidMat
    m.userData.seeThrough = false
    faded.delete(m)
  }
}

// The place you are heading for keeps its name tag at any distance.
function destination() {
  if (currentRun?.lectureRoute) return lectureVenue()
  const goal = mover.target
  if (!goal || !campus) return ''
  const hit = campus.layout.buildings.find((b) => Math.hypot(goal.x - doorPoint(b).x, goal.z - doorPoint(b).z) < 4)
  return hit?.id || ''
}

// Building doors swing open as you come up to them, and close behind you.
function swingDoors(dt) {
  for (const group of campus.buildings.children) {
    const hinge = group.getObjectByName('door-pivot')
    if (!hinge) continue
    const b = campus.layout.buildings.find((item) => item.id === group.userData.placeId)
    const near = b && (() => { const f = frontPoint(b, 1.5); return Math.hypot(player.position.x - f.x, player.position.z - f.z) < 3.6 })()
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

// Where the smoothness reports file this frame (src/smooth.js asks twice a second): a house's
// common room, a room built off the map for an activity, the nearest place within 30 m, or 'paths'.
function smoothPlace() {
  if (inHouse) return `common:${inHouse.house.id}`
  const p = player?.position
  if (!p || !campus) return 'paths'
  if (room && p.x > room.bounds.minX - 2 && p.x < room.bounds.maxX + 2 && p.z > room.bounds.minZ - 2 && p.z < room.bounds.maxZ + 2) return 'room'
  let best = 'paths'
  let nearest = 30
  for (const b of campus.layout.buildings) {
    const d = Math.hypot(p.x - b.cx, p.z - b.cz)
    if (d < nearest) { nearest = d; best = b.id }
  }
  return best
}

let frameErrors = 0
let lastFrame = 0
function tick(now) {
  frame = requestAnimationFrame(tick)
  lastFrame = performance.now()
  try {
    frameBody(now)
    frameErrors = 0
  } catch (error) {
    frameErrors += 1
    if (frameErrors === 1) { console.error(error); reportError('frame', error) }
    if (frameErrors > 90) failed('the 3D view keeps failing', error)
  }
}
// An activity's own step (onto a seat, round a room's furniture): straight there; a step
// someone or something holds back ends where it is.
function scripted(m, dt) {
  const dx = m.x - player.position.x
  const dz = m.z - player.position.z
  const d = Math.hypot(dx, dz)
  const step = m.pace * dt
  if (d < (m.best ?? Infinity) - 0.01) { m.best = d; m.stall = 0 } else m.stall = (m.stall || 0) + dt
  if (m.stall > 0.8 || d <= step) {
    if (d <= step) { player.position.x = m.x; player.position.z = m.z }
    scriptMove = null
    m.resolve()
    return false
  }
  player.position.x += (dx / d) * step
  player.position.z += (dz / d) * step
  player.rotation.y = Math.atan2(dx, dz)
  return true
}
function frameBody(now) {
  const dt = (Math.min(0.05, (now - (tick.last || now)) / 1000 || 0)) * SPEED
  tick.last = now
  const hold = paused()
  walking = false
  if (player && campus) {
    // The act bar is only a timer: it never holds you, and walking off calls it off.
    if (actionLeft > 0) {
      actionLeft -= dt
      const bar = host.querySelector('.act-bar span')
      if (bar) bar.style.width = `${Math.min(100, (1.2 - Math.max(actionLeft, 0)) / 1.2 * 100)}%`
      ps.busy(0.3)
      if (actionLeft <= 0) {
        host.querySelector('.act-bar').hidden = true
        const commit = actionCommit
        actionCommit = null
        ps.free()
        const before = currentRun ? { ...currentRun.stats } : null
        commit?.()
        if (before && currentRun) showFloater(before, currentRun.stats)
      }
    }
    // Two inputs: the stick (it wins, and calls off whatever was playing out), then a
    // tap target. Only an open card or sheet pauses them.
    if (!hold) {
      const push = input.stick() || forcedSteer
      keyWalk = Boolean(push) // (job I: walking on the keys: the view holds still, see below)
      if (push) interrupt()
      mover.setStick(push?.x, push?.z, push?.run, push?.mag)
      mover.speedScale = speedFactor(currentRun)
      frameFrom = { x: player.position.x, z: player.position.z }
      if (scriptMove && !push) walking = scripted(scriptMove, dt)
      else walking = mover.update(dt)
      dust?.update(dt)
      cityCheck()
      // Meeting people, items 1 and 5: never inside each other's mini card (walking
      // away closes it), and walking costs a little energy.
      checkAway(player.position.x, player.position.z)
      if (walking) drainWalking(currentRun, dt)
      checkLowHint(currentRun)
    }
    // The player's state follows what they're doing when nothing else holds it.
    if (walking) smooth.moved()
    if (walking) ps.busy(0.5)
    else if (player.userData.pose === 'run') player.userData.pose = 'stand'
    if (stopButton) stopButton.hidden = !walking
    // (the house bar steps aside while the map or a sheet is open: never under a finger meant for them)
    if (houseBar) houseBar.hidden = !inHouse || hold
    if (ps.open) {
      const now = walking ? (player.userData.pose === 'run' ? 'running' : 'walking') : 'free'
      if (ps.state !== now) ps.set(now)
    }
    // Eye view: standing, you turn to where you look; walking, you look where you go
    // (the body leads, so you never walk sideways). Seated, lying, mid-activity or in a
    // chat, the body keeps the way it was put (looking round never swivels you on a chair).
    if (faceTo && walking) faceTo = null
    if (faceTo && !walking) {
      player.rotation.y = Math.atan2(faceTo.x - player.position.x, faceTo.z - player.position.z)
      if (rig.mode === 'eye') rig.facing = player.rotation.y
      faceTo = null
    }
    const free = ps.open && (player.userData.pose || 'stand') === 'stand' && !inTransition(player)
    if (rig.mode === 'eye' && !walking && free) {
      const facing = rig.moveForward()
      player.rotation.y = Math.atan2(facing.x, facing.z)
    }
    clock += dt
    dropOff?.update(dt)
    soundLoop('footsteps', walking)
    setSound({ inside: Boolean(inHouse) }) // (a house's common room: the murmur, not the Quad's crowd)
    poseAvatar(player, walking, clock)
    // (only while you cover ground: turning on the spot never swings the view)
    // (job I: and never while the keys steer: keys are relative to the view, so a view that followed the body turned
    // "right" round with it, and D or W+D walked you in a curve. On the keys the view holds; a tap's walk still leads it.)
    if (rig.mode === 'eye' && walking && !keyWalk && mover.speed > 0.5 && player.userData.yaw !== undefined) {
      rig.facing += Math.atan2(Math.sin(player.userData.yaw - rig.facing), Math.cos(player.userData.yaw - rig.facing)) * Math.min(1, dt * 3)
    }
    applyTime()
    campus.dressing?.update(dt)
    quadSound()
    spotTimer -= dt
    if (spotTimer <= 0) { spotTimer = 1; countSpots() }
    crowd?.update(dt, player.position, [player.position, ...(others?.nearbyPositions(player.position.x, player.position.z, 400) || [])])
    for (const a of inHouse?.folk || []) poseAvatar(a, false, clock)
    // Presence: tell everyone where you are; draw where they are. (Not in a room built
    // off the map: there you're "away" and see nobody from campus.)
    const inRoom = room && player.position.x > room.bounds.minX - 2 && player.position.x < room.bounds.maxX + 2 && player.position.z > room.bounds.minZ - 2 && player.position.z < room.bounds.maxZ + 2
    const here = !inRoom && onCampus(player.position)
    const pose = player.userData.pose || 'stand'
    reportLocal(here ? { a: 'campus', x: player.position.x, z: player.position.z, y: pose === 'sit' || pose === 'lie' ? player.position.y : 0, h: player.rotation.y, p: walking ? (pose === 'run' || mover.speed > 2.9 ? 'run' : 'walk') : pose } : { a: 'away' })
    others?.update(dt, camera, player.position, here, rig.mode === 'eye' && !closeShot)
    crowd?.setFill(onlineCount() < 3, player.position)
    for (const a of lineup) poseAvatar(a, false, clock)
    companionTick(dt)
    lineTick(dt)
    // While playing an activity (queueing, sitting beside someone) you stand close on purpose.
    // (only while walking: standing still, you never slide; the crowd steps round you)
    // Nobody goes through anything or anyone (bodies.js), the player included.
    resolveBodies(campusBodies(), boxesNear)
    // Walking to a spot but going nowhere once the collision pass has had its say
    // (pressed against a stage or a counter): give up after half a second, never jog on
    // the spot against it. (Half a second, or six frames on a phone that draws few.)
    const gone = frameFrom ? Math.hypot(player.position.x - frameFrom.x, player.position.z - frameFrom.z) : 1
    const pressed = mover.hasTarget && mover.speed > 0.3 && gone < mover.speed * dt * 0.2
    against = pressed ? against + dt : 0
    againstFrames = pressed ? againstFrames + 1 : 0
    // (held up, not called off: a walk to someone or somewhere opens it where you stopped)
    if (against > 0.5 || againstFrames >= 6) { smooth.against(against, againstFrames, player.position.x, player.position.z); mover.giveUp(); against = 0; againstFrames = 0 }
    frameFrom = null
    // (the activity line is a docked card under the Leave button now: ui/cards.css, never pinned over a head)
    // (the Talk button on campus while nothing else is open)
    chatUi?.available(!hold && here && !acting && !inHouse && !talk)
    if (crowd) host.dataset.nearest = Math.min(99, ...crowd.people.map((p) => Math.hypot(p.avatar.position.x - player.position.x, p.avatar.position.z - player.position.z))).toFixed(2)
    host.dataset.crowd = String(crowd?.people.length || 0)
    host.dataset.crowdWalking = String(crowd?.group.userData.walking || 0)
    rig.apply(camera, player.position, dt, campus.buildings)
    keepClearOfHud(dt)
    sceneTick(dt)
    if (convo) { convo.timer -= dt; if (convo.timer <= 0) { convo.timer = 0.5; aimConvo(false) } }
    reaimTalk(dt)
    aimCamera(dt)
    // Eye view looks out of the player's eyes: hide their own head and hair (only for
    // that first-person camera: a close shot of a chat or a meal shows you whole).
    for (const part of player.userData.headParts || []) part.visible = rig.mode !== 'eye' || Boolean(closeShot) || easingOut()
    camera.updateMatrixWorld()
    if (bubbles) {
      if (frames % 30 === 0) hudTop = Math.max(0, ...[...document.querySelectorAll('.g-hud, .g-nowrow, .g-goal')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect().bottom - host.getBoundingClientRect().top))
      bubbles.frame(camera, speakerHead, player.position, hudTop)
    }
    if (frames % 3 === 0) seeThrough()
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
    host.dataset.view = (rig.mode === 'eye' ? rig.facing : rig.yaw).toFixed(3)
  }
  renderer.render(scene, camera)
  smooth.frame(now, 'campus', smoothPlace)
  frames += 1
  if (now - fpsStamp > 500) {
    const fps = Math.round((frames * 1000) / (now - fpsStamp))
    host.dataset.fps = String(fps)
    // The last 10 s, for the readout in the menu and Settings (the phone's real number).
    fpsSeen.push(fps)
    if (fpsSeen.length > 20) fpsSeen.shift()
    host.dataset.fpsAvg = String(Math.round(fpsSeen.reduce((a, b) => a + b, 0) / fpsSeen.length))
    host.dataset.fpsLow = String(Math.min(...fpsSeen))
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
  if (!on) reportLocal({ a: 'away' })
  if (!on) {
    mapUi?.close()
    input?.clearKeys()
    chatUi?.hide()
    bubbles?.clear()
  }
  if (on) start()
  else stop()
}

let arriving = null
export function showCampus(district, run) {
  if (!run) return
  ensureRenderer()
  currentDistrict = district
  currentRun = run
  const homeId = homePlaceId(district, run.character?.residence)
  const key = spawnKey(district, run)
  const needs = builtId !== buildKey(district, homeId, run) || key !== spawnedKey || (run.at === 'gate' && gateDay !== String(run.day))
  const fresh = !visible || needs || Boolean(pendingArrive) // (a start: first arrival, a reload, back from the Caf, home or SunnyBay)
  const enter = () => {
    refreshMarkers()
    const shot = new URLSearchParams(location.search).get('shot') || ''
    if (shot === 'cam-top' || shot === 'cam-sims' || shot === 'cam-eye') rig.setMode(shot.slice(4))
    if (shot === 'map') mapUi.open()
    applyArrive()
    // (every start: Sims at the normal tilt, turned to an angle with no building between the camera and you)
    if (fresh && player && campus && !inHouse) host.dataset.start = JSON.stringify(rig.startClear(player.position, [campus.buildings, campus.dressing.group], 52))
    syncCar()
    setVisible(true)
  }
  if (arriving) return arriving
  if (!needs && (visible || !curtain.isUp())) { enter(); curtain.lift(); return }
  // A new campus (first visit, day 1's gate, a new student): built behind the plum curtain, its
  // shaders compiled and two frames drawn before the curtain lifts.
  arriving = (async () => {
    try {
      if (!curtain.isUp()) await curtain.cover('Arriving at UMzansi…')
      if (needs) respawn(district, run)
      enter()
      await curtain.awaitPeople(scene, appearNow, 4000)
      await curtain.settle(renderer, scene, camera)
    } catch (error) {
      console.error(error)
    } finally {
      arriving = null
      curtain.lift()
    }
  })()
  return arriving
  // The first-load hint now lives in the shared UI (game.js ctaBar), so the old tour only opens from Help.
}

export function isWorldVisible() {
  return visible
}

// ---------- SunnyBay (City job A) ----------
// Out of the Main Gate: walk to the gap in the fence; a few steps past it the city takes over (main.js).
const GATE_OUT = { x: 0, z: FENCE_R + 2.6 }
export function walkOut() {
  if (!visible || !player) return
  interrupt()
  if (inHouse) leaveHouse()
  walkTo(GATE_OUT.x, GATE_OUT.z)
}
function cityCheck() {
  if (!player || dropOff || acting || inHouse || room) return
  const p = player.position
  if (p.z > FENCE_R + 1.4 && Math.abs(p.x) < GATE_HALF + 0.6) {
    mover.stop()
    // (stand back inside the gate: this is where you are if the city cannot start)
    p.set(0, 0, FENCE_R - 3.5)
    player.userData.lastPos?.set(p.x, 0, p.z)
    window.dispatchEvent(new CustomEvent('mzansi-enter-city'))
  }
}
// Back from the city: just inside the gate facing the campus, or at your house door when you drove home.
let pendingArrive = null
export function arriveFromCity(kind = 'gate') { pendingArrive = kind }
function applyArrive() {
  const kind = pendingArrive
  pendingArrive = null
  if (!kind || !player || !campus) return
  mover.stop()
  if (inHouse) leaveHouse()
  if (kind === 'res') {
    respawnAt(campus.layout.buildings.find((b) => b.id === homePlaceId(currentDistrict, currentRun?.character?.residence)) || nearestPlace())
  } else {
    player.position.set(0, 0, FENCE_R - 4)
    player.userData.lastPos?.set(0, 0, FENCE_R - 4)
    player.rotation.y = Math.PI
    rig.turnBehind(Math.PI)
  }
  player.userData.pose = 'stand'
  // (job I: a campus place picked on the whole map from SunnyBay: on through the gate to it)
  const goal = takeCampusGoal()
  if (goal) setTimeout(() => goTo(goal), 400)
}
// Your car, parked outside your house (a save with run.licence and run.car, the car not left in the city).
let myCar = null
function syncCar() {
  const want = canDrive(currentRun) && carAt(currentRun) === 'res' && campus
  if (!want) { if (myCar) myCar.visible = false; host.dataset.car = ''; return }
  const home = campus.layout.buildings.find((b) => b.id === homePlaceId(currentDistrict, currentRun?.character?.residence))
  if (!home) return
  // beside the door, clear of the path to it: a few metres along the front wall
  const door = frontPoint(home, 3.2)
  const f = frontOf(home.facing || 0)
  const side = { x: f.z, z: -f.x }
  let spot = null
  for (const d of [6.5, -6.5, 9, -9]) {
    const x = door.x + side.x * d
    const z = door.z + side.z * d
    if (!pointBlocked(campus.grid, x, z) && !pointBlocked(campus.grid, x + side.x * 1.6, z + side.z * 1.6) && Math.hypot(x, z) < FENCE_R - 4) { spot = { x, z }; break }
  }
  spot ||= { x: door.x + side.x * 6.5, z: door.z + side.z * 6.5 }
  if (!myCar) {
    myCar = new THREE.Group()
    myCar.name = 'my-car'
    loadModel('/models/cars/hatchback-sports.glb').then((src) => { const m = src.clone(true); m.scale.setScalar(1.6); myCar.add(m) }).catch(() => {})
  }
  if (myCar.parent !== scene) scene.add(myCar)
  myCar.position.set(spot.x, 0, spot.z)
  myCar.rotation.y = Math.atan2(side.x, side.z)
  myCar.visible = true
  host.dataset.car = `${spot.x.toFixed(1)},${spot.z.toFixed(1)}`
}
