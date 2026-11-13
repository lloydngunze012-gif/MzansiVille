// The pop-up cards of the launch job (owner, 9 Nov), each one a centred card (.sl-pop, ui/cards.css):
//   * Swap roommate  - at the drop-off the roommate introduces themselves; "Swap roommate" opens these four cards.
//   * Finish your student card - "...and get R200", after the first paid gig, the first meal, or when another
//     player taps you. Never during a walk, an action, a chat or another card. Asked at most once a day, until
//     the card is done. R200 is paid once (main.js, when the card is saved), with the badge "Card made".
//   * The weekly leaderboard - three tabs, top 10 each and "You: #N". Shown when a returning player arrives
//     (once a day) and from the menu. A new player first sees it in their second session.
//   * Feedback - the menu button, and one "How's it going?" on the third session.
// main.js hands over what it owns (the save, persist, paint, openCardEditor); everything else lives here.
import { avatarSvg, genderOf } from './avatar.js'
import { roommatesFor, roommateById, roommateFor, roommateLook } from './roommates.js'
import { BOARDS, loadBoard, onNote } from './scores.js'
import { resetText } from './engine/scores.js'
import { returning, sessionNo, funnel } from './events.js'
import { myIdentity, onPoke } from './presence.js'
import { cardOf } from './cards.js'
import { logRow } from './errors.js'
import { authEnabled, getClient } from './net.js'
import { followerCounts, followersText } from './board.js'
import { waButton } from './sharewa.js'

export const CARD_REWARD = 200
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}
// The player's own calendar day (the card is asked "at most once a day").
const today = () => new Date().toLocaleDateString('en-CA')
const params = () => new URLSearchParams(location.search)

let api = null
let wrap = null
let current = '' // which pop-up is open: 'swap' | 'card' | 'board' | 'feedback'

function close() {
  wrap?.remove()
  wrap = null
  current = ''
}
function open(kind, html) {
  close()
  wrap = document.createElement('div')
  wrap.className = 'sl-pop-wrap'
  wrap.dataset.pop = kind
  wrap.innerHTML = `<div class="sl-pop-scrim" data-lp="scrim"></div><aside class="sl-pop" role="dialog" aria-modal="true" aria-label="${esc(kind)}">${html}</aside>`
  document.body.append(wrap)
  current = kind
  return wrap.querySelector('.sl-pop')
}
export const isOpen = () => Boolean(wrap)
// (src/daily.js: the Daily and the interest picker are pop-ups of the same kind, with their own clicks)
export const popOpen = open
export const popClose = close

// ---------- Is it a calm moment? ----------
// Never during a walk, an action, a chat, a card, the drop-off or a scene of its own.
export function calmWhy() {
  if (!api) return 'not started'
  const run = api.save()?.run
  if (!run) return 'no student'
  if (run.mode !== 'play') return `mode ${run.mode}`
  if (run.dropOff) return 'drop-off'
  if (run.queue?.length) return `cards waiting (${run.queue[0].kind})`
  if (api.route() !== 'play') return `screen ${api.route()}`
  if (wrap) return 'a pop-up is open'
  const dlg = document.querySelector('[role="dialog"]:not([hidden]), .pc-sheet-wrap.on, .g-full, .g-result, .g-talk, .g-sheet, .mm-card, .dp-card:not([hidden])')
  if (dlg) return `a card is open (${dlg.className || dlg.tagName})`
  if (api.busy?.()) return 'talking or menu'
  if (document.body.dataset.caf) return 'in the Caf'
  if (document.body.dataset.city) {
    // (SunnyBay: calm once its scene is up and no door card, list, result, ride or map is open and you stand still)
    const c = document.getElementById('city3d')
    if (!c || c.dataset.ready !== '1') return 'city not ready'
    if (c.dataset.card) return `city card (${c.dataset.card})`
    if (c.dataset.riding === '1') return 'riding'
    if (document.querySelector('.cm-overlay:not([hidden])')) return 'map open'
    const stop = c.parentElement?.querySelector('.city-stop') || document.querySelector('.city-stop')
    if (stop && !stop.hidden) return 'moving'
    return ''
  }
  const world = document.getElementById('world')
  if (world) {
    if (world.dataset.on !== '1' || world.dataset.ready !== '1') return 'campus not ready'
    if (world.dataset.activityStep === 'running') return `activity ${world.dataset.activity}` // (the step stays 'done' or 'left' after a scene)
    if (world.dataset.talking) return 'talking'
    if (world.dataset.walkingTo) return `walking to ${world.dataset.walkingTo}`
    const stop = world.querySelector('.stop-btn')
    if (stop && !stop.hidden) return 'moving'
  }
  const chat = document.querySelector('body > .chat-panel')
  if (chat && chat.offsetParent !== null) return 'chat open'
  return ''
}
export const calm = () => calmWhy() === ''

// ---------- Swap roommate ----------
function openSwap({ done }) {
  const run = api.save().run
  const gender = genderOf(run.character.avatar)
  const mine = run.pendingRoommate || roommateFor(run.character).id
  const cards = roommatesFor(gender).map((r) => {
    const look = roommateLook(r)
    return `<button class="lp-roomie" type="button" data-lp="swap-${esc(r.id)}" data-roommate="${esc(r.id)}" aria-pressed="${mine === r.id}">
        <span class="lp-face" aria-hidden="true">${avatarSvg({ gender: look.gender, skin: look.skin, hair: gender === 'male' ? 'crop' : 'curls', outfit: look.outfit, hairColor: look.hairColor }, '031', 64)}</span>
        <b>${esc(r.name)}</b><small>${esc(r.blurb)}</small></button>`
  }).join('')
  const pop = open('swap', `<p class="lp-kicker">Your roommate</p><h2>Who is it going to be?</h2><div class="lp-roomies">${cards}</div><button class="lp-ghost" type="button" data-lp="swap-keep">Keep ${esc(roommateById(mine)?.name || 'them')}</button>`)
  pop.dataset.swap = '1'
  wrap.__done = done
}

// ---------- Finish your student card ----------
let pendingCard = ''
function showCardPrompt() {
  const run = api.save().run
  run.cardAsked = today()
  if (!run.quick) run.cardNudged = true // (the one gentle ask for an older card)
  api.persist()
  const pop = open('card', `<p class="lp-kicker">Student card</p><h2>Finish your student card</h2>
    <p class="lp-lede">Finish your student card so people know you, and get <b>R${CARD_REWARD}</b>.</p>
    <div class="lp-two"><button class="lp-ghost" type="button" data-lp="card-later">Later</button><button class="lp-go" type="button" data-lp="card-now">Finish it</button></div>`)
  pop.dataset.reason = pendingCard
  pendingCard = ''
}
// Job I (owner, 12 Nov: neither his phone nor his PC was ever asked): a quick-start player is asked after their first
// meal or paid gig, or when another player looks at their card, at most once a day until it is done. Anyone else whose
// card is still empty (an older save, the full enrolment skipped through) is asked once, gently, ever (run.cardNudged).
export function cardEmpty(run) {
  const c = cardOf(run, '')
  return !c.bio && !c.tags.course && !c.tags.vibe && !c.tags.looking
}
function wantCard(reason) {
  const run = api?.save()?.run
  if (!run?.character || run.cardDone) return
  if (!run.quick && (run.cardNudged || !cardEmpty(run))) return
  run.cardTriggered = true
  pendingCard = pendingCard || reason
}
const askedToday = (run) => run.cardAsked === today()

// ---------- The leaderboard ----------
let boardTab = 'academics'
const boardCache = {}
function boardHtml(tab, data) {
  const tabs = BOARDS.map((b) => `<button type="button" class="lp-tab" role="tab" data-lp="board-${b.id}" data-board="${b.id}" aria-selected="${b.id === tab}">${esc(b.label)}</button>`).join('')
  const meta = BOARDS.find((b) => b.id === tab)
  let body
  if (!data) body = '<p class="lp-lede lp-wait">Loading…</p>'
  else if (data.error === 'soon') body = '<p class="lp-lede">The weekly boards open soon. Your points are being counted already.</p>'
  else if (data.error === 'offline') body = '<p class="lp-lede">Can’t reach the campus right now. Try again in a moment.</p>'
  else if (!data.top.length) body = '<p class="lp-lede">Nobody has scored yet this week. Be the first.</p>'
  else {
    body = `<ol class="lp-list">${data.top.map((r) => `<li class="${r.you ? 'me' : ''}"><i>${r.rank}</i><span><b>${esc(r.name)}</b>${r.handle ? ` <small>@${esc(r.handle)}</small>` : ''}<small class="lp-fol" data-fol-handle="${esc(r.handle || '')}"></small></span><em>${r.points}</em></li>`).join('')}</ol>`
  }
  const you = data?.you ? (data.you.rank ? `You: #${data.you.rank} · ${data.you.points} points` : `You: ${data.you.points} points`) : data && !data.error ? 'You: not on the board yet' : ''
  return `<p class="lp-kicker">Leaderboard · resets in ${esc(resetText())}</p><h2>This week</h2>
    <div class="lp-tabs" role="tablist" aria-label="Boards">${tabs}</div>
    <p class="lp-note">${esc(meta?.note || '')}</p>
    ${body}
    <p class="lp-you" data-you>${esc(you)}</p>
    ${data?.you?.rank >= 1 && data.you.rank <= 10 ? `<p class="lp-share">${waButton('top10')}</p>` : ''}
    <button class="lp-go" type="button" data-lp="board-close">Close</button>`
}
export async function openBoard(tab = boardTab) {
  if (!api) return
  boardTab = tab
  const pop = open('board', boardHtml(tab, boardCache[tab]))
  pop.dataset.board = tab
  const data = await loadBoard(tab, api.save().run)
  boardCache[tab] = data
  if (current === 'board' && boardTab === tab) {
    const p = wrap.querySelector('.sl-pop')
    p.innerHTML = boardHtml(tab, data)
    // (Social B: each row's follower count)
    const handles = (data.top || []).map((r) => r.handle).filter(Boolean)
    if (handles.length) followerCounts([], handles).then((c) => { for (const el of p.querySelectorAll('[data-fol-handle]')) { const n = c.handles[el.dataset.folHandle]; if (n) el.textContent = ` · ${followersText(Number(n))}` } })
  }
}

// ---------- Feedback ----------
let stars = 0
export function openFeedback(kind = 'menu') {
  stars = 0
  const starBtns = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="lp-star" data-lp="star-${n}" aria-label="${n} star${n > 1 ? 's' : ''}" aria-pressed="false">★</button>`).join('')
  const pop = open('feedback', `<p class="lp-kicker">Feedback</p><h2>${kind === 'session3' ? 'How’s it going?' : 'Tell us what you think'}</h2>
    <div class="lp-stars" role="group" aria-label="Rating">${starBtns}</div>
    <label class="lp-field"><span class="sr-only">Your message</span><textarea id="lp-fb" maxlength="500" rows="4" placeholder="What’s good? What’s broken? What should we add?"></textarea></label>
    <div class="lp-two"><button class="lp-ghost" type="button" data-lp="fb-skip">Not now</button><button class="lp-go" type="button" data-lp="fb-send">Send</button></div>`)
  pop.dataset.kind = kind
}
async function sendFeedback(kind) {
  const text = String(wrap?.querySelector('#lp-fb')?.value || '').trim().slice(0, 500)
  const row = { player: myIdentity().id, stars: stars || null, message: text, kind, build: typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev', device: `${navigator.userAgent.slice(0, 120)} | ${window.innerWidth}x${window.innerHeight}` }
  ;(window.__feedback ||= []).push(row)
  funnel('feedback_sent')
  if (!authEnabled || (navigator.webdriver && params().get('feedback') !== '1')) return
  try {
    const client = await getClient()
    const { error } = await client.from('feedback').insert(row)
    // (the Launch block has not been run yet: the same words go into the error log, kind 'feedback')
    if (error) logRow({ kind: 'feedback', message: `${stars || '-'}★ ${text}`.slice(0, 500), build: row.build, device: row.device, screen: location.hash })
  } catch { /* thanks anyway */ }
}

// ---------- Clicks ----------
function onClick(event) {
  const el = event.target.closest('[data-lp]')
  if (!el || !wrap || !wrap.contains(el)) return
  const k = el.dataset.lp
  if (k === 'scrim') {
    // (a swap or feedback that was asked for stays; the others close)
    if (current === 'swap') return
    close(); return
  }
  if (current === 'swap') {
    const done = wrap.__done
    if (k === 'swap-keep') { close(); done?.(null); return }
    if (k.startsWith('swap-')) { close(); done?.(roommateById(k.slice(5))); return }
  }
  if (k === 'card-later') { close(); return }
  if (k === 'card-now') { close(); funnel('card_started'); api.openCardEditor(); return }
  if (k.startsWith('board-')) {
    if (k === 'board-close') { close(); return }
    openBoard(k.slice(6)); return
  }
  if (k.startsWith('star-')) {
    stars = Number(k.slice(5))
    wrap.querySelectorAll('.lp-star').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.lp.slice(5)) <= stars)))
    return
  }
  if (k === 'fb-skip') { store.set('mzansiville.fbasked', '1'); close(); return }
  if (k === 'fb-send') {
    const kind = wrap.querySelector('.sl-pop').dataset.kind
    store.set('mzansiville.fbasked', '1')
    sendFeedback(kind)
    close()
    api.toast('Thank you! Feedback sent.')
  }
}

// ---------- Scheduling ----------
const startedAt = Date.now()
const FB_WAIT = Number(params().get('fbwait')) || 90000 // (a minute and a half into the third session; tests shorten it)
let boardShown = false
let session3 = false
function tick() {
  if (!api) return
  const run = api.save()?.run
  if (!run?.character) return
  if (!calm()) return
  // 1. the SunnyBay Daily, once a day, for a returning player (their second session on)
  // (job L: when 'Today on campus' opens each visit, the Daily is one tap away there and in the menu, not a second card)
  if (!boardShown && document.body.dataset.today === '1') boardShown = true
  if (!boardShown && returning() && store.get('mzansiville.boardday') !== today() && Date.now() - startedAt > 2500) {
    boardShown = true
    store.set('mzansiville.boardday', today())
    // (Social B: the SunnyBay Daily, which carries the top 3 of each board, replaces the leaderboard card here)
    window.dispatchEvent(new CustomEvent('mzansi-daily-due'))
    return
  }
  // 2. the student card, if asked for, at most once a day
  if (pendingCard && !askedToday(run)) { showCardPrompt(); return }
  // 3. a first session on the third time they come back
  if (sessionNo() === 3 && !store.get('mzansiville.fbasked') && !session3 && Date.now() - startedAt > FB_WAIT) {
    session3 = true
    openFeedback('session3')
  }
}

export function initLaunch(handles) {
  api = handles
  document.addEventListener('click', onClick)
  setInterval(tick, 1200)
  window.addEventListener('mzansi-swap-roommate', (event) => openSwap(event.detail))
  // The first meal or the first paid gig; any later one asks again on a new day (once the first has happened).
  // (job I: by what the activity does, not its leaderboard board: a scored meal used to arrive as 'social' and never asked)
  onNote(({ cat, action }) => {
    const d = action?.deltas || {}
    const gig = cat === 'work' || Number(d.money) > 0
    const meal = cat === 'food' || Number(d.hunger) > 0
    if (gig || meal) wantCard(gig ? 'gig' : 'meal')
  })
  // The same for a city row (a gig or a meal in a SunnyBay place).
  window.addEventListener('mzansi-city-note', (event) => wantCard(event.detail?.kind === 'gig' ? 'gig' : 'meal'))
  // Another player tapped you (their card opened on yours: a 'look'), or waved, said hi, added you.
  onPoke(() => wantCard('tapped'))
  // A new day, the card still not done and they have started to play: ask once more at a calm moment.
  const run = api.save()?.run
  if (run?.quick && !run.cardDone && run.cardTriggered && !askedToday(run)) pendingCard = 'again'
  // (a returning player whose card is still empty: one gentle ask, a little into the session)
  else if (run?.character && !run.quick && !run.cardDone && !run.cardNudged && returning() && cardEmpty(run)) setTimeout(() => wantCard('empty'), 20000)
}
// The menu's Feedback and Leaderboard buttons, and tests.
window.mzansiLaunch = { openBoard, openFeedback, promptCard: () => showCardPrompt(), calm, why: calmWhy, pending: () => pendingCard, open: () => current, want: (r) => wantCard(r || 'test') }
