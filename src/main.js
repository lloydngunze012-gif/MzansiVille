import { fromPlace } from './from.js'
import { canonicalHouse } from './houses.js'
import { isStaleLoad, reloadForUpdate } from './stale.js'
import { barColour, installMode, onInstallChange, promptInstall, registerWorker } from './install.js'
import { iosSheet } from './ui/install.js'
import { smooth } from './smooth.js'
import { districtById, defaultDistrictId } from './districts/registry.js'
import { filterText, cleanBio, canSend } from './engine/filter.js'
import { loadBoardRows, loadLobby } from './social.js'
import { withEventEdits } from './engine/model.js'
import {
  advancePhase,
  applyAction,
  beginNextDay,
  chooseEvent,
  buy,
  createRun,
  dismissCard,
  stock,
} from './engine/sim.js'
import {
  authEnabled,
  closeReport,
  currentSession,
  fetchEventEdits,
  fetchSmoothReports,
  getClient,
  fetchReports,
  fileReport,
  pullProfile,
  pushProfile,
  saveEventText,
  sendLobby,
  signInEmail,
  signInGoogle,
  signOut,
  storeBlock,
  subscribeLobby,
  suspendUser,
} from './net.js'
import { drawShareCard, exportCard } from './share.js'
import { shareUrl } from './config.js'
import { loop as soundLoop, setGrooveLevel, setMuted, unlock as unlockSound } from './audio.js'
import { genderOf, outfitsFor, roommateOf } from './avatar.js'
import { personInfo, replyTo } from './engine/people.js'
import { checkGoals, goalText, goalsCard, startGoals } from './engine/goals.js'
import { PATH_DREAM, storyWithDefaults } from './story.js'
import { newCrush } from './crush.js'
import { addIdentity, identityCard } from './engine/identity.js'
import { chooseMoment } from './engine/moments.js'
import { startGroove, stopGroove } from './groove.js'

let shareMilestone = null
let shareBlob = null
import { emptyDraft, shotState, view } from './ui/render.js'
import { anyEnabled, fpsText, hereOf, layoutOf, soundOn, ui, viewFlags, viewPref } from './ui/game.js'
import { homePlaceId, houseOf } from './engine/model.js'
import { venueFor } from './venues.js'
import { toMinutes } from './engine/format.js'
import { MENUS, itemOf } from './menus.js'
import { LECTURERS } from './venues.js'
import { addContact, applyFx, closer, markTogether } from './engine/talkactions.js'
import { clearErrors, installErrorReporting, readErrors } from './errors.js'
import { hidePlayer, joinPresence, onPoke, sendPoke } from './presence.js'
import { compactCard, loadCard, reportPlayer, saveMyCard } from './cards.js'
import { saidBy } from './chat.js'
import { ENROL_STEPS, draftCard } from './ui/enrol.js'
import { candidates, checkRules, claimHandle, handleStatus, nextChange, suggestFor, tidyHandle } from './handles.js'
import { playerCardHtml } from './ui/card.js'

installErrorReporting()
// Install Soft Life (src/install.js): the service worker in the built game, and the menu
// and #/install screen redrawn when Chrome offers to install or it's been installed.
registerWorker()
onInstallChange(() => { if (route().name === 'install' || route().name === 'title' || ui.gear) paint() })

// One tap to install (9 Nov). Android Chrome with the browser's offer in hand: its install box, no
// screen in between. iPhone Safari: a bottom sheet pointing at Share. Anything else (Chrome before it
// has offered, other browsers, in-app browsers): the #/install screen, which switches to the one-tap
// button if the offer arrives while it is open.
function closeIosSheet() { document.querySelector('.in-sheet')?.remove() }
function openIosSheet() {
  closeIosSheet()
  document.body.insertAdjacentHTML('beforeend', iosSheet())
  const sheet = document.querySelector('.in-sheet')
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-act="install-close"]')) closeIosSheet() })
  sheet.querySelector('.in-go')?.focus()
}
function installTap() {
  ui.gear = false
  const mode = installMode()
  if (mode === 'prompt') { promptInstall(); paint(); return }
  if (mode === 'ios') { paint(); openIosSheet(); return }
  go('install')
}
// The website's Install button opens the game with ?install=1: land with the install box ready (Chrome
// needs a tap, so no auto-prompt), and take the parameter off the address.
{
  const q = new URLSearchParams(location.search)
  if (q.get('install') === '1') {
    q.delete('install')
    const rest = q.toString()
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`)
    window.__installArrival = true
  }
}

const KEY = 'mzansiville.v1'
const app = document.getElementById('app')

function loadSave() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!parsed) return { rulesAccepted: false, run: null, mutes: [], blocks: [], chatStamps: [], role: 'player' }
    parsed.mutes = parsed.mutes || []
    parsed.blocks = parsed.blocks || []
    parsed.chatStamps = parsed.chatStamps || []
    return parsed
  } catch {
    return { rulesAccepted: false, run: null, mutes: [], blocks: [], chatStamps: [], role: 'player' }
  }
}

// Random moments interrupt with a full-screen choice; automated tests that are not
// about them turn them off (?moments=1 turns them back on).
const NO_MOMENTS = Boolean(navigator.webdriver) && new URLSearchParams(location.search).get('moments') !== '1'
let save = loadSave()
// A new visit starts where people are (the Quad), not at the door you walked out of earlier.
if (save.run?.outDoor) delete save.run.outDoor
// (a save from before Greenway Grocer: the starter fridge and phone credit)
if (save.run) stock(districtById(save.run.character?.districtId || defaultDistrictId), save.run)
if (save.run) save.run.noMoments = NO_MOMENTS
// The houses replaced the residences (build plan, Piece 0): an old residence moves into
// its house (houses.json "was"; any other old name, a house of its own, always the same).
if (save.run?.character) {
  const h = houseOf(districtById(save.run.character.districtId || defaultDistrictId), save.run.character.residence)
  if (h && save.run.character.residence !== h.name) { save.run.character.residence = h.name; try { localStorage.setItem(KEY, JSON.stringify(save)) } catch { /* kept in memory */ } }
}
let edits = []
let draft = emptyDraft()
let chat = { messages: [], names: {}, offline: false, source: 'loading', error: '', notice: '', menuId: '', reportId: '', prompt: false, draft: '' }
let board = { tab: 'money', scope: 'all', rows: [], source: 'loading', error: '' }
let admin = { reports: [], eventId: 'nsfas_delayed', notice: '', allowed: false }
// Lloyd's smoothness page (#/smooth): the range, the rows, the place whose stalls are open.
let smoothPage = { range: '7d', rows: [], place: '', device: '', error: '', loading: false, injected: false }
let timer = 0
let merging = false
let chatUnsub = null
let morning = null
let cardMini = false
const hiddenToasts = new Set()

function districtNow() {
  const id = save.run?.character?.districtId || defaultDistrictId
  return withEventEdits(districtById(id), edits)
}

function persist() {
  if (save.run) save.run.noMoments = NO_MOMENTS
  localStorage.setItem(KEY, JSON.stringify(save))
}

function route() {
  if (location.pathname.replace(/\/$/, '') === '/admin') return { name: 'admin', id: '' }
  const parts = (location.hash.replace(/^#\/?/, '') || 'title').split('/').filter(Boolean)
  return { name: parts[0] || 'title', id: decodeURIComponent(parts[1] || '') }
}

function screenName(name) {
  if (name === 'new') return 'create'
  if (name === 'locked') return 'refill'
  if (name === 'over') return 'gameover'
  if (name === 'board') return 'leaderboard'
  return name
}

function state() {
  return {
    screen: screenName(route().name),
    district: districtNow(),
    run: save.run,
    draft,
    save,
    placeId: route().name === 'place' ? route().id : '',
    chat,
    board,
    shareMilestone,
    admin,
    smooth: smoothPage,
    morning,
    cardMini,
    ui,
    sound: soundOn(),
  }
}

function choiceWaiting() {
  return Boolean(save.run?.queue?.[0]?.choices)
}

function rememberMorning(run) {
  if (!run || run.mode !== 'play') return
  const id = `${run.character?.name || ''}|${run.day}`
  try {
    const saved = JSON.parse(sessionStorage.getItem('mzansiville.morning') || 'null')
    if (saved?.id === id && saved.stats) {
      morning = saved.stats
      return
    }
  } catch { /* ignore */ }
  morning = {
    money: run.stats.money,
    energy: run.stats.energy,
    hunger: run.stats.hunger,
    grades: run.stats.grades,
    social: run.stats.social,
  }
  try {
    sessionStorage.setItem('mzansiville.morning', JSON.stringify({ id, stats: morning }))
  } catch { /* ignore */ }
}

function armToasts() {
  app.querySelectorAll('.toast').forEach((el) => {
    const id = el.dataset.toast
    if (hiddenToasts.has(id)) {
      el.remove()
      return
    }
    setTimeout(() => {
      hiddenToasts.add(id)
      el.remove()
    }, 5000)
  })
}

const WORLD_SCREENS = new Set(['world', 'play', 'map', 'place', 'closed', 'summary', 'event', 'twist', 'bestie', 'graduated'])
let glOk = null

function hasGL() {
  if (glOk !== null) return glOk
  if (new URLSearchParams(location.search).get('nogl') === '1') return (glOk = false)
  try {
    const c = document.createElement('canvas')
    glOk = Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { glOk = false }
  return glOk
}

function worldWanted(viewState) {
  return Boolean(viewState?.run) && WORLD_SCREENS.has(viewState.screen) && viewPref() === '3d' && hasGL()
}
let worldPromise = null
let worldTicket = 0

let morningPromise = null

// Day 1 opens at your family home (world/home.js: leaving home, the drive to UMzansi);
// day 2 is your first morning in res (world/morning.js: the kettle, noodles, the shower).
function morningWanted(run) {
  if (!run || run.mode !== 'play' || run.phase !== 'wake') return false
  const q = new URLSearchParams(location.search)
  if (q.get('shot') || q.get('morning') === '0' || !hasGL()) return false
  if (q.get('morning') === '1') return true
  if (run.day === 1) return !run.morningDone
  if (run.day === 2) return !run.resMorningDone
  return false
}
let homePromise = null
function stopIntro() {
  morningPromise?.then((mod) => mod.stopMorning())
  homePromise?.then((mod) => mod.stopHome())
}

function morningSnapshot(run) {
  if (!run.morningStart) run.morningStart = { stats: { ...run.stats }, minutes: run.minutes }
  else { run.stats = { ...run.morningStart.stats }; run.minutes = run.morningStart.minutes }
}

function endMorning(skip, result) {
  const run = save.run
  if (!run) return
  if (skip && run.morningStart) { run.stats = { ...run.morningStart.stats }; run.minutes = run.morningStart.minutes }
  const homeDay = run.day === 1
  if (homeDay) run.morningDone = true
  else run.resMorningDone = true
  delete run.morningStart
  // Your roommate (Zanele, or Sipho for a male student) meets you at your house door on day 1,
  // so they are the bestie and the day 1 "New bestie" card would only repeat it.
  run.bestieName = roommateOf(run.character?.avatar)
  run.queue = run.queue.filter((card) => card.id !== 'bestie-1')
  stopIntro()
  if (!skip && homeDay) {
    // Leaving home: the car pulls up at the Main Gate (world/dropoff.js on campus). The goodbye,
    // the money and the walk to your house door come first; today's goals after that.
    const district = districtNow()
    const arrived = result?.arrived || run.minutes
    for (let i = 0; i < 3 && run.phase !== 'lecture'; i++) advancePhase(district, run)
    run.minutes = arrived
    run.at = 'gate'
    run.dropOff = { style: result?.style || run.home?.style || 'suburban', day: run.day }
    run.outDoor = false
    if (!run.crush) run.crush = newCrush(run.character)
    ui.gear = false
    persist()
    go('play')
    return
  }
  if (!skip) {
    const district = districtNow()
    // advancePhase resets the clock to 09:00; campus starts when you walked out of the door.
    const arrived = result?.arrived || run.minutes
    for (let i = 0; i < 3 && run.phase !== 'lecture'; i++) advancePhase(district, run)
    run.minutes = arrived
    // (no bus: you walked out of your house's door, and campus starts there; the flag is
    // for this arrival only, a later visit starts at the Quad)
    run.at = homePlaceId(district, run.character?.residence)
    run.outDoor = true
    run.lectureRoute = true
  }
  // Arrival: today's goals slide in. (A skipped morning still has someone from the bus to find.)
  if (!run.crush) run.crush = newCrush(run.character)
  startGoals(run)
  run.queue = [goalsCard(run), ...run.queue.filter((card) => card.kind !== 'goals')]
  ui.gear = false
  persist()
  go('play')
}

function syncMorning(viewState) {
  const on = viewState?.screen === 'morning' && Boolean(viewState.run)
  if (!on) { stopIntro(); return false }
  if (viewState.run.day === 1) {
    morningPromise?.then((mod) => mod.stopMorning())
    if (!homePromise) homePromise = import('./world/home.js')
    homePromise.then((mod) => {
      if (route().name !== 'morning') return
      mod.startHome({
        run: save.run,
        onUpdate() { persist(); paint() },
        onDone(result) { endMorning(false, result) },
      })
    }).catch((error) => { if (isStaleLoad(error) && reloadForUpdate(error?.message)) return; console.error(error) })
    return true
  }
  homePromise?.then((mod) => mod.stopHome())
  if (!morningPromise) morningPromise = import('./world/morning.js')
  morningPromise.then((mod) => {
    if (route().name !== 'morning') return
    mod.startMorning({
      run: save.run,
      forceRoommate: { 1: true, 0: false }[new URLSearchParams(location.search).get('roommate')],
      onUpdate() { persist(); paint() },
      onDone(result) { endMorning(false, result) },
    })
  }).catch((error) => { if (isStaleLoad(error) && reloadForUpdate(error?.message)) return; console.error(error) })
  return true
}

let lecturePromise = null
let previewPromise = null

// The place sheet's flavour line changes every few seconds, like a live feed.
let flavourTimer = 0
function cycleFlavour() {
  clearInterval(flavourTimer)
  const node = app.querySelector('.g-flavour')
  if (!node) return
  let lines = []
  try { lines = JSON.parse(node.dataset.lines || '[]') } catch { lines = [] }
  if (lines.length < 2) return
  let i = 0
  flavourTimer = setInterval(() => {
    if (!node.isConnected) { clearInterval(flavourTimer); return }
    i = (i + 1) % lines.length
    node.classList.remove('in')
    void node.offsetWidth
    node.textContent = lines[i]
    node.classList.add('in')
  }, 4500)
}

// The creator shows the real 3D student, so what you dress is what you play.
function syncPreview(viewState) {
  const stage = viewState?.screen === 'create' && hasGL() ? app.querySelector('.cc-stage') : null
  if (!stage) { previewPromise?.then((mod) => mod.hidePreview()); if (viewState?.screen === 'create') hydrateThumbs(); return }
  if (!previewPromise) previewPromise = import('./ui/preview3d.js')
  previewPromise.then((mod) => {
    const now = app.querySelector('.cc-stage')
    if (now) mod.showPreview(now, draft.avatar)
  }).catch((error) => { if (isStaleLoad(error) && reloadForUpdate(error?.message)) return; console.error(error) })
  hydrateThumbs()
}

// Creator icons: outfit, hair and body pictures rendered from the real 3D models.
// A picture made before shows at once; while a new one is drawn, the chip keeps the
// last picture it had (never blank); the selected chips are drawn first.
let thumbsPromise = null
const lastThumb = new Map() // part|id -> the last picture that chip showed
function hydrateThumbs() {
  const chips = [...app.querySelectorAll('.cc-chip.th[data-part]')].filter((chip) => ['outfit', 'hair', 'body'].includes(chip.dataset.part))
  // (the card at the end of enrolment: your portrait as dressed, made on the look screen)
  if (!chips.length) {
    const photo = app.querySelector('.cc-photo')
    if (photo && lastThumb.get('photo')) photo.innerHTML = `<img src="${lastThumb.get('photo')}" alt="">`
    // (enrolment's student card on who and vibe: the whole student as dressed, cropped like an ID photo)
    const idPhoto = app.querySelector('.en-idphoto')
    const whole = lastThumb.get('whole')
    if (idPhoto && (whole || lastThumb.get('photo'))) idPhoto.innerHTML = whole ? `<img class="whole" src="${whole}" alt="">` : `<img src="${lastThumb.get('photo')}" alt="">`
    return
  }
  if (!thumbsPromise) thumbsPromise = import('./ui/thumbs3d.js')
  const show = (chip, url) => {
    const box = chip.isConnected && chip.querySelector('.cc-thumb')
    if (!box || !url) return
    box.innerHTML = `<img src="${url}" alt="">`
    box.classList.add('is3d')
    chip.dataset.thumb = '3d'
  }
  for (const chip of chips) show(chip, lastThumb.get(`${chip.dataset.part}|${chip.dataset.id}`))
  // The student card's photo: the 3D student as dressed now (head and shoulders).
  const photo = app.querySelector('.cc-photo')
  const lastPhoto = lastThumb.get('photo')
  if (photo && lastPhoto) photo.innerHTML = `<img src="${lastPhoto}" alt="">`
  // (the big student on the stage first: the pictures wait until it's showing)
  const stageReady = previewPromise ? previewPromise.then((mod) => mod.ready?.()).catch(() => {}) : Promise.resolve()
  Promise.all([thumbsPromise, stageReady]).then(([{ thumbFor, thumbNow }]) => {
    const look = draft.avatar
    // (kept even with no card on screen: the enrolment card at the end shows it)
    const putPhoto = (url) => { if (!url) return; lastThumb.set('photo', url); const node = app.querySelector('.cc-photo'); if (node) node.innerHTML = `<img src="${url}" alt="">` }
    // (and the whole student, kept for the stage's still next time this look opens)
    // (enrolment's card shows it on the next steps: lastThumb 'whole')
    const whole = thumbNow(look, 'body')
    if (whole) lastThumb.set('whole', whole)
    else thumbFor(look, 'body', () => Boolean(app.querySelector('.cc-stage'))).then((url) => { if (url && JSON.stringify(draft.avatar) === JSON.stringify(look)) lastThumb.set('whole', url) })
    const ready = thumbNow(look, 'hair')
    if (ready) putPhoto(ready)
    else thumbFor(look, 'hair', () => Boolean(app.querySelector('.cc-photo, .cc-stage'))).then(putPhoto)
    const order = [...chips].sort((a, b) => Number(b.classList.contains('on') || b.getAttribute('aria-pressed') === 'true') - Number(a.classList.contains('on') || a.getAttribute('aria-pressed') === 'true'))
    for (const chip of order) {
      const part = chip.dataset.part
      const look = { ...draft.avatar, [part]: chip.dataset.id }
      const kind = part === 'hair' ? 'hair' : 'body'
      const ready = thumbNow(look, kind)
      const put = (url) => { if (!url) return; lastThumb.set(`${part}|${chip.dataset.id}`, url); show(chip, url) }
      if (ready) { put(ready); continue }
      thumbFor(look, kind, () => chip.isConnected).then(put)
    }
  }).catch((error) => { if (isStaleLoad(error) && reloadForUpdate(error?.message)) return; console.error(error) })
}

// The day-1 lecture is the 3D scene; it can never be skipped by a button.
const LECTURE_ACTIONS = new Set(['lecture_attend', 'lecture_back'])
function lectureWanted(run) {
  return Boolean(run && run.mode === 'play' && run.day === 1 && run.phase === 'lecture' && !run.lectureResolved && hasGL())
}

// The lecture adds its own seat and moment extras on top of the normal lecture gain.
function endLecture(result) {
  const run = save.run
  lecturePromise?.then((mod) => mod.stopLecture())
  if (!run) return
  const district = districtNow()
  const done = applyAction(district, run, 'lecture_attend')
  if (!done.ok) run.lectureResolved = true
  const caps = { energy: run.energyCap || 100, hunger: 100, grades: 100, social: 100, money: 1e9 }
  for (const [k, d] of Object.entries(result?.deltas || {})) {
    run.stats[k] = Math.max(0, Math.min(caps[k] ?? 100, (run.stats[k] || 0) + d))
  }
  run.lastEventLine = `Lecture 1: ${result?.moment || 'done'}`
  run.at = venueFor(run).id
  run.lectureRoute = false
  delete run.lectureCard
  persist()
  go('play')
}

function syncLecture(viewState) {
  const on = viewState?.screen === 'lecture' && lectureWanted(viewState.run)
  if (!on) { lecturePromise?.then((mod) => mod.stopLecture()); return false }
  if (!lecturePromise) lecturePromise = import('./world/lecture.js')
  lecturePromise.then((mod) => {
    if (route().name !== 'lecture') return
    mod.startLecture({ run: save.run, district: districtNow(), onDone: endLecture })
  }).catch((error) => { if (isStaleLoad(error) && reloadForUpdate(error?.message)) return; console.error(error) })
  return true
}

function syncWorld(viewState) {
  const morningOn = syncMorning(viewState) || syncLecture(viewState)
  const on = worldWanted(viewState) && !morningOn
  const ticket = ++worldTicket
  document.body.dataset.world = on || morningOn ? '1' : '0'
  // Music plays in the morning and on campus; the crowd only on campus.
  soundLoop('music_campus', on || morningOn)
  soundLoop('crowd', on)
  // The character creator dances to its own house groove.
  if (viewState?.screen === 'create') { setGrooveLevel(1); startGroove('creator') } else stopGroove('creator')
  if (!on) {
    worldPromise?.then((mod) => {
      if (ticket === worldTicket) mod.setVisible(false)
    })
    return
  }
  if (!worldPromise) worldPromise = import('./world/scene.js')
  worldPromise.then((mod) => {
    if (ticket !== worldTicket) return
    mod.showCampus(viewState.district, viewState.run)
  }).catch((error) => {
    // (a game file gone after a redeploy: "Updating..." and a reload, never a green screen)
    if (isStaleLoad(error) && reloadForUpdate(error?.message)) return
    console.error(error)
  })
}

// The frame-rate readout (menu, Settings) stays live while it's on screen.
setInterval(() => {
  const els = document.querySelectorAll('[data-fps-live]')
  if (els.length) { const text = fpsText(); for (const el of els) el.textContent = text }
}, 500)

function paint() {
  // Presence: on campus with everyone else as soon as you have a student (presence.js).
  if (save.run?.character) { joinPresence(save.run.character, compactCard(save.run)); saveMyCard(save.run) }
  const shot = new URLSearchParams(location.search).get('shot')
  if (!shot) rememberMorning(save.run)
  if (!shot && route().name === 'play' && morningWanted(save.run)) {
    morningSnapshot(save.run)
    location.hash = '#/morning'
    return
  }
  if (!shot && route().name === 'morning' && !morningWanted(save.run)) {
    location.hash = '#/play'
    return
  }
  if (!shot && route().name === 'morning' && save.run && !save.run.morningStart) morningSnapshot(save.run)
  if (!shot && route().name === 'lecture' && !lectureWanted(save.run)) {
    location.hash = '#/play'
    return
  }
  // (a save left on the old end-of-day screen: straight on to the next morning)
  if (!shot && save.run?.mode === 'summary') { startNextDay(); return }
  if (!shot && save.run?.mode === 'play' && route().name === 'summary') {
    location.hash = '#/play'
    return
  }
  const active = document.activeElement
  const focusId = active && app.contains(active) ? active.id : ''
  const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null
  const viewState = shot ? shotState(shot) : state()
  viewFlags.gl = hasGL()
  viewFlags.world = worldWanted(viewState)
  const html = view(viewState)
  const oldLog = document.getElementById('log')
  const logTop = oldLog ? oldLog.scrollTop : null
  app.innerHTML = html
  const newLog = document.getElementById('log')
  if (newLog) newLog.scrollTop = chat.menuId && logTop != null ? logTop : newLog.scrollHeight
  const screen = app.querySelector('[data-screen]')
  app.dataset.screen = screen?.dataset.screen || 'title'
  barColour(app.dataset.screen)
  syncPreview(viewState)
  cycleFlavour()
  if (focusId) {
    const el = document.getElementById(focusId)
    if (el) {
      el.focus()
      if (caret != null && el.setSelectionRange) {
        try { el.setSelectionRange(caret, caret) } catch { /* number inputs */ }
      }
    }
  }
  const canvas = document.getElementById('share-card')
  const shown = shot ? shotState(shot) : state()
  const run = shown.run
  const district = shown.district
  if (canvas && run) {
    // Draw, then encode the PNG ahead of time so the Share tap is instant and
    // navigator.share still has the tap's user activation.
    shareBlob = drawShareCard(canvas, { district, run, url: shareUrl(), milestone: shot ? shown.shareMilestone : shareMilestone })
      .then(() => exportCard(canvas)).catch(() => null)
  }
  if (app.dataset.screen !== 'title' && app.dataset.screen !== 'create' && !app.querySelector('.g-home')) {
    app.insertAdjacentHTML('beforeend', '<button class="g-home g-home-float" type="button" data-act="home" aria-label="Home">\u{1F3E0}</button>')
  }
  syncWorld(shown)
  armToasts()
  armAuto()
}

function go(path) {
  const next = `#/${path}`
  if (location.hash === next) paint()
  else location.hash = next
}

function captureForm() {
  const name = document.getElementById('name')
  if (name) draft.name = name.value
  const residence = document.getElementById('residence')
  if (residence) draft.residence = residence.value
  const course = document.getElementById('course')
  if (course) draft.course = course.value
  const handle = document.getElementById('handle')
  if (handle) draft.handle = handle.value
  const bio = document.getElementById('bio')
  if (bio) draft.bio = bio.value
  const email = document.getElementById('email')
  if (email) draft.email = email.value
  const composer = document.getElementById('composer')
  if (composer) chat.draft = composer.value
  const eventId = document.getElementById('event-id')
  if (eventId) admin.eventId = eventId.value
}

function needsRun(name) {
  return ['play', 'morning', 'lecture', 'world', 'place', 'summary', 'locked', 'over', 'milestones', 'profile', 'share', 'shop', 'chat', 'board'].includes(name)
}

function arm() {
  clearInterval(timer)
  if (new URLSearchParams(location.search).get('shot')) return
  const name = route().name
  if (name === 'board') timer = setInterval(loadBoard, 30000)
  if (name === 'locked') timer = setInterval(paint, 1000)
}

async function sync() {
  if (save.run?.userId) {
    const result = await pushProfile(save.run)
    if (result.error) draft.error = result.error
  }
}

function blip(freq = 660) {
  if (!soundOn()) return
  // Pass 3: never start audio in the same frame as the visual feedback.
  // Wait for the next painted frame, then run the sound off the input path.
  requestAnimationFrame(() => setTimeout(() => blipNow(freq), 0))
}

// Pass 3: warm the audio context in idle time after the first gesture, so a
// later tap never pays the (Edge: ~500 ms) cold AudioContext start.
function prewarmAudio() {
  if (blip.ctx || !soundOn()) return
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 250))
  requestAnimationFrame(() => idle(() => {
    try {
      blip.ctx = blip.ctx || new (window.AudioContext || window.webkitAudioContext)()
    } catch { /* no audio */ }
  }, { timeout: 1500 }))
}
// Talking: the scene walks you up to someone, then the card takes over.
// Skipping a walk costs the minutes it would have taken (never past the end of this part of the day).
window.addEventListener('mzansi-travel-skip', (event) => {
  const run = save.run
  if (!run || run.mode !== 'play') return
  const phases = districtNow().meta.phases
  const next = phases[phases.findIndex((p) => p.id === run.phase) + 1]
  const limit = next ? toMinutes(next.start) - 1 : run.minutes + 60
  run.minutes = Math.min(limit, run.minutes + (event.detail?.minutes || 1))
  persist()
  paint()
})
// Queue, then order: tapping a vendor (or her queue) walks you to the back of the
// line; at the front, her order card opens by itself.
function joinQueue(vendor, told) {
  const menu = MENUS[vendor]
  if (!menu || !save.run) return
  window.mzansiVendorReady = null
  if (document.body.dataset.world !== '1') { window.mzansiVendorReady = vendor; ui.talk = { id: vendor, menu: true }; paint(); return }
  // Eating with someone: they queue behind you and stay with you till you've eaten.
  const friend = together && { with: together.id, keep: true, answer: together.answer, name: together.name }
  if (together) together.answer = ''
  window.dispatchEvent(new CustomEvent('mzansi-act', { detail: {
    placeId: menu.place,
    actionId: 'talk_queue',
    sceneOpt: { vendor, told, vendorName: personInfo(vendor)?.name, ...friend },
    commit() {
      spendMinutes(menu.place === 'cafeteria' ? 8 : 4)
      persist()
      window.mzansiVendorReady = vendor
      window.mzansiTalkTo?.(vendor)
    },
  } }))
}
window.addEventListener('mzansi-vendor-tap', (event) => {
  toast('Back of the line, baby!')
  joinQueue(event.detail.id, true)
})

window.addEventListener('mzansi-talk', (event) => {
  if (!save.run || !event.detail?.id) return
  // At the front of the queue: straight to her menu.
  if (MENUS[event.detail.id] && window.mzansiVendorReady === event.detail.id) {
    ui.talk = { id: event.detail.id, menu: true }
    blip(700)
    paint()
    return
  }
  ui.talk = { id: event.detail.id }
  blip(700)
  paint()
})
// Minutes pass, but never past the end of this part of the day.
function spendMinutes(n) {
  const run = save.run
  const phases = districtNow().meta.phases
  const next = phases[phases.findIndex((p) => p.id === run.phase) + 1]
  run.minutes = Math.min(next ? toMinutes(next.start) - 1 : run.minutes + n, run.minutes + n)
}

// Play a scene for something you chose in a conversation, then apply it.
function talkScene(actionId, placeId, sceneOpt, commit) {
  endTalk({ keepFriend: true })
  paint()
  if (document.body.dataset.world !== '1') { commit(); persist(); paint(); return }
  window.dispatchEvent(new CustomEvent('mzansi-act', { detail: { placeId, actionId, sceneOpt, commit() { commit(); checkGoals(save.run); persist(); finishTurn() } } }))
}

function buyFood(itemId, sizeId) {
  const id = ui.talk.id
  const got = itemOf(id, itemId, sizeId)
  if (!got || (save.run.stats.money || 0) < got.price) return
  save.run.stats.money -= got.price // the HUD money drops as you pay
  ui.talk = { id, bought: { item: itemId, size: sizeId, label: got.label, price: got.price, fx: got.fx } }
  window.dispatchEvent(new CustomEvent('mzansi-talk-react', { detail: { tone: 'good' } }))
  blip(990)
  persist()
  paint()
}

function eatFood(sit) {
  const id = ui.talk.id
  const b = ui.talk.bought
  const menu = MENUS[id]
  const friend = together
  together = null
  talkScene('talk_eat', menu.place, { food: b.label.toLowerCase(), eat: sit, vendorName: personInfo(id)?.name, ...(friend && { with: friend.id, name: friend.name }) }, () => {
    applyFx(save.run, b.fx)
    spendMinutes(sit ? 25 : 5)
    save.run.at = menu.place
    if (!friend) { flash(`\u{1F37D} ${b.label}: +${b.fx.hunger || 0} Fullness`); return }
    applyFx(save.run, { social: 4 })
    closer(save.run, friend.id, 8)
    markTogether(save.run, `eat:${friend.id}`)
    addIdentity(save.run, { socialite: 1 })
    flash(`\u{1F37D} Ate with ${friend.name}: +${b.fx.hunger || 0} Fullness, +4 Social`)
  })
}

// Where "Walk with me" goes: your lecture if it's next, otherwise somewhere else.
function walkPlace(run) {
  if (lectureWanted(run)) return venueFor(run).id
  return run.at === 'quad' ? 'library' : 'quad'
}

// answer: what they said to the reply that led here (shown as the scene starts).
function talkAct(kind, answer = '') {
  const run = save.run
  const id = ui.talk.id
  const info = personInfo(id)
  const name = run.crush?.id === id ? (run.crush.nameKnown ? run.crush.name : 'them') : info?.name || 'them'
  if (kind === 'order') { ui.talk = { id, menu: true }; paint(); return }
  if (kind === 'swap') {
    addContact(run, id, name)
    closer(run, id, 3)
    window.dispatchEvent(new CustomEvent('mzansi-talk-react', { detail: { tone: 'good' } }))
    ui.talk = { id, swapped: true, answer }
    blip(1100)
    persist()
    paint()
    return
  }
  if (kind === 'consult') {
    const venue = LECTURERS[id]
    talkScene('talk_consult', 'here', { who: id, name: venue.lecturerName, hide: id, answer }, () => {
      applyFx(run, { grades: 3, energy: -4 })
      run.consulted = { ...(run.consulted || {}), [run.day]: true }
      closer(run, id, 6)
      addIdentity(run, { scholar: 1 })
      spendMinutes(20)
      flash('\u{1F4D6} Consultation: +3 Grades')
    })
    return
  }
  if (kind === 'sit') {
    talkScene('talk_sit', 'here', { who: id, name, hide: id, answer }, () => {
      applyFx(run, { social: 4, energy: -2 })
      closer(run, id, 8)
      markTogether(run, id)
      addIdentity(run, { socialite: 1 })
      spendMinutes(30)
      flash(`\u{1FA91} You and ${name}: +4 Social, closer`)
    })
    return
  }
  if (kind === 'study') {
    talkScene('talk_study', 'library', { who: id, with: id, name, answer }, () => {
      applyFx(run, { grades: 3, social: 2, energy: -8 })
      closer(run, id, 5)
      markTogether(run, `study:${id}`)
      run.weekStudied = (run.weekStudied || 0) + 1
      if (run.today?.day === run.day) run.today.studied += 1
      addIdentity(run, { scholar: 1 })
      spendMinutes(45)
      save.run.at = 'library'
      flash(`\u{1F4DA} Studied with ${name}: +3 Grades, +2 Social`)
    })
    return
  }
  if (kind === 'walk') {
    const to = walkPlace(run)
    const placeName = districtNow().places.find((p) => p.id === to)?.name || 'there'
    talkScene('talk_walk', to, { who: id, with: id, name, answer, placeName }, () => {
      applyFx(run, { social: 2, energy: -2 })
      closer(run, id, 5)
      markTogether(run, `walk:${id}`)
      spendMinutes(10)
      save.run.at = to
      flash(`\u{1F6B6} Walked to ${placeName} with ${name}: +2 Social, closer`)
    })
    return
  }
  if (kind === 'eat') {
    // Both of you walk to her queue, line up, order, then sit at one table.
    const vendor = /gugu|vetkoek/i.test(answer) ? 'mam_gugu' : 'auntie_pinky'
    together = { id, name, answer }
    endTalk({ keepFriend: true })
    paint()
    if (document.body.dataset.world === '1') window.dispatchEvent(new CustomEvent('mzansi-companion', { detail: { id } }))
    joinQueue(vendor, false)
  }
}

const DOING = new Set(['eat', 'study', 'sit', 'walk', 'swap', 'order', 'consult'])
// Who is coming along with you to eat (from "Let's get something to eat" to the last bite).
let together = null

// away: a goodbye - you walk off. keepFriend: the chat ends because you go and do something together.
function endTalk({ away = false, keepFriend = false } = {}) {
  if (!keepFriend && together) {
    together = null
    window.dispatchEvent(new CustomEvent('mzansi-companion', { detail: {} }))
  }
  if (!ui.talk) return
  if (MENUS[ui.talk.id]) window.mzansiVendorReady = null
  ui.talk = null
  window.dispatchEvent(new CustomEvent('mzansi-talk-end', { detail: { away } }))
}

// The world's Goodbye button (or its watchdog) ends the chat: the card closes too.
window.addEventListener('mzansi-talk-leave', () => {
  if (!ui.talk) return
  endTalk()
  paint()
})

// Day 1: the drop-off at the Main Gate (world/dropoff.js). The money lands as it is handed
// over; at your house door your roommate meets you and the day proper starts (goals, the route
// to your lecture).
window.addEventListener('mzansi-dropoff-update', () => { persist(); paint() })
window.addEventListener('mzansi-dropoff-done', () => {
  const run = save.run
  if (!run) return
  delete run.dropOff
  run.at = homePlaceId(districtNow(), run.character?.residence)
  run.outDoor = true
  run.lectureRoute = true
  startGoals(run)
  run.queue = [goalsCard(run), ...run.queue.filter((card) => card.kind !== 'goals')]
  persist()
  paint()
})
window.addEventListener('mzansi-lecture-arrive', () => {
  if (save.run) delete save.run.lectureCard
  persist()
  go(lectureWanted(save.run) ? 'lecture' : 'play')
})
window.addEventListener('pointerup', prewarmAudio, { once: true, passive: true })
// Every tap re-unlocks: iOS suspends the audio context when the tab is hidden.
window.addEventListener('pointerdown', unlockSound, { passive: true })

function blipNow(freq) {
  try {
    const ctx = blip.ctx || (blip.ctx = new (window.AudioContext || window.webkitAudioContext)())
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = freq
    g.gain.setValueAtTime(0.05, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.13)
  } catch { /* no audio */ }
}

// Fix 2 from play-through: plain result cards close themselves.
let autoTimer = 0
function armAuto() {
  clearTimeout(autoTimer)
  const card = app.querySelector('.g-result[data-auto]')
  if (!card) return
  card.insertAdjacentHTML('beforeend', '<i class="g-timer"></i>')
  autoTimer = setTimeout(() => {
    const q = save.run?.queue?.[0]
    if (!q || q.choices || !app.contains(card)) return
    dismissCard(save.run, q.id)
    autoAdvance()
    persist()
    paint()
  }, 1800)
}

// A small bounce on the tapped thing and a short note: the tap was heard.
function pulse(el, text) {
  el.classList.remove('g-pulse')
  void el.offsetWidth
  el.classList.add('g-pulse')
  blip(660)
  toast(text)
}

// A short note on any screen (the play screen's notice line only exists there).
let toastTimer = 0
function toast(text) {
  let node = document.getElementById('toast')
  if (!node) {
    node = document.createElement('p')
    node.id = 'toast'
    node.className = 'g-toast'
    node.setAttribute('role', 'status')
    document.body.append(node)
  }
  node.textContent = text
  node.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { node.hidden = true }, 1800)
}

let noticeTimer = 0
function flash(text) {
  ui.notice = text || ''
  clearTimeout(noticeTimer)
  if (text) noticeTimer = setTimeout(() => { ui.notice = ''; const n = app.querySelector('.g-notice'); if (n) n.remove() }, 2200)
}

function phaseNotice() {
  const run = save.run
  if (!run || run.mode !== 'play') return ''
  const p = districtNow().meta.phases.find((item) => item.id === run.phase)
  return p ? `${p.label} \u00b7 ${p.start}` : ''
}

// Skip phases where nothing on the map can be done, so the day never stalls.
function seenMapHint() {
  try { localStorage.setItem('mzansiville.mapHint', '1') } catch { /* private mode */ }
}

function autoAdvance() {
  const district = districtNow()
  const run = save.run
  let guard = 0
  const skipped = []
  // (never past night: the day ends when you sleep, not by itself)
  while (run && run.mode === 'play' && run.phase !== 'night' && !run.queue.some((card) => card.choices) && !anyEnabled(district, run) && guard < 6) {
    if (guard) skipped.push(run.phase)
    advancePhase(district, run)
    guard += 1
  }
  // Play-through fix: say which phases were jumped instead of silently losing them.
  if (guard) {
    const names = skipped.map((id) => district.meta.phases.find((p) => p.id === id)?.label).filter(Boolean)
    flash(names.length ? `Nothing open at ${names.join(' & ')} \u2014 now ${phaseNotice()}` : phaseNotice())
  }
}

// Avatar walks to the tapped place before the action lands.
function walkThen(button, done) {
  button.classList.add('busy')
  blip()
  const me = document.getElementById('g-me')
  const target = button.dataset.place
  const from = save.run && hereOf(districtNow(), save.run)
  if (!me || !target || target === from) { setTimeout(done, 120); return }
  const [x, y] = layoutOf(target)
  const sheet = app.querySelector('.g-sheet')
  if (sheet) sheet.style.transform = 'translateY(110%)', sheet.style.transition = 'transform .2s'
  app.querySelectorAll('.g-scrim').forEach((el) => el.remove())
  me.classList.add('walk')
  me.style.left = `${x}%`
  me.style.top = `${y}%`
  setTimeout(done, 450)
}

function gameAct(act, button) {
  const district = districtNow()
  if (act === 'stat') {
    ui.tip = ui.tip === button.dataset.k ? '' : button.dataset.k
    blip(520)
    paint()
    clearTimeout(gameAct.t)
    gameAct.t = setTimeout(() => { if (ui.tip) { ui.tip = ''; paint() } }, 5000)
    return true
  }
  if (act === 'skip-morning') { endMorning(true); return true }
  if (act === 'talk-reply' && ui.talk) {
    const index = Number(button.dataset.i)
    const said = button.textContent.trim()
    const res = replyTo(save.run, ui.talk.id, index)
    if (res) {
      ui.talk = { ...ui.talk, res, said }
      const titled = addIdentity(save.run, ['bongani', 'lindiwe', 'ruan'].includes(ui.talk.id) ? { leader: 1 } : res.closeDelta > 0 ? { socialite: 1 } : {})
      if (titled && titled.level !== 'new') save.run.queue.push(identityCard(save.run, titled))
      const done = checkGoals(save.run)
      if (done.length) { flash(`\u{1F3AF} Goal done: ${goalText(save.run, done[0])}`); blip(1320) }
      window.dispatchEvent(new CustomEvent('mzansi-talk-react', { detail: { tone: res.tone } }))
      blip(res.tone === 'bad' ? 330 : 880)
      persist()
      // The reply leads somewhere: do it now, with their answer as the first line.
      if (DOING.has(res.act)) { talkAct(res.act, res.answer); return true }
    }
    paint()
    return true
  }
  if (act === 'moment' && save.run?.queue?.[0]?.kind === 'moment') {
    const picked = chooseMoment(save.run, save.run.queue[0].momentId, Number(button.dataset.i))
    if (picked?.titled && picked.titled.level !== 'new') save.run.queue.push(identityCard(save.run, picked.titled))
    const done = checkGoals(save.run)
    if (done.length) flash(`\u{1F3AF} Goal done: ${goalText(save.run, done[0])}`)
    blip(880)
    persist()
    paint()
    return true
  }
  if (act === 'goals' && save.run?.goals) {
    save.run.queue = [goalsCard(save.run), ...save.run.queue.filter((card) => card.kind !== 'goals')]
    paint()
    return true
  }
  if (act === 'talk-act' && ui.talk) { talkAct(button.dataset.kind); return true }
  if (act === 'talk-menu' && ui.talk) { ui.talk = { id: ui.talk.id, menu: true }; paint(); return true }
  if (act === 'talk-item' && ui.talk) {
    const item = MENUS[ui.talk.id]?.items.find((i) => i.id === button.dataset.item)
    if (item?.sizes) { ui.talk = { id: ui.talk.id, item: item.id }; paint() } else if (item) buyFood(item.id)
    return true
  }
  if (act === 'talk-size' && ui.talk?.item) { buyFood(ui.talk.item, button.dataset.size); return true }
  if (act === 'talk-eat' && ui.talk?.bought) { eatFood(button.dataset.how === 'sit'); return true }
  if (act === 'talk-more' && ui.talk) { ui.talk = { id: ui.talk.id }; paint(); return true }
  if (act === 'talk-bye') { endTalk({ away: button.dataset.away === '1' }); paint(); return true }
  if (act === 'talk-phone') { endTalk(); go('profile'); setTimeout(() => app.querySelector('.phone-card')?.scrollIntoView({ block: 'center' }), 50); return true }
  if (act === 'gear') { ui.gear = !ui.gear; ui.confirmReset = false; paint(); return true }
  if (act === 'install-go') { promptInstall(); return true }
  if (act === 'sound') {
    try { localStorage.setItem('mzansiville.sound', soundOn() ? 'off' : 'on') } catch { /* private mode */ }
    setMuted(!soundOn())
    blip(880)
    paint()
    return true
  }
  if (act === 'reset') { ui.confirmReset = true; paint(); return true }
  if (act === 'lecture-go') { delete save.run.lectureCard; persist(); go(lectureWanted(save.run) ? 'lecture' : `place/${venueFor(save.run).id}`); return true }
  if (act === 'hint-ok') { seenMapHint(); paint(); return true }
  if (act === 'place-open') {
    seenMapHint()
    blip(600)
    ui.gear = false
    // From the 2D map (with 3D available): back to the 3D view and walk there.
    if (!viewFlags.world && viewFlags.gl && button.closest('.g-map')) {
      try { localStorage.setItem('mzansiville.view', '3d') } catch { /* ignore */ }
      const id = button.dataset.id
      go('play')
      paint()
      setTimeout(() => window.dispatchEvent(new CustomEvent('mzansi-go-place', { detail: { id } })), 400)
      return true
    }
    go(`place/${button.dataset.id}`)
    return true
  }
  if (act === 'close-sheet') { go('play'); return true }
  if (act === 'spot') {
    // Walk to a spot in the place: the sheet closes so you watch yourself go.
    blip(600)
    go('play')
    const queueOf = { 'cafeteria:queue': 'auntie_pinky', 'quad:stall': 'mam_gugu' }[`${button.dataset.place}:${button.dataset.spot}`]
    if (queueOf) { setTimeout(() => joinQueue(queueOf, false), 300); return true }
    window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: { place: button.dataset.place, spot: button.dataset.spot } }))
    return true
  }
  if (act === 'to-night') {
    while (save.run.mode === 'play' && save.run.phase !== 'night') advancePhase(district, save.run)
    flash(phaseNotice())
    finishTurn()
    return true
  }
  if (act === 'nav' || act === 'new') ui.gear = false
  if (act === 'dismiss' && button.dataset.pair && save.run?.queue?.[1]) dismissCard(save.run, save.run.queue[1].id)
  if (act === 'dismiss' || act === 'choice' || act === 'snooze') setTimeout(() => { if (save.run?.mode === 'play' && !save.run.queue.length) { autoAdvance(); persist(); paint() } }, 0)
  return false
}

// The next day: you wake in your room (the wake-up plays), today's goals come after.
function startNextDay() {
  const district = districtNow()
  beginNextDay(district, save.run, new Date())
  const home = homePlaceId(district, save.run.character.residence)
  save.run.at = home
  ui.delta = null
  finishTurn()
  // You wake up in your room, not on the path outside; today's goals come after. (Day 2's
  // first morning in res plays the whole wake-up itself: world/morning.js.)
  if (save.run.mode === 'play' && document.body.dataset.world === '1' && !morningWanted(save.run)) {
    const held = save.run.queue.filter((card) => card.kind === 'goals')
    save.run.queue = save.run.queue.filter((card) => card.kind !== 'goals')
    paint()
    setTimeout(() => window.dispatchEvent(new CustomEvent('mzansi-act', { detail: { placeId: home, actionId: 'talk_wake', commit() { save.run.queue = [...held, ...save.run.queue]; persist(); paint() } } })), 600)
  }
}

function finishTurn() {
  persist()
  const mode = save.run?.mode
  // (owner, 6 Nov) No "end of the day" screen: you slept, so the next day starts (you wake
  // in your room; last night's text comes with the day's goals).
  if (mode === 'summary') { startNextDay(); return }
  // The day's time ran out: night falls, one soft line, and you carry on.
  if (mode === 'play' && save.run.lateNight === save.run.day && save.run.lateNightShown !== save.run.day) {
    save.run.lateNightShown = save.run.day
    persist()
    flash('\u{1F319} Late night on campus')
  }
  if (mode === 'over') go('over')
  else if (mode === 'locked') go('locked')
  else go('play')
  if (mode === 'summary' || mode === 'over') sync()
}

// Skipping your name: a name to start with (change it any time from your card).
const DEFAULT_NAMES = { female: ['Thandi', 'Lerato', 'Naledi', 'Emma', 'Chloe'], male: ['Sipho', 'Luyanda', 'Thabo', 'Daniel', 'Ethan'] }
function enrolDefaultName() {
  const list = DEFAULT_NAMES[genderOf(draft.avatar)] || DEFAULT_NAMES.female
  return list[Math.floor(Math.random() * list.length)]
}

function readCharacter() {
  captureForm()
  const district = districtNow()
  const name = draft.name.trim()
  const handle = draft.handle.trim().replace(/^@/, '')
  const errors = []
  if (name.length < 2 || name.length > 24) errors.push('Name needs 2 to 24 characters.')
  if (!district.residences.some((row) => row.name === draft.residence)) errors.push('Pick a residence.')
  if (!district.courses.includes(draft.course)) errors.push('Pick a course.')
  if (handle && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) errors.push('Handles use letters, numbers, dots, and underscores.')
  return {
    errors,
    character: {
      name,
      residence: draft.residence,
      course: draft.course,
      handle,
      avatar: { ...draft.avatar },
    },
  }
}

async function loadChat() {
  try {
    const result = await loadLobby()
    chat.source = result.source
    chat.offline = result.source === 'offline'
    if (result.source === 'mock') {
      const mine = (save.mockChat || []).filter((m) => Date.now() - new Date(m.created_at).getTime() < 864e5)
      chat.messages = mine.slice().reverse().concat(result.messages)
    } else chat.messages = result.messages
    chat.names = result.names
    chat.error = result.error
  } catch {
    chat.source = 'offline'
    chat.offline = true
  }
  if (save.suspended) chat.error = 'Your account is suspended.'
  paint()
}

async function loadBoard() {
  try {
    const result = await loadBoardRows()
    board.source = result.source
    board.rows = result.rows
    board.error = result.error
  } catch {
    board.source = 'offline'
    board.rows = []
  }
  paint()
}

async function loadAdmin() {
  admin.allowed = save.role === 'admin'
  if (!authEnabled || !admin.allowed) {
    paint()
    return
  }
  const result = await fetchReports()
  admin.reports = result.rows
  admin.notice = result.error
  paint()
}

// #/smooth: the newest 5,000 smooth_reports rows in the range, aggregated in the browser.
// (?smooth=test with window.__smoothRows set: those rows instead, for the tests.)
async function loadSmooth() {
  admin.allowed = save.role === 'admin'
  const injected = new URLSearchParams(location.search).get('smooth') === 'test' && Array.isArray(window.__smoothRows)
  smoothPage.injected = injected
  if (injected) {
    smoothPage.rows = window.__smoothRows
    smoothPage.error = ''
    smoothPage.loading = false
    paint()
    return
  }
  if (!authEnabled || !admin.allowed) {
    paint()
    return
  }
  smoothPage.loading = true
  paint()
  const since = new Date(Date.now() - (smoothPage.range === '24h' ? 24 : 24 * 7) * 3600 * 1000).toISOString()
  const result = await fetchSmoothReports(since)
  smoothPage.rows = result.rows
  smoothPage.error = result.error
  smoothPage.loading = false
  paint()
}

async function merge(session) {
  if (!session || merging) return
  merging = true
  try {
    const remote = await pullProfile(session.user.id)
    save.role = remote?.role || 'player'
    save.suspended = Boolean(remote?.suspended)
    if (remote?.state && (!save.run || (remote.state.day || 0) > (save.run.day || 0))) save.run = remote.state
    if (save.run) {
      save.run.userId = session.user.id
      save.run.promptSave = false
      await pushProfile(save.run)
    }
    const districtId = save.run?.character?.districtId || defaultDistrictId
    edits = await fetchEventEdits(districtId)
    persist()
    paint()
  } finally {
    merging = false
  }
}

async function bootAuth() {
  if (!authEnabled) return
  const session = await currentSession()
  if (session) await merge(session)
  const client = await getClient()
  client?.auth.onAuthStateChange((event, next) => {
    if (next && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) merge(next)
  })
  if (!chatUnsub) {
    chatUnsub = subscribeLobby(() => {
      if (route().name === 'chat') loadChat()
    })
  }
}

app.addEventListener('focusin', (event) => {
  if (event.target.id === 'composer' && !save.run?.userId && chat.source !== 'mock' && chat.source !== 'offline') {
    event.target.blur()
    chat.prompt = true
    paint()
  }
})

app.addEventListener('input', (event) => {
  if (event.target.id === 'pc-bio') { const n = app.querySelector('[data-pc-count]'); if (n) n.textContent = `${event.target.value.length}/${event.target.maxLength}` }
  if (event.target.id === 'bio') { draft.bio = event.target.value; const n = app.querySelector('[data-bio-count]'); if (n) n.textContent = `${event.target.value.length}/${event.target.maxLength}` }
  if (event.target.id === 'name') {
    draft.name = event.target.value
    // (the handle follows your name until you type your own)
    if (!draft.handleEdited && app.querySelector('.en #handle')) {
      draft.handle = candidates(draft.name)[0] || ''
      app.querySelector('.en #handle').value = draft.handle
    }
    enrolCardText()
  }
  if (event.target.id === 'handle' && app.querySelector('.en #handle')) {
    draft.handleEdited = true
    const tidy = tidyHandle(event.target.value)
    if (tidy !== event.target.value) event.target.value = tidy
    const note = app.querySelector('[data-handle-note]')
    if (note) { const r = checkRules(tidy); note.textContent = r.ok ? `@${tidy} looks good.` : r.why }
  }
  if (event.target.id === 'handle') { draft.handle = event.target.value; enrolCardText() }
  if (event.target.id === 'email') draft.email = event.target.value
  if (event.target.id === 'composer') chat.draft = event.target.value
  if (event.target.id === 'residence') draft.residence = event.target.value
  if (event.target.id === 'course') draft.course = event.target.value
  if (['name', 'handle', 'residence', 'course'].includes(event.target.id)) syncCard()
})

// Enrolment's student card (src/ui/enrol.js idCard): your name and @handle as you type them.
function enrolCardText() {
  const name = app.querySelector('.en-id [data-card-name]')
  if (name) { const n = draft.name.trim().replace(/^@/, ''); name.textContent = n || 'Your name'; name.classList.toggle('ph', !n) }
  const handle = app.querySelector('.en-id [data-card-handle]')
  if (handle) { const h = tidyHandle(draft.handle); handle.textContent = h ? `@${h} · ` : '' }
}

function syncCard() {
  const set = (key, text) => { const el = app.querySelector(`[data-card="${key}"]`); if (el && el.textContent !== text) el.textContent = text }
  const h = draft.handle.trim().replace(/^@/, '')
  set('name', draft.name.trim() || 'Your name')
  set('residence', draft.residence || 'House: choose')
  // (the card wears the house colours)
  const card = app.querySelector('.cc-id')
  const house = districtNow().houses?.find((h) => h.name === draft.residence)
  if (card) { card.style.setProperty('--h1', house?.main || ''); card.style.setProperty('--h2', house?.accent || ''); card.toggleAttribute('data-house', Boolean(house)) }
  set('course', draft.course || 'Course: choose')
  set('handle', h ? '@' + h : '@handle')
  const todo = [draft.name.trim().length >= 2, !!draft.residence, !!draft.course].filter((ok) => !ok).length
  const ready = app.querySelector('[data-card="ready"]')
  if (ready) { ready.classList.toggle('ok', !todo); const t = todo ? todo + ' to go' : 'Ready \u2713'; if (ready.textContent !== t) ready.textContent = t }
}

app.addEventListener('change', (event) => {
  if (event.target.id === 'residence') { draft.residence = event.target.value; syncCard() }
  if (event.target.id === 'course') { draft.course = event.target.value; syncCard() }
  if (event.target.id === 'event-id') {
    admin.eventId = event.target.value
    paint()
  }
})

app.addEventListener('click', async (event) => {
  if (new URLSearchParams(location.search).get('shot')) return
  const place = event.target.closest('[data-place]')
  const button = event.target.closest('[data-act]')
  // Same-page links (Leaderboards while on the board) and already-chosen options
  // still answer the tap, so no tap ever does nothing.
  const link = event.target.closest('a[href^="#/"]')
  if (link && link.getAttribute('href') === location.hash) { pulse(link, 'You\u2019re already here'); return }
  if (button && button.dataset.act !== 'sound' && button.dataset.act !== 'smooth-switch' && (button.getAttribute('aria-pressed') === 'true' || button.hasAttribute('aria-current'))) {
    pulse(button, button.dataset.act === 'view' ? 'Already in this view' : button.hasAttribute('aria-current') ? 'You\u2019re already here' : 'Already selected \u2713')
    if (button.hasAttribute('aria-current')) window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (!button && !place) return
  captureForm()
  const act = button?.dataset.act
  if (act === 'install-tap') { event.preventDefault(); installTap(); return }
  if (act === 'copy-link') {
    const note = app.querySelector('.in-copied')
    const url = location.href
    try { await navigator.clipboard.writeText(url); if (note) note.textContent = 'Link copied. Open Safari and paste it.' } catch { if (note) note.textContent = `Copy this link: ${url}` }
    return
  }
  const district = districtNow()
  if (act === 'pc-edit') { ui.cardEdit = true; ui.cardNotice = null; paint(); return }
  if (act === 'pc-cancel') { ui.cardEdit = false; ui.cardNotice = null; paint(); return }
  if (act === 'pc-stats') { ui.cardStats = !ui.cardStats; paint(); return }
  if (act === 'pc-save') { saveCardForm(); return }

  if (place && !act) {
    go(`place/${place.dataset.place}`)
    return
  }
  if (act === 'start') {
    draft = emptyDraft()
    go(save.rulesAccepted ? 'new' : 'rules')
    return
  }
  if (act === 'home') {
    if (route().name === 'morning' && save.run?.morningStart && !window.confirm('Leave the morning? This morning starts over next time.')) return
    ui.gear = false
    stopIntro()
    persist()
    go('title')
    return
  }
  if (act === 'edit-char' && save.run) {
    const c = save.run.character
    const locked = nextChange(c)
    draft = { ...emptyDraft(), name: c.name, handle: c.handle || '', handleEdited: true, handleLocked: locked ? locked.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' }) : '', residence: c.residence, course: c.course, handle: c.handle || '', avatar: { ...c.avatar }, bio: c.bio || '', vibe: c.vibe || '', looking: c.looking || '', from: fromPlace(c.from), story: { funding: c.funding, path: c.path, dream: c.dream, interest: c.interest }, edit: true }
    ui.gear = false
    go('new')
    return
  }
  if (act === 'delete-ask') { ui.confirmDelete = true; paint(); return }
  if (act === 'delete-no') { ui.confirmDelete = false; paint(); return }
  // Start over (the start screen): a fresh student; the rules stay agreed.
  if (act === 'restart-ask') { ui.confirmRestart = true; paint(); return }
  if (act === 'restart-no') { ui.confirmRestart = false; paint(); return }
  if (act === 'restart-yes') {
    ui.confirmRestart = false
    save.run = null
    draft = emptyDraft()
    persist()
    go('new')
    return
  }
  if (act === 'delete-yes') {
    ui.confirmDelete = false
    save.run = null
    draft = emptyDraft()
    persist()
    go('title')
    return
  }
  // The error log: copy it all (to send to the owner), or clear it.
  if (act === 'errors-copy') {
    navigator.clipboard?.writeText(JSON.stringify(readErrors(), null, 2)).then(() => toast('Copied'), () => toast('Copy failed'))
    return
  }
  if (act === 'errors-clear') {
    clearErrors()
    paint()
    return
  }
  if (act === 'sound' && (route().name === 'settings' || route().name === 'new')) {
    try { localStorage.setItem('mzansiville.sound', soundOn() ? 'off' : 'on') } catch { /* private mode */ }
    setMuted(!soundOn())
    paint()
    return
  }
  if (act === 'smooth-range') {
    smoothPage.range = button.dataset.v === '24h' ? '24h' : '7d'
    smoothPage.place = ''
    loadSmooth()
    return
  }
  if (act === 'smooth-device') {
    smoothPage.device = smoothPage.device === button.dataset.id ? '' : button.dataset.id
    paint()
    return
  }
  if (act === 'smooth-place') {
    smoothPage.place = smoothPage.place === button.dataset.id ? '' : button.dataset.id
    paint()
    return
  }
  if (act === 'smooth-switch') {
    smooth.setSwitch(!smooth.switchOn())
    paint()
    return
  }
  if (act === 'continue' && save.run) {
    const mode = save.run.mode
    go(mode === 'locked' ? 'locked' : mode === 'over' ? 'over' : mode === 'summary' ? 'summary' : 'play')
    return
  }
  if (act === 'nav') {
    ui.gear = false
    go(button.dataset.go)
    return
  }
  if (act === 'open-map') {
    window.dispatchEvent(new CustomEvent('mzansi-open-map'))
    return
  }
  if (act === 'view') {
    const mode = button.dataset.mode
    try { localStorage.setItem('mzansiville.view', mode === 'map' ? 'map' : '3d') } catch { /* ignore */ }
    if (mode !== 'map') {
      try { localStorage.setItem('mzansiville.camera', mode) } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: mode }))
    }
    paint()
    return
  }
  if (act === 'cam') {
    window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: button.dataset.mode }))
    paint()
    return
  }
  if (act === 'help') {
    window.dispatchEvent(new CustomEvent('mzansi-help'))
    return
  }
  if (act === 'hud') {
    const next = localStorage.getItem('mzansiville.hud') === 'icons' ? 'full' : 'icons'
    localStorage.setItem('mzansiville.hud', next)
    paint()
    return
  }
  if (act === 'toast') {
    hiddenToasts.add(button.dataset.toast)
    button.remove()
    return
  }
  if (act === 'minimise-card') {
    cardMini = true
    paint()
    return
  }
  if (act === 'restore-card') {
    cardMini = false
    paint()
    return
  }
  if (act === 'agree') {
    if (!document.getElementById('agree')?.checked) {
      draft.error = 'Tick the box to continue.'
      const note = document.querySelector('.legal')
      if (note && !note.querySelector('.error')) {
        const p = document.createElement('p')
        p.className = 'error'
        p.textContent = draft.error
        note.appendChild(p)
      }
      return
    }
    save.rulesAccepted = true
    persist()
    go('new')
    return
  }
  // ---- Enrolment: look, who you are, your vibe, your card (src/ui/enrol.js) ----
  if (act === 'enrol-pick') {
    captureForm()
    const { k, v } = button.dataset
    // (a second tap on the chosen one clears an optional pick)
    draft[k] = draft[k] === v && ['from', 'vibe', 'looking', 'bio'].includes(k) ? '' : v
    if (k === 'bio') draft.notice = ''
    if (k === 'handle') { draft.handleEdited = true; draft.handleSuggest = []; draft.handleNote = `@${v} is free.` }
    draft.error = ''
    paint()
    return
  }
  if (act === 'enrol-next' || act === 'enrol-skip') {
    captureForm()
    const skip = act === 'enrol-skip'
    if (draft.step === 'who') {
      const raw = draft.name.trim()
      if (skip && raw.length < 2) draft.name = enrolDefaultName()
      if (skip && !draft.residence) draft.residence = district.houses?.[Math.floor(Math.random() * (district.houses?.length || 1))]?.name || district.residences[0]?.name || ''
      const name = draft.name.trim().replace(/^@/, '')
      if (name.length < 2) { draft.error = 'Your name needs at least 2 letters.'; paint(); return }
      if (filterText(name).blocked) { draft.error = 'Pick another name.'; paint(); return }
      // The @handle: the rules here, then free on campus (Supabase); taken: three free ones.
      draft.handle = tidyHandle(draft.handle) || (skip || !draft.handleEdited ? (await suggestFor(name))[0] || '' : '')
      const rules = checkRules(draft.handle)
      if (!rules.ok) { draft.error = rules.why; draft.handleSuggest = await suggestFor(name, draft.handle); paint(); return }
      const status = await handleStatus(draft.handle)
      if (status === 'taken') {
        if (skip) draft.handle = (await suggestFor(name, draft.handle))[0] || draft.handle
        else { draft.error = `@${draft.handle} is taken.`; draft.handleSuggest = await suggestFor(name, draft.handle); paint(); return }
      }
      draft.handleSuggest = []
      draft.handleNote = status === 'free' ? `@${draft.handle} is yours if you want it.` : ''
      if (!draft.residence) { draft.error = 'Tap the house you live in.'; paint(); return }
    }
    if (draft.step === 'vibe') {
      if (!draft.course) draft.course = district.courses[0]
      const res = cleanBio(draft.bio || '')
      if (res.blocked) { draft.notice = 'That line can’t go on your card. Try another.'; paint(); return }
      draft.notice = res.removed.join(' ')
      draft.bio = res.text
    }
    draft.error = ''
    const i = ENROL_STEPS.indexOf(draft.step)
    draft.step = ENROL_STEPS[Math.min(ENROL_STEPS.length - 1, i + 1)]
    paint()
    window.scrollTo(0, 0)
    return
  }
  if (act === 'enrol-back') {
    captureForm()
    const i = ENROL_STEPS.indexOf(draft.step)
    draft.step = ENROL_STEPS[Math.max(0, i - 1)]
    draft.error = ''
    paint()
    window.scrollTo(0, 0)
    return
  }
  if (act === 'enrol-enter') {
    // Claim the handle (someone may have taken it a moment ago: back to step 2 if so).
    const was = save.run?.character?.handle || ''
    if (tidyHandle(draft.handle) !== was) {
      const claim = await claimHandle(draft.handle)
      if (claim === 'taken' || claim === 'invalid') {
        draft.step = 'who'
        draft.error = claim === 'taken' ? `@${tidyHandle(draft.handle)} was just taken.` : checkRules(draft.handle).why
        draft.handleSuggest = await suggestFor(draft.name, draft.handle)
        paint()
        return
      }
      if (claim === 'cooldown') { draft.step = 'who'; draft.error = 'You changed your handle less than 30 days ago.'; paint(); return }
    }
    const card = draftCard(district, draft)
    const character = {
      name: card.name,
      handle: card.handle,
      residence: draft.residence,
      course: draft.course || district.courses[0],
      avatar: { ...draft.avatar },
      bio: card.bio,
      vibe: draft.vibe,
      looking: draft.looking,
      from: draft.from,
      handleChangedAt: tidyHandle(draft.handle) !== (save.run?.character?.handle || '') ? new Date().toISOString() : save.run?.character?.handleChangedAt,
    }
    if (draft.edit && save.run) {
      save.run.character = { ...save.run.character, ...character }
      draft = emptyDraft()
      persist()
      saveMyCard(save.run)
      go('title')
      return
    }
    save.run = createRun(district, { ...character, ...storyWithDefaults(draft.story) })
    draft = emptyDraft()
    persist()
    saveMyCard(save.run)
    go('play')
    return
  }
  if (act === 'avatar') {
    draft.avatar = { ...draft.avatar, [button.dataset.part]: button.dataset.id }
    // (a new gender keeps the outfit only if that gender has it: men have no dress)
    if (button.dataset.part === 'gender' && !outfitsFor(button.dataset.id).some((o) => o.id === draft.avatar.outfit)) draft.avatar.outfit = 'hoodie'
    // (and Curvy is a women's body)
    if (button.dataset.part === 'gender' && button.dataset.id === 'male') draft.avatar.body = 'regular'
    // The preview changes at once; the options stay where you scrolled them (down the
    // page, and along each row of cards).
    const y = window.scrollY
    const rows = [...app.querySelectorAll('.en-strip')].map((el) => el.scrollLeft)
    paint()
    app.querySelectorAll('.en-strip').forEach((el, i) => { el.scrollLeft = rows[i] || 0 })
    window.scrollTo(0, y)
    return
  }
  if (act === 'begin') {
    const read = readCharacter()
    if (read.errors.length) {
      draft.error = read.errors[0]
      paint()
      return
    }
    draft.error = ''
    // Part 1 is your look; part 2 is your story, then campus.
    if (!draft.edit && draft.step !== 'story') {
      draft.step = 'story'
      paint()
      window.scrollTo(0, 0)
      return
    }
    if (draft.edit && save.run) {
      save.run.character = { ...save.run.character, ...read.character }
      draft = emptyDraft()
      persist()
      go('title')
      return
    }
    save.run = createRun(district, { ...read.character, ...storyWithDefaults(draft.story) })
    draft.step = 'look'
    persist()
    go('play')
    return
  }
  if (act === 'story') {
    const { k, id } = button.dataset
    draft.story = { ...(draft.story || {}), [k]: id }
    // The dream follows the path until you pick a dream yourself.
    if (k === 'path' && !draft.storyDream) draft.story.dream = PATH_DREAM[id]
    if (k === 'dream') draft.storyDream = true
    paint()
    return
  }
  if (act === 'story-back') {
    draft.step = 'look'
    paint()
    return
  }
  if (act === 'place') {
    go(`place/${button.dataset.id}`)
    return
  }
  if (!save.run && needsRun(route().name)) {
    go('title')
    return
  }
  if (gameAct(act, button)) return
  if (act === 'do' && button.dataset.id === 'caf_queue') {
    // The breakfast queue is the queue: stand in it, then order at the front.
    go('play')
    setTimeout(() => joinQueue('auntie_pinky', false), 300)
    return
  }
  if (act === 'do' && LECTURE_ACTIONS.has(button.dataset.id) && lectureWanted(save.run)) {
    // Attending the day-1 lecture from a sheet or the map plays the lecture itself.
    blip()
    go('lecture')
    return
  }
  // Greenway Grocer: buy at the till (money drops, the fridge fills, or it counts at once).
  if (act === 'buy' && save.run) {
    const res = buy(district, save.run, button.dataset.id)
    toast(res.ok ? res.text : `\u274C ${res.text}`)
    if (res.ok) {
      window.dispatchEvent(new CustomEvent('mzansi-wave', { detail: { gesture: 'interact-right' } }))
      blip(500)
    }
    persist()
    paint()
    return
  }
  // Out of something: walk to Greenway (its card opens at the door).
  if (act === 'go-greenway') {
    go('play')
    setTimeout(() => window.dispatchEvent(new CustomEvent('mzansi-go-place', { detail: { id: 'greenway' } })), 50)
    return
  }
  if (act === 'do') {
    if (choiceWaiting()) {
      cardMini = false
      paint()
      return
    }
    const id = button.dataset.id
    if (document.body.dataset.world === '1') {
      button.classList.add('busy')
      blip()
      const sheet = app.querySelector('.g-sheet')
      if (sheet) sheet.style.transform = 'translateY(110%)', sheet.style.transition = 'transform .2s'
      app.querySelectorAll('.g-scrim').forEach((el) => el.remove())
      window.dispatchEvent(new CustomEvent('mzansi-act', {
        detail: {
          placeId: button.dataset.place || '',
          actionId: id,
          commit() {
            const before = { ...save.run.stats }
            const result = applyAction(district, save.run, id)
            if (!result.ok) { ui.notice = result.error; paint(); return }
            save.run.at = button.dataset.place || save.run.at
            ui.delta = Object.fromEntries(Object.keys(before).map((k) => [k, Math.round(save.run.stats[k] - before[k])]))
            autoAdvance()
            finishTurn()
            // The bus to town is the way to Greenway Grocer: off the bus, it's your stop.
            if (id === 'bus_town') setTimeout(() => window.dispatchEvent(new CustomEvent('mzansi-go-place', { detail: { id: 'greenway' } })), 300)
          },
        },
      }))
      return
    }
    walkThen(button, () => {
      const before = { ...save.run.stats }
      const result = applyAction(district, save.run, id)
      if (!result.ok) { ui.notice = result.error; paint(); return }
      save.run.at = button.dataset.place || save.run.at
      ui.delta = Object.fromEntries(Object.keys(before).map((k) => [k, Math.round(save.run.stats[k] - before[k])]))
      autoAdvance()
      finishTurn()
    })
    return
  }
  if (act === 'phase') {
    if (choiceWaiting()) {
      cardMini = false
      paint()
      return
    }
    advancePhase(district, save.run)
    autoAdvance()
    flash(phaseNotice())
    finishTurn()
    return
  }
  if (act === 'choice') {
    cardMini = false
    const card = save.run.queue[0]
    if (card?.eventId) chooseEvent(district, save.run, card.eventId, Number(button.dataset.i))
    persist()
    paint()
    return
  }
  if (act === 'dismiss') {
    cardMini = false
    const card = save.run.queue[0]
    if (card) dismissCard(save.run, card.id)
    if (card?.kind === 'milestone') save.run.milestoneSeen = true
    persist()
    paint()
    return
  }
  if (act === 'snooze') {
    save.run.saveSnooze = true
    save.run.promptSave = false
    persist()
    paint()
    return
  }
  if (act === 'next') { startNextDay(); return }
  if (act === 'restart') {
    save.run = createRun(district, save.run.character)
    persist()
    go('play')
    return
  }
  if (act === 'new') {
    save.run = null
    draft = emptyDraft()
    persist()
    go('new')
    return
  }
  if (act === 'open-shop') {
    go('shop')
    return
  }
  if (act === 'leave') {
    if (!district.shop.url) {
      draft.notice = 'The shop link is not set yet.'
      paint()
      return
    }
    window.open(district.shop.url, '_blank', 'noopener')
    return
  }
  if (act === 'share-day' || act === 'share-milestone') {
    shareMilestone = act === 'share-milestone' ? (save.run?.queue || []).find((c) => c.id === button.dataset.id) || null : null
    go('share')
    return
  }
  if (act === 'share') {
    const note = document.getElementById('copy-note')
    if (note) note.textContent = 'Making your image\u2026'
    const blob = await (shareBlob || exportCard(document.getElementById('share-card')))
    if (!blob) return
    const name = `soft-life-day${save.run?.day || 1}.png`
    const file = new File([blob], name, { type: 'image/png' })
    const url = `https://${shareUrl()}`
    const text = shareMilestone ? `${save.run.character.name} unlocked ${shareMilestone.title} in Soft Life` : `${save.run.character.name}'s day ${save.run.day} in Soft Life`
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Soft Life', text, url })
      } catch { /* cancelled */ }
    } else {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(link.href), 4000)
      if (note) note.textContent = `Saved ${name}`
    }
    return
  }
  if (act === 'copy') {
    try { await navigator.clipboard.writeText(`https://${shareUrl()}`) } catch { /* no clipboard */ }
    const note = document.getElementById('copy-note')
    if (note) note.textContent = 'Link copied.'
    return
  }
  if (act === 'google') {
    const result = await signInGoogle()
    draft.error = result.error
    draft.notice = result.error ? '' : 'Opening Google.'
    paint()
    return
  }
  if (act === 'magic') {
    const email = draft.email.trim()
    if (!email.includes('@')) {
      draft.error = 'Enter an email address.'
      paint()
      return
    }
    const result = await signInEmail(email)
    draft.error = result.error
    draft.notice = result.error ? '' : 'Check your email for the link.'
    paint()
    return
  }
  if (act === 'signout') {
    await signOut()
    if (save.run) save.run.userId = null
    save.role = 'player'
    persist()
    paint()
    return
  }
  if (act === 'msg-menu') {
    chat.menuId = chat.menuId === button.dataset.id ? '' : button.dataset.id
    chat.reportId = ''
    chat.notice = ''
    paint()
    return
  }
  if (act === 'prompt-close') {
    chat.prompt = false
    paint()
    return
  }
  if (act === 'chat-retry' || act === 'board-retry') {
    toast('Trying again\u2026')
    if (act === 'chat-retry') { chat.source = 'loading'; paint(); await loadChat() } else { board.source = 'loading'; paint(); await loadBoard() }
    const offline = act === 'chat-retry' ? chat.offline || chat.source === 'offline' : board.source === 'offline' || board.offline
    toast(offline ? 'Still offline. Showing the campus sample for now.' : 'Up to date \u2713')
    paint()
    return
  }
  if (act === 'send') {
    const mock = chat.source === 'mock'
    if (!save.run?.userId && !mock) {
      chat.prompt = true
      paint()
      return
    }
    if (save.suspended) {
      chat.error = 'Your account is suspended.'
      paint()
      return
    }
    const checked = filterText(chat.draft || '')
    if (!checked.text) return
    if (checked.blocked) {
      chat.error = 'That message has a slur in it, so it wasn\u2019t sent.'
      chat.notice = ''
      paint()
      return
    }
    const gate = canSend(save.chatStamps || [])
    if (!gate.ok) {
      chat.error = gate.reason
      paint()
      return
    }
    if (mock) {
      save.mockChat = (save.mockChat || []).concat({ id: 'mine-' + Date.now(), user_id: save.run?.userId || 'you', name: save.run?.character.name || 'You', residence: save.run?.character.residence || '', body: checked.text, masked: checked.masked, sample: true, created_at: new Date().toISOString() })
      save.chatStamps = gate.stamps.concat(Date.now())
      chat.draft = ''
      chat.error = ''
      chat.notice = checked.masked ? 'Sent, with a word filtered. (Sample mode: only on this phone.)' : 'Sent. (Sample mode: only on this phone.)'
      persist()
      await loadChat()
      return
    }
    const result = await sendLobby(save.run.userId, checked.text)
    chat.error = result.error
    chat.notice = !result.error && checked.masked ? 'Sent, with a word filtered.' : ''
    if (!result.error) {
      save.chatStamps = gate.stamps.concat(Date.now())
      chat.draft = ''
      persist()
      await loadChat()
    } else paint()
    return
  }
  if (act === 'mute') {
    const id = button.dataset.id
    save.mutes = save.mutes.includes(id) ? save.mutes : save.mutes.concat(id)
    chat.menuId = ''
    chat.notice = 'Muted. You won\u2019t see their messages on this phone.'
    persist()
    paint()
    return
  }
  if (act === 'block') {
    const id = button.dataset.id
    save.blocks = save.blocks.includes(id) ? save.blocks : save.blocks.concat(id)
    chat.menuId = ''
    chat.notice = 'Blocked.'
    if (save.run?.userId && chat.source === 'live') {
      try { await storeBlock(save.run.userId, id) } catch { /* local block still applies */ }
    }
    persist()
    paint()
    return
  }
  if (act === 'report') {
    if (!save.run?.userId && chat.source !== 'mock') {
      chat.prompt = true
      chat.menuId = ''
      paint()
      return
    }
    chat.reportId = button.dataset.id
    paint()
    return
  }
  if (act === 'reason') {
    const message = chat.messages.find((item) => item.id === button.dataset.id)
    chat.menuId = ''
    chat.reportId = ''
    if (message && chat.source === 'mock') {
      chat.notice = 'Report saved. (Sample mode: nothing was sent.)'
    } else if (message && save.run?.userId) {
      try {
        const result = await fileReport(save.run.userId, message, button.dataset.reason)
        chat.error = result.error
        chat.notice = result.error ? '' : 'Thanks. A moderator will look at it.'
      } catch {
        chat.error = 'Could not send the report. Try again when you\u2019re online.'
      }
    }
    paint()
    return
  }
  if (act === 'board-tab') {
    board.tab = button.dataset.id
    paint()
    return
  }
  if (act === 'board-scope') {
    board.scope = button.dataset.id
    paint()
    return
  }
  if (act === 'suspend') {
    const result = await suspendUser(button.dataset.id, true)
    admin.notice = result.error || 'Suspended.'
    await loadAdmin()
    return
  }
  if (act === 'close-report') {
    const result = await closeReport(button.dataset.id)
    admin.notice = result.error || 'Report closed.'
    await loadAdmin()
    return
  }
  if (act === 'save-event') {
    const labels = [0, 1, 2].map((index) => document.getElementById(`label-${index}`)?.value).filter((value) => value != null)
    const result = await saveEventText(
      district.meta.id,
      document.getElementById('event-id').value,
      document.getElementById('event-title').value,
      document.getElementById('event-body').value,
      labels,
    )
    admin.notice = result.error || 'Event text saved.'
    edits = await fetchEventEdits(district.meta.id)
    paint()
  }
})

window.addEventListener('hashchange', () => {
  const name = route().name
  // QA B02: a screen change always closes the gear menu, so it never sits on top
  // of the new screen and steals its taps (chat Send, Save's magic link).
  ui.gear = false
  ui.confirmReset = false
  endTalk()
  if (needsRun(name) && !save.run) {
    location.hash = '#/'
    return
  }
  paint()
  arm()
  if (name === 'chat') loadChat()
  if (name === 'board') loadBoard()
  if (name === 'admin') loadAdmin()
  if (name === 'smooth') loadSmooth()
})

paint()
smooth.boot() // (smoothness reports: the first screen is up; the title counts once its cover has loaded)
if (route().name === 'smooth') loadSmooth()
// The students' models start loading in the background as the title shows, so the
// creator's student is there the moment it opens.
if (hasGL()) (window.requestIdleCallback || setTimeout)(() => { import('./world/avatar3d.js').then((m) => m.preloadPeople()).catch(() => {}) })
arm()
if (save.run && route().name === 'chat') loadChat()
if (save.run && route().name === 'board') loadBoard()

// The start screen: Enter presses the main button (Enrol, or Continue · day N). A focused
// button or link keeps its own Enter; nothing happens while the start-over confirm is open.
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const start = document.querySelector('.tc .tc-start')
  if (!start || document.querySelector('.tc-restart')) return
  if (event.target?.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return
  event.preventDefault()
  start.click()
})

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (new URLSearchParams(location.search).get('shot')) return
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (document.querySelector('.map-overlay:not([hidden])')) {
    window.dispatchEvent(new CustomEvent('mzansi-close-map'))
    event.preventDefault()
    return
  }
  const card = save.run?.queue?.[0]
  if (!card) return
  if (card.choices) {
    cardMini = true
    paint()
    return
  }
  dismissCard(save.run, card.id)
  persist()
  paint()
})
// Arriving from the website's Install button (?install=1, taken off the address above).
if (window.__installArrival && installMode() !== 'done') {
  if (installMode() === 'ios') setTimeout(openIosSheet, 300)
  else if (route().name === 'title') location.hash = '#/install'
}

bootAuth().catch(() => {})

// ---------- Player cards (build plan, Piece 1a) ----------
// Your card: Edit (the bio filtered on save, saying what was taken out), Stats.
function saveCardForm() {
  const c = save.run?.character
  if (!c) return
  const res = cleanBio(app.querySelector('#pc-bio')?.value || '')
  if (res.blocked) { ui.cardNotice = { bad: true, text: 'That bio has a word we don’t allow. Try other words.' }; paint(); return }
  c.bio = res.text
  c.vibe = app.querySelector('#pc-vibe')?.value || ''
  c.looking = app.querySelector('#pc-looking')?.value || ''
  ui.cardEdit = false
  ui.cardNotice = res.removed.length ? { bad: false, text: `Saved. ${res.removed.join(' ')}` } : { bad: false, text: 'Card saved.' }
  persist()
  saveMyCard(save.run)
  paint()
}

// Someone else's card: tapped on campus, it slides up from the bottom; one tap on the
// scrim, the grab bar or Close puts it away. Wave, Say hi, Add friend, Report.
let sheetFor = ''
let sheetCard = null
let sheetMessage = '' // opened from a line in the chat: that line goes with a report
let sheetKeep = false // opened from the chat: closing it leaves the chat (and its camera) as it was
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
function sheetEl() {
  let el = document.querySelector('.pc-sheet-wrap')
  if (!el) {
    el = document.createElement('div')
    el.className = 'pc-sheet-wrap'
    document.body.append(el)
    el.addEventListener('click', onSheetClick)
  }
  return el
}
function openPlayerCard(id, opts = {}) {
  sheetFor = id
  sheetCard = null
  sheetMessage = String(opts.message || '')
  sheetKeep = Boolean(opts.keep)
  const el = sheetEl()
  el.innerHTML = '<div class="pc-scrim" data-pc="close"></div><aside class="pc-sheet" role="dialog" aria-label="Player card"><button type="button" class="pc-grab" data-pc="close" aria-label="Close"></button><div class="pc-sheet-body"><p class="fine">Loading their card…</p></div></aside>'
  el.hidden = false
  el.dataset.opened = String(Date.now())
  requestAnimationFrame(() => el.classList.add('on'))
  loadCard(id, (card) => { if (sheetFor === id) { sheetCard = card; renderSheet() } })
}
// keep: the conversation goes on (Say hi opens the chat); otherwise it ends and the
// camera eases back out of the two-shot.
function closePlayerCard(keep = false) {
  const el = document.querySelector('.pc-sheet-wrap')
  if (!el) return
  if (!keep && !sheetKeep) window.dispatchEvent(new CustomEvent('mzansi-convo-end'))
  sheetFor = ''
  el.classList.remove('on')
  setTimeout(() => { if (!sheetFor) { el.hidden = true; el.innerHTML = '' } }, 260)
}
function renderSheet(reporting = false) {
  const body = document.querySelector('.pc-sheet-body')
  if (!body || !sheetCard) return
  const house = districtNow().houses?.find((h) => h.name === canonicalHouse(sheetCard.house)) || null
  const friend = (save.run?.friends || []).some((f) => f.id === sheetFor)
  const first = escHtml(String(sheetCard.name || 'them').split(' ')[0])
  const reasons = ['Rude or hateful', 'A bad name or bio', 'Spam or a scam', 'Something else']
  body.innerHTML = `${playerCardHtml(sheetCard, house)}
    ${reporting ? `<div class="pc-report"><p><b>Report ${first}?</b> Pick what is wrong. You won’t see them on campus after this.${sheetMessage ? `<br><small>Their message goes with it: “${escHtml(sheetMessage)}”</small>` : ''}</p>
      ${reasons.map((r) => `<button type="button" data-pc="report-${escHtml(r)}">${escHtml(r)}</button>`).join('')}
      <button type="button" class="ghost" data-pc="report-cancel">Cancel</button></div>`
    : `<div class="pc-sheet-acts">
      <button type="button" data-pc="wave">\u{1F44B} Wave</button>
      <button type="button" data-pc="hi">\u{1F4AC} Say hi</button>
      <button type="button" data-pc="friend"${friend ? ' disabled' : ''}>${friend ? '✓ Friends' : '➕ Add friend'}</button>
      <button type="button" class="bad" data-pc="block">\u{1F6AB} Block</button>
      <button type="button" class="bad wide" data-pc="report">⚑ Report</button>
    </div>
    <button type="button" class="pc-close" data-pc="close">Close</button>`}`
}
function onSheetClick(event) {
  const k = event.target.closest('[data-pc]')?.dataset.pc
  if (!k) return
  const id = sheetFor
  const name = String(sheetCard?.name || 'them').split(' ')[0]
  // (the tap that opened the card ends in a click on the same spot, now the scrim: not a close)
  if (k === 'close' && Date.now() - Number(event.currentTarget.dataset.opened || 0) < 500) return
  if (k === 'close') { closePlayerCard(); return }
  if (k === 'wave') {
    sendPoke(id, 'wave')
    window.dispatchEvent(new CustomEvent('mzansi-wave', { detail: { id } }))
    toast(`\u{1F44B} You waved at ${name}`)
    closePlayerCard()
    return
  }
  // Say hi (Piece 3): the chat opens, the conversation (and its two-shot) goes on.
  if (k === 'hi') {
    window.dispatchEvent(new CustomEvent('mzansi-wave', { detail: { id, gesture: 'interact-right' } }))
    const keep = sheetKeep
    closePlayerCard(true)
    if (!keep) window.dispatchEvent(new CustomEvent('mzansi-open-chat', { detail: { id } }))
    return
  }
  // Block: their body, bubbles, lines in your chat and card are gone for you.
  if (k === 'block') {
    blockPlayer(id)
    toast(`\u{1F6AB} Blocked. You won’t see or hear ${name} any more.`)
    closePlayerCard(sheetKeep)
    return
  }
  if (k === 'friend' && save.run) {
    save.run.friends = (save.run.friends || []).filter((f) => f.id !== id).concat({ id, name: sheetCard?.name || 'Student', house: sheetCard?.house || '', num: sheetCard?.num || '', day: save.run.day })
    persist()
    sendPoke(id, 'friend')
    toast(`\u{1F91D} ${name} is on your friends list`)
    renderSheet()
    return
  }
  if (k === 'report') { renderSheet(true); return }
  if (k === 'report-cancel') { renderSheet(); return }
  if (k.startsWith('report-')) {
    // (with what they said: the line it was opened from, else their last few lines)
    reportPlayer(id, k.slice(7), sheetCard, sheetMessage || saidBy(id).join(' | '))
    blockPlayer(id)
    toast(`Reported. You won’t see ${name} on campus any more.`)
    closePlayerCard(sheetKeep)
  }
}
function blockPlayer(id) {
  save.blocks = [...new Set([...(save.blocks || []), id])]
  persist()
  hidePlayer(id)
  window.dispatchEvent(new CustomEvent('mzansi-block', { detail: { id } }))
}
window.addEventListener('mzansi-player-card', (event) => openPlayerCard(event.detail.id, event.detail))
// Someone did something to you.
onPoke(({ from, kind, name }) => {
  const who = String(name || 'Someone').split(' ')[0]
  if (kind === 'wave') { toast(`\u{1F44B} ${who} waved at you`); window.dispatchEvent(new CustomEvent('mzansi-remote-gesture', { detail: { id: from } })) }
  if (kind === 'hi') { toast(`\u{1F4AC} ${who} says hi!`); window.dispatchEvent(new CustomEvent('mzansi-remote-gesture', { detail: { id: from, gesture: 'interact-right' } })) }
  if (kind === 'friend') toast(`\u{1F91D} ${who} added you as a friend`)
})
for (const id of save.blocks || []) hidePlayer(id)
