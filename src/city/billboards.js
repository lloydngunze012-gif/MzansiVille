// What each billboard in SunnyBay shows today (City job A). Data: data/campusville/billboards.json
// (brand, line, image, link, start and end date, how many boards). A board with no ad running shows a
// University of Mzansi house ad in that house's colours. Brand ads and house ads alternate along the roads.
import DATA from '../../data/campusville/billboards.json' with { type: 'json' }

const day = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

// (job J) slots: the twelve roadside boards, then DATA.walls side-wall slots. What fills them, in turn: the game's own
// features (DATA.features.lines) and the brand ads running today, mixed along the roads; then the empty brand slots
// (DATA.slots_for_brands); then house ads.
export function adsFor(houses = [], today = new Date()) {
  const road = Math.max(8, Math.min(12, Number(DATA.slots) || 10))
  const walls = Math.max(0, Math.min(16, Number(DATA.walls) || 0))
  const f = DATA.features || {}
  const features = (f.lines || []).map((line, i) => ({ id: `feature-${i + 1}`, brand: f.brand || 'Soft Life', line, bg: f.bg || '#f0c400', fg: f.fg || '#1c1915', feature: true }))
  const empty = (DATA.slots_for_brands || []).map((a) => ({ id: a.id, brand: a.brand || 'Your brand here', line: a.line || '', bg: a.bg || '#ffffff', fg: a.fg || '#1c1915', image: a.image || '', link: a.link || '', empty: true }))
  const paid = brandAds(houses, today, road)
  const out = []
  // the roads: the brand ads where adsOf put them, features on the other boards
  let fi = 0
  for (const a of paid) out.push(a.house ? features[fi++ % Math.max(1, features.length)] || a : a)
  // the walls: the empty brand slots first (they are for sale), then the rest of the features, then houses
  const rest = [...empty, ...features.slice(fi)]
  for (let i = 0; i < walls; i++) out.push(rest[i] || paid.filter((a) => a.house)[i % Math.max(1, paid.filter((a) => a.house).length)] || features[i % Math.max(1, features.length)])
  return out.filter(Boolean)
}
function brandAds(houses, today, slots) {
  const now = day(today)
  const live = (DATA.ads || []).filter((a) => a.brand && (!a.start || a.start <= now) && (!a.end || now <= a.end))
  const brand = []
  // (turn by turn, so one brand's boards are not all in a row)
  for (let i = 0; i < 12; i++) for (const a of live) if (i < Math.max(1, Number(a.boards) || 1)) brand.push({ id: a.id, brand: a.brand, line: (a.lines?.length ? a.lines[i % a.lines.length] : a.line) || '', image: a.image || '', link: a.link || '', bg: a.bg || '#22143b', fg: a.fg || '#ffffff' })
  const house = (i) => {
    const h = houses[i % Math.max(1, houses.length)]
    const said = DATA.house?.lines?.length ? DATA.house.lines[i % DATA.house.lines.length] : DATA.house?.line || 'University of Mzansi'
    if (!h) return { id: 'umzansi', brand: 'UMzansi', line: said, bg: '#22143b', fg: '#f0c400', house: true }
    return { id: `house-${h.id}`, brand: h.name, line: said, bg: h.main, fg: inkOn(h.main, h.accent), house: true }
  }
  // brand ads spread evenly over the boards, a house ad on every board between them
  const out = []
  const n = Math.min(brand.length, slots)
  let b = 0
  let h = 0
  for (let i = 0; i < slots; i++) {
    const due = n && Math.floor(((i + 1) * n) / slots) > Math.floor((i * n) / slots)
    out.push(due ? brand[b++] : house(h++))
  }
  return out
}

// The accent if it reads on the main colour, else white or ink.
function inkOn(bg, accent) {
  const lum = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  if (accent && ratio(bg, accent) >= 3) return accent
  return ratio(bg, '#ffffff') >= ratio(bg, '#1c1915') ? '#ffffff' : '#1c1915'
}
