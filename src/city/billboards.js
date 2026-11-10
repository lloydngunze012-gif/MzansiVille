// What each billboard in SunnyBay shows today (City job A). Data: data/campusville/billboards.json
// (brand, line, image, link, start and end date, how many boards). A board with no ad running shows a
// University of Mzansi house ad in that house's colours. Brand ads and house ads alternate along the roads.
import DATA from '../../data/campusville/billboards.json' with { type: 'json' }

const day = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

export function adsFor(houses = [], today = new Date()) {
  const now = day(today)
  const slots = Math.max(8, Math.min(12, Number(DATA.slots) || 10))
  const live = (DATA.ads || []).filter((a) => a.brand && (!a.start || a.start <= now) && (!a.end || now <= a.end))
  const brand = []
  // (turn by turn, so one brand's boards are not all in a row)
  for (let i = 0; i < 12; i++) for (const a of live) if (i < Math.max(1, Number(a.boards) || 1)) brand.push({ id: a.id, brand: a.brand, line: a.line || '', image: a.image || '', link: a.link || '', bg: a.bg || '#22143b', fg: a.fg || '#ffffff' })
  const house = (i) => {
    const h = houses[i % Math.max(1, houses.length)]
    if (!h) return { id: 'umzansi', brand: 'UMzansi', line: DATA.house?.line || 'University of Mzansi', bg: '#22143b', fg: '#f0c400', house: true }
    return { id: `house-${h.id}`, brand: h.name, line: DATA.house?.line || 'University of Mzansi', bg: h.main, fg: inkOn(h.main, h.accent), house: true }
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
