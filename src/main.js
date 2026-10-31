import { districtById, defaultDistrictId } from './districts/registry.js'
import { filterText, canSend } from './engine/filter.js'
import { loadBoardRows, loadLobby } from './social.js'
import { withEventEdits } from './engine/model.js'
import {
  advancePhase,
  applyAction,
  beginNextDay,
  chooseEvent,
  createRun,
  dismissCard,
} from './engine/sim.js'
import {
  authEnabled,
  closeReport,
  currentSession,
  fetchEventEdits,
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
import { roommateOf } from './avatar.js'
import { replyTo } from './engine/people.js'
import { startGroove, stopGroove } from './groove.js'

let shareMilestone = null
let shareBlob = null
import { emptyDraft, shotState, view } from './ui/render.js'
import { anyEnabled, hereOf, layoutOf, soundOn, ui, viewFlags, viewPref } from './ui/game.js'
import { homePlaceId } from './engine/model.js'

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

let save = loadSave()
let edits = []
let draft = emptyDraft()
let chat = { messages: [], names: {}, offline: false, source: 'loading', error: '', notice: '', menuId: '', reportId: '', prompt: false, draft: '' }
let board = { tab: 'money', scope: 'all', rows: [], source: 'loading', error: '' }
let admin = { reports: [], eventId: 'nsfas_delayed', notice: '', allowed: false }
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

function morningWanted(run) {
  if (!run || run.mode !== 'play' || run.phase !== 'wake') return false
  const q = new URLSearchParams(location.search)
  if (q.get('shot') || q.get('morning') === '0' || !hasGL()) return false
  if (q.get('morning') === '1') return true
  return run.day === 1 && !run.morningDone
}

function morningSnapshot(run) {
  if (!run.morningStart) run.morningStart = { stats: { ...run.stats }, minutes: run.minutes }
  else { run.stats = { ...run.morningStart.stats }; run.minutes = run.morningStart.minutes }
}

function endMorning(skip, result) {
  const run = save.run
  if (!run) return
  if (skip && run.morningStart) { run.stats = { ...run.morningStart.stats }; run.minutes = run.morningStart.minutes }
  run.morningDone = true
  delete run.morningStart
  // The morning already introduced the roommate (Zanele, or Sipho for a male student), so they are the bestie
  // and the day 1 "New bestie" card would only repeat it.
  run.bestieName = roommateOf(run.character?.avatar)
  run.queue = run.queue.filter((card) => card.id !== 'bestie-1')
  morningPromise?.then((mod) => mod.stopMorning())
  if (!skip) {
    const district = districtNow()
    // advancePhase resets the clock to 09:00; campus starts when the bus got in.
    const arrived = result?.arrived || run.minutes
    for (let i = 0; i < 3 && run.phase !== 'lecture'; i++) advancePhase(district, run)
    run.minutes = arrived
    run.at = 'gate'
    run.lectureRoute = true
  }
  ui.gear = false
  persist()
  go('play')
}

function syncMorning(viewState) {
  const on = viewState?.screen === 'morning' && Boolean(viewState.run)
  if (!on) { morningPromise?.then((mod) => mod.stopMorning()); return false }
  if (!morningPromise) morningPromise = import('./world/morning.js')
  morningPromise.then((mod) => {
    if (route().name !== 'morning') return
    mod.startMorning({
      run: save.run,
      forceRoommate: { 1: true, 0: false }[new URLSearchParams(location.search).get('roommate')],
      onUpdate() { persist(); paint() },
      onDone(result) { endMorning(false, result) },
    })
  }).catch((error) => console.error(error))
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
  if (!stage) { previewPromise?.then((mod) => mod.hidePreview()); return }
  if (!previewPromise) previewPromise = import('./ui/preview3d.js')
  previewPromise.then((mod) => {
    const now = app.querySelector('.cc-stage')
    if (now) mod.showPreview(now, draft.avatar)
  }).catch((error) => console.error(error))
}

// The day-1 lecture is the 3D scene; it can never be skipped by a button.
const LECTURE_ACTIONS = new Set(['lecture_attend', 'lecture_back', 'smig_sitin'])
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
  run.at = 'smig'
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
  }).catch((error) => console.error(error))
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
    console.error(error)
  })
}

function paint() {
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
  if (app.dataset.screen !== 'title' && !app.querySelector('.g-home')) {
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
window.addEventListener('mzansi-talk', (event) => {
  if (!save.run || !event.detail?.id) return
  ui.talk = { id: event.detail.id }
  blip(700)
  paint()
})
function endTalk() {
  if (!ui.talk) return
  ui.talk = null
  window.dispatchEvent(new CustomEvent('mzansi-talk-end'))
}

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
  while (run && run.mode === 'play' && !run.queue.some((card) => card.choices) && !anyEnabled(district, run) && guard < 6) {
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
      window.dispatchEvent(new CustomEvent('mzansi-talk-react', { detail: { tone: res.tone } }))
      blip(res.tone === 'bad' ? 330 : 880)
      persist()
    }
    paint()
    return true
  }
  if (act === 'talk-more' && ui.talk) { ui.talk = { id: ui.talk.id }; paint(); return true }
  if (act === 'talk-bye') { endTalk(); paint(); return true }
  if (act === 'gear') { ui.gear = !ui.gear; ui.confirmReset = false; paint(); return true }
  if (act === 'sound') {
    try { localStorage.setItem('mzansiville.sound', soundOn() ? 'off' : 'on') } catch { /* private mode */ }
    setMuted(!soundOn())
    blip(880)
    paint()
    return true
  }
  if (act === 'reset') { ui.confirmReset = true; paint(); return true }
  if (act === 'lecture-go') { delete save.run.lectureCard; persist(); go(lectureWanted(save.run) ? 'lecture' : 'place/smig'); return true }
  if (act === 'hint-ok') { seenMapHint(); paint(); return true }
  if (act === 'place-open') { seenMapHint(); blip(600); ui.gear = false; go(`place/${button.dataset.id}`); return true }
  if (act === 'close-sheet') { go('play'); return true }
  if (act === 'spot') {
    // Walk to a spot in the place: the sheet closes so you watch yourself go.
    blip(600)
    go('play')
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

function finishTurn() {
  persist()
  const mode = save.run?.mode
  if (mode === 'summary') go('summary')
  else if (mode === 'over') go('over')
  else if (mode === 'locked') go('locked')
  else go('play')
  if (mode === 'summary' || mode === 'over') sync()
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
  if (event.target.id === 'name') draft.name = event.target.value
  if (event.target.id === 'handle') draft.handle = event.target.value
  if (event.target.id === 'email') draft.email = event.target.value
  if (event.target.id === 'composer') chat.draft = event.target.value
  if (event.target.id === 'residence') draft.residence = event.target.value
  if (event.target.id === 'course') draft.course = event.target.value
  if (['name', 'handle', 'residence', 'course'].includes(event.target.id)) syncCard()
})

function syncCard() {
  const set = (key, text) => { const el = app.querySelector(`[data-card="${key}"]`); if (el && el.textContent !== text) el.textContent = text }
  const h = draft.handle.trim().replace(/^@/, '')
  set('name', draft.name.trim() || 'Your name')
  set('residence', draft.residence || 'Res: choose')
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
  if (!button && !place) return
  captureForm()
  const act = button?.dataset.act
  const district = districtNow()

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
    morningPromise?.then((mod) => mod.stopMorning())
    persist()
    go('title')
    return
  }
  if (act === 'edit-char' && save.run) {
    const c = save.run.character
    draft = { ...emptyDraft(), name: c.name, residence: c.residence, course: c.course, handle: c.handle || '', avatar: { ...c.avatar }, edit: true }
    ui.gear = false
    go('new')
    return
  }
  if (act === 'delete-ask') { ui.confirmDelete = true; paint(); return }
  if (act === 'delete-no') { ui.confirmDelete = false; paint(); return }
  if (act === 'delete-yes') {
    ui.confirmDelete = false
    save.run = null
    draft = emptyDraft()
    persist()
    go('title')
    return
  }
  if (act === 'sound' && (route().name === 'settings' || route().name === 'new')) {
    try { localStorage.setItem('mzansiville.sound', soundOn() ? 'off' : 'on') } catch { /* private mode */ }
    setMuted(!soundOn())
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
  if (act === 'avatar') {
    draft.avatar = { ...draft.avatar, [button.dataset.part]: button.dataset.id }
    paint()
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
    if (draft.edit && save.run) {
      save.run.character = { ...save.run.character, ...read.character }
      draft = emptyDraft()
      persist()
      go('title')
      return
    }
    save.run = createRun(district, read.character)
    persist()
    go('play')
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
  if (act === 'do' && LECTURE_ACTIONS.has(button.dataset.id) && lectureWanted(save.run)) {
    // Attending the day-1 lecture from a sheet or the map plays the lecture itself.
    blip()
    go('lecture')
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
  if (act === 'next') {
    beginNextDay(district, save.run, new Date())
    save.run.at = homePlaceId(district, save.run.character.residence)
    ui.delta = null
    finishTurn()
    return
  }
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
    const name = `mzansiville-day${save.run?.day || 1}.png`
    const file = new File([blob], name, { type: 'image/png' })
    const url = `https://${shareUrl()}`
    const text = shareMilestone ? `${save.run.character.name} unlocked ${shareMilestone.title} in MzansiVille` : `${save.run.character.name}'s day ${save.run.day} in MzansiVille`
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'MzansiVille', text, url })
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
    if (act === 'chat-retry') { chat.source = 'loading'; await loadChat() } else { board.source = 'loading'; paint(); await loadBoard() }
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
})

paint()
arm()
if (save.run && route().name === 'chat') loadChat()
if (save.run && route().name === 'board') loadBoard()

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
bootAuth().catch(() => {})
