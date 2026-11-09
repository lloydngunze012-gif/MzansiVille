// "Where you're from" (owner, 7 Nov): the nine provinces, then Elsewhere in Africa, then Overseas.
// Saves from before keep their old answer (a city); it shows as its province, and the day-1 home
// style still finds it in data/campusville/homes.json.
// Countries (owner, 8 Nov): Elsewhere in Africa and Overseas each open a list of countries; the
// country is the answer that's saved and shown (with its flag on the student card). The day-1 home
// style looks up the country's region.
import COUNTRY_DATA from '../data/campusville/countries.json'
export const FROM = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape', 'Elsewhere in Africa', 'Overseas']
// The old answers, and the province each is in.
export const FROM_WAS = { Durban: 'KwaZulu-Natal', Joburg: 'Gauteng', Soweto: 'Gauteng', Pretoria: 'Gauteng', 'Cape Town': 'Western Cape' }
export const PROVINCES = FROM.slice(0, 9)

// Flags, drawn (Windows shows flag emoji as two letters). Simplified so they read at 21x14 px.
// viewBox 30 x 20 for all.
const star = (cx, cy, r, fill) => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const d = i % 2 ? r * 0.4 : r
    pts.push(`${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`
}
const h = (...c) => c.map((col, i) => `<rect y="${(20 / c.length) * i}" width="30" height="${20 / c.length + 0.05}" fill="${col}"/>`).join('')
const v = (...c) => c.map((col, i) => `<rect x="${(30 / c.length) * i}" width="${30 / c.length + 0.05}" height="20" fill="${col}"/>`).join('')
const UNION = '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.4"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.4"/>'
const ART = {
  'South Africa': '<rect width="30" height="10" fill="#e03c31"/><rect y="10" width="30" height="10" fill="#001489"/><path d="M0 0L15 10H30M0 20L15 10" stroke="#fff" stroke-width="6.7" fill="none"/><path d="M0 0L15 10H30M0 20L15 10" stroke="#007749" stroke-width="4" fill="none"/><path d="M0 3L10.5 10L0 17Z" fill="#ffb81c"/><path d="M0 4.75L8 10L0 15.25Z" fill="#000"/>',
  Zimbabwe: `${h('#319208', '#ffd200', '#de2010', '#000', '#de2010', '#ffd200', '#319208')}<path d="M0 0L11 10L0 20Z" fill="#fff" stroke="#000" stroke-width=".6"/>${star(4.2, 10, 2.6, '#de2010')}`,
  Nigeria: v('#008751', '#fff', '#008751'),
  Kenya: `<rect width="30" height="20" fill="#fff"/><rect width="30" height="6" fill="#000"/><rect y="7" width="30" height="6" fill="#bb0000"/><rect y="14" width="30" height="6" fill="#006600"/><ellipse cx="15" cy="10" rx="3" ry="6" fill="#bb0000" stroke="#000" stroke-width=".8"/><path d="M15 4.5V15.5" stroke="#fff" stroke-width=".5"/>`,
  Ghana: `${h('#ce1126', '#fcd116', '#006b3f')}${star(15, 10, 3.2, '#000')}`,
  Botswana: '<rect width="30" height="20" fill="#75aadb"/><rect y="7.5" width="30" height="5" fill="#fff"/><rect y="8.5" width="30" height="3" fill="#000"/>',
  Lesotho: `${h('#00209f', '#fff', '#009543')}<path d="M12.5 11.5L15 7L17.5 11.5Z" fill="#000"/><rect x="11.5" y="11.2" width="7" height="1" rx=".5" fill="#000"/>`,
  Eswatini: '<rect width="30" height="20" fill="#3e5eb9"/><rect y="4" width="30" height="12" fill="#ffd900"/><rect y="5.2" width="30" height="9.6" fill="#b10c0c"/><ellipse cx="15" cy="10" rx="5.5" ry="3.2" fill="#fff"/><path d="M15 6.8A5.5 3.2 0 0 1 15 13.2Z" fill="#000"/>',
  Namibia: '<rect width="30" height="20" fill="#009543"/><path d="M0 0H30L0 20Z" fill="#003580"/><path d="M0 20L30 0" stroke="#fff" stroke-width="8"/><path d="M0 20L30 0" stroke="#d21034" stroke-width="5.6"/><circle cx="6" cy="5" r="2.6" fill="#ffce00"/>',
  Mozambique: `${h('#009739', '#000', '#fcd116')}<path d="M0 6.4H30M0 13.6H30" stroke="#fff" stroke-width="1"/><path d="M0 0L12 10L0 20Z" fill="#d21034"/>${star(4.5, 10, 2.8, '#fcd116')}`,
  Malawi: `${h('#000', '#ce1126', '#339e35')}<path d="M10 6.6a5 5 0 0 1 10 0Z" fill="#ce1126"/>`,
  Zambia: '<rect width="30" height="20" fill="#198a00"/><rect x="18" y="8" width="4" height="12" fill="#de2010"/><rect x="22" y="8" width="4" height="12" fill="#000"/><rect x="26" y="8" width="4" height="12" fill="#ef7d00"/><path d="M21 5Q24 2.5 27 5Q24 4 21 5Z" fill="#ef7d00"/>',
  'DR Congo': `<rect width="30" height="20" fill="#007fff"/><path d="M0 20L30 0" stroke="#f7d618" stroke-width="7"/><path d="M0 20L30 0" stroke="#ce1021" stroke-width="4.6"/>${star(5.5, 5, 3.2, '#f7d618')}`,
  Uganda: `${h('#000', '#fcdc04', '#d90000', '#000', '#fcdc04', '#d90000')}<circle cx="15" cy="10" r="4" fill="#fff"/>`,
  Tanzania: '<rect width="30" height="20" fill="#1eb53a"/><path d="M30 0V20H0Z" fill="#00a3dd"/><path d="M0 20L30 0" stroke="#fcd116" stroke-width="7.4"/><path d="M0 20L30 0" stroke="#000" stroke-width="5"/>',
  Cameroon: `${v('#007a5e', '#ce1126', '#fcd116')}${star(15, 10, 3.2, '#fcd116')}`,
  Ethiopia: `${h('#078930', '#fcdd09', '#da121a')}<circle cx="15" cy="10" r="4.4" fill="#0f47af"/>${star(15, 10, 3, '#fcdd09')}`,
  Angola: '<rect width="30" height="10" fill="#cc092f"/><rect y="10" width="30" height="10" fill="#000"/><path d="M12 13.5a4 4 0 1 1 6 -6" stroke="#ffcb00" stroke-width="1.4" fill="none"/>',
  Egypt: `${h('#ce1126', '#fff', '#000')}<path d="M14 8H16L16.6 11.6H13.4Z" fill="#c09300"/>`,
  'United Kingdom': UNION,
  'United States': `${h('#b22234', '#fff', '#b22234', '#fff', '#b22234', '#fff', '#b22234', '#fff', '#b22234', '#fff', '#b22234', '#fff', '#b22234')}<rect width="13" height="10.8" fill="#3c3b6e"/>${[[2.2, 2], [5.4, 2], [8.6, 2], [11, 2], [3.8, 4.4], [7, 4.4], [10.2, 4.4], [2.2, 6.8], [5.4, 6.8], [8.6, 6.8], [11, 6.8], [3.8, 9], [7, 9], [10.2, 9]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".55" fill="#fff"/>`).join('')}`,
  India: `${h('#ff9933', '#fff', '#138808')}<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".7"/><circle cx="15" cy="10" r=".6" fill="#000080"/>`,
  China: `<rect width="30" height="20" fill="#de2910"/>${star(5, 5, 3, '#ffde00')}${star(10, 2, 1, '#ffde00')}${star(12, 4, 1, '#ffde00')}${star(12, 7, 1, '#ffde00')}${star(10, 9, 1, '#ffde00')}`,
  Germany: h('#000', '#dd0000', '#ffce00'),
  Netherlands: h('#ae1c28', '#fff', '#21468b'),
  France: v('#002395', '#fff', '#ed2939'),
  Portugal: '<rect width="12" height="20" fill="#006600"/><rect x="12" width="18" height="20" fill="#ff0000"/><circle cx="12" cy="10" r="4" fill="#ffcc00"/><circle cx="12" cy="10" r="2.6" fill="#ff0000" stroke="#fff" stroke-width=".6"/>',
  Brazil: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2L27.5 10L15 17.8L2.5 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/><path d="M11 9.2Q15 8 19 10.6" stroke="#fff" stroke-width=".7" fill="none"/>',
  Australia: `<rect width="30" height="20" fill="#012169"/><g transform="scale(.5)">${UNION}</g>${star(7.5, 15.5, 2.4, '#fff')}${star(23, 4, 1.1, '#fff')}${star(20, 9, 1.1, '#fff')}${star(26, 8, 1.1, '#fff')}${star(23, 16, 1.2, '#fff')}`,
  Canada: '<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#d80621"/><rect x="22.5" width="7.5" height="20" fill="#d80621"/><path d="M15 4L16.2 7L18.5 6.2L17.8 9.6L20 9.2L18.8 11.6L19.6 12.4L15.4 13.4V16H14.6V13.4L10.4 12.4L11.2 11.6L10 9.2L12.2 9.6L11.5 6.2L13.8 7Z" fill="#d80621"/>',
}
export const COUNTRIES = {
  'Elsewhere in Africa': ['Zimbabwe', 'Nigeria', 'Kenya', 'Ghana', 'Botswana', 'Lesotho', 'Eswatini', 'Namibia', 'Mozambique', 'Malawi', 'Zambia', 'DR Congo', 'Uganda', 'Tanzania', 'Cameroon', 'Ethiopia', 'Angola', 'Egypt'],
  Overseas: ['United Kingdom', 'United States', 'India', 'China', 'Germany', 'Netherlands', 'France', 'Portugal', 'Brazil', 'Australia', 'Canada'],
}

// The three pickers on the who step (owner, 8 Nov: "South Africa, Rest of Africa and World, all with
// drop downs"): South Africa lists the provinces; the other two their countries, then "somewhere
// else" (saved as the old region answer, which homes.json knows).
export const FROM_GROUPS = [
  { id: 'za', label: 'South Africa', places: PROVINCES },
  { id: 'africa', label: 'Rest of Africa', places: [...COUNTRIES['Elsewhere in Africa'], 'Elsewhere in Africa'] },
  { id: 'world', label: 'World', places: [...COUNTRIES.Overseas, 'Overseas'] },
]
// The words for an answer in a picker ("Elsewhere in Africa" reads oddly in a list of countries).
export const fromLabel = (place) => (place === 'Elsewhere in Africa' ? 'Somewhere else in Africa' : place === 'Overseas' ? 'Somewhere else' : place)
// Which picker holds an answer ('' for none).
export function groupOf(from) {
  const place = fromPlace(from)
  return FROM_GROUPS.find((g) => g.places.includes(place))?.id || ''
}

// What to show (and keep pressed) for a saved answer.
export function fromPlace(from) {
  return FROM_WAS[from] || from || ''
}

// The region a country is in ('' for a province or a region itself).
export function regionOf(place) {
  return Object.keys(COUNTRIES).find((r) => COUNTRIES[r].includes(place)) || ''
}

// The flag for an answer: South Africa's for a province, the country's own, a globe otherwise.
export function flagOf(from) {
  const place = fromPlace(from)
  if (!place) return ''
  const art = PROVINCES.includes(place) ? ART['South Africa'] : ART[place]
  if (art) return `<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">${art}</svg>`
  return `<i class="flag-globe" aria-hidden="true">${place === 'Overseas' ? '🌐' : '🌍'}</i>`
}

// The answer to look up in homes.json's "from": the answer itself, else (a province that file
// doesn't name yet) the first old city in that province that it does name; a country: its region.
export function fromKey(from, table = {}) {
  if (!from || table[from]) return from
  const region = regionOf(from)
  if (region) return table[region] ? region : from
  const city = Object.keys(FROM_WAS).find((c) => FROM_WAS[c] === from && table[c])
  return city || from
}

// ---- Home country (owner, 9 Nov): the "Where are you from?" step of enrolment ----
// character.country is one of the ids in data/campusville/countries.json (South Africa by default).
// It rides on the player's card and name tag as a small drawn flag; the roommate welcomes a player
// from abroad on day 1. `from` (province or country) stays the home-style answer: a country other than
// South Africa also sets it, so the day-1 home follows the region (fromKey above).
export const DEFAULT_COUNTRY = COUNTRY_DATA.default
export const COUNTRY_LIST = COUNTRY_DATA.countries.map((c) => c.id)
const countryRow = (id) => COUNTRY_DATA.countries.find((c) => c.id === id) || null

// The country of a character (an old save has none: South Africa).
export const countryOf = (character) => (countryRow(character?.country) ? character.country : DEFAULT_COUNTRY)
// Has this save been asked? (an old save has no country; it sees the step once)
export const hasCountry = (character) => Boolean(countryRow(character?.country))

// The country dropdown (owner, 9 Nov): African countries first, then the rest of the world. Each option
// shows its flag emoji (a Windows PC shows the two letters instead; the drawn flags stay on cards and tags).
export const COUNTRY_GROUPS = [
  { id: 'africa', label: 'Africa', countries: COUNTRY_DATA.countries.filter((c) => c.region === 'africa') },
  { id: 'world', label: 'Rest of the world', countries: COUNTRY_DATA.countries.filter((c) => c.region !== 'africa') },
]
export const countryEmoji = (country) => { const iso = countryRow(country)?.iso; return iso ? String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '' }

// The drawn flag for a country id (a globe where none is drawn).
export function countryFlag(country) {
  const row = countryRow(country)
  return row ? flagOf(row.flag) : ''
}

// One welcome line from the roommate for a player who is not from South Africa ('' for South Africa).
export function countryWelcome(country) {
  return countryRow(country)?.welcome || ''
}

// What `from` becomes when a country is picked: a country is its own answer; South Africa keeps
// the province (cleared if it was a foreign country); Other is the world (the globe).
export function fromForCountry(country, from = '') {
  if (country === 'South Africa') return PROVINCES.includes(fromPlace(from)) ? from : ''
  if (country === 'Other') return 'Overseas'
  return country
}

// A country's flag as a picture the 3D name tags can draw (a data URL of the same drawn SVG).
export function flagSrc(country) {
  const row = countryRow(country)
  if (!row) return ''
  const html = flagOf(row.flag)
  if (!html.startsWith('<svg')) return '' // (the globe is a character, not a drawing: the tag draws it as text)
  const svg = html.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="60" ')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
export const isGlobe = (country) => Boolean(countryRow(country)) && countryRow(country).flag === 'Overseas'
