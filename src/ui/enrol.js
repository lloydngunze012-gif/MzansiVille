import { avatarSvg, bodiesFor, genderOf, genders, HAIR_BLACK, hairColors, hairsFor, outfitsFor, skins } from '../avatar.js'
import { LOOKING, VIBES, CLASS_OF } from '../cards.js'
import { BIO_MAX } from '../engine/filter.js'
import { myNumber } from '../presence.js'
import { playerCardHtml } from './card.js'
import { themePicker } from '../theme.js'
import { tidyHandle } from '../handles.js'
import REGIONS from '../../data/campusville/regions.json'
import { COUNTRY_GROUPS, countryEmoji, countryFlag, countryOf, flagOf, fromPlace, PROVINCES } from '../from.js'
import { roommateFor, roommatesFor, roommateLook } from '../roommates.js'
import { faceHtml } from '../faces3d.js'

// Enrolment (owner, 6 Nov): three quick screens, one question each, big tappable cards,
// a progress dot, back and skip; then the finished player card, "This is what other
// students see", and Enter campus. Under 45 seconds start to finish.
//   look  - your look (the 3D student fills the screen; rows of cards under it)
//           ('Where are you from?' is a dropdown first in its rows; South Africa is the default)
//   roommate - your roommate: four cards for your res, the default pre-selected
//   who   - name or @handle, house (big cards in its colours), where you're from (optional)
//   vibe  - three tags (course, vibe, looking for), then one line for strangers (80
//           characters, suggestions to tap)
//   card  - your card as others see it
// main.js handles the taps (enrol-next, enrol-back, enrol-skip, enrol-pick, enrol-enter).

export const ENROL_STEPS = ['look', 'roommate', 'who', 'vibe', 'card']
export { FROM } from '../from.js'
export const LINES = [
  'New here, say howzit',
  'Find me at the Quad with a coffee',
  'Will trade notes for food',
  'Amapiano on, books open',
  'First time away from home',
  'Gym in the morning, library at night',
]

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The card the draft makes (the same card others will see on campus).
export function draftCard(district, draft) {
  return {
    name: draft.name.trim().replace(/^@/, '') || 'Student',
    handle: tidyHandle(draft.handle),
    num: myNumber(),
    house: draft.residence,
    bio: draft.bio || '',
    tags: { course: draft.course || '', vibe: draft.vibe || '', looking: draft.looking || '' },
    year: 1,
    days: 1,
    badges: [],
    look: draft.avatar,
    classOf: CLASS_OF,
    from: fromPlace(draft.from),
    country: draft.country || 'South Africa',
  }
}

function dots(step) {
  const i = ENROL_STEPS.indexOf(step)
  return `<ol class="en-dots" aria-label="Step ${i + 1} of ${ENROL_STEPS.length}">${ENROL_STEPS.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}" aria-current="${k === i ? 'step' : 'false'}"></li>`).join('')}</ol>`
}

// The student card you fill in (owner's pick, 8 Nov, direction C "Student card"): on the look step
// its photo is the live 3D student (.cc-stage); on who and vibe it's your portrait (.cc-photo, filled
// by main.js) and the card fills in as you go: your name as you type, your house's colours, your tags.
// The next empty slot glows.
// Where you're from, on the card, with its flag (from.js flagOf).
function fromBadge(from) {
  const place = fromPlace(from)
  return place ? `<span class="en-idfrom">${flagOf(place)}${esc(place)}</span>` : ''
}
const fmtNum = (n) => String(n || '').replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3')
function idCard(state, { live = '', step }) {
  const { district, draft } = state
  const house = district.houses?.find((h) => h.name === draft.residence) || null
  const vars = house ? ` style="--h1:${house.main};--h2:${house.accent}"` : ''
  const name = draft.name.trim().replace(/^@/, '')
  const handle = tidyHandle(draft.handle)
  const slots = [['course', 'Course'], ['vibe', 'Vibe'], ['looking', 'Looking for']]
  const next = step === 'vibe' ? slots.find(([k]) => !draft[k])?.[0] : ''
  const tags = slots.map(([k, label]) => draft[k]
    ? `<li data-g="${k}">${icon(draft[k])}${esc(draft[k])}</li>`
    : `<li data-g="${k}" class="empty${next === k ? ' next' : ''}">${label}</li>`).join('')
  // (job D, owner 11 Nov: on every step the photo is your own 3D student, turning slowly, the same live stage as the
  // look step at a smaller size; the picture under it is what shows until the 3D is in, and all that shows without it)
  const photo = live || `<div class="cc-stage en-idstage cc-mini"><div class="en-idphoto">${avatarSvg(draft.avatar, district.meta.dialCode, 90)}</div><i class="cc-loading" aria-hidden="true"></i></div>`
  return `<div class="en-id${live ? ' en-stage' : ''}${house ? ' housed' : ''}" data-id-step="${step}"${vars}>
      <div class="en-idbar"><span class="en-crest" aria-hidden="true">U</span><span>${esc(house ? house.name : 'University of Mzansi')}</span><span class="en-idkind">${house ? `Class of ${CLASS_OF}` : 'Student'}</span></div>
      <div class="en-idphoto-box">${photo}</div>
      <div class="en-idinfo">
        ${live ? '<small>Name</small>' : ''}<b class="en-idname${name ? '' : ' ph'}" data-card-name>${esc(name || 'Your name')}</b>${fromBadge(draft.from || draft.country)}
        ${live ? '<small>Student no.</small>' : ''}<span class="en-idnum"><span data-card-handle>${live || !handle ? '' : `@${esc(handle)} · `}</span>${fmtNum(myNumber())}</span>
        ${live ? `<small>Class of</small><b class="en-idyear">${CLASS_OF}</b>` : ''}
        <ul class="en-idtags">${house ? '' : '<li class="empty">House</li>'}${tags}</ul>
        ${draft.bio && step !== 'look' ? `<q class="en-idq">${esc(draft.bio)}</q>` : ''}
      </div>
      <i class="en-holo" aria-hidden="true"></i>
    </div>`
}

function lookStep(state, still) {
  const { district, draft } = state
  const code = district.meta.dialCode
  const g = genderOf(draft.avatar)
  const chosen = (key, id) => (draft.avatar[key] || (key === 'body' ? 'regular' : key === 'hairColor' ? HAIR_BLACK : '')) === id
  const pickedLabel = (items, key) => items.find((item) => chosen(key, item.id))?.label || ''
  const row = (label, items, key) => `<section class="en-row"><h3>${label}<em>${esc(pickedLabel(items, key))}</em></h3><div class="en-strip">${items.map((item) =>
    `<button class="cc-chip en-card${item.fill ? ' sw' : ' th'}" type="button" data-act="avatar" data-part="${key}" data-id="${item.id}" aria-label="${esc(item.label)}" aria-pressed="${chosen(key, item.id)}">${
      item.fill ? `<i style="background:${item.fill}"></i><b>${esc(item.label)}</b>`
        : `<span class="cc-thumb ${key}">${avatarSvg({ ...draft.avatar, [key]: item.id }, code, 40)}</span><b>${esc(item.label)}</b>`
    }</button>`).join('')}</div></section>`
  const genderRow = `<section class="en-row en-you"><h3>You are</h3><div class="en-strip">${genders.map((item) =>
    `<button class="cc-chip en-card th" type="button" data-act="avatar" data-part="gender" data-id="${item.id}" data-gender="${item.id}" aria-pressed="${g === item.id}"><span class="cc-thumb gender">${item.id === 'female' ? '♀' : '♂'}</span><b>${esc(item.label)}</b></button>`).join('')}</div></section>`
  const stage = `<div class="cc-stage en-idstage">
        <i class="en-spark" aria-hidden="true"></i>
        <span class="en-turn" aria-hidden="true">Drag to turn</span>
        ${still ? `<img class="cc-still" src="${still}" alt="">` : ''}<i class="cc-loading" aria-hidden="true"></i>
        <div class="cc-bob cc-dance">${avatarSvg(draft.avatar, code, 150)}</div>
      </div>`
  return `<div class="en-look">
      ${themePicker(true)}
      ${idCard(state, { live: stage, step: 'look' }).replace('<i class="en-holo"', `<button class="cc-mute" type="button" data-act="sound" aria-label="${state.sound === false ? 'Turn music on' : 'Mute music'}" aria-pressed="${state.sound === false}">${state.sound === false ? '\u{1F507}' : '\u{1F3B6}'}</button><i class="en-holo"`)}
      <div class="en-rows">
        ${countryPick(state)}
        ${genderRow}
        ${row('Skin', skins, 'skin')}
        ${g === 'male' ? '' : row('Body', bodiesFor(g), 'body')}
        ${row('Hair', hairsFor(g), 'hair')}
        ${row('Hair colour', hairColors, 'hairColor')}
        ${row('Outfit', outfitsFor(g), 'outfit')}
      </div>
    </div>`
}

// Where are you from? A dropdown like the ones on the who step: the pill shows your country with its
// drawn flag, the phone's own list opens on tap (each option has its flag emoji; African countries
// first, then the rest of the world). South Africa is the default. No intro text.
// South Africa: which province? (optional) It picks the day-1 home (a suburban house or a township street house).
// Social A (owner, 11 Nov): every African country in the list gets the same optional second dropdown, under its own
// word (province, state, county, region...: data/campusville/regions.json). V2.1: so do the United States, the
// United Kingdom, Australia, India and China. Other countries get none.
function provincePick(state) {
  const mine = countryOf({ country: state.draft.country })
  const info = REGIONS[mine]
  if (!info) return ''
  const sa = mine === 'South Africa'
  // Notifications (owner, 11 Nov): South Africa's dropdown also holds each province's main towns (regions.json
  // `towns`), optional: a province alone, or "Province|Town". The pill shows the town when one is picked.
  if (sa && info.towns) {
    const prov = PROVINCES.includes(fromPlace(state.draft.from)) ? fromPlace(state.draft.from) : ''
    const town = prov && (info.towns[prov] || []).includes(state.draft.town) ? state.draft.town : ''
    const groups = PROVINCES.map((p) => `<optgroup label="${esc(p)}"><option value="${esc(p)}"${p === prov && !town ? ' selected' : ''}>${esc(p)} (anywhere)</option>${(info.towns[p] || []).map((t) => `<option value="${esc(`${p}|${t}`)}"${p === prov && t === town ? ' selected' : ''}>${esc(t)}</option>`).join('')}</optgroup>`).join('')
    return `<label class="en-frompick en-ctypick en-provpick" data-province-pick aria-pressed="${Boolean(prov)}"><span>${esc(town || prov || info.label)}</span><b aria-hidden="true">▾</b>
        <select data-province aria-label="Which province or town?"><option value="">${esc(info.label)} (optional)</option>${groups}</select></label>`
  }
  const list = sa ? PROVINCES : info.list || []
  const now = sa ? (PROVINCES.includes(fromPlace(state.draft.from)) ? fromPlace(state.draft.from) : '') : list.includes(state.draft.region) ? state.draft.region : ''
  return `<label class="en-frompick en-ctypick en-provpick" data-province-pick aria-pressed="${Boolean(now)}"><span>${esc(now || info.label)}</span><b aria-hidden="true">▾</b>
        <select ${sa ? 'data-province' : 'data-region'} aria-label="Which ${esc(info.label.toLowerCase())}?"><option value="">${esc(info.label)} (optional)</option>${list.map((p) => `<option value="${esc(p)}"${p === now ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>`
}

export function countryPick(state, { province = true } = {}) {
  const mine = countryOf({ country: state.draft.country })
  const opts = COUNTRY_GROUPS.map((g) => `<optgroup label="${esc(g.label)}">${g.countries.map((c) => `<option value="${esc(c.id)}"${c.id === mine ? ' selected' : ''}>${countryEmoji(c.id)} ${esc(c.id)}</option>`).join('')}</optgroup>`).join('')
  return `<section class="en-row en-ctyrow"><h3>Where are you from?</h3>
      <div class="en-ctypair"><label class="en-frompick en-ctypick" data-country-pick aria-pressed="true">${countryFlag(mine)}<span>${esc(mine)}</span><b aria-hidden="true">▾</b>
        <select data-country aria-label="Where are you from?">${opts}</select></label>${province ? provincePick(state) : ''}</div></section>`
}

// Your roommate: four students share your res; the default (your res, the skin closest to yours) is picked.
function roommateStep(state) {
  const { draft } = state
  const gender = genderOf(draft.avatar)
  const mine = roommateFor({ avatar: draft.avatar, roommate: draft.roommate })
  const cards = roommatesFor(gender).map((r) => {
    const look = roommateLook(r)
    return `<button class="en-roomie" type="button" data-act="enrol-pick" data-k="roommate" data-v="${esc(r.id)}" data-roommate="${esc(r.id)}" aria-pressed="${mine.id === r.id}">
        <span class="en-rface" aria-hidden="true">${faceHtml(look, 60)}</span>
        <b>${esc(r.name)}</b><small>${esc(r.blurb)}</small>
      </button>`
  }).join('')
  return `<div class="en-roommate">
      ${idCard(state, { step: 'roommate' })}
      <h2 class="en-q">Your roommate</h2>
      <p class="en-lede">${gender === 'male' ? "Four students share the men's res." : "Four students share the women's res."} Tap to change.</p>
      <div class="en-roomies">${cards}</div>
    </div>`
}

function whoStep(state) {
  const { district, draft } = state
  const houses = (district.houses || []).map((h) => `<button class="en-house" type="button" data-act="enrol-pick" data-k="residence" data-v="${esc(h.name)}" data-house-pick="${esc(h.id)}" style="--h1:${h.main};--h2:${h.accent}" aria-pressed="${draft.residence === h.name}"><b>${esc(h.name.replace(/ House$/, ''))}</b><small>${esc(h.vibe || '')}</small></button>`).join('')
  return `<div class="en-who">
      ${idCard(state, { step: 'who' })}
      <h2 class="en-q">Who are you?</h2>
      <label class="en-field"><span>Your name</span><input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="given-name" placeholder="Emma" enterkeyhint="next"></label>
      <label class="en-field en-handle"><span>Your @handle</span><span class="en-at"><b aria-hidden="true">@</b><input id="handle" maxlength="20" value="${esc(tidyHandle(draft.handle))}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="emma_m" enterkeyhint="done"${draft.handleLocked ? ' disabled' : ''}></span></label>
      <p class="en-hint" data-handle-note>${esc(draft.handleLocked ? `You can change your handle again on ${draft.handleLocked}.` : draft.handleNote || '3 to 20: lowercase letters, numbers, underscores. You can change it once a month.')}</p>
      ${draft.error ? `<p class="en-err" role="alert">${esc(draft.error)}</p>` : ''}
      ${(draft.handleSuggest || []).length ? `<div class="en-chips en-suggest"><span>Free:</span>${draft.handleSuggest.map((h) => `<button class="en-chip" type="button" data-act="enrol-pick" data-k="handle" data-v="${esc(h)}">@${esc(h)}</button>`).join('')}</div>` : ''}
      <h3 class="en-sub">Your house</h3>
      <div class="en-houses">${houses}</div>
    </div>`
}

// A small picture for every tag (looks only: a name that isn't here just shows without one).
const ICON = {
  Accounting: '🧮', 'Information Systems': '🗂️', Management: '📈', Marketing: '📣', 'Computer Science': '💻',
  Engineering: '⚙️', Law: '⚖️', Medicine: '🩺', Nursing: '🏥', Science: '🔬',
  Bookworm: '📚', 'Party starter': '🎉', 'Gym rat': '💪', Creative: '🎨', Gamer: '🎮', Foodie: '🍔',
  Chilled: '😎', Hustler: '💸', Sporty: '⚽', 'Music head': '🎧',
  'Study buddy': '📖', 'New friends': '🤝', 'Someone to eat with': '🍽️', 'Gym partner': '🏋️',
  'Crew for the hunts': '🌙', 'Party people': '🪩', 'A society to join': '🏛️', 'Just vibing': '✌️',
}
const icon = (v) => (ICON[v] ? `<i aria-hidden="true">${ICON[v]}</i>` : '')

function vibeStep(state) {
  const { district, draft } = state
  const group = (n, label, key, items) => `<section class="en-group" data-g="${key}" data-done="${Boolean(draft[key])}">
      <h3 class="en-gh"><span class="en-num" aria-hidden="true">${draft[key] ? '✓' : n}</span>${label}</h3>
      <div class="en-chips">${items.map((v) => `<button class="en-chip" type="button" data-act="enrol-pick" data-k="${key}" data-v="${esc(v)}" data-pick="${key}" aria-pressed="${draft[key] === v}">${icon(v)}${esc(v)}</button>`).join('')}</div>
    </section>`
  const lines = LINES.map((l) => `<button class="en-chip en-line" type="button" data-act="enrol-pick" data-k="bio" data-v="${esc(l)}" aria-pressed="${draft.bio === l}">${esc(l)}</button>`).join('')
  return `<div class="en-vibe">
      ${idCard(state, { step: 'vibe' })}
      <h2 class="en-q">What's your vibe?</h2>
      <p class="en-lede">Every tap lands on your card. It's how people on campus find their crew.</p>
      ${group(1, 'Studying', 'course', district.courses)}
      ${group(2, 'Your vibe', 'vibe', VIBES)}
      ${group(3, 'Looking for', 'looking', LOOKING)}
      <section class="en-group en-opener" data-g="bio" data-done="${Boolean(draft.bio)}">
        <h3 class="en-gh"><span class="en-num" aria-hidden="true">${draft.bio ? '✓' : 4}</span>Your opener <span class="en-count" data-bio-count>${(draft.bio || '').length}/${BIO_MAX}</span></h3>
        <div class="en-bubble"><input id="bio" class="en-input" maxlength="${BIO_MAX}" value="${esc(draft.bio || '')}" placeholder="Say something, or tap one below" autocomplete="off" enterkeyhint="done"></div>
        ${draft.notice ? `<p class="en-note" role="status">${esc(draft.notice)}</p>` : ''}
        <div class="en-chips">${lines}</div>
      </section>
    </div>`
}

function cardStep(state, photo) {
  const { district, draft } = state
  const card = draftCard(district, draft)
  const house = district.houses?.find((h) => h.name === draft.residence) || null
  const html = playerCardHtml(card, house, { provisional: true, photo }).replace('class="pc-photo"', 'class="pc-photo cc-photo"')
  return `<div class="en-done">
      <h2 class="en-q">This is what other students see</h2>
      ${html}
    </div>`
}

export function enrolScreen(state, { still = '', photo = '' } = {}) {
  const { draft } = state
  const step = ENROL_STEPS.includes(draft.step) ? draft.step : 'look'
  // (an old save is only asked its country: one step, then back into the game)
  if (draft.countryOnly) {
    return `<main class="screen en" data-screen="create" data-step="look" data-country-only="1">
    <header class="en-top"><span class="en-skip" aria-hidden="true"></span><span></span><span class="en-skip" aria-hidden="true"></span></header>
    <div class="en-body"><div class="en-country">${countryPick(state)}</div></div>
    <footer class="en-foot"><button class="en-go" type="button" data-act="enrol-country-save">Continue ›</button></footer>
  </main>`
  }
  const body = step === 'look' ? lookStep(state, still) : step === 'roommate' ? roommateStep(state) : step === 'who' ? whoStep(state) : step === 'vibe' ? vibeStep(state) : cardStep(state, photo)
  const first = step === 'look'
  const last = step === 'card'
  // (opened from the top bar's face button: the look can be saved on its own, straight back to the game)
  const lookOnly = first && draft.edit && draft.toPlay
  const go = last ? `<button class="en-go" type="button" data-act="enrol-enter">${draft.edit ? 'Save changes' : 'Enter campus ›'}</button>`
    : lookOnly ? `<button class="en-go" type="button" data-act="enrol-save-look">Save my look</button><button class="en-more" type="button" data-act="enrol-next">Name, house and card ›</button>`
    : `<button class="en-go" type="button" data-act="enrol-next">Next ›</button>`
  return `<main class="screen en" data-screen="create" data-step="${step}">
    <header class="en-top">
      ${first ? `<a class="en-back" href="${draft.edit && draft.toPlay ? '#/play' : '#/'}">‹ Back</a>` : '<button class="en-back" type="button" data-act="enrol-back">‹ Back</button>'}
      ${dots(step)}
      ${last || lookOnly ? '<span class="en-skip" aria-hidden="true"></span>' : '<button class="en-skip" type="button" data-act="enrol-skip">Skip</button>'}
    </header>
    <div class="en-body">${body}</div>
    <footer class="en-foot">${go}</footer>
  </main>`
}
