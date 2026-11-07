// Lloyd's smoothness page (#/smooth, admin only; docs/design/smoothness-reports.md section 5).
// The rows come from smooth_reports (main.js loadSmooth), aggregated here in the browser by
// src/engine/smooth-stats.js: a Places table and a Devices table, worst first (red when the
// worst 10% are under 20 fps or over 5% of the time was; amber when typical is under 30), the
// load line, and a tapped place's last 20 stalls. Cream theme.
// On a phone (up to 480 px wide) nothing scrolls sideways: Places and Devices keep Place (or
// Device), Typical, Worst 10%, <20 fps and Stalls, and tapping a row opens the rest (players,
// minutes, long frames a minute, tap ms) under it; the stall list keeps Kind, How and When, with
// the device on a second line and x, z small. On a computer every column shows, as before.
import { AMBER_TYPICAL, RED_LOW, RED_SHARE, byDevice, byPlace, loadLine, placeName, stallsOf } from '../engine/smooth-stats.js'

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const dash = '–'
const n0 = (v) => (v === null || v === undefined ? dash : String(Math.round(v)))
const n1 = (v) => (v === null || v === undefined ? dash : (Math.round(v * 10) / 10).toString())
const secs = (ms) => (ms === null || ms === undefined ? dash : `${(ms / 1000).toFixed(1)} s`)

// kind: 'places' (tap a row: its stalls, and on a phone the rest of its numbers) or 'devices'
// (tap a row: on a phone the rest of its numbers). open: the key of the row that's open.
function table(kind, groups, open) {
  const act = kind === 'places' ? 'smooth-place' : 'smooth-device'
  const rows = groups.map((g) => {
    // (c-more cells are the ones a phone hides until the row is tapped)
    const cells = `<th scope="row" class="sm-name" title="${esc(g.key)}">${esc(g.label)}</th><td class="c-more">${g.players}</td><td class="c-more">${n1(g.minutes)}</td><td>${n0(g.typical)}</td><td>${n0(g.low)}</td><td>${n1(g.below20)}%</td><td class="c-more">${n1(g.longPerMin)}</td><td>${g.stalls}</td><td class="c-more">${n0(g.tapMs)}</td>`
    const isOpen = open === g.key
    const row = `<tr class="sm-row ${g.status}${isOpen ? ' open' : ''}" data-status="${g.status}" data-key="${esc(g.key)}" data-act="${act}" data-id="${esc(g.key)}" tabindex="0" role="button" aria-expanded="${isOpen}" aria-label="${esc(g.label)}: ${kind === 'places' ? 'show its stalls and numbers' : 'show its numbers'}">${cells}</tr>`
    const more = isOpen
      ? `<tr class="sm-detail" data-detail="${esc(g.key)}"><td colspan="9"><dl><div><dt>Players</dt><dd>${g.players}</dd></div><div><dt>Minutes</dt><dd>${n1(g.minutes)}</dd></div><div><dt>Long/min</dt><dd>${n1(g.longPerMin)}</dd></div><div><dt>Tap ms</dt><dd>${n0(g.tapMs)}</dd></div></dl></td></tr>`
      : ''
    return row + more
  }).join('')
  return `<div class="sm-wrap"><table class="sm-table" data-table="${kind}">
    <thead><tr><th scope="col">${kind === 'places' ? 'Place' : 'Device'}</th><th scope="col" class="c-more">Players</th><th scope="col" class="c-more">Min</th><th scope="col" title="typical fps">Typical</th><th scope="col" title="fps of the worst 10% of frames">Worst 10%</th><th scope="col" title="share of time under 20 fps">&lt;20 fps</th><th scope="col" class="c-more" title="frames over 50 ms, per minute">Long/min</th><th scope="col">Stalls</th><th scope="col" class="c-more" title="tap to first step, median ms">Tap ms</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="sm-none">No reports in this range.</td></tr>'}</tbody>
  </table></div>`
}

function clockHtml(kind, label, l) {
  if (!l.all.n) return `<p class="sm-load" data-load="${kind}">${label}: no reports yet.</p>`
  const net = l.byNet.map((x) => `<li><b>${esc(x.net)}</b> ${secs(x.median)} median, ${secs(x.slow)} slowest 10% <small>(${x.n})</small></li>`).join('')
  return `<p class="sm-load" data-load="${kind}">${label}: <b>${secs(l.all.median)}</b> median, <b>${secs(l.all.slow)}</b> slowest 10% <small>(${l.all.n} sessions)</small></p><ul class="sm-net" data-net="${kind}">${net}</ul>`
}
function loadHtml(rows) {
  const l = loadLine(rows)
  return clockHtml('boot', 'Open to title', l.boot) + clockHtml('load', 'Tap to playing', l.load)
}

// "13:47" for today, "7 Nov 13:47" for an earlier day (short); the long form for a computer.
function whenParts(iso) {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return { short: esc(iso), long: esc(iso) }
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  const today = new Date().toDateString() === d.toDateString()
  const day = d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
  return { short: today ? time : `${day} ${time}`, long: d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
}

function stallsHtml(group) {
  if (!group) return ''
  const list = stallsOf(group)
  const rows = list.map((s) => {
    const w = whenParts(s.when)
    return `<tr><td class="c-id">${esc(group.key)}</td><td>${esc(s.kind)}</td><td class="sm-how">${esc(s.how)}</td><td class="sm-xz">${n1(s.x)}</td><td class="sm-xz">${n1(s.z)}</td><td class="sm-when"><span class="when-long">${w.long}</span><span class="when-short">${w.short}</span><small class="sm-dev">${esc(s.device)}</small></td><td class="c-device">${esc(s.device)}</td></tr>`
  }).join('')
  return `<section class="sm-stalls" data-stalls="${esc(group.key)}"><h2>Last stalls at ${esc(group.label)} <small>(${esc(group.key)})</small></h2>${list.length
    ? `<div class="sm-wrap"><table class="sm-table sm-stall-table"><thead><tr><th class="c-id">Place id</th><th>Kind</th><th>How</th><th class="sm-xz">x</th><th class="sm-xz">z</th><th>When</th><th class="c-device">Device</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="fine">No stalls here in this range.</p>'}</section>`
}

export function smoothScreen(state) {
  const s = state.smooth || {}
  const allowed = Boolean(state.admin?.allowed || s.injected)
  const range = s.range || '7d'
  const rows = s.rows || []
  const names = { places: state.district?.places || [], houses: state.district?.houses || [] }
  const places = byPlace(rows, (r) => placeName(r.place, names))
  const picked = places.find((g) => g.key === s.place)
  const range1 = (key, label) => `<button type="button" class="sm-range${range === key ? ' on' : ''}" data-act="smooth-range" data-v="${key}" aria-pressed="${range === key}">${label}</button>`
  return `<main class="screen pad sm" data-screen="smooth">
    <a class="link" href="#/admin">Back</a>
    <h1 style="margin-top:12px">Smoothness</h1>
    ${allowed ? '' : '<p class="lede">Admins only. Set role to admin in Supabase, then sign in.</p>'}
    ${allowed ? `<div class="sm-ranges" role="group" aria-label="Range">${range1('24h', 'Last 24 h')}${range1('7d', 'Last 7 days')}</div>
    <p class="fine" data-count>${rows.length} report${rows.length === 1 ? '' : 's'}${rows.length >= 5000 ? ' (the newest 5,000)' : ''}${s.error ? ` · ${esc(s.error)}` : ''}${s.loading ? ' · loading' : ''}</p>
    <p class="fine sm-key"><span class="sm-dot red"></span>worst 10% under ${RED_LOW} fps, or over ${RED_SHARE}% of the time under ${RED_LOW} <span class="sm-dot amber"></span>typical under ${AMBER_TYPICAL}</p>
    ${loadHtml(rows)}
    <h2>Places</h2>
    ${table('places', places, s.place)}
    ${stallsHtml(picked)}
    <h2>Devices</h2>
    ${table('devices', byDevice(rows), s.device)}` : ''}
  </main>`
}
