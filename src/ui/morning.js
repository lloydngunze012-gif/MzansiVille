import morning from '../../data/campusville/morning.json'
import { avatarSvg } from '../avatar.js'
import { homePlaceId } from '../engine/model.js'

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

export const MORNING = morning

const ROOM = morning.room.anchors
const STOP = morning.stop.anchors

export const MORNING_FLOW = {
  bed: {
    scene: 'room',
    at: 'bed',
    to: 'kettle',
    button: 'Get up',
    line: 'Sun on the curtain. O Block is already noisy.',
    next: 'kettle',
  },
  kettle: {
    scene: 'room',
    at: 'kettle',
    to: 'kettle',
    button: 'Make noodles',
    line: 'Kettle on the counter. Packets on the shelf.',
    effect: 'noodles',
    next: 'door',
  },
  door: {
    scene: 'room',
    at: 'kettle',
    to: 'door',
    button: 'Out to the bus',
    effect: 'leave',
    next: 'stop',
  },
  stop: {
    scene: 'stop',
    at: 'arrive',
    to: 'waiting',
    enter: true,
    button: 'Wait for the bus',
    line: 'The campus stop. Bench, sign, an empty lane.',
    effect: 'bus',
    next: 'bus',
  },
  bus: {
    scene: 'stop',
    at: 'waiting',
    to: 'bus_stop',
    button: 'Ride to campus',
    line: 'The bus is in. Gold stripe, purple board.',
    effect: 'ride',
    next: 'campus',
  },
  campus: {
    scene: 'campus',
    at: 'campus',
    button: 'Onto campus',
    line: 'Westville Campus. The lecture is at 9:00.',
    effect: 'arrive',
    next: 'done',
  },
}

export function morningStep(run) {
  if (run?.morningDone) return 'done'
  if (MORNING_FLOW[run?.morningStep]) return run.morningStep
  if (run?.doneToday?.includes('go_bus')) return 'done'
  if (run?.doneToday?.includes('wake_noodles')) return 'door'
  return 'bed'
}

export function morningActive(district, run) {
  if (!run || run.mode !== 'play' || run.day !== 1 || run.morningDone) return false
  if (typeof location !== 'undefined') {
    const shot = new URLSearchParams(location.search).get('shot')
    if (shot && shot !== 'morning') return false
  }
  if (homePlaceId(district, run.character?.residence) !== morning.homePlace) return false
  if (run.phase !== 'wake' && run.phase !== 'transit') return false
  const step = morningStep(run)
  if (step === 'done') return false
  if (run.doneToday?.includes('go_bus') && step !== 'campus') return false
  return true
}

function spot(anchors, name) {
  const point = anchors[name] || [50, 50]
  return { x: point[0], y: point[1] }
}

function figure(avatar, code, size) {
  return avatarSvg(avatar, code, size)
}

function roomSvg(stolen) {
  const bed = spot(ROOM, 'bed')
  const kettle = spot(ROOM, 'kettle')
  const shelf = spot(ROOM, 'noodle_shelf')
  const door = spot(ROOM, 'door')
  return `<svg class="m-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="m-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4b2d86"/><stop offset="1" stop-color="#2a1846"/>
      </linearGradient>
      <linearGradient id="m-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e7c48a"/><stop offset="1" stop-color="#c9956a"/>
      </linearGradient>
    </defs>
    <rect width="100" height="34" fill="url(#m-wall)"/>
    <rect y="34" width="100" height="66" fill="url(#m-floor)"/>
    <rect x="8" y="8" width="28" height="16" rx="2" fill="#ffd27a" opacity=".35"/>
    <rect x="10" y="10" width="24" height="12" rx="1" fill="#9fd4ff" opacity=".55"/>
    <path d="M${bed.x} ${bed.y - 6} L${kettle.x} ${kettle.y - 8} L${door.x} ${door.y + 6}" fill="none" stroke="#f6e7c8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
    <g class="m-door" transform="translate(${door.x - 8} ${door.y - 10})">
      <rect width="16" height="22" rx="1" fill="#5b23c9" stroke="#ffd23f" stroke-width="1.2"/>
      <rect x="2" y="2" width="12" height="14" fill="#3a1d6e"/>
      <circle cx="12" cy="16" r="1" fill="#ffd23f"/>
    </g>
    <g class="m-bed" transform="translate(${bed.x - 14} ${bed.y - 8})">
      <rect width="28" height="16" rx="2" fill="#f4efe4" stroke="#5b23c9" stroke-width="1"/>
      <rect width="28" height="5" fill="#7b3fe4"/>
      <rect x="2" y="6" width="10" height="6" rx="1" fill="#ffd23f"/>
    </g>
    <g class="m-counter" transform="translate(${kettle.x - 16} ${kettle.y - 16})">
      <rect width="32" height="10" rx="1" fill="#6b4a32"/>
      <rect y="10" width="32" height="3" fill="#4a3020"/>
    </g>
    <g class="m-kettle" transform="translate(${kettle.x - 5} ${kettle.y - 22})">
      <rect width="12" height="10" rx="2" fill="#d7d2dc" stroke="#2a1846" stroke-width=".6"/>
      <rect x="4" y="-2" width="4" height="3" rx="1" fill="#2a1846"/>
      <path d="M12 3h3v4h-3" fill="none" stroke="#2a1846" stroke-width="1"/>
      <g class="m-steam" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0">
        <path d="M4 0q2-3 0-5"/><path d="M8 0q-2-3 0-6"/>
      </g>
    </g>
    <g class="m-shelf${stolen ? ' empty' : ''}" transform="translate(${shelf.x - 12} ${shelf.y - 8})">
      <rect width="24" height="3" fill="#5b23c9"/>
      <g class="m-packets">
        <rect x="2" y="-8" width="5" height="8" fill="#ffd23f"/>
        <rect x="9" y="-8" width="5" height="8" fill="#ff8a3d"/>
        <rect x="16" y="-8" width="5" height="8" fill="#f6e7c8"/>
      </g>
    </g>
    <rect x="0" y="0" width="100" height="100" fill="url(#m-glow)" opacity=".0"/>
    <rect x="70" y="0" width="30" height="28" fill="#ffb35c" opacity=".18"/>
  </svg>`
}

function stopSvg(mode) {
  const bench = spot(STOP, 'bench')
  const sign = spot(STOP, 'sign')
  const lane = spot(STOP, 'bus_lane')
  return `<svg class="m-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="m-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffb35c"/><stop offset=".45" stop-color="#e07a4a"/><stop offset="1" stop-color="#6b3fa0"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#m-sky)"/>
    <rect y="58" width="100" height="42" fill="#5e9445"/>
    <rect y="68" width="100" height="18" fill="#3a4450"/>
    <g fill="#f3dfb4">
      <rect y="74" x="0" width="12" height="2"/><rect y="74" x="20" width="12" height="2"/>
      <rect y="74" x="40" width="12" height="2"/><rect y="74" x="60" width="12" height="2"/>
      <rect y="74" x="80" width="12" height="2"/>
    </g>
    <rect x="${lane.x - 18}" y="72" width="36" height="6" fill="none" stroke="#ffd23f" stroke-width="1" stroke-dasharray="2 2" opacity=".8"/>
    <g transform="translate(${bench.x - 10} ${bench.y - 4})">
      <rect width="22" height="3" rx="1" fill="#8a5a3a"/>
      <rect x="2" width="2" height="8" fill="#5b3a22"/><rect x="18" width="2" height="8" fill="#5b3a22"/>
    </g>
    <g transform="translate(${sign.x - 7} ${sign.y - 16})">
      <rect x="6" y="10" width="2" height="16" fill="#2a1846"/>
      <rect width="22" height="12" rx="2" fill="#5b23c9" stroke="#ffd23f" stroke-width="1"/>
      <text x="11" y="8" text-anchor="middle" font-size="3.2" font-weight="700" fill="#ffd23f" font-family="Arial,sans-serif">CAMPUS</text>
    </g>
    <g transform="translate(${lane.x - 16} ${lane.y - 14})">
      <g class="m-bus ${mode}">
      <rect width="34" height="16" rx="3" fill="#ffb43d" stroke="#2a1846" stroke-width=".6"/>
      <rect y="10" width="34" height="3" fill="#e0782a"/>
      <rect x="3" y="3" width="7" height="6" rx="1" fill="#2a1846"/>
      <rect x="13" y="3" width="7" height="6" rx="1" fill="#2a1846"/>
      <rect x="23" y="3" width="7" height="6" rx="1" fill="#2a1846"/>
      <circle cx="8" cy="16" r="2.4" fill="#1a0f2e"/><circle cx="26" cy="16" r="2.4" fill="#1a0f2e"/>
      </g>
    </g>
  </svg>`
}

function campusSvg() {
  return `<svg class="m-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="100" height="100" fill="#5e9445"/>
    <rect width="100" height="42" fill="#ffb35c" opacity=".35"/>
    <path d="M30 78 C40 60 60 60 70 78" fill="none" stroke="#f6e7c8" stroke-width="6" stroke-linecap="round"/>
    <rect x="18" y="34" width="10" height="40" fill="#ecd5a8"/>
    <rect x="72" y="34" width="10" height="40" fill="#ecd5a8"/>
    <rect x="16" y="30" width="14" height="6" fill="#5b23c9"/>
    <rect x="70" y="30" width="14" height="6" fill="#5b23c9"/>
    <path d="M23 36 Q50 8 77 36" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/>
    <text x="50" y="28" text-anchor="middle" font-size="5" font-weight="700" fill="#ffd23f" font-family="Arial,sans-serif">WESTVILLE</text>
  </svg>`
}

function youHtml(run, code, point, enter) {
  const avatar = figure(run.character?.avatar, code, 64)
  return `<span class="m-you${enter ? ' enter' : ''}" style="left:${point.x}%;top:${point.y}%">${avatar}</span>`
}

function lineFor(run, step, spec) {
  if (step === 'door') {
    if (run.morningPacket === 'stolen') return 'The shelf is bare. Your roommate got the last packet.'
    return 'Noodles done. Time to make the bus.'
  }
  return spec.line
}

export function morningHtml(state) {
  const { district, run } = state
  const step = morningStep(run)
  const spec = MORNING_FLOW[step] || MORNING_FLOW.bed
  const code = district.meta.dialCode
  const anchors = spec.scene === 'room' ? ROOM : STOP
  const at = spot(anchors, spec.at)
  const stolen = run.morningPacket === 'stolen'
  const scene = spec.scene === 'room' ? roomSvg(stolen) : spec.scene === 'stop' ? stopSvg(step === 'bus' ? 'in' : 'hold') : campusSvg()
  const mate = spec.scene === 'room' ? (() => {
    const mateAt = stolen ? spot(ROOM, 'noodle_shelf') : spot(ROOM, 'roommate')
    return `<span class="m-mate${stolen ? ' at-shelf' : ''}" style="left:${mateAt.x}%;top:${mateAt.y}%">
      <svg viewBox="0 0 40 64" width="46" height="74" aria-hidden="true">
        <ellipse cx="20" cy="62" rx="10" ry="2" fill="#1a0f2e" opacity=".3"/>
        <path d="M12 40h16l2 16H10z" fill="#5b23c9"/>
        <path d="M14 54h5l-1 8h-4zM21 54h5l-1 8h-4z" fill="#1c1915"/>
        <circle cx="20" cy="24" r="10" fill="#d2956b"/>
        <path d="M10 26c0-10 4-16 10-16s10 6 10 16" fill="#1c1915"/>
        <circle cx="16" cy="25" r="1.3" fill="#1c1915"/><circle cx="24" cy="25" r="1.3" fill="#1c1915"/>
      </svg>
      ${stolen ? '<b class="m-bubble">Last packet. Sorry.</b>' : ''}
    </span>`
  })() : ''
  const enterFrom = spot(STOP, 'arrive')
  const enterTo = spot(STOP, 'waiting')
  const enterCss = spec.enter ? `<style>@keyframes m-enter{from{left:${enterFrom.x}%;top:${enterFrom.y}%}to{left:${enterTo.x}%;top:${enterTo.y}%}}</style>` : ''
  return `<section class="m-stage" data-morning="${esc(step)}" data-scene="${esc(spec.scene)}">
    ${enterCss}
    ${scene}
    ${mate}
    ${youHtml(run, code, at, Boolean(spec.enter))}
    <p class="m-goal">${esc(morning.goal)}</p>
    <p class="m-line">${esc(lineFor(run, step, spec))}</p>
    <button type="button" class="m-go" data-act="morning">${esc(spec.button)}</button>
  </section>`
}
