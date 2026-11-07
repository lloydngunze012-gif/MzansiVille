// Lloyd's smoothness page (#/smooth, admin only; docs/design/smoothness-reports.md section 5).
// The rows come from smooth_reports (main.js loadSmooth), aggregated here in the browser by
// src/engine/smooth-stats.js: a Places table and a Devices table, worst first (red when the
// worst 10% are under 20 fps or over 5% of the time was; amber when typical is under 30), the
// load line, and a tapped place's last 20 stalls. Cream theme, readable at 390 px: the tables
// scroll sideways inside their own box, never the page.
import { AMBER_TYPICAL, RED_LOW, RED_SHARE, byDevice, byPlace, loadLine, stallsOf } from '../engine/smooth-stats.js'

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const dash = '–'
const n0 = (v) => (v === null || v === undefined ? dash : String(Math.round(v)))
const n1 = (v) => (v === null || v === undefined ? dash : (Math.round(v * 10) / 10).toString())
const secs = (ms) => (ms === null || ms === undefined ? dash : `${(ms / 1000).toFixed(1)} s`)

function table(kind, groups, open) {
  const rows = groups.map((g) => {
    const cells = `<th scope="row" class="sm-name">${esc(g.label)}</th><td>${g.players}</td><td>${n1(g.minutes)}</td><td>${n0(g.typical)}</td><td>${n0(g.low)}</td><td>${n1(g.below20)}%</td><td>${n1(g.longPerMin)}</td><td>${g.stalls}</td><td>${n0(g.tapMs)}</td>`
    const tag = `class="sm-row ${g.status}${open === g.key ? ' open' : ''}" data-status="${g.status}" data-key="${esc(g.key)}"`
    return kind === 'places'
      ? `<tr ${tag} data-act="smooth-place" data-id="${esc(g.key)}" tabindex="0" role="button" aria-label="${esc(g.label)}: show its stalls">${cells}</tr>`
      : `<tr ${tag}>${cells}</tr>`
  }).join('')
  return `<div class="sm-wrap"><table class="sm-table" data-table="${kind}">
    <thead><tr><th scope="col">${kind === 'places' ? 'Place' : 'Device'}</th><th scope="col">Players</th><th scope="col">Min</th><th scope="col" title="typical fps">Typical</th><th scope="col" title="fps of the worst 10% of frames">Worst 10%</th><th scope="col" title="share of time under 20 fps">&lt;20 fps</th><th scope="col" title="frames over 50 ms, per minute">Long/min</th><th scope="col">Stalls</th><th scope="col" title="tap to first step, median ms">Tap ms</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="sm-none">No reports in this range.</td></tr>'}</tbody>
  </table></div>`
}

function loadHtml(rows) {
  const l = loadLine(rows)
  if (!l.all.n) return '<p class="sm-load">Load time: no reports yet.</p>'
  const net = l.byNet.map((x) => `<li><b>${esc(x.net)}</b> ${secs(x.median)} median, ${secs(x.slow)} slowest 10% <small>(${x.n})</small></li>`).join('')
  return `<p class="sm-load" data-load>Load time to the first 3D frame: <b>${secs(l.all.median)}</b> median, <b>${secs(l.all.slow)}</b> slowest 10% <small>(${l.all.n} sessions)</small></p><ul class="sm-net">${net}</ul>`
}

function stallsHtml(group) {
  if (!group) return ''
  const list = stallsOf(group)
  const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? esc(iso) : d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  return `<section class="sm-stalls" data-stalls="${esc(group.key)}"><h2>Last stalls at ${esc(group.label)}</h2>${list.length
    ? `<div class="sm-wrap"><table class="sm-table"><thead><tr><th>Kind</th><th>How</th><th>x</th><th>z</th><th>When</th><th>Device</th></tr></thead><tbody>${list.map((s) => `<tr><td>${esc(s.kind)}</td><td>${esc(s.how)}</td><td>${n1(s.x)}</td><td>${n1(s.z)}</td><td>${when(s.when)}</td><td>${esc(s.device)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="fine">No stalls here in this range.</p>'}</section>`
}

export function smoothScreen(state) {
  const s = state.smooth || {}
  const allowed = Boolean(state.admin?.allowed || s.injected)
  const range = s.range || '7d'
  const rows = s.rows || []
  const places = byPlace(rows)
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
    ${table('devices', byDevice(rows), '')}` : ''}
  </main>`
}
