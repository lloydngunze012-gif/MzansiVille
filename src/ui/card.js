import { avatarSvg } from '../avatar.js'

// The player card (build plan, Piece 1a): one phone screen, nothing scrolling. The same
// card for your own (with Edit) and for anyone you tap on campus. Never an age.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']

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
  return `<article class="pcard" style="${vars}" data-house="${esc(house?.id || '')}">
    <header class="pc-top"><span class="pc-house">${esc((house?.name || card.house || 'UMzansi').toUpperCase())}</span><span class="pc-class">Class of ${esc(card.classOf || 2026)}</span></header>
    <div class="pc-main">
      <div class="pc-photo">${photo}</div>
      <div class="pc-id">
        <h2 class="pc-name">${esc(card.name || 'Student')}</h2>
        <p class="pc-handle">${card.handle ? `@${esc(card.handle)}` : opts.own ? '<span class="empty">no @handle yet</span>' : ''}</p>
        <p class="pc-num"><small>Student no.</small> <b>${esc(num || '—')}</b>${opts.provisional ? ' <i title="Real numbers arrive with enrolment">provisional</i>' : ''}</p>
      </div>
    </div>
    <p class="pc-bio">${bio}</p>
    <ul class="pc-tags">${tagHtml}</ul>
    <dl class="pc-facts"><div><dt>Year</dt><dd>${esc(ORD[card.year] || `${card.year}th`)} year</dd></div><div><dt>On campus</dt><dd>${esc(card.days || 1)} day${(card.days || 1) === 1 ? '' : 's'}</dd></div><div><dt>UMzansi</dt><dd>Student</dd></div></dl>
    <div class="pc-badges">${badges}</div>
  </article>`
}
