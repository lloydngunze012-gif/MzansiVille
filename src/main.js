import { districtById, defaultDistrictId } from './districts/registry.js'
import { cleanText, canSend } from './engine/filter.js'
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
  fetchLeaderboard,
  fetchLobby,
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
import { emptyDraft, localBoardRow, shotState, view } from './ui/render.js'

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
let chat = { messages: [], names: {}, offline: !authEnabled, error: '', reportId: '', draft: '' }
let board = { tab: 'money', scope: 'all', rows: [], error: '' }
let admin = { reports: [], eventId: 'nsfas_delayed', notice: '', allowed: false }
let timer = 0
let merging = false
let chatUnsub = null

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
    admin,
  }
}

function paint() {
  const shot = new URLSearchParams(location.search).get('shot')
  if (!shot && save.run?.mode === 'play' && route().name === 'summary') {
    location.hash = '#/play'
    return
  }
  const active = document.activeElement
  const focusId = active && app.contains(active) ? active.id : ''
  const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null
  const html = shot ? view(shotState(shot)) : view(state())
  app.innerHTML = html
  const screen = app.querySelector('[data-screen]')
  app.dataset.screen = screen?.dataset.screen || 'title'
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
  const run = shot ? shotState(shot).run : save.run
  const district = shot ? shotState(shot).district : districtNow()
  if (canvas && run) drawShareCard(canvas, { district, run, url: location.origin }).catch(() => {})
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
  return ['play', 'place', 'summary', 'locked', 'over', 'profile', 'share', 'shop', 'chat', 'board'].includes(name)
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
  if (!authEnabled) {
    chat.offline = true
    return
  }
  const result = await fetchLobby()
  chat.offline = false
  chat.messages = result.messages
  chat.names = result.names
  chat.error = result.error
  if (save.suspended) chat.error = 'Your account is suspended.'
  paint()
}

async function loadBoard() {
  const local = localBoardRow(save.run)
  if (!authEnabled) {
    board.rows = local ? [local] : []
    board.error = ''
    paint()
    return
  }
  const result = await fetchLeaderboard()
  const rows = result.rows || []
  if (local && !rows.some((row) => row.user_id === save.run.userId)) rows.push(local)
  const tab = board.tab
  const key = tab === 'grades' ? 'dean_avg' : tab === 'balanced' ? 'balanced_avg' : 'rich_avg'
  rows.sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))
  board.rows = rows
  board.error = result.error
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

app.addEventListener('input', (event) => {
  if (event.target.id === 'name') draft.name = event.target.value
  if (event.target.id === 'handle') draft.handle = event.target.value
  if (event.target.id === 'email') draft.email = event.target.value
  if (event.target.id === 'composer') chat.draft = event.target.value
  if (event.target.id === 'residence') draft.residence = event.target.value
  if (event.target.id === 'course') draft.course = event.target.value
})

app.addEventListener('change', (event) => {
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
    go(save.rulesAccepted ? 'new' : 'rules')
    return
  }
  if (act === 'continue' && save.run) {
    const mode = save.run.mode
    go(mode === 'locked' ? 'locked' : mode === 'over' ? 'over' : mode === 'summary' ? 'summary' : 'play')
    return
  }
  if (act === 'nav') {
    go(button.dataset.go)
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
  if (act === 'do') {
    const result = applyAction(district, save.run, button.dataset.id)
    if (!result.ok) return
    finishTurn()
    return
  }
  if (act === 'phase') {
    advancePhase(district, save.run)
    finishTurn()
    return
  }
  if (act === 'choice') {
    const card = save.run.queue[0]
    if (card?.eventId) chooseEvent(district, save.run, card.eventId, Number(button.dataset.i))
    persist()
    paint()
    return
  }
  if (act === 'dismiss') {
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
  if (act === 'share') {
    const canvas = document.getElementById('share-card')
    const blob = await exportCard(canvas)
    if (!blob) return
    const file = new File([blob], 'mzansiville.png', { type: 'image/png' })
    const url = location.origin
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'MzansiVille', text: save.run.character.name, url })
      } catch { /* cancelled */ }
    } else {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'mzansiville.png'
      link.click()
    }
    return
  }
  if (act === 'copy') {
    await navigator.clipboard.writeText(location.origin)
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
  if (act === 'send') {
    if (!save.run?.userId) {
      chat.error = 'Save your progress to talk in the lobby.'
      paint()
      return
    }
    if (save.suspended) {
      chat.error = 'Your account is suspended.'
      paint()
      return
    }
    const text = cleanText(chat.draft || '')
    if (!text) return
    const gate = canSend(save.chatStamps || [])
    if (!gate.ok) {
      chat.error = gate.reason
      paint()
      return
    }
    const result = await sendLobby(save.run.userId, text)
    chat.error = result.error
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
    persist()
    paint()
    return
  }
  if (act === 'block') {
    const id = button.dataset.id
    save.blocks = save.blocks.includes(id) ? save.blocks : save.blocks.concat(id)
    if (save.run?.userId) await storeBlock(save.run.userId, id)
    persist()
    paint()
    return
  }
  if (act === 'report') {
    chat.reportId = button.dataset.id
    paint()
    return
  }
  if (act === 'reason') {
    const message = chat.messages.find((item) => item.id === button.dataset.id)
    if (message && save.run?.userId) {
      const result = await fileReport(save.run.userId, message, button.dataset.reason)
      chat.error = result.error
      chat.reportId = ''
    }
    paint()
    return
  }
  if (act === 'board-tab') {
    board.tab = button.dataset.id
    await loadBoard()
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
bootAuth()
