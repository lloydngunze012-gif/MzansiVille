// A reason to come and leave fulfilled (owner, 13 Nov, job L, item 4).
//  - Each visit opens with "Today on campus": three things to do today (meet someone new, try an activity, join a
//    conversation: the "Today 0/3" pill in the top bar), the hot topic, and one suggested group or person.
//  - During play: a prompt at least every promptMinutes (the hot topic, a group to join, someone new nearby, what is
//    starting), in the one small-card slot (.fm-card, shared with Find me: never two on screen, never over a chat
//    banner, a toast or a pop-up).
//  - On leaving (the menu's Home) or after summaryMinutes: "Today you..." (people met, activities, money and grades,
//    the streak) and what is on tomorrow.
// Words: data/campusville/today.json. Wired from main.js (initToday, noteToday from countDone, the 'home' act).
// Automation sees none of it unless ?today=1 (?promptgap=<seconds>, ?summarygap=<seconds> shorten the waits).
import T from '../data/campusville/today.json' with { type: 'json' }
import META from '../data/campusville/meta.json' with { type: 'json' }
import { calm, popClose, popOpen } from './launch.js'
import { joinTopic, myPicks, topicToday } from './daily.js'
import { specialFor, streakNow } from './loops.js'
import { DAY_THEMES } from './engine/friday.js'
import { peerList } from './presence.js'
import { groupSuggestion, answerSuggestion, onThreads } from './threads.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fill = (t, o) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''))
const params = () => new URLSearchParams(location.search)
const automated = () => typeof navigator !== 'undefined' && navigator.webdriver
export const todayOn = () => !automated() || params().get('today') === '1'
const PROMPT_MS = () => (Number(params().get('promptgap')) || T.promptMinutes * 60) * 1000
const SUMMARY_MS = () => (Number(params().get('summarygap')) || T.summaryMinutes * 60) * 1000
const ROOM = '.fm-card, .cht-wake, .cht-ask, .jt-toast, .cht-ping:not([hidden]), .sl-pop'

// ---------- the three things (saved: run.today { day, meet, try, talk }) ----------
const SOCIAL = new Set(['talk_chat', 'friend_add', 'hangout', 'talk_eat'])
const TALK = new Set(['player_say', 'board_post', 'chat_line'])
function todayOf(run) {
  if (!run.today || run.today.day !== run.day) run.today = { day: run.day, meet: false, try: false, talk: false }
  return run.today
}
export const doneCount = (run) => (run ? ['meet', 'try', 'talk'].filter((k) => todayOf(run)[k]).length : 0)
// Called by main.js countDone for every finished thing; returns true when one of the three just ticked.
export function noteToday(run, id) {
  if (!run) return false
  const t = todayOf(run)
  const k = SOCIAL.has(id) ? 'meet' : TALK.has(id) ? 'talk' : 'try'
  if (k === 'meet') session.met++
  else if (k === 'try') session.acts++
  if (t[k]) return false
  t[k] = true
  api?.persist()
  const n = doneCount(run)
  api?.toast(n === 3 ? `✅ ${T.allDone}` : `✅ ${T.things.find((x) => x.id === k).label} (${n}/3 today)`)
  api?.paint()
  return true
}
// The top bar's pill (ui/game.js nowRow).
export function todayPill(run) {
  if (!run || run.mode !== 'play' || !todayOn()) return ''
  const n = doneCount(run)
  return `<button type="button" class="td-pill${n === 3 ? ' done' : ''}" data-act="today" aria-label="Today: ${n} of 3 done"><span aria-hidden="true">✓</span> ${n}/3</button>`
}

// ---------- state ----------
let api = null
let started = 0
let opened = false
let lastPrompt = 0
let summaryShown = false
let rot = 0
let snap = null
const session = { met: 0, acts: 0 }
const log = []
const note = (k, x = {}) => { log.push({ k, ...x, at: Date.now() }); if (log.length > 40) log.shift() }

// api: { save(), persist(), paint(), toast(text), openCard(id), goHome() }
export function initToday(a) {
  api = a
  started = Date.now()
  if (todayOn()) document.body.dataset.today = '1'
  lastPrompt = Date.now()
  setInterval(tick, 1000)
  onThreads((kind) => { if (kind === 'sent') noteToday(api.save()?.run, 'chat_line') })
  window.mzansiToday = () => ({ on: todayOn(), opened, summaryShown, age: Math.round((Date.now() - started) / 1000), tickAt: lastTick, lastPrompt, done: doneCount(api.save()?.run), today: api.save()?.run?.today || null, session: { ...session }, log: [...log] })
}

let lastTick = ''
function tick() {
  lastTick = new Date().toISOString().slice(11, 19)
  if (!api || !todayOn()) return
  const run = api.save()?.run
  if (!run?.character || run.mode !== 'play' || run.dropOff) return
  if (!snap) snap = { money: run.stats.money, grades: run.stats.grades }
  if (!calm()) return
  if (!opened && Date.now() - started > 2500) { opened = true; openToday(); return }
  if (!summaryShown && Date.now() - started > SUMMARY_MS()) { summaryShown = true; openSummary(); return }
  if (Date.now() - lastPrompt > PROMPT_MS() && !document.querySelector(ROOM)) { lastPrompt = Date.now(); prompt() }
}

// ---------- "Today on campus" ----------
function suggestion() {
  const mine = new Set((api.save()?.run?.friends || []).map((f) => f.id))
  const p = peerList().find((x) => !mine.has(x.id))
  return p ? { kind: 'person', id: p.id, name: p.name, text: fill(T.suggestPerson, { name: String(p.name).split(' ')[0] }) } : { kind: 'quad', text: T.suggestNone }
}
export function openToday() {
  const run = api.save().run
  const t = todayOf(run)
  const topic = topicToday(myPicks())
  const s = suggestion()
  note('today')
  const things = T.things.map((x) => `<li class="td-thing${t[x.id] ? ' done' : ''}" data-thing="${x.id}"><span aria-hidden="true">${t[x.id] ? '✅' : '○'}</span><b>${esc(x.label)}</b><small>${esc(x.hint)}</small></li>`).join('')
  const pop = popOpen('today', `<p class="lp-kicker">${esc(T.title)} · ${esc(DAY_THEMES[run.day] || `Day ${run.day}`)}</p><h2>${doneCount(run)}/3 today</h2>
    <ul class="td-things">${things}</ul>
    <p class="lp-kicker">${esc(T.topicKicker)}</p><p class="td-topic">${esc(topic.question)}</p>
    <button class="lp-ghost" type="button" data-td="topic">${esc(T.joinTopic)}</button>
    <p class="lp-kicker">${esc(T.suggestKicker)}</p><p class="td-topic">${esc(s.text)}</p>
    <button class="lp-go" type="button" data-td="go">${esc(T.go)}</button>`)
  pop.addEventListener('click', (event) => {
    const k = event.target.closest('[data-td]')?.dataset.td
    if (!k) return
    popClose()
    if (k === 'topic') { note('join-topic'); joinTopic(topic) }
    if (k === 'go' && s.kind === 'person') api.openCard(s.id)
    // (no one new here: off to the Quad on campus, the map anywhere else)
    if (k === 'go' && s.kind !== 'person') { if (document.body.dataset.city || document.body.dataset.caf) api.openPlaces(); else window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'quad' })) }
  })
}

// ---------- prompts: one small card at a time ----------
let card = null
function showCard(kind, text, yes, act) {
  card?.remove()
  card = document.createElement('section')
  card.className = 'fm-card td-nudge'
  card.dataset.fm = 'nudge'
  card.dataset.nudge = kind
  card.setAttribute('role', 'status')
  card.innerHTML = `<p><b>${esc(text)}</b></p><div class="fm-row"><button type="button" class="fm-yes" data-td="yes">${esc(yes)}</button><button type="button" class="fm-no" data-td="no">Not now</button></div>`
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) card.addEventListener(type, (event) => event.stopPropagation(), { passive: true })
  card.addEventListener('click', (event) => {
    const k = event.target.closest('[data-td]')?.dataset.td
    if (!k) return
    card?.remove(); card = null
    if (k === 'yes') act()
  })
  document.body.append(card)
  const mine = card
  setTimeout(() => { if (card === mine) { card.remove(); card = null } }, 20000)
  note('prompt', { kind })
}
function nextPhase(run) {
  const i = META.phases.findIndex((p) => p.id === run.phase)
  return META.phases[i + 1] || null
}
async function prompt() {
  const run = api.save().run
  const t = todayOf(run)
  const kinds = ['topic', 'group', 'person', 'activity']
  for (let n = 0; n < kinds.length; n++) {
    const kind = kinds[(rot + n) % kinds.length]
    if (kind === 'topic' && !t.talk) {
      rot += n + 1
      const topic = topicToday(myPicks())
      showCard('topic', fill(T.prompts.topic, { question: topic.question }), 'Reply', () => joinTopic(topic))
      return
    }
    if (kind === 'group') {
      const g = await groupSuggestion().catch(() => null)
      if (g?.thread && !document.querySelector(ROOM)) {
        rot += n + 1
        showCard('group', fill(T.prompts.group, { group: g.name, interest: g.interest || 'today' }), 'Join', () => answerSuggestion(g.thread, true).then(() => window.dispatchEvent(new CustomEvent('mzansi-open-threads', { detail: { thread: g.thread } }))))
        return
      }
    }
    if (kind === 'person') {
      const s = suggestion()
      if (s.kind === 'person') { rot += n + 1; showCard('person', fill(T.prompts.person, { name: String(s.name).split(' ')[0] }), 'Say hi', () => api.openCard(s.id)); return }
    }
    if (kind === 'activity') {
      const next = nextPhase(run)
      if (next) {
        rot += n + 1
        showCard('activity', fill(T.prompts.activity, { phase: next.label, time: next.start, what: T.whatNext[next.id] || '' }), 'Things to do', () => api.openPlaces())
        return
      }
    }
  }
}

// ---------- "Today you..." ----------
export function openSummary(onLeave) {
  const run = api.save()?.run
  if (!run) { onLeave?.(); return false }
  note('summary')
  const s0 = snap || { money: run.stats.money, grades: run.stats.grades }
  const dm = Math.round((run.stats.money || 0) - s0.money)
  const dg = Math.round((run.stats.grades || 0) - s0.grades)
  const streak = streakNow(run)?.n || run.streak?.n || 0
  const lines = [
    fill(T.met, { n: session.met, people: session.met === 1 ? 'person' : 'people' }),
    fill(T.did, { n: session.acts, acts: session.acts === 1 ? 'activity' : 'activities' }),
    fill(T.money, { sign: dm < 0 ? '-' : '+', n: Math.abs(dm) }),
    fill(T.grades, { sign: dg < 0 ? '-' : '+', n: Math.abs(dg) }),
  ]
  if (streak) lines.push(fill(T.streak, { n: streak }))
  const dish = specialFor(run.day + 1)?.dish || ''
  const pop = popOpen('today-you', `<p class="lp-kicker">${esc(T.title)}</p><h2>${esc(T.summaryTitle)}</h2>
    <ul class="td-sum">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <p class="lp-kicker">${esc(T.tomorrow)}</p><p class="td-topic">${esc(DAY_THEMES[run.day + 1] || `Day ${run.day + 1}`)}${dish ? `. ${esc(fill(T.tomorrowSpecial, { dish }))}` : ''}</p>
    <div class="lp-two"><button class="lp-ghost" type="button" data-td="leave">${esc(T.leave)}</button><button class="lp-go" type="button" data-td="stay">${esc(T.keepGoing)}</button></div>`)
  pop.addEventListener('click', (event) => {
    const k = event.target.closest('[data-td]')?.dataset.td
    if (!k) return
    popClose()
    if (k === 'leave') onLeave?.()
  })
  return true
}
// The menu's Home: the summary first (once a visit, after a couple of minutes of play), then home.
export function leaving(goHome) {
  if (!todayOn() || summaryShown || Date.now() - started < 120000 || !api?.save()?.run?.character) { goHome(); return }
  summaryShown = true
  openSummary(goHome)
}
