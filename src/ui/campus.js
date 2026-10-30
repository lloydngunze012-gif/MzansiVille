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
    <circle cx="32" cy="16" r="5" fill="#ffd23f"/><text x="32" y="19" font-size="7" text-anchor="middle">${glyph}</text>`)
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

function residence(letter, tint = '#d9774a') {
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

function blocks() {
  return svg(60, 54, `${SHADOW}
    <rect x="4" y="18" width="22" height="32" rx="2" fill="#c96a44"/><rect x="30" y="12" width="24" height="38" rx="2" fill="#d9774a"/>
    ${[8, 16].map((x) => [24, 33, 42].map((y) => `<rect x="${x}" y="${y}" width="4" height="5" fill="#ffcf6b"/>`).join('')).join('')}
    ${[34, 42].map((x) => [18, 27, 36].map((y) => `<rect x="${x}" y="${y}" width="5" height="5" fill="#ffcf6b" opacity=".8"/>`).join('')).join('')}
    <circle cx="50" cy="44" r="7" fill="#2a1846" stroke="#ffd23f" stroke-width="1.3"/><text x="50" y="47.5" font-size="10" font-weight="900" text-anchor="middle" fill="#ffd23f">+</text>`)
}

function house() {
  return svg(56, 50, `${SHADOW}
    <rect x="10" y="22" width="34" height="24" fill="#f3d9b1"/>
    <polygon points="6,24 27,8 48,24" fill="#b2462e"/>
    <rect x="15" y="28" width="8" height="7" fill="#ffcf6b"/><rect x="30" y="31" width="8" height="15" fill="#2a1846"/>
    <rect x="44" y="30" width="2" height="16" fill="#5b4a3a"/><rect x="40" y="26" width="12" height="7" rx="2" fill="#ffd23f"/>
    <text x="46" y="31.5" font-size="5" text-anchor="middle" font-weight="900" fill="#2a1846">BUS</text>`)
}

function busStation() {
  return svg(76, 52, `${SHADOW}
    <rect x="4" y="12" width="30" height="4" rx="1.5" fill="#5b23c9"/>
    <rect x="7" y="16" width="2.5" height="28" fill="#2a1846"/><rect x="28" y="16" width="2.5" height="28" fill="#2a1846"/>
    <rect x="9" y="17" width="19" height="16" fill="#bfe6ff" opacity=".35"/>
    <rect x="10" y="36" width="17" height="3" rx="1" fill="#8a5a3a"/>
    <rect x="36" y="20" width="36" height="22" rx="4" fill="#ffb43d"/>
    <rect x="36" y="34" width="36" height="4" fill="#e0782a"/>
    ${[39, 48, 57].map((x) => `<rect x="${x}" y="23" width="7" height="8" rx="1" fill="#2a1846" opacity=".8"/>`).join('')}
    <rect x="65" y="23" width="5" height="13" rx="1" fill="#2a1846" opacity=".8"/>
    <circle cx="44" cy="43" r="4" fill="#1a0f2e"/><circle cx="64" cy="43" r="4" fill="#1a0f2e"/>
    <circle cx="44" cy="43" r="1.6" fill="#ccc"/><circle cx="64" cy="43" r="1.6" fill="#ccc"/>`)
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

function quad() {
  const bench = (x, y) => `<rect x="${x}" y="${y}" width="11" height="2.6" rx="1" fill="#8a5a3a"/><rect x="${x + 1}" y="${y + 2.6}" width="1.4" height="2.4" fill="#5b3a22"/><rect x="${x + 8.6}" y="${y + 2.6}" width="1.4" height="2.4" fill="#5b3a22"/>`
  return svg(124, 76, `
    <ellipse cx="62" cy="40" rx="60" ry="33" fill="#5fae4f"/>
    <ellipse cx="62" cy="40" rx="60" ry="33" fill="none" stroke="#f6e7c8" stroke-width="3"/>
    <ellipse cx="62" cy="42" rx="22" ry="11" fill="#e8d2a4"/>
    <ellipse cx="62" cy="56" rx="13" ry="3" fill="#1a0f2e" opacity=".22"/>
    <rect x="59" y="34" width="6" height="22" rx="2" fill="#7a4a2a"/>
    <circle cx="62" cy="26" r="15" fill="#2f7d3a"/><circle cx="52" cy="31" r="9" fill="#3a8f45"/><circle cx="73" cy="30" r="10" fill="#3a8f45"/>
    <circle cx="57" cy="22" r="5" fill="#6cc25a" opacity=".7"/>
    ${bench(18, 40)}${bench(95, 40)}${bench(38, 60)}${bench(76, 60)}
    <circle cx="26" cy="54" r="2.2" fill="#ffd23f"/><circle cx="31" cy="55" r="2.2" fill="#d77bff"/><circle cx="96" cy="54" r="2.2" fill="#6fb6ff"/>`)
}

export const ART = {
  quad: quad,
  cafeteria: cafeteria,
  library: library,
  sports_centre: sports,
  smig: () => lecture('#7b3fe4', '\u{1F4BC}'),
  health_sciences: () => lecture('#2f9e8f', '\u2695\uFE0F'),
  science: () => lecture('#3d7be0', '\u{1F52C}'),
  law: () => lecture('#8a3346', '\u2696\uFE0F'),
  engineering: () => lecture('#d0782a', '\u2699\uFE0F'),
  res_o: () => residence('O'),
  res_r: () => residence('R', '#c9704a'),
  res_s: () => residence('S', '#e08a55'),
  res_other: blocks,
  off_campus: house,
  bus_station: busStation,
  gate: gate,
}

// Display positions (percent of the map box), following the brief: Quad in
// the centre, cafeteria beside it, sports east, lecture venues around, res
// south-west, bus station and gate south.
export const LAYOUT = {
  science: [27, 10], law: [70, 10],
  engineering: [13, 26], library: [42, 25], sports_centre: [80, 27],
  smig: [17, 41], quad: [47, 45], cafeteria: [79, 43],
  health_sciences: [80, 59], res_other: [13.5, 57],
  res_r: [43, 66], res_o: [15, 75], res_s: [31, 90],
  bus_station: [65, 75], gate: [57, 93], off_campus: [83, 88],
}

// Curved paved paths (viewBox 0-100, stretched). Hand-placed to avoid the
// spoke look: a ring round the Quad, a spine to the gate, branches that bend.
const PATHS = [
  'M57 97 C56 84 48 70 47 55',
  'M47 55 C60 62 64 68 65 78',
  'M33 45 C33 36 40 31 47 31 C56 31 62 37 62 45 C62 54 55 58 47 58 C39 58 33 53 33 45',
  'M33 45 C26 44 20 45 15 47',
  'M40 33 C36 26 33 20 31 15',
  'M55 32 C60 24 66 18 70 14',
  'M43 31 C40 28 30 28 13 30',
  'M62 42 C68 41 73 42 79 46',
  'M60 38 C66 34 72 32 80 31',
  'M60 52 C68 56 74 60 80 62',
  'M44 57 C44 61 43 64 43 68',
  'M43 68 C34 71 24 75 15 78 M43 68 C39 77 34 84 31 92',
  'M15 78 C14 72 13 68 13 63',
  'M65 78 C72 84 79 88 86 92',
]

const TREES = [[6, 8, 'p'], [93, 6, 'p'], [52, 7, 't'], [24, 33, 't'], [93, 46, 'p'], [60, 63, 't'], [4, 44, 'p'],
  [95, 72, 'p'], [46, 76, 't'], [6, 88, 'p'], [72, 95, 't'], [57, 18, 't'], [90, 16, 't'], [22, 58, 't']]

function tree(kind) {
  if (kind === 'p') {
    return svg(26, 34, `<ellipse cx="13" cy="32" rx="7" ry="2" fill="#1a0f2e" opacity=".25"/><path d="M12 32 Q11 20 14 10" stroke="#8a5a3a" stroke-width="2.4" fill="none"/>
      <path d="M14 10 Q6 6 1 11 M14 10 Q20 4 25 9 M14 10 Q10 2 4 2 M14 10 Q19 1 23 2 M14 10 Q15 16 21 17 M14 10 Q8 14 5 18" stroke="#3a8f45" stroke-width="3.2" fill="none" stroke-linecap="round"/>`)
  }
  return svg(24, 28, `<ellipse cx="12" cy="26" rx="7" ry="2" fill="#1a0f2e" opacity=".25"/><rect x="10.5" y="16" width="3" height="10" fill="#7a4a2a"/><circle cx="12" cy="12" r="9" fill="#2f7d3a"/><circle cx="9" cy="9" r="3.5" fill="#6cc25a" opacity=".55"/>`)
}

export function groundHtml() {
  const paths = PATHS.map((d) => `<path d="${d}"/>`).join('')
  return `<svg class="g-ground" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8aa64a"/><stop offset=".55" stop-color="#5e9445"/><stop offset="1" stop-color="#3f6e3c"/></linearGradient>
      <radialGradient id="gs" cx="88%" cy="0%" r="70%"><stop offset="0" stop-color="#ffb35c" stop-opacity=".75"/><stop offset=".5" stop-color="#ff8a3d" stop-opacity=".22"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
      <radialGradient id="gv" cx="50%" cy="48%" r="75%"><stop offset=".6" stop-color="#2a1846" stop-opacity="0"/><stop offset="1" stop-color="#2a1846" stop-opacity=".75"/></radialGradient>
    </defs>
    <rect width="100" height="100" fill="url(#gg)"/>
    <g fill="#79a84f" opacity=".5"><ellipse cx="20" cy="18" rx="14" ry="6"/><ellipse cx="78" cy="70" rx="16" ry="7"/><ellipse cx="25" cy="92" rx="18" ry="5"/></g>
    <g class="g-paths-edge" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
    <g class="g-paths" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
    <rect width="100" height="100" fill="url(#gs)"/>
    <rect width="100" height="100" fill="url(#gv)"/>
  </svg>
  <div class="g-decor" aria-hidden="true">
    ${TREES.map(([x, y, k]) => `<span class="g-tree" style="left:${x}%;top:${y}%">${tree(k)}</span>`).join('')}
    <span class="g-cloud c1"></span><span class="g-cloud c2"></span><span class="g-sun"></span>
    ${[1, 2, 3, 4, 5, 6].map((i) => `<span class="g-npc n${i}"></span>`).join('')}
  </div>`
}
