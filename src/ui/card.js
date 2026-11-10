import { avatarSvg } from '../avatar.js'
import { flagOf, fromPlace } from '../from.js'
import { canonicalHouse } from '../houses.js'

// The player card (build plan, Piece 1a): one phone screen, nothing scrolling. The same
// card for your own (with Edit) and for anyone you tap on campus. Never an age.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const ORD =['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']

// card: cards.js cardOf / loadCard. house: houses.json entry (colours), or null.
// opts.photo: an image URL for the portrait (a 3D still), else the drawn one.
// opts.own: placeholders invite you to fill your card in.
export function playerCardHtml(card, house, opts = {}) {
  const vars = house ? `--h1:${house.main};--h2:${house.accent}` : ''
  const num = String(card.num || '').replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3')
  const tags = [['\u{1F4DA}', card.tags?.course], ['✨', card.tags?.vibe], ['\u{1F50E}', card.tags?.looking]]
  const tagHtml = tags.map(([ic, t]) => (t ? `<li>${ic} ${esc(t)}</li>` : opts.own ? `<li class="empty">${ic} add a tag</li>` : '')).join('')
  const bio = card.bio ? `“${esc(card.bio)}”` : opts.own ? '<span class="empty">Add one line about you</span>' : '<span class="empty">No bio yet</span>'
  const badges = (card.badges || []).length ? card.badges.map((b) => `<span class="pc-badge">\u{1F3C5} ${esc(b)}</span>`).join('') : '<span class="pc-badge none">No badges yet</span>'
  const photo = opts.photo ? `<img src="${esc(opts.photo)}" alt="">` : avatarSvg(card.look || {}, '031', 96)
  // (City job B: the latest three show-offs bought in SunnyBay)
  const flex = (card.flex || []).slice(0, 3)
  const theme = 'white' // the student card is always white (owner, 8 Nov)
  return `<article class="pcard" style="${vars}" data-theme="${theme}" data-house="${esc(house?.id || '')}">
    <header class="pc-top"><span class="pc-house">${esc((house?.name || canonicalHouse(card.house) || 'UMzansi').toUpperCase())}</span><span class="pc-class">Class of ${esc(card.classOf || 2026)}</span></header>
    <div class="pc-main">
      <div class="pc-photo">${photo}</div>
      <div class="pc-id">
        <h2 class="pc-name">${esc(card.name || 'Student')}</h2>
        <p class="pc-handle">${card.handle ? `@${esc(card.handle)}` : opts.own ? '<span class="empty">no @handle yet</span>' : ''}</p>
        ${card.from || card.country ? `<p class="pc-from">${flagOf(card.from || card.country)} From ${esc(fromPlace(card.from || card.country))}</p>` : ''}
        <p class="pc-num"><small>Student no.</small> <b>${esc(num || '—')}</b>${opts.provisional ? ' <i title="Real numbers arrive with enrolment">provisional</i>' : ''}</p>
      </div>
    </div>
    <p class="pc-bio">${bio}</p>
    <ul class="pc-tags">${tagHtml}</ul>
    <dl class="pc-facts"><div><dt>Year</dt><dd>${esc(ORD[card.year] || `${card.year}th`)} year</dd></div><div><dt>On campus</dt><dd>${esc(card.days || 1)} day${(card.days || 1) === 1 ? '' : 's'}</dd></div><div><dt>UMzansi</dt><dd>Student</dd></div></dl>
    <div class="pc-badges">${badges}</div>
    ${flex.length ? `<div class="pc-flex"><small>Show-offs</small>${flex.map((f) => `<span class="pc-badge flex">\u2728 ${esc(f)}</span>`).join('')}</div>` : ''}
  </article>`
}

// Meeting people (owner, 10 Nov), item 1: the mini card. About a third of the screen,
// the world visible behind it, never a dialog (main.js gives it no role so it never
// pauses movement; src/ui/minicard-state.js closes it when you walk away). Face,
// name, flag, @handle, the vibe line, one grey "House · Course · Year" line, then
// Wave / Say hi / (Race, in the city) / a ⋯ menu for Add friend, View full card,
// Block, Report.
export function miniCardHtml(card, house, opts = {}) {
  const vars = house ? `--h1:${house.main};--h2:${house.accent}` : ''
  const photo = opts.photo ? `<img src="${esc(opts.photo)}" alt="">` : avatarSvg(card.look || {}, '031', 72)
  const friend = Boolean(opts.friend)
  const houseName = house?.name || canonicalHouse(card.house) || 'UMzansi'
  const grey = [houseName, card.tags?.course, card.year ? `${esc(ORD[card.year] || `${card.year}th`)} year` : ''].filter(Boolean).join(' · ')
  const flag = (card.from || card.country) ? flagOf(card.from || card.country) : ''
  return `<article class="pc-mini" data-house="${esc(house?.id || '')}" style="${vars}">
    <div class="pc-mini-row">
      <div class="pc-mini-face">${photo}</div>
      <div class="pc-mini-id">
        <p class="pc-mini-name">${esc(card.name || 'Student')} ${flag}${card.handle ? `<small>@${esc(card.handle)}</small>` : ''}</p>
        <p class="pc-mini-vibe">${card.tags?.vibe ? `✨ ${esc(card.tags.vibe)}` : '<span class="empty">No vibe set yet</span>'}</p>
        <p class="pc-mini-grey">${esc(grey || 'UMzansi student')}</p>
      </div>
      <button type="button" class="pc-mini-x" data-pc="close" aria-label="Close">✕</button>
    </div>
    <div class="pc-mini-acts">
      <button type="button" class="pc-mini-wave" data-pc="wave">\u{1F44B} Wave</button>
      <button type="button" data-pc="hi">\u{1F4AC} Say hi</button>
      ${opts.race ? '<button type="button" class="pc-mini-race" data-pc="race">\u{1F3C1} Race</button>' : ''}
      <span class="pc-mini-more">
        <button type="button" data-pc="more" aria-haspopup="true" aria-expanded="${opts.moreOpen ? 'true' : 'false'}" aria-label="More">⋯</button>
        <span class="pc-mini-menu"${opts.moreOpen ? '' : ' hidden'}>
          <button type="button" data-pc="friend"${friend ? ' disabled' : ''}>${friend ? '✓ Friends' : '➕ Add friend'}</button>
          <button type="button" data-pc="full">\u{1F4C7} View full card</button>
          <button type="button" class="bad" data-pc="block">\u{1F6AB} Block</button>
          <button type="button" class="bad" data-pc="report">⚑ Report</button>
        </span>
      </span>
    </div>
  </article>`
}
