import { avatarSvg, bodiesFor, genderOf, genders, HAIR_BLACK, hairColors, hairsFor, outfitsFor, skins } from '../avatar.js'
import { LOOKING, VIBES, CLASS_OF } from '../cards.js'
import { BIO_MAX } from '../engine/filter.js'
import { myNumber } from '../presence.js'
import { playerCardHtml } from './card.js'
import { tidyHandle } from '../handles.js'

// Enrolment (owner, 6 Nov): three quick screens, one question each, big tappable cards,
// a progress dot, back and skip; then the finished player card, "This is what other
// students see", and Enter campus. Under 45 seconds start to finish.
//   look  - your look (the 3D student fills the screen; rows of cards under it)
//   who   - name or @handle, house (big cards in its colours), where you're from (optional)
//   vibe  - three tags (course, vibe, looking for), then one line for strangers (80
//           characters, suggestions to tap)
//   card  - your card as others see it
// main.js handles the taps (enrol-next, enrol-back, enrol-skip, enrol-pick, enrol-enter).

export const ENROL_STEPS = ['look', 'who', 'vibe', 'card']
export const FROM = ['Durban', 'Joburg', 'Soweto', 'Pretoria', 'Cape Town', 'Eastern Cape', 'Limpopo', 'Mpumalanga', 'Free State', 'North West', 'Elsewhere in Africa', 'Overseas']
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
    from: draft.from || '',
  }
}

function dots(step) {
  const i = ENROL_STEPS.indexOf(step)
  return `<ol class="en-dots" aria-label="Step ${i + 1} of ${ENROL_STEPS.length}">${ENROL_STEPS.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}" aria-current="${k === i ? 'step' : 'false'}"></li>`).join('')}</ol>`
}

function lookStep(state, still) {
  const { district, draft } = state
  const code = district.meta.dialCode
  const g = genderOf(draft.avatar)
  const chosen = (key, id) => (draft.avatar[key] || (key === 'body' ? 'regular' : key === 'hairColor' ? HAIR_BLACK : '')) === id
  const row = (label, items, key) => `<section class="en-row"><h3>${label}</h3><div class="en-strip">${items.map((item) =>
    `<button class="cc-chip en-card${item.fill ? ' sw' : ' th'}" type="button" data-act="avatar" data-part="${key}" data-id="${item.id}" aria-label="${esc(item.label)}" aria-pressed="${chosen(key, item.id)}">${
      item.fill ? `<i style="background:${item.fill}"></i><b>${esc(item.label)}</b>`
        : `<span class="cc-thumb ${key}">${avatarSvg({ ...draft.avatar, [key]: item.id }, code, 40)}</span><b>${esc(item.label)}</b>`
    }</button>`).join('')}</div></section>`
  const genderRow = `<section class="en-row"><h3>You are</h3><div class="en-strip">${genders.map((item) =>
    `<button class="cc-chip en-card th" type="button" data-act="avatar" data-part="gender" data-id="${item.id}" data-gender="${item.id}" aria-pressed="${g === item.id}"><span class="cc-thumb gender">${item.id === 'female' ? '♀' : '♂'}</span><b>${esc(item.label)}</b></button>`).join('')}</div></section>`
  return `<div class="en-look">
      <div class="cc-stage en-stage">
        <button class="cc-mute" type="button" data-act="sound" aria-label="${state.sound === false ? 'Turn music on' : 'Mute music'}" aria-pressed="${state.sound === false}">${state.sound === false ? '\u{1F507}' : '\u{1F3B6}'}</button>
        ${still ? `<img class="cc-still" src="${still}" alt="">` : ''}<i class="cc-loading" aria-hidden="true"></i>
        <div class="cc-bob cc-dance">${avatarSvg(draft.avatar, code, 150)}</div>
      </div>
      <div class="en-rows">
        ${genderRow}
        ${row('Skin', skins, 'skin')}
        ${g === 'male' ? '' : row('Body', bodiesFor(g), 'body')}
        ${row('Hair', hairsFor(g), 'hair')}
        ${row('Hair colour', hairColors, 'hairColor')}
        ${row('Outfit', outfitsFor(g), 'outfit')}
      </div>
    </div>`
}

function whoStep(state) {
  const { district, draft } = state
  const houses = (district.houses || []).map((h) => `<button class="en-house" type="button" data-act="enrol-pick" data-k="residence" data-v="${esc(h.name)}" data-house-pick="${esc(h.id)}" style="--h1:${h.main};--h2:${h.accent}" aria-pressed="${draft.residence === h.name}"><b>${esc(h.name.replace(/ House$/, ''))}</b><small>${esc(h.vibe || '')}</small></button>`).join('')
  const from = FROM.map((f) => `<button class="en-chip" type="button" data-act="enrol-pick" data-k="from" data-v="${esc(f)}" aria-pressed="${draft.from === f}">${esc(f)}</button>`).join('')
  return `<div class="en-who">
      <h2 class="en-q">Who are you?</h2>
      <label class="en-field"><span>Your name</span><input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="given-name" placeholder="Thandi" enterkeyhint="next"></label>
      <label class="en-field en-handle"><span>Your @handle</span><span class="en-at"><b aria-hidden="true">@</b><input id="handle" maxlength="20" value="${esc(tidyHandle(draft.handle))}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="thandi_m" enterkeyhint="done"${draft.handleLocked ? ' disabled' : ''}></span></label>
      <p class="en-hint" data-handle-note>${esc(draft.handleLocked ? `You can change your handle again on ${draft.handleLocked}.` : draft.handleNote || '3 to 20: lowercase letters, numbers, underscores. You can change it once a month.')}</p>
      ${draft.error ? `<p class="en-err" role="alert">${esc(draft.error)}</p>` : ''}
      ${(draft.handleSuggest || []).length ? `<div class="en-chips en-suggest"><span>Free:</span>${draft.handleSuggest.map((h) => `<button class="en-chip" type="button" data-act="enrol-pick" data-k="handle" data-v="${esc(h)}">@${esc(h)}</button>`).join('')}</div>` : ''}
      <h3 class="en-sub">Your house</h3>
      <div class="en-houses">${houses}</div>
      <h3 class="en-sub">Where you're from <span>optional</span></h3>
      <div class="en-chips">${from}</div>
    </div>`
}

function vibeStep(state) {
  const { district, draft } = state
  const group = (label, key, items) => `<h3 class="en-sub">${label}</h3><div class="en-chips">${items.map((v) => `<button class="en-chip" type="button" data-act="enrol-pick" data-k="${key}" data-v="${esc(v)}" data-pick="${key}" aria-pressed="${draft[key] === v}">${esc(v)}</button>`).join('')}</div>`
  const lines = LINES.map((l) => `<button class="en-chip en-line" type="button" data-act="enrol-pick" data-k="bio" data-v="${esc(l)}" aria-pressed="${draft.bio === l}">${esc(l)}</button>`).join('')
  return `<div class="en-vibe">
      <h2 class="en-q">Your vibe</h2>
      ${group('\u{1F4DA} Studying', 'course', district.courses)}
      ${group('✨ Your vibe', 'vibe', VIBES)}
      ${group('\u{1F50E} Looking for', 'looking', LOOKING)}
      <h3 class="en-sub">One line for strangers <span data-bio-count>${(draft.bio || '').length}/${BIO_MAX}</span></h3>
      <input id="bio" class="en-input" maxlength="${BIO_MAX}" value="${esc(draft.bio || '')}" placeholder="Or tap one below" autocomplete="off" enterkeyhint="done">
      ${draft.notice ? `<p class="en-note" role="status">${esc(draft.notice)}</p>` : ''}
      <div class="en-chips">${lines}</div>
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
  const body = step === 'look' ? lookStep(state, still) : step === 'who' ? whoStep(state) : step === 'vibe' ? vibeStep(state) : cardStep(state, photo)
  const first = step === 'look'
  const last = step === 'card'
  const go = last ? `<button class="en-go" type="button" data-act="enrol-enter">${draft.edit ? 'Save changes' : 'Enter campus ›'}</button>`
    : `<button class="en-go" type="button" data-act="enrol-next">Next ›</button>`
  return `<main class="screen en" data-screen="create" data-step="${step}">
    <header class="en-top">
      ${first ? '<a class="en-back" href="#/">‹ Back</a>' : '<button class="en-back" type="button" data-act="enrol-back">‹ Back</button>'}
      ${dots(step)}
      ${last ? '<span class="en-skip" aria-hidden="true"></span>' : '<button class="en-skip" type="button" data-act="enrol-skip">Skip</button>'}
    </header>
    <div class="en-body">${body}</div>
    <footer class="en-foot">${go}</footer>
  </main>`
}
