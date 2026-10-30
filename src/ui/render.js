import { avatarSvg, hairs, outfits, skins } from '../avatar.js'
import { balancedScore, rollingAverage } from '../engine/board.js'
import { formatClock, formatMoney, weekdayName } from '../engine/format.js'
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

function pips(run) {
  return `<span class="pips" aria-label="${run.slotsLeft} of ${run.slotsTotal} actions left">${Array.from({ length: run.slotsTotal }, (_, index) =>
    `<i class="${index < run.slotsLeft ? 'on' : ''}"></i>`).join('')}</span>`
}

function icon(path) {
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
}

const ICONS = {
  wallet: icon('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>'),
  bolt: icon('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
  plate: icon('<path d="M4 13a8 8 0 0 0 16 0"/><path d="M2 13h20M8 8c1-2 3-3 4-3s3 1 4 3"/>'),
  book: icon('<path d="M4 5a3 3 0 0 1 3-2h13v16H7a3 3 0 0 0-3 3z"/><path d="M7 3v16"/>'),
  people: icon('<circle cx="9" cy="8" r="3"/><circle cx="16" cy="9" r="2.2"/><path d="M3 19c1-3 3.2-4.5 6-4.5S14 16 15 19M14 14.5c1.6 0 3.2.8 4 2.5"/>'),
}

const PHASE_WORD = {
  wake: 'Morning',
  transit: 'Heading out',
  lecture: 'Lectures',
  social: 'Afternoon',
  leisure: 'Free time',
  night: 'Night',
}

const TIPS = {
  money: 'Money is the rand in your pocket. Shifts add to it. Meals and a bad day take it away. Below zero, noodles are all you can afford until you work.',
  energy: 'Energy is how rested you are. Sleep raises it. Lectures, the gym, and a night without sleep use it. When it is empty, very little is possible.',
  hunger: 'Fullness is how well you have eaten. 100 means you are well fed. Eating raises it. If it drops under 10 you cannot study, and sleeping while it is under 20 leaves you tired.',
  grades: 'Grades start at 50. Lectures and study raise them. Skipping and a failed spot test lower them. Under 20 for three days, you are excluded.',
  social: 'Social is how connected you are on campus. Friends, the quad, and a Friday party raise it.',
  slots: 'Each activity uses one or more of the five time slots in a day. When they run out, the day ends.',
  phase: 'Moves you on to the next part of the day. The clock jumps ahead, and different places open.',
}

function phaseWord(id) {
  return PHASE_WORD[id] || 'Today'
}

function camMode() {
  const shot = new URLSearchParams(location.search).get('shot') || ''
  if (shot.startsWith('cam-')) return shot.slice(4)
  try {
    return localStorage.getItem('mzansiville.camera') || 'sims'
  } catch {
    return 'sims'
  }
}

function hudMode() {
  try {
    return localStorage.getItem('mzansiville.hud') === 'icons' ? 'icons' : 'full'
  } catch {
    return 'full'
  }
}

function nav(active, world) {
  const items = [['play', 'Map'], ['profile', 'You'], ['board', 'Board'], ['chat', 'Chat']]
  return `<nav class="nav">${items.map(([id, label]) => {
    if (world && id === 'play') {
      const here = active === 'play' || active === 'summary' || active === 'place' || active === 'closed'
      return `<button type="button" data-act="open-map" ${here ? 'aria-current="page"' : ''}>Map</button>`
    }
    return `<button type="button" data-act="nav" data-go="${id}" ${active === id ? 'aria-current="page"' : ''}>${label}</button>`
  }).join('')}</nav>`
}

function statRow(key, word, svg, value, max, color) {
  const width = Math.max(0, Math.min(100, (value / max) * 100))
  const low = key !== 'money' && value < max * 0.25
  const shown = key === 'money' ? formatMoney(value) : `${Math.round(value)}/${max}`
  return `<button class="stat tip-host${low ? ' low' : ''}" type="button">
    ${svg}
    <span class="word">${word}</span>
    <b class="bar" style="--p:${width}%;--c:${color}"><i></i></b>
    <span class="num">${shown}</span>
    <p class="tip">${esc(TIPS[key])}</p>
  </button>`
}

function chrome(district, run) {
  const next = district.meta.phases[district.meta.phases.findIndex((item) => item.id === run.phase) + 1]
  const nextLabel = next ? `On to ${next.label}` : 'End the day'
  const word = phaseWord(run.phase)
  const mode = camMode()
  const icons = hudMode() === 'icons' ? ' icons' : ''
  const cams = ['top', 'Top', 'sims', 'Sims', 'eye', 'Eye']
  let buttons = ''
  for (let i = 0; i < cams.length; i += 2) {
    const mark = cams[i] === 'top' ? '▣' : cams[i] === 'eye' ? '◉' : '◢'
    buttons += `<button type="button" data-act="cam" data-mode="${cams[i]}" aria-pressed="${mode === cams[i]}">${mark} ${cams[i + 1]}</button>`
  }
  return `<header class="hud${icons}">
    <div class="hud-top">
      <p class="clock-line">${esc(weekdayName(district.meta, run.day))} - Day ${run.day} - ${esc(word)} - ${formatClock(run.minutes)}</p>
      <button class="btn ghost tiny" type="button" data-act="hud">${icons ? 'Show words' : 'Icons only'}</button>
    </div>
    ${statRow('money', 'Money', ICONS.wallet, run.stats.money, 3000, '#f0c400')}
    ${statRow('energy', 'Energy', ICONS.bolt, run.stats.energy, run.energyCap || 100, '#3cba78')}
    ${statRow('hunger', 'Fullness', ICONS.plate, run.stats.hunger, 100, '#e07a3d')}
    ${statRow('grades', 'Grades', ICONS.book, run.stats.grades, 100, '#7eb6e6')}
    ${statRow('social', 'Social', ICONS.people, run.stats.social, 100, '#f0c400')}
    <button class="slots tip-host" type="button">Time left today: ${run.slotsLeft} of ${run.slotsTotal} actions ${pips(run)}<span class="tip">${esc(TIPS.slots)}</span></button>
    <p class="tip-host phase-line"><button class="btn ghost tiny" type="button" data-act="phase">${nextLabel}</button><span class="tip">${esc(TIPS.phase)}</span></p>
  </header>
  <div class="cam-switch" role="group" aria-label="Camera">${buttons}<button type="button" data-act="help" aria-label="Help">?</button></div>
  ${toasts(district, run)}`
}

function toasts(district, run) {
  const items = []
  if (run.morningNote) items.push(['morning', run.morningNote])
  if (run.status) items.push(['status', `${run.status}. Grade gains are halved until two study sessions.`])
  if (run.noodlesOnly) items.push(['noodles', 'Noodles only until a shift.'])
  if (run.examWeek) items.push(['exam', 'Exam week. The paper is at the Sports Centre. Study counts double. Parties are quieter.'])
  if (weekdayName(district.meta, run.day) === district.meta.calendar.socialBoostWeekday) {
    items.push(['friday', 'Friday. Social moves count for more.'])
  }
  if (run.badges?.includes('lectures')) items.push(['streak', 'Lecture streak.'])
  if (!items.length) return ''
  return `<div class="toasts">${items.map(([id, text]) => `<button class="toast" type="button" data-act="toast" data-toast="${id}">${esc(text)}</button>`).join('')}</div>`
}

function laterHint(district, run, placeId) {
  const phases = district.meta.phases
  const index = phases.findIndex((phase) => phase.id === run.phase)
  const here = phaseWord(run.phase)
  for (const phase of phases.slice(index + 1)) {
    if (actionsAt(district, { ...run, phase: phase.id }, placeId).length) {
      return `Nothing to do here in the ${here}. Come back in the ${phaseWord(phase.id)}.`
    }
  }
  return `Nothing to do here in the ${here}.`
}

const REASONS = {
  'Already done today': 'You already did this today.',
  'You already chose': 'You already picked something else.',
  'No shifts left this week': 'No shifts left this week.',
  'Too hungry to study': 'You are too hungry to study. Eat something first.',
  'Noodles only until a shift': 'You can only afford noodles until you work a shift.',
}

function plainReason(reason) {
  if (!reason) return ''
  if (REASONS[reason]) return REASONS[reason]
  if (reason.startsWith('Closed')) return reason.replace('·', '.').replace('opens', 'Opens at')
  if (reason.startsWith('Needs')) return `This needs more time than you have left today.`
  if (reason.startsWith('Unlocks')) return `This opens on ${reason.replace('Unlocks ', '')}.`
  return reason
}

function effectBits(deltas) {
  const bits = []
  const add = (text, kind) => bits.push(`<em class="${kind}">${text}</em>`)
  if (deltas.energy) add(`${deltas.energy > 0 ? '+' : ''}${deltas.energy} Energy`, deltas.energy > 0 ? 'up' : 'down')
  if (deltas.money) add(`${deltas.money > 0 ? '+' : ''}${formatMoney(deltas.money)}`, deltas.money > 0 ? 'up' : 'down')
  if (deltas.hunger) add(`${deltas.hunger > 0 ? '+' : ''}${deltas.hunger} Fullness`, deltas.hunger > 0 ? 'up' : 'down')
  if (deltas.grades) add(`${deltas.grades > 0 ? '+' : ''}${deltas.grades} Grades`, deltas.grades > 0 ? 'up' : 'down')
  if (deltas.social) add(`${deltas.social > 0 ? '+' : ''}${deltas.social} Social`, deltas.social > 0 ? 'up' : 'down')
  return bits.join(' ')
}

function sheet(district, run, placeId) {
  const place = district.places.find((item) => item.id === placeId)
  if (!place) return ''
  const actions = actionsAt(district, run, placeId)
  const buttons = actions.map((action) => {
    const state = actionState(district, run, action)
    if (state.hidden) return ''
    const slots = action.slots === 1 ? '1' : String(action.slots)
    const detail = state.disabled
      ? esc(plainReason(state.reason))
      : `${effectBits(action.deltas)} <em>uses ${slots} of your ${run.slotsTotal} time slots</em>`
    return `<button class="act" type="button" data-act="do" data-id="${esc(action.id)}" ${state.disabled ? 'disabled' : ''}>
      <strong>${esc(action.name)}</strong><small>${detail}</small>
    </button>`
  }).join('')
  return `<section class="sheet">
    <div class="spread"><h2>${esc(place.name)}</h2><button class="btn ghost tiny" type="button" data-act="nav" data-go="play">Close</button></div>
    <p class="blurb">${esc(place.blurb)}</p>
    <div class="stack">${buttons || `<p>${esc(laterHint(district, run, placeId))}</p>`}</div>
  </section>`
}

const CARD_LABEL = {
  event: 'Random event',
  bestie: 'New bestie',
  twist: 'Plot twist',
  milestone: 'Milestone',
  shop: 'Campus job',
  result: 'What happened',
  spot: 'Spot test',
  over: 'That is the end',
}

function cardHtml(card, state) {
  if (!card) return ''
  const district = state?.district
  const choices = (card.choices || []).map((label, index) => {
    const event = district?.events?.find((item) => item.id === card.eventId)
    const effect = effectBits(event?.choices?.[index]?.deltas || {})
    return `<button class="act" type="button" data-act="choice" data-i="${index}"><strong>${esc(label)}</strong>${effect ? `<small>${effect}</small>` : ''}</button>`
  }).join('')
  let actions = choices
  if (!actions) {
    actions = card.kind === 'shop'
      ? `<button class="act" type="button" data-act="open-shop"><strong>${esc('This links to a real shop')}</strong></button>
         <button class="act" type="button" data-act="dismiss"><strong>Not now</strong></button>`
      : '<button class="act" type="button" data-act="dismiss"><strong>OK</strong></button>'
  }
  const text = String(card.text || '').replaceAll('Hunger', 'Fullness')
  return `<aside class="glass-card">
    <div class="spread"><p class="kind">${esc(CARD_LABEL[card.kind] || 'Note')}</p><button class="btn ghost tiny" type="button" data-act="${card.choices ? 'minimise-card' : 'dismiss'}" aria-label="Close">×</button></div>
    <h2>${esc(card.title)}</h2>
    <p>${esc(text)}</p>
    <div class="stack">${actions}</div>
  </aside>`
}

function overlay(state) {
  const run = state.run
  if (run?.queue?.[0]) {
    if (state.cardMini && run.queue[0].choices) {
      return `<button class="decision-chip" type="button" data-act="restore-card">1 decision waiting</button>`
    }
    return cardHtml(run.queue[0], state)
  }
  if (run?.promptSave && !run.userId && !run.saveSnooze && run.mode === 'play') {
    return `<aside class="glass-card"><h2>Save your progress</h2><p>Day ${run.day}. Keep this person on an account.</p><div class="stack"><button class="act" type="button" data-act="nav" data-go="save"><strong>Save your progress</strong></button><button class="act" type="button" data-act="snooze"><strong>Not now</strong></button></div></aside>`
  }
  return ''
}

function play(state, screenName, placeId) {
  const { district, run } = state
  return `<main class="screen world-hud" data-screen="${screenName}">
    ${chrome(district, run)}
    <div class="world-space"></div>
    ${placeId ? sheet(district, run, placeId) : ''}
    ${nav('play', true)}
    ${overlay(state)}
  </main>`
}

function summaryRows(morning, stats) {
  const rows = [
    ['Money', morning?.money, stats.money],
    ['Energy', morning?.energy, stats.energy],
    ['Fullness', morning?.hunger, stats.hunger],
    ['Grades', morning?.grades, stats.grades],
    ['Social', morning?.social, stats.social],
  ]
  return rows.map(([label, from, to]) => {
    if (from == null) return `<li><span>${label}</span><span>${label === 'Money' ? formatMoney(to) : to}</span></li>`
    const delta = Math.round(to - from)
    const shownFrom = label === 'Money' ? formatMoney(from) : from
    const shownTo = label === 'Money' ? formatMoney(to) : to
    return `<li><span>${label}</span><span>${shownFrom} → ${shownTo} (${delta > 0 ? '+' : ''}${delta})</span></li>`
  }).join('')
}

function summary(state) {
  const { district, run } = state
  const line = run.summary?.hungry
    ? 'You slept hungry. Tomorrow starts a little tired.'
    : run.summary?.slept
      ? 'You made it to bed.'
      : 'You did not sleep. Tomorrow starts with less energy.'
  return `<main class="screen world-hud" data-screen="summary">
    ${chrome(district, run)}
    <section class="summary-panel">
      <p class="kind">End of day ${run.summary?.day || run.day}</p>
      <h2>That's the day</h2>
      <p>${esc(line)}</p>
      <ul class="delta-list">${summaryRows(state.morning, run.stats)}</ul>
      <button class="btn primary block" type="button" data-act="next">Start next day</button>
    </section>
    ${nav('summary', true)}
    ${overlay(state)}
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
  const code = district.meta.dialCode
  const groups = RES_GROUPS.map(([type, label]) => {
    const rows = district.residences.filter((row) => row.type === type)
    if (!rows.length) return ''
    return `<optgroup label="${label}">${rows.map((row) =>
      `<option value="${esc(row.name)}" ${row.name === draft.residence ? 'selected' : ''}>${esc(row.name)}${row.distanceKm ? ` · ${row.distanceKm} km` : ''}</option>`).join('')}</optgroup>`
  }).join('')
  const picker = (label, items, key) => `<fieldset class="cc-group"><legend>${label}</legend><div class="cc-chips${key === 'skin' ? '' : ' thumbs'}">${items.map((item) =>
    `<button class="cc-chip${item.fill ? ' sw' : ' th'}" type="button" data-act="avatar" data-part="${key}" data-id="${item.id}" aria-label="${esc(item.label)}" aria-pressed="${draft.avatar[key] === item.id}">${
      item.fill ? `<i style="background:${item.fill}"></i>`
        : `<span class="cc-thumb ${key}">${avatarSvg({ ...draft.avatar, [key]: item.id }, code, 44)}</span><b>${esc(item.label)}</b>`
    }</button>`).join('')}</div></fieldset>`
  const todo = [draft.name.trim().length >= 2, !!draft.residence, !!draft.course].filter((ok) => !ok).length
  return `<main class="screen cc" data-screen="create">
    <header class="cc-top"><a class="cc-back" href="#/">‹ Back</a><h1>Who's arriving?</h1><a class="cc-back" href="#/rules">Rules</a></header>
    <div class="cc-body">
      <div class="cc-opts">
        ${picker('Skin', skins, 'skin')}
        ${picker('Hair', hairs, 'hair')}
        ${picker('Outfit', outfits, 'outfit')}
      </div>
      <aside class="cc-preview">
        <div class="cc-stage">
          <svg class="cc-bg" viewBox="0 0 150 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <rect width="150" height="260" fill="#ffc37a"/><circle cx="118" cy="96" r="22" fill="#ff8a3d"/>
            <path d="M20 110Q50 40 80 110" fill="none" stroke="#fff4e4" stroke-width="3"/>
            <rect y="108" width="150" height="20" fill="#1d7fb8"/><rect y="128" width="150" height="132" fill="#5cb85c"/>
            <ellipse cx="75" cy="214" rx="66" ry="22" fill="#7fd07f" stroke="#f3e2c2" stroke-width="5"/>
            <path d="M136 200c2-20 0-36-6-52" stroke="#8a5a3a" stroke-width="4" fill="none"/>
            <g fill="#1f6b45" transform="translate(130 148)"><path d="M0 0q-14-10-26 2q12-6 26-2z"/><path d="M0 0q14-10 26 2q-12-6-26-2z"/><path d="M0 0q-6-14-20-16q12 4 20 16z"/><path d="M0 0q6-14 20-16q-12 4-20 16z"/></g>
          </svg>
          <span class="cc-ready${todo ? '' : ' ok'}">${todo ? `${todo} to go` : 'Ready ✓'}</span>
          <div class="cc-bob">${avatarSvg(draft.avatar, code, 118)}</div>
        </div>
        <div class="cc-id"><small>Student card</small>
          <strong>${esc(draft.name.trim() || 'Your name')}</strong>
          <span>${esc(draft.residence || 'Res: choose below')}</span><span>${esc(draft.course || 'Course: choose below')}</span></div>
      </aside>
    </div>
    <div class="cc-fields">
      <label class="cc-field">Name<input id="name" maxlength="24" value="${esc(draft.name)}" autocomplete="nickname" placeholder="Your name"></label>
      <label class="cc-field">Residence<select id="residence"><option value="">Choose res</option>${groups}</select></label>
      <label class="cc-field">Course<select id="course"><option value="">Choose course</option>${district.courses.map((course) =>
        `<option ${course === draft.course ? 'selected' : ''}>${esc(course)}</option>`).join('')}</select></label>
      <label class="cc-field"><span>Social handle <span class="fine">optional</span></span><input id="handle" maxlength="30" placeholder="@handle" value="${esc(draft.handle)}"></label>
    </div>
    ${draft.error ? `<p class="error cc-err">${esc(draft.error)}</p>` : ''}
    <div class="cc-go"><button class="btn ts-start" type="button" data-act="begin">Walk onto campus</button></div>
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

function isoBlock(x, y, w, h, d, front, side, roof) {
  return `<path d="M${x + 6} ${y + h}h${w}l${d} ${-d / 2}h${-w}z" fill="#1c1915" opacity=".14" transform="translate(${d * .6} ${d * .5})"/>
    <path d="M${x} ${y}h${w}v${h}h${-w}z" fill="${front}"/>
    <path d="M${x + w} ${y}l${d} ${-d / 2}v${h}l${-d} ${d / 2}z" fill="${side}"/>
    <path d="M${x} ${y}l${d} ${-d / 2}h${w}l${-d} ${d / 2}z" fill="${roof}"/>`
}

function palm(x, y, k) {
  const fronds = [[-46, 8], [-38, -14], [-16, -30], [16, -30], [38, -14], [46, 8]]
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <ellipse cx="6" cy="2" rx="16" ry="4" fill="#1c1915" opacity=".14"/>
    <path d="M0 0c4-24 2-50-8-78" stroke="#8a5a3a" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M2-14h-7M3-30h-7M1-46h-7M-3-62h-7" stroke="#6b4429" stroke-width="2"/>
    <g class="ts-palm" transform="translate(-8 -78)">
      ${fronds.map(([fx, fy], i) => `<path d="M0 0Q${fx * .5} ${fy - 14} ${fx} ${fy}Q${fx * .45} ${fy - 2} 0 0z" fill="${i % 2 ? '#2e8b57' : '#1f6b45'}"/>`).join('')}
      <circle cx="-3" cy="3" r="3" fill="#8a5a3a"/><circle cx="3" cy="4" r="3" fill="#6b4429"/></g></g>`
}

function campusScene(district, avatar) {
  const places = Object.fromEntries((district.places || []).map((p) => [p.id, p]))
  const nm = (id, fb) => esc(places[id]?.name || fb)
  const res = ['res_o', 'res_r', 'res_s'].map((id, i) => nm(id, ['O Block', 'R Block', 'S Block'][i]))
  const towers = [[0, 52], [14, 70], [30, 44], [44, 84], [60, 58], [250, 64], [266, 90], [284, 50], [300, 76], [318, 60], [334, 96], [352, 54], [368, 72]]
  return `<svg class="ts-scene" viewBox="0 -170 390 844" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <rect y="-170" width="390" height="844" fill="#ffd9a8"/>
    <rect y="-170" width="390" height="190" fill="#ffc37a"/>
    <rect y="20" width="390" height="70" fill="#ffcf92"/>
    <g class="ts-cloud c1" fill="#fff4e4"><ellipse cx="40" cy="40" rx="38" ry="11"/><ellipse cx="62" cy="31" rx="20" ry="12"/></g>
    <g class="ts-cloud c2" fill="#fff4e4" opacity=".85"><ellipse cx="180" cy="66" rx="30" ry="8"/><ellipse cx="196" cy="59" rx="15" ry="9"/></g>
    <g class="ts-cloud c3" fill="#fff4e4" opacity=".8"><ellipse cx="300" cy="-14" rx="30" ry="8"/><ellipse cx="316" cy="-21" rx="14" ry="8"/></g><g class="ts-cloud c4" fill="#fff4e4" opacity=".6"><ellipse cx="120" cy="2" rx="22" ry="6"/></g>
    <g class="ts-birds" fill="none" stroke="#5a3a5e" stroke-width="2" stroke-linecap="round">
      <path d="M90 60q5-5 10 0q5-5 10 0"/><path d="M118 48q4-4 8 0q4-4 8 0"/><path d="M104 76q3-3 6 0q3-3 6 0"/></g>
    <circle cx="318" cy="132" r="44" fill="#ff8a3d"/><circle cx="318" cy="132" r="30" fill="#ffa95e"/>
    <g fill="#b0527a">${towers.map(([tx, th]) => `<rect x="${tx}" y="${140 - th}" width="14" height="${th}"/>`).join('')}</g>
    <g fill="#ffd27a" opacity=".8">${towers.filter((_, i) => i % 2).map(([tx, th]) => `<rect x="${tx + 4}" y="${148 - th}" width="3" height="3"/><rect x="${tx + 4}" y="${158 - th}" width="3" height="3"/>`).join('')}</g>
    <path d="M96 140q0-22 54-26q54 4 54 26z" fill="#8f3f68"/>
    <path d="M108 140Q150 22 196 140" fill="none" stroke="#fff4e4" stroke-width="5" stroke-linecap="round"/>
    <rect y="140" width="390" height="44" fill="#1d7fb8"/>
    <g fill="#ffa95e" opacity=".85"><rect x="290" y="146" width="56" height="3" rx="1.5"/><rect x="298" y="155" width="40" height="3" rx="1.5"/><rect x="306" y="164" width="24" height="3" rx="1.5"/></g>
    <path d="M0 176h390" stroke="#7cc6e8" stroke-width="2" stroke-dasharray="14 20" class="ts-wave"/>
    <path d="M0 184c80-12 200-12 390 0v10H0z" fill="#f3e2c2"/>
    <path d="M0 192c90-14 220-14 390-2V674H0z" fill="#5cb85c"/>
    <path d="M0 260c110-18 240-18 390 0V674H0z" fill="#4aa34f"/>
    <path d="M195 674V330M20 340c80-8 270-8 360 0" stroke="#f3e2c2" stroke-width="18" fill="none" stroke-linecap="round"/>
    <g transform="translate(0 -6)">${isoBlock(14, 220, 92, 50, 18, '#c4512a', '#9c3f20', '#e0662a')}
      <rect x="26" y="234" width="10" height="36" fill="#fff4e4"/><rect x="52" y="234" width="10" height="36" fill="#fff4e4"/><rect x="78" y="234" width="10" height="36" fill="#fff4e4"/>
      <text x="60" y="196" class="ts-lbl" text-anchor="middle">${nm('library', 'Library')}</text></g>
    <g>${isoBlock(250, 226, 104, 52, 22, '#1d7fb8', '#165f8a', '#7cc6e8')}
      <rect x="290" y="250" width="24" height="28" fill="#fff4e4"/><rect x="258" y="236" width="24" height="9" fill="#bfe6f7"/><rect x="322" y="236" width="24" height="9" fill="#bfe6f7"/>
      <text x="306" y="196" class="ts-lbl" text-anchor="middle">${nm('sports_centre', 'Sports Centre')}</text></g>
    <g transform="translate(195 340)"><ellipse cx="6" cy="8" rx="100" ry="30" fill="#1c1915" opacity=".1"/><ellipse rx="100" ry="30" fill="#7fd07f" stroke="#f3e2c2" stroke-width="7"/>
      <ellipse rx="14" ry="6" fill="#7b3fe4"/><ellipse cy="-3" rx="7" ry="3" fill="#f0c400"/>
      <text x="-48" y="-38" class="ts-lbl big" text-anchor="middle">${nm('quad', 'The Quad')}</text></g>
    <g class="ts-kombi"><g transform="translate(0 318)"><ellipse cx="22" cy="18" rx="24" ry="3" fill="#1c1915" opacity=".18"/>
      <path d="M0 4q0-6 6-6h28q8 0 12 10v8H0z" fill="#fffaf2"/><rect y="8" width="46" height="4" fill="#1d7fb8"/>
      <rect x="6" y="0" width="9" height="6" fill="#7cc6e8"/><rect x="18" y="0" width="9" height="6" fill="#7cc6e8"/><path d="M30 0h5q4 0 6 6h-11z" fill="#7cc6e8"/>
      <circle cx="10" cy="16" r="4" fill="#1c1915"/><circle cx="36" cy="16" r="4" fill="#1c1915"/></g></g>
    ${[[0, '#ff8a3d', '#1c1915'], [1, '#7b3fe4', '#3f291c']].map(([i, c, h]) => `<g class="ts-walker w${i}"><g transform="translate(0 ${i ? 470 : 420})">
      <ellipse cx="0" cy="18" rx="6" ry="1.6" fill="#1c1915" opacity=".2"/><path d="M-2 10v8M2 10v8" stroke="#2b3a55" stroke-width="2.4"/>
      <rect x="-5" y="0" width="10" height="11" rx="4" fill="${c}"/><circle cy="-4" r="4.2" fill="${i ? '#8a5a3a' : '#d2956b'}"/><path d="M-4.2-5a4.2 4.2 0 0 1 8.4 0z" fill="${h}"/></g></g>`).join('')}
    ${res.map((r, i) => { const x = 12 + i * 62, y = 400 + (i % 2) * 18; return `<g>${isoBlock(x, y, 52, 64 - i * 4, 14, ['#fff4e4', '#ffe1b8', '#fff4e4'][i], '#e8c79c', '#c9a57a')}
      ${[0, 1, 2].map((row) => `<rect x="${x + 6}" y="${y + 8 + row * 17}" width="10" height="8" fill="#1d7fb8"/><rect x="${x + 21}" y="${y + 8 + row * 17}" width="10" height="8" fill="#ff8a3d"/><rect x="${x + 36}" y="${y + 8 + row * 17}" width="10" height="8" fill="#1d7fb8"/>`).join('')}
      <rect x="${x}" y="${y - 10}" width="52" height="11" rx="2" fill="#7b3fe4"/><text x="${x + 26}" y="${y - 1.5}" class="ts-tag">${r}</text></g>` }).join('')}
    ${palm(368, 330, 1.05)}${palm(150, 262, .8)}${palm(214, 470, .95)}${palm(20, 312, .7)}
    <g class="ts-avatar">${avatar}</g>
  </svg>`
}

function title(state) {
  const district = state.district
  const day = state.save.run?.day
  const look = state.save.run?.character?.avatar || { skin: 'amber', hair: 'braids', outfit: 'organt' }
  const avatar = avatarSvg(look, district.meta.dialCode, 104).replace('<svg ', '<svg x="206" y="236" class="wave" ')
  return `<main class="screen ts" data-screen="title">
    ${campusScene(district, avatar)}
    <header class="ts-sign" aria-label="CampusVille">
      <div class="ts-board"><small>Welcome to</small><h1>Campus<span>Ville</span></h1><i class="bolt a"></i><i class="bolt b"></i><i class="bolt c"></i><i class="bolt d"></i></div>
      <div class="ts-plaque">${esc(district.meta.city || 'Durban')} · Est. first year</div>
      <i class="ts-post l"></i><i class="ts-post r"></i>
    </header>
    <div class="ts-foot">
      <p class="ts-tag-line">Res, lectures, bunny chows and besties. Survive first year.</p>
      <button class="btn ts-start" type="button" data-act="start">Start first year</button>
      ${day ? `<button class="ts-continue" type="button" data-act="continue">Continue · day ${day}</button>` : ''}
      <nav class="ts-links"><a href="#/rules">Rules</a><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a></nav>
    </div>
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
    return `<main class="screen world-hud" data-screen="${screen}">
      ${chrome(state.district, state.run)}
      ${cardHtml(state.run.queue[0], state)}
      ${nav(screen, true)}
    </main>`
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
  if (name.startsWith('cam-')) state.screen = 'play'
  if (name === 'summary') {
    run.day = 4
    run.mode = 'summary'
    run.stats = { money: 1420, energy: 45, hunger: 30, grades: 58, social: 55 }
    run.summary = { day: 4, slept: true, hungry: true, stats: { ...run.stats } }
    state.morning = { money: 1500, energy: 80, hunger: 70, grades: 50, social: 40 }
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
