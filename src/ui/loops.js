// Loops (owner, 11 Nov), what the player sees: the streak and the badges on the profile, "Order tomorrow's
// special" at Night, "Your biryani is ready" the next day, and "Invite a friend". The rules are in src/loops.js.
import { badgeBoard, placePreorder, preorderOffer, STREAK_GOAL, streakNow } from '../loops.js'
import { popClose, popOpen } from '../launch.js'
import { inviteFriendLink, INVITE_REWARD } from '../sharewa.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The profile: the streak (with its 7-day milestone and this week's free freeze) and the badges.
export function loopsProfileHtml(run) {
  if (!run) return ''
  const s = streakNow(run)
  const left = Math.max(0, STREAK_GOAL - s.n)
  const dots = Array.from({ length: STREAK_GOAL }, (_, i) => `<i class="${i < Math.min(s.n, STREAK_GOAL) ? 'on' : ''}"></i>`).join('')
  const line = s.n >= STREAK_GOAL ? `${s.n} days running. Seven Strong.` : s.n ? `${left} more day${left === 1 ? '' : 's'} to Seven Strong.` : 'Finish one activity today to start a streak.'
  const board = badgeBoard(run)
  const earned = board.filter((b) => b.state === 'earned').length
  return `<section class="lo-card" data-streak="${s.n}">
      <p class="lo-streak"><b>\u{1F525} ${s.n}-day streak</b><span class="lo-dots" aria-hidden="true">${dots}</span></p>
      <p class="lo-line">${esc(line)} ${s.today ? 'Today is done.' : s.n ? 'Today is still to do.' : ''}</p>
      <p class="lo-freeze">${s.freeze ? '\u{1F9CA} One free freeze this week: a single missed day will not break it.' : '\u{1F9CA} This week’s freeze is used.'}${s.best > s.n ? ` Best: ${s.best} days.` : ''}</p>
    </section>
    <details class="lo-card lo-badges" data-earned="${earned}"><summary><b>\u{1F3C5} Badges</b> <span>${earned} of ${board.length}</span></summary>
      <ul>${board.map((b) => `<li class="${b.state}" data-badge="${esc(b.id)}"><b>${esc(b.name)}</b><span>${esc(b.state === 'earned' ? b.description : b.how)}</span>${b.state === 'coming' ? '<small>Coming</small>' : b.state === 'earned' ? '<small>Earned</small>' : ''}</li>`).join('')}</ul>
    </details>`
}

// At Night: tomorrow's special, R5 off if you order now. api: { save, persist, toast, repaint }.
export function openPreorder(api) {
  const run = api.save()?.run
  const offer = preorderOffer(run)
  if (!offer) { api.toast(run?.preorder?.day === run?.day + 1 ? `Tomorrow’s ${run.preorder.dish} is already ordered.` : 'The Caf takes orders for tomorrow at Night.'); return }
  const pop = popOpen('preorder', `<p class="lp-kicker">Tomorrow at the Caf</p><h2>${esc(offer.dish)}</h2>
    <p class="lp-lede">${esc(offer.says)}</p>
    <p class="lp-lede">Order tonight: <b>R${offer.price}</b> <s>R${offer.full}</s>. Collect it from Mama Liz tomorrow.</p>
    <div class="lp-two"><button class="lp-ghost" type="button" data-lo="no">Not tonight</button><button class="lp-go" type="button" data-lo="order">Order for R${offer.price}</button></div>`)
  pop.addEventListener('click', (event) => {
    const k = event.target.closest('[data-lo]')?.dataset.lo
    if (!k) return
    popClose()
    if (k !== 'order') return
    const res = placePreorder(run)
    if (res.ok) api.persist()
    api.toast(res.ok ? `\u{1F9FE} ${res.text}` : res.text)
    api.repaint()
  })
}
// The next day, when the game opens.
export function openReady(text) {
  const pop = popOpen('ready', `<p class="lp-kicker">The Caf</p><h2>\u{1F35B} Order up</h2><p class="lp-lede">${esc(text)}</p><button class="lp-go" type="button" data-lo="ok">Okay</button>`)
  pop.addEventListener('click', (event) => { if (event.target.closest('[data-lo]')) popClose() })
}
// Invite a friend: your link, on WhatsApp or copied. Both get the reward when they finish the quick start.
export async function openInvite(api) {
  const pop = popOpen('invite', `<p class="lp-kicker">Invite a friend</p><h2>R${INVITE_REWARD} each</h2>
    <p class="lp-lede">Send your link. When your friend starts playing, you both get <b>R${INVITE_REWARD}</b>.</p>
    <div data-lo-link><p class="lp-note">Making your link…</p></div>
    <button class="lp-ghost" type="button" data-lo="close">Close</button>`)
  pop.addEventListener('click', (event) => {
    const k = event.target.closest('[data-lo]')?.dataset.lo
    if (k === 'close') popClose()
    if (k === 'copy') navigator.clipboard?.writeText(pop.dataset.url || '').then(() => api.toast('Link copied.'), () => api.toast(pop.dataset.url || ''))
  })
  const res = await inviteFriendLink()
  const box = pop.isConnected && pop.querySelector('[data-lo-link]')
  if (!box) return
  if (!res.ok) { box.innerHTML = `<p class="lp-note">${esc(res.note)}</p>`; return }
  pop.dataset.url = res.url
  box.innerHTML = `<a class="wa-btn block" href="${esc(res.wa)}" target="_blank" rel="noopener" data-wa-kind="invite">Send on WhatsApp</a>
    <p class="lo-url"><span>${esc(res.url)}</span><button class="lp-ghost" type="button" data-lo="copy">Copy</button></p>`
}
