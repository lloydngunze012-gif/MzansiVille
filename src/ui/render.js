import { avatarSvg, hairs, outfits, skins } from '../avatar.js'
import { balancedScore, rollingAverage } from '../engine/board.js'
import { formatClock, formatDelta, formatMoney, weekdayName } from '../engine/format.js'
import { actionState, actionsAt, createRun } from '../engine/sim.js'
import { districtById } from '../districts/registry.js'
import { authEnabled } from '../net.js'

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

const RES_GROUPS = [
  ['on_campus', 'On campus'],
  ['off_campus_ukzn_owned', 'UKZN residences'],
  ['off_campus_leased', 'Leased'],
  ['private_accredited', 'Private accredited'],
  ['other', 'Other'],
]

export function emptyDraft() {
  return {
    name: '',
    residence: '',
    course: '',
    handle: '',
    avatar: { skin: 'amber', hair: 'crop', outfit: 'hoodie' },
    email: '',
    notice: '',
    error: '',
  }
}

function phaseOf(district, id) {
  return district.meta.phases.find((phase) => phase.id === id) || district.meta.phases[0]
}

function meter(label, value, max, color) {
  const width = Math.max(0, Math.min(100, (value / max) * 100))
  return `<span title="${label} ${value}"><b style="--p:${width}%;--c:${color}"><i></i></b></span>`
}

function pips(run) {
  return `<span class="pips" aria-label="${run.slotsLeft} slots left">${Array.from({ length: run.slotsTotal }, (_, index) =>
    `<i class="${index < run.slotsLeft ? 'on' : ''}"></i>`).join('')}</span>`
}

function banners(district, run) {
  const bits = []
  if (run.morningNote) bits.push(`<p class="banner">${esc(run.morningNote)}</p>`)
  if (run.status) bits.push(`<p class="banner bad">${esc(run.status)}. Grade gains are halved until two study sessions.</p>`)
  if (run.noodlesOnly) bits.push('<p class="banner bad">Noodles only until a shift.</p>')
  if (run.examWeek) bits.push('<p class="banner">Exam week. The paper is at the Sports Centre. Study counts double. Parties are quieter.</p>')
  if (weekdayName(district.meta, run.day) === district.meta.calendar.socialBoostWeekday) {
    bits.push('<p class="banner good">Friday. Social moves count for more.</p>')
  }
  return bits.join('')
}

function nav(active) {
  const items = [['play', 'Map'], ['profile', 'You'], ['board', 'Board'], ['chat', 'Chat']]
  return `<nav class="nav">${items.map(([id, label]) =>
    `<button type="button" data-act="nav" data-go="${id}" ${active === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`
}

function chrome(district, run, active) {
  const phase = phaseOf(district, run.phase)
  const next = district.meta.phases[district.meta.phases.findIndex((item) => item.id === run.phase) + 1]
  const nextLabel = next ? `On to ${next.label}` : 'End the day'
  return `<header class="top">
    <div class="spread">
      <p class="kicker">${esc(weekdayName(district.meta, run.day))} · Day ${run.day} · ${esc(phase.label)} · ${formatClock(run.minutes)}</p>
      ${pips(run)}
    </div>
    <div class="stats"><strong>${formatMoney(run.stats.money)}</strong><span>EN ${run.stats.energy}</span><span>HU ${run.stats.hunger}</span><span>GR ${run.stats.grades}</span><span>SO ${run.stats.social}</span></div>
    <div class="meters" aria-hidden="true">
      ${meter('Energy', run.stats.energy, run.energyCap, '#1f6b45')}
      ${meter('Hunger', run.stats.hunger, 100, '#c4512a')}
      ${meter('Grades', run.stats.grades, 100, '#244e78')}
      ${meter('Social', run.stats.social, 100, '#f0c400')}
    </div>
    <div class="spread" style="margin-top:8px">
      <span class="kicker">Today ${run.gameDaysToday} of ${district.meta.day.realDays}</span>
      <button class="btn ghost" type="button" data-act="phase" style="min-height:40px;padding:8px 12px">${nextLabel}</button>
    </div>
  </header>
  ${run.badges?.includes('lectures') ? '<p class="banner good">Lecture streak</p>' : ''}
  ${banners(district, run)}`
}

function laterHint(district, run, placeId) {
  const phases = district.meta.phases
  const index = phases.findIndex((phase) => phase.id === run.phase)
  for (const phase of phases.slice(index + 1)) {
    if (actionsAt(district, { ...run, phase: phase.id }, placeId).length) {
      return `Nothing in ${phaseOf(district, run.phase).label}. Try ${phase.label}.`
    }
  }
  return 'Nothing on right now.'
}

function sheet(district, run, placeId) {
  const place = district.places.find((item) => item.id === placeId)
  if (!place) return ''
  const actions = actionsAt(district, run, placeId)
  const buttons = actions.map((action) => {
    const state = actionState(district, run, action)
    if (state.hidden) return ''
    const slots = action.slots === 1 ? '1 slot' : `${action.slots} slots`
    const left = action.weeklyLimit ? ` · ${action.weeklyLimit - (run.weekly[action.id] || 0)} left this week` : ''
    const detail = state.reason || `${formatDelta(action.deltas)} · ${slots}${left}`
    return `<button class="btn block" type="button" data-act="do" data-id="${esc(action.id)}" ${state.disabled ? 'disabled' : ''}>
      ${esc(action.name)}<small>${esc(detail)}</small>${action.twist ? `<small>${esc(action.twist)}</small>` : ''}
    </button>`
  }).join('')
  return `<section class="sheet">
    <div class="handlebar"></div>
    <div class="spread"><h2>${esc(place.name)}</h2><button class="btn ghost" type="button" data-act="nav" data-go="play" style="min-height:40px">Close</button></div>
    <p class="blurb">${esc(place.blurb)}</p>
    <div class="stack">${buttons || `<p class="fine">${esc(laterHint(district, run, placeId))}</p>`}</div>
  </section>`
}

function cardHtml(card) {
  const choices = (card.choices || []).map((label, index) =>
    `<button class="btn block" type="button" data-act="choice" data-i="${index}">${esc(label)}</button>`).join('')
  let actions = choices
  if (!actions) {
    actions = card.kind === 'shop'
      ? `<button class="btn primary block" type="button" data-act="open-shop">${esc('This links to a real shop')}</button>
         <button class="btn ghost block" type="button" data-act="dismiss">Not now</button>`
      : '<button class="btn primary block" type="button" data-act="dismiss">OK</button>'
  }
  return `<div class="modal-back"><section class="card">
    <p class="kind">${esc(card.kind)}</p>
    <h2>${esc(card.title)}</h2>
    <p>${esc(card.text)}</p>
    <div class="stack">${actions}</div>
  </section></div>`
}

function overlay(run) {
  if (run?.queue?.[0]) return cardHtml(run.queue[0])
  if (run?.promptSave && !run.userId && !run.saveSnooze && run.mode === 'play') {
    return `<div class="modal-back"><section class="card"><h2>Save your progress</h2><p>Day ${run.day}. Keep this person on an account.</p><div class="stack"><button class="btn primary block" type="button" data-act="nav" data-go="save">Save your progress</button><button class="btn ghost block" type="button" data-act="snooze">Not now</button></div></section></div>`
  }
  return ''
}

function play(state, screenName, placeId) {
  const { district, run } = state
  return `<main class="screen world-hud" data-screen="${screenName}">
    ${chrome(district, run, 'play')}
    <div class="world-space"></div>
    <p class="world-hint">Drag to turn. Tap the ground to walk.</p>
    ${placeId ? sheet(district, run, placeId) : ''}
    ${nav('play')}
    ${overlay(run)}
  </main>`
}

function summary(state) {
  const { run } = state
  const line = run.summary?.hungry
    ? 'You slept hungry'
    : run.summary?.slept
      ? 'You made it to bed.'
      : 'You did not sleep. Tomorrow starts with less energy.'
  return `<main class="screen pad" data-screen="summary">
    <p class="kicker">Day ${run.summary?.day || run.day}</p>
    <h1>That's the day</h1>
    <p class="lede">${esc(line)}</p>
    <p>${esc(run.lastStatLine)}</p>
    <p class="fine">${esc(run.lastEventLine)}</p>
    <div class="stack" style="margin-top:18px">
      <button class="btn primary block" type="button" data-act="next">Start tomorrow</button>
    </div>
    ${overlay(run)}
  </main>`
}

function locked(state) {
  const until = state.run.lockedUntil ? new Date(state.run.lockedUntil) : null
  const ready = !until || until.getTime() <= Date.now()
  let extra = ''
  if (!ready) {
    const ms = until.getTime() - Date.now()
    const hours = Math.floor(ms / 3600000)
    const mins = Math.floor((ms % 3600000) / 60000)
    extra = ` · ${hours}h ${mins}m`
  }
  return `<main class="screen pad" data-screen="refill">
    <p class="kicker">${esc(state.district.meta.name)}</p>
    <h1>${ready ? 'A new day is open' : 'Energy refills at 06:00'}</h1>
    <p class="clock">${ready ? '06:00' : `Energy refills at 06:00${extra}`}</p>
    <p class="lede">Three game days, then the campus sleeps. Your person is still here.</p>
    <button class="btn primary block" type="button" data-act="next" ${ready ? '' : 'disabled'}>${ready ? 'Start the day' : 'Not yet'}</button>
  </main>`
}

function gameover(state) {
  return `<main class="screen pad" data-screen="gameover">
    <p class="kicker">Excluded</p>
    <h1>${esc(state.run.character.name)}</h1>
    <p class="lede">${esc(state.run.excludeText || 'Excluded.')}</p>
    <div class="stack">
      <button class="btn primary block" type="button" data-act="restart">Start again</button>
      <button class="btn ghost block" type="button" data-act="new">New character</button>
    </div>
  </main>`
}

function legalText(screen, title, paragraphs) {
  return `<main class="screen pad legal" data-screen="${screen}">
    <a class="link" href="#/">Back</a>
    <h1 style="margin-top:16px">${title}</h1>
    ${paragraphs.map((text) => `<p>${text}</p>`).join('')}
  </main>`
}

function rules() {
  return `<main class="screen pad legal" data-screen="rules">
    <a class="link" href="#/">Back</a>
    <h1 style="margin-top:16px">Community rules</h1>
    <p>The lobby is one public room. Talk like a person other people have to sit next to.</p>
    <p>No harassment, hate, or threats. No sexual content about anyone under 21. No posting someone's private information.</p>
    <p>Every message has mute, block, and report. Reports go to admins. A suspended account cannot post.</p>
    <p>Chat is rate limited: a short pause between messages, and 30 messages in 10 minutes.</p>
    <label class="field" style="font-weight:500"><span><input id="agree" type="checkbox" style="width:auto;min-height:0"/> I agree</span></label>
    <button class="btn primary block" type="button" data-act="agree">Continue</button>
    <p class="fine">Full community text can be extended later. These are the rules that already bind the lobby.</p>
  </main>`
}

function create(state) {
  const { district, draft } = state
  const groups = RES_GROUPS.map(([type, label]) => {
    const rows = district.residences.filter((row) => row.type === type)
    if (!rows.length) return ''
    return `<optgroup label="${label}">${rows.map((row) =>
      `<option value="${esc(row.name)}" ${row.name === draft.residence ? 'selected' : ''}>${esc(row.name)}${row.distanceKm ? ` · ${row.distanceKm} km` : ''}</option>`).join('')}</optgroup>`
  }).join('')
  const picker = (label, items, key) => `<div class="stack"><span>${label}</span><div class="choices">${items.map((item) =>
    `<button class="choice" type="button" data-act="avatar" data-part="${key}" data-id="${item.id}" aria-label="${esc(item.label)}" aria-pressed="${draft.avatar[key] === item.id}">${
      item.fill ? `<i class="swatch" style="background:${item.fill}"></i>` : esc(item.label)
    }</button>`).join('')}</div></div>`
  return `<main class="screen pad" data-screen="create">
    <a class="link" href="#/rules">Rules</a>
    <h1 style="margin-top:12px">Who's arriving?</h1>
    <div class="avatar-preview">${avatarSvg(draft.avatar, district.meta.dialCode, 140)}</div>
    <div class="stack">
      <label class="field">Name<input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="nickname"></label>
      <label class="field">Residence<select id="residence"><option value="">Choose</option>${groups}</select></label>
      <label class="field">Course<select id="course"><option value="">Choose</option>${district.courses.map((course) =>
        `<option ${course === draft.course ? 'selected' : ''}>${esc(course)}</option>`).join('')}</select></label>
      ${picker('Skin', skins, 'skin')}
      ${picker('Hair', hairs, 'hair')}
      ${picker('Outfit', outfits, 'outfit')}
      <label class="field">Instagram or TikTok <span class="fine">optional</span><input id="handle" maxlength="30" placeholder="handle" value="${esc(draft.handle)}"></label>
      ${draft.error ? `<p class="error">${esc(draft.error)}</p>` : ''}
      <button class="btn primary block" type="button" data-act="begin">Walk onto campus</button>
    </div>
  </main>`
}

function profile(state) {
  const { district, run } = state
  const badges = [
    run.badges?.includes('lectures') ? '<span class="badge">Lecture streak</span>' : '',
    run.graduated ? '<span class="badge">Graduated first year</span>' : '',
  ].join(' ')
  const card = run.referralCode ? `<section class="organt-card">
      <strong>${esc(district.shop.brand)}</strong>
      <p>Referral ${esc(run.referralCode)}</p>
      <button class="btn block" type="button" data-act="open-shop">This links to a real shop</button>
    </section>` : ''
  return `<main class="screen pad has-nav" data-screen="profile">
    <div class="profile-head">
      ${avatarSvg(run.character.avatar, district.meta.dialCode, 96)}
      <div>
        <h1>${esc(run.character.name)}</h1>
        <p class="fine">${esc(run.character.residence)} · ${esc(run.character.course)}</p>
        <p class="fine">${run.character.handle ? `@${esc(run.character.handle)}` : 'No handle yet'} · Day ${run.day}</p>
        <p>${badges}</p>
      </div>
    </div>
    <p style="margin:12px 0">${esc(run.lastStatLine)}</p>
    <p class="fine">Bestie: ${esc(run.bestieName)} from ${esc(run.character.residence)}</p>
    ${card}
    <div class="stack" style="margin-top:12px">
      <button class="btn primary block" type="button" data-act="nav" data-go="share">Share card</button>
      ${run.userId ? '' : '<button class="btn block" type="button" data-act="nav" data-go="save">Save your progress</button>'}
      <button class="btn ghost block" type="button" data-act="nav" data-go="admin">Admin</button>
      ${run.userId ? '<button class="btn ghost block" type="button" data-act="signout">Sign out</button>' : ''}
    </div>
    ${nav('profile')}
  </main>`
}

function share(state) {
  return `<main class="screen pad" data-screen="share">
    <a class="link" href="#/profile">Back</a>
    <h1 style="margin:12px 0">Share card</h1>
    <canvas id="share-card" class="share-preview" width="1080" height="1080"></canvas>
    <div class="stack" style="margin-top:12px">
      <button class="btn primary block" type="button" data-act="share">Share</button>
      <button class="btn ghost block" type="button" data-act="copy">Copy link</button>
    </div>
    <p class="fine" id="copy-note"></p>
  </main>`
}

function shop(state) {
  const { district, run } = state
  const ready = Boolean(district.shop.url)
  return `<main class="screen pad" data-screen="shop">
    <a class="link" href="#/profile">Back</a>
    <h1 style="margin-top:12px">This links to a real shop</h1>
    <p class="lede">The ${esc(district.shop.brand)} rep card is part of the game. The next step is not.</p>
    <p class="organt-card"><strong>${esc(run?.referralCode || 'ORG-____')}</strong><br>Code format to follow. This one is a placeholder.</p>
    <button class="btn primary block" type="button" data-act="leave" ${ready ? '' : 'disabled'}>${ready ? 'Open the shop' : 'Link to follow'}</button>
    ${state.draft?.notice ? `<p class="fine">${esc(state.draft.notice)}</p>` : ''}
  </main>`
}

function saveScreen(state) {
  const note = authEnabled
    ? 'Google or a magic link. This phone\'s progress is copied onto the account. If the account is already further along, that day is kept.'
    : 'Supabase is not connected on this build. Progress stays on this phone.'
  return `<main class="screen pad" data-screen="save">
    <a class="link" href="#/play">Back</a>
    <h1 style="margin-top:12px">Save your progress</h1>
    <p class="lede">${note}</p>
    <div class="stack">
      <button class="btn block" type="button" data-act="google" ${authEnabled ? '' : 'disabled'}>Continue with Google</button>
      <label class="field">Email<input id="email" type="email" inputmode="email" value="${esc(state.draft.email)}" ${authEnabled ? '' : 'disabled'}></label>
      <button class="btn primary block" type="button" data-act="magic" ${authEnabled ? '' : 'disabled'}>Send a magic link</button>
      ${state.draft.notice ? `<p class="fine">${esc(state.draft.notice)}</p>` : ''}
      ${state.draft.error ? `<p class="error">${esc(state.draft.error)}</p>` : ''}
      <a class="link" href="#/rules">Community rules</a>
    </div>
  </main>`
}

function chat(state) {
  const messages = state.chat.messages || []
  const hidden = new Set([...(state.save.mutes || []), ...(state.save.blocks || [])])
  const list = messages.filter((message) => !hidden.has(message.user_id)).map((message) => {
    const person = state.chat.names?.[message.user_id]
    const name = message.name || person?.display_name || 'Student'
    const res = message.residence || person?.residence || ''
    return `<article class="msg">
      <strong>${esc(name)}</strong>
      <p class="fine">${esc(res)}</p>
      <p>${esc(message.body)}</p>
      <div class="tools">
        <button type="button" data-act="mute" data-id="${esc(message.user_id)}">Mute</button>
        <button type="button" data-act="block" data-id="${esc(message.user_id)}">Block</button>
        <button type="button" data-act="report" data-id="${esc(message.id)}">Report</button>
      </div>
      ${state.chat.reportId === message.id ? `<div class="wrap">${['Harassment', 'Hate', 'Sexual content', 'Spam', 'Something else'].map((reason) =>
        `<button class="btn ghost" type="button" data-act="reason" data-id="${esc(message.id)}" data-reason="${esc(reason)}">${esc(reason)}</button>`).join('')}</div>` : ''}
    </article>`
  }).join('')
  const offline = state.chat.offline
  return `<main class="screen pad has-nav" data-screen="chat">
    <h1>Campus lobby</h1>
    <p class="fine">One room. No DMs. A short pause between messages, 30 in 10 minutes.</p>
    ${offline ? '<p class="lede">The lobby opens once Supabase is connected. Guest play stays on this phone.</p>' : ''}
    ${state.chat.error ? `<p class="error">${esc(state.chat.error)}</p>` : ''}
    <div class="list" id="log">${list || (offline ? '' : '<p class="fine">Nobody has spoken yet.</p>')}</div>
    <div class="stack" style="margin-top:12px">
      <label class="field">Message<input id="composer" maxlength="280" value="${esc(state.chat.draft || '')}" ${offline ? 'disabled' : ''}></label>
      <button class="btn primary block" type="button" data-act="send" ${offline ? 'disabled' : ''}>Send</button>
    </div>
    ${nav('chat')}
  </main>`
}

function scoreText(row, tab) {
  if (tab === 'grades') return `Grades ${Math.round(Number(row.dean_avg ?? row.grades))}`
  if (tab === 'balanced') return `Balance ${Math.round(Number(row.balanced_avg ?? row.balanced))}`
  return formatMoney(Number(row.rich_avg ?? row.money))
}

function board(state) {
  const { board: table, run } = state
  const tab = table.tab || 'money'
  const rows = (table.rows || []).filter((row) => table.scope !== 'res' || !run || row.residence === run.character.residence)
  const body = rows.map((row, index) =>
    `<tr><td>${index + 1}</td><td>${esc(row.display_name)}<br><span class="fine">${esc(row.residence || '')}</span></td><td>${esc(scoreText(row, tab))}</td></tr>`).join('')
  return `<main class="screen pad has-nav" data-screen="leaderboard">
    <h1>Boards</h1>
    <p class="fine">7-day rolling average. Refreshes every 30s. Money is scaled 0–100 at R3 000 for Most Balanced.</p>
    <div class="tabs">
      ${[['money', 'Richest'], ['grades', "Dean's List"], ['balanced', 'Most Balanced']].map(([id, label]) =>
        `<button type="button" data-act="board-tab" data-id="${id}" aria-pressed="${tab === id}">${label}</button>`).join('')}
    </div>
    <div class="tabs" style="margin-top:8px">
      <button type="button" data-act="board-scope" data-id="all" aria-pressed="${table.scope !== 'res'}">Overall</button>
      <button type="button" data-act="board-scope" data-id="res" aria-pressed="${table.scope === 'res'}">Your residence</button>
    </div>
    ${table.error ? `<p class="error">${esc(table.error)}</p>` : ''}
    <table><thead><tr><th>#</th><th>Student</th><th>Score</th></tr></thead><tbody id="board-rows">${body || '<tr><td colspan="3">When more students save their progress, they show up here.</td></tr>'}</tbody></table>
    ${nav('board')}
  </main>`
}

function admin(state) {
  const reports = state.admin.reports || []
  const events = state.district.events
  const current = events.find((event) => event.id === state.admin.eventId) || events[0]
  return `<main class="screen pad" data-screen="admin">
    <a class="link" href="#/profile">Back</a>
    <h1 style="margin-top:12px">Admin</h1>
    ${state.admin.allowed ? '' : '<p class="lede">Admins only. Set role to admin in Supabase, then sign in.</p>'}
    <h2>Open reports</h2>
    <div class="list">${reports.map((report) => `<article class="msg">
      <strong>${esc(report.display_name || report.reported_user_id || 'Student')}</strong>
      <p>${esc(report.reason)}</p>
      <div class="tools">
        <button type="button" data-act="suspend" data-id="${esc(report.reported_user_id || '')}">Suspend</button>
        <button type="button" data-act="close-report" data-id="${esc(report.id)}">Close</button>
      </div>
    </article>`).join('') || '<p class="fine">No open reports.</p>'}</div>
    <h2 style="margin-top:16px">Event text</h2>
    <div class="stack">
      <label class="field">Event<select id="event-id">${events.map((event) =>
        `<option value="${esc(event.id)}" ${event.id === current?.id ? 'selected' : ''}>${esc(event.title)}</option>`).join('')}</select></label>
      <label class="field">Title<input id="event-title" value="${esc(current?.title || '')}"></label>
      <label class="field">Text<textarea id="event-body" style="min-height:88px;width:100%;border-radius:12px;border:1px solid var(--line);padding:12px">${esc(current?.text || '')}</textarea></label>
      ${(current?.choices || []).map((choice, index) =>
        `<label class="field">Choice ${index + 1}<input id="label-${index}" value="${esc(choice.label)}"></label>`).join('')}
      <button class="btn primary block" type="button" data-act="save-event">Save text</button>
      ${state.admin.notice ? `<p class="fine">${esc(state.admin.notice)}</p>` : ''}
    </div>
  </main>`
}

function title(state) {
  const district = state.district
  const day = state.save.run?.day
  return `<main class="screen dark" data-screen="title">
    <div class="avatar-preview">${avatarSvg({ skin: 'amber', hair: 'braids', outfit: 'organt' }, district.meta.dialCode, 140)}</div>
    <p class="chip">${esc(district.meta.name)} · ${esc(district.meta.city)}</p>
    <h1 class="wordmark" style="margin-top:18px">Mzansi<br><em>Ville</em></h1>
    <p class="lede">A life sim you can finish on the bus. Guest first. Your person stays when the next district opens.</p>
    <div class="grow"></div>
    <div class="stack">
      ${day ? `<button class="btn ghost block" type="button" data-act="continue">Continue · day ${day}</button>` : ''}
      <button class="btn primary block" type="button" data-act="start">Start as guest</button>
    </div>
    <nav class="links" style="margin-top:18px"><a href="#/rules">Rules</a><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a></nav>
  </main>`
}

export function view(state) {
  const screen = state.screen
  if (screen === 'title') return title(state)
  if (screen === 'rules') return rules()
  if (screen === 'privacy') {
    return legalText('privacy', 'Privacy', [
      'Guest progress stays in localStorage on this phone. Clearing the browser clears the guest.',
      'If you save, your name, residence, course, avatar, handle, stats, and the game state are stored in Supabase. Lobby messages are public to the campus room.',
      'There are no photos. The avatar is drawn in the game.',
      'Full privacy text to follow.',
    ])
  }
  if (screen === 'terms') {
    return legalText('terms', 'Terms', [
      'MzansiVille is a game in progress. In-game money is not real money.',
      'The Organt rep job can open a real shop. That screen says so before you leave.',
      'Full terms to follow.',
    ])
  }
  if (screen === 'create') return create(state)
  if (screen === 'map' || screen === 'play') return play(state, screen === 'map' ? 'map' : 'play', '')
  if (screen === 'place' || screen === 'closed') return play(state, screen, state.placeId)
  if (screen === 'summary') {
    if (state.run?.mode === 'play') return play(state, 'play', '')
    return summary(state)
  }
  if (screen === 'refill' || screen === 'locked') return locked(state)
  if (screen === 'gameover' || screen === 'over') return gameover(state)
  if (screen === 'profile') return profile(state)
  if (screen === 'share') return share(state)
  if (screen === 'shop') return shop(state)
  if (screen === 'save') return saveScreen(state)
  if (screen === 'chat') return chat(state)
  if (screen === 'leaderboard' || screen === 'board') return board(state)
  if (screen === 'admin') return admin(state)
  if (screen === 'event' || screen === 'twist' || screen === 'bestie' || screen === 'graduated') {
    return `<main class="screen" data-screen="${screen}">${cardHtml(state.run.queue[0])}</main>`
  }
  return title(state)
}

export function localBoardRow(run) {
  if (!run) return null
  const now = new Date()
  const balanced = balancedScore(run.stats)
  return {
    user_id: run.userId || 'you',
    display_name: run.character.name,
    residence: run.character.residence,
    money: run.stats.money,
    grades: run.stats.grades,
    balanced,
    rich_avg: rollingAverage(run.history, now, 'money') ?? run.stats.money,
    dean_avg: rollingAverage(run.history, now, 'grades') ?? run.stats.grades,
    balanced_avg: rollingAverage(run.history, now, 'balanced') ?? balanced,
  }
}

export function shotState(name) {
  const district = districtById('campusville')
  const run = createRun(district, {
    name: 'Aya M.',
    residence: 'O Block',
    course: 'Law',
    avatar: { skin: 'brown', hair: 'braids', outfit: 'organt' },
    handle: 'aya.m',
  })
  run.queue = []
  run.promptSave = false
  run.morningNote = ''
  run.bestieName = 'Thandi'
  const draft = emptyDraft()
  const state = {
    screen: name,
    district,
    run,
    draft,
    save: { rulesAccepted: true, run, mutes: [], blocks: [] },
    placeId: 'res_o',
    chat: { messages: [], names: {}, offline: !authEnabled, error: '', reportId: '' },
    board: { tab: 'money', scope: 'all', rows: [], error: '' },
    admin: { reports: [], eventId: 'nsfas_delayed', notice: '', allowed: false },
  }
  if (name === 'title') state.save = { rulesAccepted: false, run: null, mutes: [], blocks: [] }
  if (name === 'place') {
    run.phase = 'wake'
    state.placeId = 'res_o'
  }
  if (name === 'closed') {
    run.phase = 'leisure'
    run.minutes = 18 * 60
    state.placeId = 'cafeteria'
  }
  if (name === 'event') {
    const event = district.events.find((item) => item.id === 'nsfas_delayed')
    run.queue = [{ id: 'shot-event', kind: 'event', title: event.title, text: event.text, choices: event.choices.map((choice) => choice.label), eventId: event.id }]
  }
  if (name === 'twist') {
    run.queue = [{ id: 'shot-twist', kind: 'twist', title: 'Meanwhile', text: 'Rain. You arrive soaked.' }]
  }
  if (name === 'bestie') {
    run.queue = [{ id: 'shot-bestie', kind: 'bestie', title: 'Thandi', text: 'Thandi from O Block holds the door and waits like they already decided you are their person.' }]
  }
  if (name === 'summary') {
    run.day = 4
    run.mode = 'summary'
    run.summary = { day: 4, slept: true, hungry: true, stats: { ...run.stats } }
    run.lastEventLine = 'You slept hungry'
  }
  if (name === 'refill') {
    run.mode = 'locked'
    run.gameDaysToday = 3
    run.lockedUntil = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
  }
  if (name === 'gameover') {
    run.mode = 'over'
    run.excluded = true
    run.excludeText = 'Three days under the line. Excluded.'
  }
  if (name === 'graduated') {
    run.day = 30
    run.graduated = true
    run.queue = [{ id: 'shot-grad', kind: 'milestone', title: 'Graduated first year', text: 'CampusVille keeps your person. The next district opens from here.' }]
  }
  if (name === 'profile' || name === 'share' || name === 'shop') {
    run.day = 12
    run.badges = ['lectures']
    run.referralCode = 'ORG-7K2M'
    run.lastStatLine = 'Grades 64 · R1 280 in your pocket'
    run.lastEventLine = 'Gold. The quad answers back.'
  }
  if (name === 'chat') {
    state.chat.offline = false
    state.chat.messages = [
      { id: 'm1', user_id: 'u1', name: 'Sipho', residence: 'R Block', body: 'Is the bus late or is it just me?' },
      { id: 'm2', user_id: 'u2', name: 'Naledi', residence: 'O Block', body: 'Stage 4. The library is on the generator.' },
      { id: 'm3', user_id: 'u3', name: 'Jordan', residence: 'S Block', body: 'Derby fit check at the quad.' },
    ]
  }
  if (name === 'leaderboard') {
    state.board.rows = [
      { display_name: 'Aya M.', residence: 'O Block', money: 1280, grades: 64, balanced: 70, rich_avg: 1280, dean_avg: 64, balanced_avg: 70 },
      { display_name: 'Sipho', residence: 'R Block', money: 2400, grades: 55, balanced: 48, rich_avg: 2400, dean_avg: 55, balanced_avg: 48 },
      { display_name: 'Naledi', residence: 'O Block', money: 900, grades: 81, balanced: 62, rich_avg: 900, dean_avg: 81, balanced_avg: 62 },
    ]
  }
  if (name === 'admin') {
    state.admin.allowed = true
    state.admin.reports = [{ id: 'r1', reported_user_id: 'u3', display_name: 'Jordan', reason: 'Harassment' }]
  }
  return state
}
