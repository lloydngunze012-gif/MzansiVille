// Flat-vector campus art for the map home. Each building is its own small
// SVG so it keeps its shape at any phone width; the ground is one stretched
// SVG with non-scaling paths.

const CREAM = '#f6e7c8'
const SHADOW = '<ellipse cx="50%" cy="96%" rx="44%" ry="5%" fill="#1a0f2e" opacity=".28"/>'

function svg(w, h, body) {
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`
}

function lecture(roof, glyph) {
  return svg(64, 54, `${SHADOW}
    <rect x="8" y="21" width="48" height="29" rx="1.5" fill="${CREAM}"/>
    <rect x="44" y="21" width="12" height="29" fill="#1a0f2e" opacity=".1"/>
    <polygon points="3,22 32,6 61,22" fill="${roof}"/>
    <polygon points="32,6 61,22 46,22" fill="#1a0f2e" opacity=".18"/>
    ${[13, 21, 39, 47].map((x) => `<rect x="${x}" y="25" width="4" height="21" fill="#fffaf0"/>`).join('')}
    <rect x="27" y="33" width="10" height="17" rx="5" fill="#2a1846"/>
    <rect x="6" y="48" width="52" height="3" fill="#d8c29a"/>
    <circle cx="32" cy="16" r="6.5" fill="#1d6fbf" stroke="#fffaf0" stroke-width="1.2"/><text x="32" y="19" font-size="8" text-anchor="middle">${glyph}</text>`)
}

function library() {
  return svg(72, 54, `${SHADOW}
    <rect x="6" y="18" width="60" height="32" rx="2" fill="#ecd5a8"/>
    <rect x="6" y="14" width="60" height="7" rx="2" fill="#7b3fe4"/>
    <rect x="52" y="18" width="14" height="32" fill="#1a0f2e" opacity=".1"/>
    ${[11, 21, 45, 55].map((x) => `<rect x="${x}" y="26" width="7" height="9" rx="1" fill="#ffcf6b"/><rect x="${x}" y="38" width="7" height="9" rx="1" fill="#ffcf6b" opacity=".75"/>`).join('')}
    <rect x="30" y="33" width="12" height="17" rx="1" fill="#2a1846"/>
    <rect x="24" y="2" width="24" height="15" rx="3" fill="#2a1846" stroke="#ffd23f" stroke-width="1.2"/>
    <path d="M27 6 Q31.5 4 36 6.5 L36 14 Q31.5 11.5 27 13.5Z" fill="#ffd23f"/>
    <path d="M45 6 Q40.5 4 36 6.5 L36 14 Q40.5 11.5 45 13.5Z" fill="#ffe58a"/>`)
}

function cafeteria() {
  const stripes = Array.from({ length: 8 }, (_, i) => `<rect x="${6 + i * 7}" y="20" width="7" height="7" fill="${i % 2 ? '#fff4dc' : '#ff8a3d'}"/>`).join('')
  const scallop = Array.from({ length: 8 }, (_, i) => `<circle cx="${9.5 + i * 7}" cy="27" r="3.5" fill="${i % 2 ? '#fff4dc' : '#ff8a3d'}"/>`).join('')
  return svg(68, 54, `${SHADOW}
    <rect x="8" y="12" width="52" height="38" rx="2" fill="#fff1d6"/>
    <rect x="8" y="9" width="52" height="5" rx="2" fill="#5b23c9"/>
    <rect x="48" y="12" width="12" height="38" fill="#1a0f2e" opacity=".08"/>
    ${stripes}${scallop}
    <rect x="14" y="33" width="16" height="12" rx="1" fill="#ffcf6b"/><rect x="37" y="33" width="10" height="17" rx="1" fill="#2a1846"/>
    <circle cx="5" cy="47" r="3" fill="#c46a2c"/><circle cx="63" cy="47" r="3" fill="#c46a2c"/>`)
}

function sports() {
  return svg(84, 60, `${SHADOW}
    <rect x="4" y="18" width="76" height="38" rx="3" fill="#3f9a4e"/>
    <rect x="4" y="18" width="76" height="38" rx="3" fill="none" stroke="#e9ffe9" stroke-width="1.2" opacity=".85"/>
    <line x1="42" y1="18" x2="42" y2="56" stroke="#e9ffe9" stroke-width="1.2" opacity=".85"/>
    <circle cx="42" cy="37" r="6" fill="none" stroke="#e9ffe9" stroke-width="1.2" opacity=".85"/>
    <rect x="4" y="29" width="9" height="16" fill="none" stroke="#e9ffe9" stroke-width="1.2" opacity=".85"/>
    <rect x="71" y="29" width="9" height="16" fill="none" stroke="#e9ffe9" stroke-width="1.2" opacity=".85"/>
    <rect x="18" y="4" width="48" height="13" rx="2" fill="#5b23c9"/>
    ${[22, 30, 38, 46, 54].map((x) => `<rect x="${x}" y="8" width="5" height="5" fill="#ffd23f" opacity=".85"/>`).join('')}`)
}

export function residence(letter, tint = '#d9774a') {
  const win = []
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) win.push(`<rect x="${12 + c * 9}" y="${14 + r * 10}" width="5" height="6" rx="1" fill="#ffcf6b" opacity="${(r + c) % 3 ? 0.9 : 0.45}"/>`)
  return svg(58, 54, `${SHADOW}
    <rect x="7" y="8" width="34" height="42" rx="2" fill="${tint}"/>
    <rect x="33" y="8" width="8" height="42" fill="#1a0f2e" opacity=".14"/>
    <rect x="5" y="5" width="38" height="5" rx="2" fill="#7a3a26"/>
    ${win.join('')}
    <rect x="20" y="43" width="8" height="7" fill="#2a1846"/>
    <circle cx="46" cy="16" r="9" fill="#2a1846" stroke="#ffd23f" stroke-width="1.5"/>
    <text x="46" y="20" font-size="11" font-weight="900" text-anchor="middle" fill="#ffd23f" font-family="Arial Black,Arial">${letter}</text>`)
}


// Greenway Grocer: a white shop, green awning and fascia, a trolley.
function grocer() {
  return svg(76, 52, `${SHADOW}
    <rect x="8" y="14" width="56" height="30" rx="3" fill="#f6f7f3" stroke="#2f8f5b" stroke-width="2"/>
    <rect x="6" y="10" width="60" height="7" rx="2" fill="#2f8f5b"/>
    <circle cx="64" cy="14" r="7" fill="#f0c400" stroke="#1c1915" stroke-width="1.3"/>
    ${[10, 22, 34, 46, 58].map((x) => `<rect x="${x}" y="17" width="6" height="5" fill="#3aa86b"/>`).join('')}
    <rect x="14" y="26" width="16" height="12" rx="1" fill="#cfeee0"/><rect x="42" y="26" width="16" height="12" rx="1" fill="#cfeee0"/>
    <rect x="32" y="28" width="8" height="16" rx="1" fill="#2f8f5b"/>`)
}

function busStation() {
  return svg(76, 52, `${SHADOW}
    <rect x="4" y="12" width="30" height="4" rx="1.5" fill="#c47a32"/>
    <rect x="7" y="16" width="2.5" height="28" fill="#2a1846"/><rect x="28" y="16" width="2.5" height="28" fill="#2a1846"/>
    <rect x="9" y="17" width="19" height="16" fill="#bfe6ff" opacity=".35"/>
    <rect x="10" y="36" width="17" height="3" rx="1" fill="#8a5a3a"/>
    <rect x="36" y="20" width="36" height="22" rx="4" fill="#ffb43d"/>
    <rect x="36" y="34" width="36" height="4" fill="#e0782a"/>
    ${[39, 48, 57].map((x) => `<rect x="${x}" y="23" width="7" height="8" rx="1" fill="#2a1846" opacity=".8"/>`).join('')}
    <rect x="65" y="23" width="5" height="13" rx="1" fill="#2a1846" opacity=".8"/>
    <circle cx="44" cy="43" r="4" fill="#1a0f2e"/><circle cx="64" cy="43" r="4" fill="#1a0f2e"/>
    <circle cx="44" cy="43" r="1.6" fill="#ccc"/><circle cx="64" cy="43" r="1.6" fill="#ccc"/>
    <circle cx="66" cy="12" r="7" fill="#f0c400" stroke="#1c1915" stroke-width="1.3"/>`)
}

function gate() {
  return svg(80, 52, `${SHADOW}
    <rect x="8" y="10" width="10" height="38" rx="1" fill="#ecd5a8"/><rect x="62" y="10" width="10" height="38" rx="1" fill="#ecd5a8"/>
    <rect x="6" y="7" width="14" height="5" fill="#5b23c9"/><rect x="60" y="7" width="14" height="5" fill="#5b23c9"/>
    <path d="M13 12 Q40 -4 67 12" fill="none" stroke="#ffd23f" stroke-width="4" stroke-linecap="round"/>
    <rect x="18" y="30" width="44" height="4" rx="2" fill="#fff"/>
    ${[22, 32, 42, 52].map((x) => `<rect x="${x}" y="30" width="5" height="4" fill="#e23b3b"/>`).join('')}
    <rect x="22" y="38" width="9" height="10" fill="#2a1846"/><rect x="23" y="39.5" width="7" height="3" fill="#bfe6ff" opacity=".7"/>`)
}

// The heart of campus: a paved plaza ring, a plinth and the gold crown (the Soft Life mark).
function quad() {
  return svg(124, 84, `
    <ellipse cx="62" cy="50" rx="60" ry="32" fill="#f0c400" opacity=".28"/>
    <ellipse cx="62" cy="48" rx="54" ry="28" fill="#f6e7c8" stroke="#f0c400" stroke-width="3"/>
    <ellipse cx="62" cy="48" rx="38" ry="19" fill="#e8d2a4"/>
    <ellipse cx="62" cy="48" rx="26" ry="12.5" fill="none" stroke="#b9925a" stroke-width="1.4" stroke-dasharray="3 3"/>
    <ellipse cx="62" cy="55" rx="14" ry="4" fill="#1a0f2e" opacity=".25"/>
    <rect x="52" y="40" width="20" height="14" rx="3" fill="#5b23c9" stroke="#2a1846" stroke-width="1.4"/>
    <path d="M47 38 L50 20 L56 29 L62 14 L68 29 L74 20 L77 38 Z" fill="#f0c400" stroke="#1c1915" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="47" y="35" width="30" height="5" rx="1.5" fill="#ffd23f" stroke="#1c1915" stroke-width="1.4"/>
    <circle cx="50" cy="19" r="2.6" fill="#ff8a3d"/><circle cx="62" cy="13" r="2.8" fill="#e53950"/><circle cx="74" cy="19" r="2.6" fill="#6fb6ff"/>
    <rect x="14" y="52" width="11" height="2.6" rx="1" fill="#8a5a3a"/><rect x="99" y="52" width="11" height="2.6" rx="1" fill="#8a5a3a"/>`)
}

export const ART = {
  quad: quad,
  cafeteria: cafeteria,
  library: library,
  sports_centre: sports,
  smig: () => lecture('#7b3fe4', '\u{1F4BC}'),
  health_sciences: () => lecture('#2f9e8f', '⚕️'),
  science: () => lecture('#3d7be0', '\u{1F52C}'),
  law: () => lecture('#8a3346', '⚖️'),
  engineering: () => lecture('#d0782a', '⚙️'),
  greenway: grocer,
  gate: gate,
  bus_stop: busStation,
}

// "Campus Postcard" (owner's pick, 8 Nov): zones, one place that calls you, quiet
// closed places, a real road edge, and light that follows the clock.
// Display positions (percent of the map box): the Lecture Walk on red-brick paving
// along the top, the Quad lawn in the middle, the Res Village in the south-west,
// Main Road along the bottom.
export const LAYOUT = {
  science: [13, 8], engineering: [37, 7], law: [63, 7], health_sciences: [87, 8],
  smig: [12, 32], library: [50, 22], cafeteria: [87, 32],
  quad: [50, 45],
  sports_centre: [87, 57],
  res_other: [12, 63], res_r: [33, 64], res_j: [54, 63],
  res_k: [12, 78], res_o: [33, 79], res_s: [54, 78],
  greenway: [87, 78],
  off_campus: [12, 91], gate: [37, 91], bus_stop: [65, 92],
}

// Paved paths (viewBox 0-100, stretched): the Lecture Walk, a ring round the Quad,
// branches out to each side, the spine down through the village to the gate.
const PATHS = [
  'M3 16.5 C30 15 70 15 97 16.5',
  'M50 15.5 L50 32.5',
  'M27 45 C27 37 38 32.5 50 32.5 C62 32.5 73 37 73 45 C73 53 62 57.5 50 57.5 C38 57.5 27 53 27 45',
  'M27 43 C21 41 16 38 12 36',
  'M12 36 C10 29 9 23 9 16',
  'M73 43 C79 40 84 37 87 36',
  'M87 36 C90 29 91 23 91 16',
  'M71 51 C77 55 82 58 86 61',
  'M50 57.5 C48 62 45 66 44 71 C42 78 39 85 37 93',
  'M5 71 C20 70 34 71 44 71 C52 71 58 71 64 71.5',
  'M64 71.5 C72 74 80 78 86 81',
  'M86 61 C88 67 88 74 87 81',
  'M37 92.5 C28 92 20 92 13 92',
  'M37 93 C46 93.4 56 93.4 65 93',
]

const TREES = [[3, 26, 't'], [97, 25, 'p'], [29, 26, 't'], [71, 26, 't'], [6, 47, 'p'], [20, 52, 't'], [95, 45, 't'],
  [72, 63, 't'], [96, 69, 'p'], [68, 84, 't'], [97, 89, 'p'], [51, 89, 't'], [23, 86, 't'], [4, 71, 't'], [79, 47, 't']]

// Street lamps: hidden by day, on from golden hour.
const LAMPS = [[27, 37], [73, 37], [27, 53], [73, 53], [47, 63], [41, 83], [22, 70.5], [58, 71], [50, 26], [9, 24], [91, 24], [80, 77], [55, 93]]

function tree(kind) {
  if (kind === 'p') {
    return svg(26, 34, `<ellipse cx="13" cy="32" rx="7" ry="2" fill="#1a0f2e" opacity=".25"/><path d="M12 32 Q11 20 14 10" stroke="#8a5a3a" stroke-width="2.4" fill="none"/>
      <path d="M14 10 Q6 6 1 11 M14 10 Q20 4 25 9 M14 10 Q10 2 4 2 M14 10 Q19 1 23 2 M14 10 Q15 16 21 17 M14 10 Q8 14 5 18" stroke="#3a8f45" stroke-width="3.2" fill="none" stroke-linecap="round"/>`)
  }
  return svg(24, 28, `<ellipse cx="12" cy="26" rx="7" ry="2" fill="#1a0f2e" opacity=".25"/><rect x="10.5" y="16" width="3" height="10" fill="#7a4a2a"/><circle cx="12" cy="12" r="9" fill="#2f7d3a"/><circle cx="9" cy="9" r="3.5" fill="#6cc25a" opacity=".55"/>`)
}

// A minibus taxi: white body, a green stripe, dark windows.
function taxi() {
  return svg(34, 16, `<rect x="1" y="2" width="31" height="10" rx="3" fill="#fbfaf6" stroke="#1c1915" stroke-width="1"/>
    <rect x="1" y="8" width="31" height="1.8" fill="#2f8f5b"/>
    ${[4, 10, 16, 22].map((x) => `<rect x="${x}" y="3.6" width="5" height="3.4" rx=".8" fill="#2a1846"/>`).join('')}
    <rect x="28" y="3.6" width="3" height="4.5" rx=".8" fill="#9fd0ff"/>
    <circle cx="8" cy="12.5" r="2.6" fill="#1c1915"/><circle cx="25" cy="12.5" r="2.6" fill="#1c1915"/>
    <circle cx="31.6" cy="9.6" r="1" fill="#ffe58a"/>`)
}

// Light follows the clock: morning, day, golden hour, night.
export function todOf(run) {
  if (run.phase === 'night') return 'night'
  if (run.phase === 'wake' || run.phase === 'transit') return 'morning'
  if (run.phase === 'leisure' && run.minutes >= 17 * 60 + 30) return 'golden'
  return 'day'
}

export function groundHtml() {
  const paths = PATHS.map((d) => `<path d="${d}"/>`).join('')
  const ns = 'vector-effect="non-scaling-stroke"'
  return `<svg class="g-ground" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="gcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cb04e"/><stop offset=".6" stop-color="#5e9a46"/><stop offset="1" stop-color="#4b843f"/></linearGradient>
      <linearGradient id="gcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d79c72"/><stop offset="1" stop-color="#c7865e"/></linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#gcg)"/>
    <path d="M0 0H100V20.5C72 23 28 23 0 20.5Z" fill="url(#gcb)"/>
    <g stroke="#a9653f" stroke-width="1" ${ns} opacity=".35">${[4, 8, 12, 16].map((y) => `<path d="M0 ${y}H100"/>`).join('')}</g>
    <path d="M0 20.5C28 23 72 23 100 20.5" fill="none" stroke="#8a4a2c" stroke-width="2.5" ${ns} opacity=".55"/>
    <rect x="1.5" y="57" width="68" height="31" rx="5" fill="#8cc866" opacity=".45"/>
    <rect x="1.5" y="57" width="68" height="31" rx="5" fill="none" stroke="#2f7d3a" stroke-width="4" stroke-dasharray=".1 7" stroke-linecap="round" ${ns}/>
    <ellipse cx="50" cy="45" rx="23" ry="12.5" fill="#74c257"/>
    <g class="g-paths-edge" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
    <g class="g-paths" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
    <ellipse class="g-lights" cx="50" cy="45" rx="25.6" ry="14.2" fill="none" stroke-linecap="round" ${ns}/>
    <rect x="33" y="92" width="8" height="2.2" fill="#e8d6ac"/>
    <path d="M0 92.7H33M41 92.7H100" stroke="#2a1846" stroke-width="2.5" stroke-dasharray="1.5 4" ${ns} opacity=".6"/>
    <rect y="94" width="100" height="6" fill="#3f3b4a"/>
    <rect y="94" width="100" height=".6" fill="#e8dcc0"/>
    <path d="M0 97.3H100" stroke="#f0c400" stroke-width="2" stroke-dasharray="10 9" ${ns}/>
  </svg>
  <div class="g-decor" aria-hidden="true">
    ${TREES.map(([x, y, k]) => `<span class="g-tree" style="left:${x}%;top:${y}%">${tree(k)}</span>`).join('')}
    <span class="g-zone" style="left:24%;top:19%">LECTURE WALK</span>
    <span class="g-zone road" style="left:84%;top:96.2%">MAIN ROAD</span>
    ${[1, 2, 3, 4, 5, 6].map((i) => `<span class="g-npc n${i}"></span>`).join('')}
  </div>
  <div class="g-lamps" aria-hidden="true">
    ${LAMPS.map(([x, y]) => `<span class="g-lamp" style="left:${x}%;top:${y}%"><i></i></span>`).join('')}
    <span class="g-taxi">${taxi()}</span><span class="g-taxi back">${taxi()}</span>
  </div>`
}

// The gold quest line from you to the place that calls you. A gentle curve, under the pins.
export function routeSvg(from, to) {
  if (!from || !to) return ''
  const [x1, y1] = from
  const [x2, y2] = to
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const bend = 0.22
  const d = `M${x1} ${y1 - 2} Q${mx - (y2 - y1) * bend} ${my + (x2 - x1) * bend} ${x2} ${y2 + 3}`
  return `<svg class="g-lit" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path class="g-quest-under" d="${d}" fill="none" stroke-linecap="round"/>
    <path class="g-quest" d="${d}" fill="none" stroke-linecap="round"/>
  </svg>`
}

// Text on a house colour: ink on light colours, white on dark ones.
export function inkOn(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16)
  if (Number.isNaN(n)) return '#fff'
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return l > 0.3 ? '#1c1915' : '#fff'
}
