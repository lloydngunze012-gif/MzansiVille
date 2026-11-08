// Game themes (owner, 8 Nov): the player picks the colour of the game's background panels and
// screens: beige (the original cream), purple, white, pink. All four are light, so every text
// colour in the game (dark ink) keeps reading on them. The colours live in cream.css under
// html[data-theme]; the 3D world and the student card (always white) are not touched.
export const THEMES = [
  { id: 'beige', label: 'Beige', bg: '#f4ecdc' },
  { id: 'purple', label: 'Purple', bg: '#e6dafc' },
  { id: 'white', label: 'White', bg: '#ffffff' },
  { id: 'pink', label: 'Pink', bg: '#ffdcec' },
]
const KEY = 'mzansiville.theme'

export function themeOf() {
  try { const t = localStorage.getItem(KEY); if (THEMES.some((x) => x.id === t)) return t } catch { /* private mode */ }
  return 'beige'
}

export function applyTheme(id = themeOf()) {
  document.documentElement.dataset.theme = id
  const meta = document.querySelector('meta[name="theme-color"]')
  const t = THEMES.find((x) => x.id === id)
  if (meta && t && !document.querySelector('.tc, .en')) meta.setAttribute('content', t.bg)
}

export function themePicker(compact = false) {
  const now = themeOf()
  return `<div class="th-row${compact ? ' th-compact' : ''}" role="group" aria-label="Game colour"><span class="th-lbl">Game colour</span><div class="th-swatches">${THEMES.map((t) =>
    `<button type="button" class="th-sw" data-app-theme="${t.id}" aria-pressed="${now === t.id}" aria-label="${t.label}"><i style="background:${t.bg}"></i><b>${t.label}</b></button>`).join('')}</div></div>`
}

applyTheme()
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-app-theme]')
  if (!b) return
  const id = b.dataset.appTheme
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
  applyTheme(id)
  document.querySelectorAll('[data-app-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.appTheme === id)))
}, true)
