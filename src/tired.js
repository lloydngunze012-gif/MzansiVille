// Out of energy (owner, 13 Nov, job L, item 2). At 0 Energy, at the first calm moment, a card with three ways out:
//   Go home and sleep (in the day the rest of this part of the day is gone; at Night, to your bed),
//   Order delivery (SunnyBay Eats: the Caf menu, the food's price plus a fee; a rider on a scooter rides up a few
//     game minutes later and hands it over),
//   Ask a friend (a friend in your room gets "<you> is starving. Bring food?"; if they say yes they pay for the food,
//     walk over to you and hand it over; both gain Social).
// Words and numbers: data/campusville/eats.json. Wired from main.js: initTired(api).
import EATS from '../data/campusville/eats.json' with { type: 'json' }
import { MENUS } from './menus.js'
import { isEmpty } from './engine/energy.js'
import { calm, popClose, popOpen } from './launch.js'
import { onPoke, peerAt, peerList, sendPoke, whereAmI } from './presence.js'
import { ms } from './speed.js'
import { formatMoney } from './engine/format.js'
import { play as actSound } from './actsound.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fill = (t, o) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''))
const first = (n) => String(n || 'Someone').split(' ')[0]

// The Caf menu as single dishes (a dish with sizes: each size), from Mama Liz's counter.
export function eatsMenu() {
  const out = []
  for (const item of MENUS.mama_liz?.items || []) {
    if (item.sizes) for (const s of item.sizes) out.push({ id: `${item.id}:${s.id}`, name: `${item.name} (${s.name})`, icon: item.icon, price: s.price, fx: s.fx })
    else out.push({ id: item.id, name: item.name, icon: item.icon, price: item.price, fx: item.fx })
  }
  return out.filter((d) => (d.fx?.hunger || 0) >= 20) // (a meal, not a cooldrink)
}

let api = null
let shownFor = '' // (the card once per time you hit 0: day + minutes)
let order = null // { dish, due } while a rider is on the way
let asked = null // { to, at } while a friend is asked
const log = []
const note = (k, x = {}) => { log.push({ k, ...x, at: Date.now() }); if (log.length > 40) log.shift() }

// api: { save(), persist(), paint(), toast(text), applyFx(fx), sleepHome(), friends() -> [{ id, name }] }
export function initTired(a) {
  api = a
  setInterval(tick, 1000)
  onPoke(onFoodPoke)
  // (tests: set the live stats, as a long day would)
  window.mzansiSetStats = (patch) => { const run = api.save()?.run; if (!run) return null; Object.assign(run.stats, patch); api.persist(); api.paint(); return { ...run.stats } }
  window.mzansiTired = () => ({ empty: isEmpty(api.save()?.run), open: document.querySelector('.sl-pop-wrap')?.dataset.pop || '', order, asked, log: [...log], menu: eatsMenu() })
}

function tick() {
  const run = api?.save()?.run
  if (!run || run.mode !== 'play') return
  if (order && Date.now() >= order.due) arrive()
  if (!isEmpty(run)) { shownFor = ''; return }
  const key = `${run.day}:${run.phase}`
  if (shownFor === key || order || !calm()) return
  shownFor = key
  openEmpty()
}

export function openEmpty() {
  const run = api.save().run
  note('card')
  const pop = popOpen('empty', `<p class="lp-kicker">Energy 0</p><h2>${esc(EATS.title)}</h2><p class="lp-lede">${esc(EATS.lede)}</p>
    <div class="ti-ways">
      <button type="button" class="lp-go ti-way" data-ti="sleep"><b>\u{1F6CF}️ ${esc(EATS.sleep)}</b><small>${esc(run.phase === 'night' ? '' : EATS.sleepHint)}</small></button>
      <button type="button" class="lp-go ti-way" data-ti="order"><b>\u{1F6F5} ${esc(EATS.order)}</b><small>${esc(fill(EATS.orderHint, { fee: EATS.fee }))}</small></button>
      <button type="button" class="lp-go ti-way" data-ti="ask"><b>\u{1F64B} ${esc(EATS.ask)}</b><small>${esc(EATS.askHint)}</small></button>
    </div>
    <button type="button" class="lp-ghost" data-ti="close">${esc(EATS.close)}</button>`)
  pop.addEventListener('click', (event) => {
    const k = event.target.closest('[data-ti]')?.dataset.ti
    if (!k) return
    if (k === 'close') { popClose(); return }
    if (k === 'sleep') { popClose(); note('sleep'); shownFor = ''; api.sleepHome(); return }
    if (k === 'order') { openMenu(); return }
    if (k === 'ask') openAsk()
  })
}

// ---------- SunnyBay Eats ----------
function openMenu() {
  const money = Math.floor(api.save().run.stats.money || 0)
  const rows = eatsMenu().map((d) => {
    const total = d.price + EATS.fee
    return `<button type="button" class="ti-dish" data-ti-dish="${esc(d.id)}" ${total > money ? 'aria-disabled="true"' : ''}><span>${d.icon || ''} ${esc(d.name)}</span><b>R${total}</b></button>`
  }).join('')
  const pop = popOpen('eats', `<p class="lp-kicker">${esc(EATS.brand)}</p><h2>From the Caf</h2><p class="lp-lede">Food price plus R${EATS.fee} delivery. You have ${formatMoney(money)}.</p>
    <div class="ti-menu">${rows}</div><button type="button" class="lp-ghost" data-ti="back">Back</button>`)
  pop.addEventListener('click', (event) => {
    if (event.target.closest('[data-ti="back"]')) { popClose(); openEmpty(); return }
    const b = event.target.closest('[data-ti-dish]')
    if (!b) return
    if (b.getAttribute('aria-disabled') === 'true') { api.toast('Not enough money for that one.'); return }
    placeOrder(b.dataset.tiDish)
  })
}
export function placeOrder(id) {
  const run = api.save().run
  const dish = eatsMenu().find((d) => d.id === id)
  if (!dish) return false
  const total = dish.price + EATS.fee
  if ((run.stats.money || 0) < total) { api.toast('Not enough money for that one.'); return false }
  api.applyFx({ money: -total })
  order = { dish, due: Date.now() + ms(EATS.seconds * 1000) }
  note('order', { id, total })
  popClose()
  api.persist()
  api.paint()
  api.toast(fill(EATS.onTheWay, { minutes: EATS.minutes }))
  return true
}
function arrive() {
  const o = order
  order = null
  const hand = () => {
    const run = api.save().run
    shownFor = '' // (the next time you hit 0 is a new time)
    api.applyFx({ ...o.dish.fx, energy: (o.dish.fx.energy || 0) + EATS.energy })
    note('arrived', { id: o.dish.id })
    api.persist()
    api.paint()
    const line = EATS.riderLines[Math.floor(Math.random() * EATS.riderLines.length)]
    api.toast(`\u{1F6F5} “${fill(line, { name: first(run.character?.name) })}” ${fill(EATS.arrived, { dish: o.dish.name.replace(/ \(.*\)$/, ''), energy: EATS.energy })}`)
    actSound('crunch')
  }
  // a scene that is up shows the rider riding to you (scene.js, city.js, caf.js); none: the food just arrives
  const detail = { done: hand, taken: false }
  window.dispatchEvent(new CustomEvent('mzansi-rider', { detail }))
  note('rider', { scene: detail.taken })
  if (!detail.taken) hand()
}

// ---------- Ask a friend ----------
function friendsHere() {
  const mine = new Set((api.friends() || []).map((f) => f.id))
  return peerList().filter((p) => mine.has(p.id))
}
function openAsk() {
  const list = friendsHere()
  const rows = list.length ? list.map((p) => `<button type="button" class="ti-dish" data-ti-friend="${esc(p.id)}"><span>${esc(p.name)}</span><b>Ask</b></button>`).join('') : `<p class="lp-note">${esc(EATS.askNone)}</p>`
  const pop = popOpen('ask-food', `<p class="lp-kicker">${esc(EATS.ask)}</p><h2>Who's around?</h2><div class="ti-menu">${rows}</div><button type="button" class="lp-ghost" data-ti="back">Back</button>`)
  pop.addEventListener('click', (event) => {
    if (event.target.closest('[data-ti="back"]')) { popClose(); openEmpty(); return }
    const b = event.target.closest('[data-ti-friend]')
    if (b) askFriend(b.dataset.tiFriend, b.querySelector('span')?.textContent || '')
  })
}
export function askFriend(id, name) {
  const run = api.save().run
  if (!sendPoke(id, 'food-ask', { line: fill(EATS.askLine, { name: first(run.character?.name) }) })) { api.toast('Could not reach them right now.'); return false }
  asked = { to: id, name: first(name), at: Date.now() }
  note('asked', { to: id })
  popClose()
  api.toast(fill(EATS.askSent, { friend: first(name) }))
  return true
}

// Pokes: food-ask (to the friend), food-no / food-coming / food-here (back to the hungry one).
function onFoodPoke({ from, kind, name, line }) {
  const who = first(name)
  if (kind === 'food-ask') { openAsked(from, who, line); return }
  if (!asked || asked.to !== from) return
  if (kind === 'food-no') { asked = null; api.toast(fill(EATS.askNo, { friend: who })); return }
  if (kind === 'food-coming') { api.toast(`\u{1F371} ${who} is bringing you food.`); return }
  if (kind === 'food-here') {
    asked = null
    shownFor = ''
    api.applyFx({ hunger: 40, energy: EATS.energy, social: EATS.friendSocial })
    note('fed', { by: from })
    api.persist()
    api.paint()
    api.toast(fill(EATS.friendDone, { friend: who, energy: EATS.energy, social: EATS.friendSocial }))
  }
}
function openAsked(from, who, line) {
  note('was-asked', { from })
  const pop = popOpen('food-ask', `<p class="lp-kicker">\u{1F371} A friend needs you</p><h2>${esc(line || fill(EATS.askLine, { name: who }))}</h2>
    <p class="lp-lede">The food is R${EATS.friendPrice} from you. You walk it over.</p>
    <div class="lp-two"><button class="lp-ghost" type="button" data-ti="no">Can't right now</button><button class="lp-go" type="button" data-ti="yes">Bring food</button></div>`)
  pop.addEventListener('click', (event) => {
    const k = event.target.closest('[data-ti]')?.dataset.ti
    if (!k) return
    popClose()
    if (k === 'no') { sendPoke(from, 'food-no'); return }
    const run = api.save().run
    if ((run.stats.money || 0) < EATS.friendPrice) { api.toast(`You need R${EATS.friendPrice} for the food.`); sendPoke(from, 'food-no'); return }
    api.applyFx({ money: -EATS.friendPrice })
    api.persist()
    sendPoke(from, 'food-coming')
    bring(from, who)
  })
}
// Walk over to them (as walk.js does), then hand it over: within 3 m, or after 25 s whatever happens.
function bring(id, who) {
  api.toast(fill(EATS.bringing, { name: who }))
  const city = () => Boolean(document.body.dataset.city)
  const t0 = Date.now()
  const timer = setInterval(() => {
    const at = peerAt(id)
    const me = whereAmI()
    const d = at && me ? Math.hypot(at.x - me.x, at.z - me.z) : Infinity
    if (d < 3 || Date.now() - t0 > ms(25000)) {
      clearInterval(timer)
      sendPoke(id, 'food-here')
      api.applyFx({ social: EATS.friendSocial })
      note('brought', { to: id })
      api.persist()
      api.paint()
      api.toast(fill(EATS.friendThanks, { name: who, social: EATS.friendSocial }))
      return
    }
    if (at) window.dispatchEvent(new CustomEvent(city() ? 'mzansi-city-walk' : 'mzansi-walk-xz', { detail: { x: at.x + 1.2, z: at.z } }))
  }, 900)
}
