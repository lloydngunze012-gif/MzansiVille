// Social B (owner, 11 Nov): the SunnyBay Daily and the interest picker, both centred pop-ups (.sl-pop, launch.js).
//   The Daily: one card on the first open of each day, for a returning player at a calm moment (it replaces the
//   leaderboard card at sign-in; launch.js says when). Words: data/campusville/daily.json (editable without
//   code): today's hot topic, matched to your interests where it can be, with "Join the conversation" into that
//   interest's group; the Post of the day; today's Caf special (specials.json, by game day); the top 3 of each
//   weekly board; who joined today.
//   Interests: pick 3 of the 12 (interests.json) at the end of the student-card flow, and later from the Feed's
//   "Edit". Each has a standing group; your picks put you in theirs (supabase/chat.sql chat_interests).
import DAILY from '../data/campusville/daily.json'
import INTERESTS from '../data/campusville/interests.json'
import SPECIALS from '../data/campusville/specials.json'
import { joinedToday, setInterests } from './board.js'
import { calm, openBoard, popClose, popOpen } from './launch.js'
import { BOARDS, loadBoard } from './scores.js'
import { myInterests, socialBReady, threadOf } from './threads.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const PICK = INTERESTS.pick || 3
const byId = (id) => INTERESTS.interests.find((i) => i.id === id)
let api = null

// Today in SAST, as a day number from the Daily's start date (never negative).
const sastDay = (d = new Date()) => Math.floor((d.getTime() + 2 * 3600000) / 86400000)
function dayIndex() {
  const start = sastDay(new Date(`${DAILY.startDate}T00:00:00+02:00`))
  return Math.max(0, sastDay() - start)
}
// The Caf's special for a game day (day 1 is a Monday; three weeks, going round).
export function specialFor(day = 1) { return SPECIALS.specials[(Math.max(1, Number(day) || 1) - 1) % SPECIALS.specials.length] }
// Today's topic and the interest it is filed under for this player: one of their own if the topic has it.
export function topicToday(mine = myInterests()) {
  const topic = DAILY.topics[dayIndex() % DAILY.topics.length]
  const tag = topic.tags.find((t) => mine.includes(t)) || topic.tags[0]
  return { ...topic, tag, matched: mine.includes(tag) }
}
const picksOf = () => { const fromServer = myInterests(); return fromServer.length ? fromServer : api?.save()?.run?.character?.interests || [] }

// ---------- The interest picker ----------
export function openInterests() {
  if (!api?.save()?.run) return
  let picks = picksOf().filter(byId).slice(0, PICK)
  const html = () => `<p class="lp-kicker">Your interests</p><h2>Pick ${PICK}</h2>
    <p class="lp-lede">Each one has a group chat. Your picks put you in theirs.</p>
    <div class="dy-picks" role="group" aria-label="Interests">${INTERESTS.interests.map((i) => `<button type="button" class="dy-pick" data-interest="${esc(i.id)}" aria-pressed="${picks.includes(i.id)}"><span aria-hidden="true">${i.emoji}</span> ${esc(i.label)}</button>`).join('')}</div>
    <p class="lp-note" data-dy-count>${picks.length} of ${PICK} picked</p>
    <div class="lp-two"><button class="lp-ghost" type="button" data-dy="later">Later</button><button class="lp-go" type="button" data-dy="save">Save</button></div>`
  const pop = popOpen('interests', html())
  pop.addEventListener('click', async (event) => {
    const chip = event.target.closest('[data-interest]')
    if (chip) {
      const id = chip.dataset.interest
      if (picks.includes(id)) picks = picks.filter((x) => x !== id)
      else if (picks.length < PICK) picks = picks.concat(id)
      else { api.toast(`${PICK} at most. Drop one first.`); return }
      for (const b of pop.querySelectorAll('[data-interest]')) b.setAttribute('aria-pressed', String(picks.includes(b.dataset.interest)))
      pop.querySelector('[data-dy-count]').textContent = `${picks.length} of ${PICK} picked`
      return
    }
    const k = event.target.closest('[data-dy]')?.dataset.dy
    if (!k) return
    const run = api.save().run
    delete run.interestsAsk
    if (k === 'save') {
      run.character.interests = picks
      api.persist()
      popClose()
      const res = await setInterests(picks)
      api.toast(res.ok ? (picks.length ? 'Saved. Your groups are in your chats.' : 'Saved.') : 'Saved on this phone. The groups open soon.')
      return
    }
    api.persist()
    popClose()
  })
}

// ---------- The Daily ----------
let daily = null // what the open card has loaded: { boards, joined }
export function openDaily() {
  const run = api?.save()?.run
  if (!run) return
  const topic = topicToday(picksOf())
  const tagged = byId(topic.tag)
  const post = DAILY.posts[dayIndex() % DAILY.posts.length]
  const special = specialFor(run.day)
  const date = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })
  daily = { boards: null, joined: null }
  const top3 = () => (!daily.boards ? '<p class="lp-note">Loading the boards…</p>' : daily.boards.map((b) => `<p class="dy-board"><b>${esc(b.label)}</b> ${b.top.length ? b.top.map((r) => `<span><i>${r.rank}</i> ${esc(r.name)}</span>`).join('') : '<span>Nobody yet. Be the first.</span>'}</p>`).join(''))
  const joined = () => (!daily.joined ? '' : daily.joined.joined ? `<p class="dy-line">\u{1F44B} <b>${daily.joined.joined}</b> student${daily.joined.joined === 1 ? '' : 's'} joined today${daily.joined.names.length ? `: ${daily.joined.names.map(esc).join(', ')}` : ''}.</p>` : '')
  const html = () => `<p class="lp-kicker">${esc(DAILY.title)} · ${esc(date)}</p>
    <h2 class="dy-q">${esc(topic.question)}</h2>
    <p class="lp-lede">${esc(topic.opener)}</p>
    <button class="lp-go" type="button" data-dy="join" data-tag="${esc(topic.tag)}">${tagged ? `${tagged.emoji} ` : ''}${esc(DAILY.join)}</button>
    <section class="dy-sec"><p class="lp-kicker">Post of the day</p><p class="dy-post"><b>${esc(post.who)}</b> “${esc(post.post)}”</p><p class="lp-note">${esc(post.why)}</p></section>
    <section class="dy-sec"><p class="lp-kicker">Today at the Caf</p><p class="dy-post"><b>${esc(special.dish)}</b> · R${special.price}</p><p class="lp-note">${esc(special.says)}</p></section>
    <section class="dy-sec" data-dy-boards><p class="lp-kicker">This week’s top 3</p>${top3()}<button class="lp-ghost dy-more" type="button" data-dy="boards">See the boards</button></section>
    <div data-dy-joined>${joined()}</div>
    <button class="lp-ghost" type="button" data-dy="close">Let’s go</button>`
  const pop = popOpen('daily', html())
  pop.dataset.topic = topic.question
  pop.dataset.tag = topic.tag
  pop.addEventListener('click', async (event) => {
    const k = event.target.closest('[data-dy]')?.dataset.dy
    if (k === 'close') { popClose(); return }
    if (k === 'boards') { openBoard(); return }
    if (k !== 'join') return
    popClose()
    // into the topic's group: yours already if it matched; else it becomes a pick (while you have room for one);
    // with three other picks, the conversation is in The Quad.
    const mine = picksOf()
    let thread = `i:${topic.tag}`
    if (!mine.includes(topic.tag)) {
      if (mine.length < PICK && socialBReady()) {
        const next = mine.concat(topic.tag)
        run.character.interests = next
        api.persist()
        await setInterests(next)
      } else thread = 'quad'
    }
    if (!threadOf(thread)) thread = threadOf('quad') ? 'quad' : ''
    window.dispatchEvent(new CustomEvent('mzansi-open-threads', { detail: { thread } }))
  })
  const paint = () => {
    if (!pop.isConnected) return
    const b = pop.querySelector('[data-dy-boards]')
    if (b) b.innerHTML = `<p class="lp-kicker">This week’s top 3</p>${top3()}<button class="lp-ghost dy-more" type="button" data-dy="boards">See the boards</button>`
    const j = pop.querySelector('[data-dy-joined]')
    if (j) j.innerHTML = joined()
  }
  Promise.all(BOARDS.map((b) => loadBoard(b.id, run).then((d) => ({ label: b.label, top: (d.top || []).slice(0, 3) })))).then((boards) => { daily.boards = boards; paint() })
  joinedToday().then((j) => { daily.joined = j; paint() })
}

export function initDaily(handles) {
  api = handles
  window.addEventListener('mzansi-daily-due', () => openDaily())
  window.addEventListener('mzansi-interests', () => openInterests())
  // the end of the student-card flow: once the card is saved, at the next calm moment
  setInterval(() => { const run = api.save()?.run; if (run?.interestsAsk && calm()) openInterests() }, 1500)
}
// Tests.
window.mzansiDaily = { open: () => openDaily(), interests: () => openInterests(), topic: () => topicToday(picksOf()), special: (day) => specialFor(day), day: dayIndex }
