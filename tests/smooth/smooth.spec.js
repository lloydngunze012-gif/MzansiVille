// Smoothness reports (owner, 7 Nov; docs/design/smoothness-reports.md section 6). Any machine.
// S1 ?smooth=test: walk Quad -> Cafeteria, flush: two buckets with the right place ids, every
//    column the right type and range; the Settings switch off gives no rows; a normal run and
//    a test run both make no request to smooth_reports.
// S3 the cost of smooth.frame over 600 counted frames.
// S4 #/smooth with injected rows: the order, the colours, the stall list; screenshots at
//    390x844 and 1440x900 in docs/sprints/smoothness/ (not committed).
// npx playwright test tests/smooth/smooth.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/smoothness'
fs.mkdirSync(OUT, { recursive: true })
test.describe.configure({ timeout: 240000 })

// A new student on day 1 at 13:00 (the same setup as tests/basics/touch.js, without its fps gate:
// these checks count time, not frames, so they hold on a slow machine too).
async function student(page, query = '') {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto(`/?morning=0&spawn=quad${query}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
}
const seconds = (page, place) => page.evaluate((p) => window.mzansiSmooth.buckets.get(`campus|${p}`)?.seconds || 0, place)

test('S1 walk Quad -> Cafeteria: two buckets, every column right; the switch off gives no rows; nothing sent', async ({ page }) => {
  const sent = []
  page.on('request', (r) => { if (/smooth_reports/.test(r.url())) sent.push(r.url()) })
  await student(page, '&smooth=test')
  // At the Quad: the first 3 s are the loading hitch and aren't counted; then play counts.
  await expect.poll(() => seconds(page, 'quad'), { timeout: 60000, intervals: [500] }).toBeGreaterThan(2.2)
  expect(await page.evaluate(() => window.mzansiSmoothPlace())).toBe('quad')
  // Walk to the Cafeteria (the map's "go there", by place id); the sheet opens on arrival.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
  await expect.poll(() => seconds(page, 'cafeteria'), { timeout: 120000, intervals: [500] }).toBeGreaterThan(2.2)
  const rows = await page.evaluate(() => window.mzansiSmoothFlush())
  const all = await page.evaluate(() => window.__smoothReports)
  expect(all.length).toBe(rows.length)
  const byPlace = Object.fromEntries(rows.map((r) => [r.place, r]))
  console.log('S1 places:', rows.map((r) => `${r.scene}/${r.place} ${r.seconds}s ${r.fps_typical}/${r.fps_low} fps`).join(' | '))
  expect(Object.keys(byPlace)).toEqual(expect.arrayContaining(['quad', 'cafeteria']))
  expect(rows.length).toBeLessThanOrEqual(6)
  const isInt = (v) => Number.isInteger(v)
  const intOrNull = (v) => v === null || Number.isInteger(v)
  rows.forEach((r, i) => {
    const where = `${r.scene}/${r.place}`
    expect(typeof r.session, where).toBe('string')
    expect(r.session.length, `${where} session`).toBeGreaterThan(8)
    expect(typeof r.build, where).toBe('string')
    expect(['campus', 'home', 'morning', 'lecture'], where).toContain(r.scene)
    expect(typeof r.place).toBe('string')
    expect(r.seconds, `${where} seconds`).toBeGreaterThanOrEqual(2)
    expect(r.seconds).toBeLessThan(600)
    expect(isInt(r.fps_typical), `${where} fps_typical`).toBe(true)
    expect(isInt(r.fps_low), `${where} fps_low`).toBe(true)
    expect(r.fps_typical).toBeGreaterThanOrEqual(1)
    expect(r.fps_typical).toBeLessThanOrEqual(240)
    expect(r.fps_low, 'worst 10% is no faster than typical').toBeLessThanOrEqual(r.fps_typical)
    expect(typeof r.secs_below_30).toBe('number')
    expect(r.secs_below_20).toBeGreaterThanOrEqual(0)
    expect(r.secs_below_30, 'under 30 includes under 20').toBeGreaterThanOrEqual(r.secs_below_20)
    expect(r.secs_below_30).toBeLessThanOrEqual(r.seconds + 0.5)
    expect(isInt(r.long_frames) && r.long_frames >= 0).toBe(true)
    expect(isInt(r.worst_ms) && r.worst_ms >= 0 && r.worst_ms <= 1000).toBe(true)
    expect(isInt(r.taps) && r.taps >= 0).toBe(true)
    expect(intOrNull(r.tap_ms)).toBe(true)
    if (r.taps === 0) expect(r.tap_ms).toBeNull()
    expect(isInt(r.walks) && r.walks >= 0).toBe(true)
    expect(isInt(r.stalls) && r.stalls >= 0).toBe(true)
    expect(Array.isArray(r.stall_at)).toBe(true)
    expect(r.stall_at.length).toBeLessThanOrEqual(8)
    expect(r.stall_at.length).toBeLessThanOrEqual(r.stalls)
    for (const s of r.stall_at) { expect(['player', 'against', 'npc']).toContain(s.k); expect(typeof s.h).toBe('string'); expect(typeof s.x).toBe('number'); expect(typeof s.z).toBe('number') }
    expect(intOrNull(r.load_ms)).toBe(true)
    expect(typeof r.device).toBe('string')
    expect(r.device.length).toBeGreaterThan(2)
    expect(r.gpu === null || typeof r.gpu === 'string').toBe(true)
    expect(r.mem === null || typeof r.mem === 'number').toBe(true)
    expect(r.cores === null || isInt(r.cores)).toBe(true)
    expect(r.screen).toMatch(/^\d+x\d+@[\d.]+$/)
    expect(r.net === null || typeof r.net === 'string').toBe(true)
    expect(typeof r.installed).toBe('boolean')
    // The load time rides on the session's first row only.
    if (i === 0) expect(r.load_ms, 'load_ms on the first row').toBeGreaterThan(100)
    else expect(r.load_ms).toBeNull()
  })
  // The walk was counted (a place walk starts one; NPCs' walks count too).
  expect(rows.reduce((a, r) => a + r.walks, 0)).toBeGreaterThan(0)
  // The report doesn't carry the player's id: the session is random, and no row names the student.
  expect(JSON.stringify(rows)).not.toMatch(/Thandeka|userId|"user_id"/)
  expect(sent, 'test mode keeps rows in window.__smoothReports; nothing is sent').toEqual([])

  // The switch: Settings has it, on by default; off gives no rows.
  await page.evaluate(() => { location.hash = '#/settings' })
  const toggle = page.locator('[data-act="smooth-switch"]')
  await expect(toggle).toBeVisible()
  await expect(toggle).toContainText('Send smoothness reports')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: `${OUT}/settings-switch.png` })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => localStorage.getItem('mzansiville.smooth'))).toBe('off')
  await page.goto('/?morning=0&spawn=quad&smooth=test&off=1#/play') // (a new query: a real reload, not just a new #)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await page.waitForTimeout(7000) // longer than the 3 s hitch and the 2 s minimum together
  expect(await page.evaluate(() => window.mzansiSmoothFlush())).toEqual([])
  expect(await page.evaluate(() => window.__smoothReports || [])).toEqual([])
  // Back on.
  await page.evaluate(() => localStorage.setItem('mzansiville.smooth', 'on'))
  await page.goto('/?morning=0&spawn=quad&smooth=test&on=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiSmoothFlush())).length, { timeout: 60000, intervals: [1000] }).toBeGreaterThan(0)
  expect(sent).toEqual([])
})

test('S1b a normal run (no ?smooth=test) never calls smooth_reports, and collects nothing', async ({ page }) => {
  const sent = []
  page.on('request', (r) => { if (/smooth_reports/.test(r.url())) sent.push(r.url()) })
  await student(page, '')
  await page.waitForTimeout(8000)
  // Automation, localhost: nothing is collected, nothing sent, the test hooks aren't there.
  expect(await page.evaluate(() => typeof window.mzansiSmoothFlush)).toBe('undefined')
  expect(await page.evaluate(() => (window.__smoothReports || []).length)).toBe(0)
  await page.evaluate(() => { location.hash = '#/settings' })
  await expect(page.locator('[data-act="smooth-switch"]')).toBeVisible()
  expect(sent).toEqual([])
})

// S5 Cursor's words (data/campusville/meta.json "smoothness") reach Settings and Privacy: empty keys
// show nothing (the switch keeps the label it was specified with), filled keys show up.
test('S5 Settings and Privacy show the smoothness words from meta.json, and nothing when they are empty', async ({ page }) => {
  const words = JSON.parse(fs.readFileSync('data/campusville/meta.json', 'utf8')).smoothness
  expect(Object.keys(words).sort(), 'the three keys are there').toEqual(['privacyLine', 'settingHelp', 'settingLabel'])
  await page.goto('/#/settings')
  const toggle = page.locator('[data-act="smooth-switch"]')
  await expect(toggle).toBeVisible()
  await expect(toggle).toContainText(words.settingLabel || 'Send smoothness reports')
  await expect(page.locator('[data-smooth-help]')).toHaveCount(words.settingHelp ? 1 : 0)
  if (words.settingHelp) await expect(page.locator('[data-smooth-help]')).toHaveText(words.settingHelp)
  await page.goto('/#/privacy')
  const items = page.locator('main[data-screen="privacy"] li span')
  await expect(items.first()).toBeVisible()
  const texts = await items.allTextContents()
  expect(texts.every((t) => t.trim().length > 0), 'no empty line on the Privacy screen').toBe(true)
  if (words.privacyLine) expect(texts).toContain(words.privacyLine)
  else expect(texts.length, 'the three lines and "full text to follow"').toBe(4)
  await page.screenshot({ path: `${OUT}/privacy.png` })
})

test('S3 the cost of smooth.frame over 600 counted frames is under 0.05 ms', async ({ page }) => {
  await page.goto('/?smooth=test#/')
  await page.waitForFunction(() => window.mzansiSmooth)
  const cost = await page.evaluate(() => {
    const smooth = window.mzansiSmooth
    const place = () => 'quad'
    // 180 frames of the 3 s hitch (not counted), then 600 that are; a frame every 16.7 ms.
    let now = performance.now() + 1e6
    smooth.frame(now, 'campus', place) // the first frame of the scene
    const run = (n, ms) => {
      const t0 = performance.now()
      for (let i = 0; i < n; i++) { now += ms; smooth.frame(now, 'campus', place) }
      return (performance.now() - t0) / n
    }
    const warm = run(180, 16.7)
    const counted = run(600, 16.7)
    // And the same with a few slow frames in it, so the long-frame and window paths run.
    const mixed = (() => { const t0 = performance.now(); for (let i = 0; i < 600; i++) { now += i % 40 === 0 ? 80 : 16.7; smooth.frame(now, 'campus', place) } return (performance.now() - t0) / 600 })()
    const b = smooth.buckets.get('campus|quad')
    return { warm, counted, mixed, seconds: b.seconds, frames: b.hist.reduce((a, c) => a + c, 0) }
  })
  console.log('S3 per-frame cost (ms):', JSON.stringify({ warm: +cost.warm.toFixed(5), counted: +cost.counted.toFixed(5), mixed: +cost.mixed.toFixed(5) }))
  test.info().annotations.push({ type: 'cost', description: `${cost.counted.toFixed(5)} ms counted, ${cost.mixed.toFixed(5)} ms mixed` })
  expect(cost.frames, 'the counted frames were counted').toBeGreaterThanOrEqual(1190)
  expect(cost.counted).toBeLessThan(0.05)
  expect(cost.mixed).toBeLessThan(0.05)
  expect(cost.warm).toBeLessThan(0.05)
})

// ---- S4 ---------------------------------------------------------------------------------------
const NOW = Date.now()
const row = (place, session, typical, low, below20, extra = {}) => ({
  id: Math.random(), created_at: new Date(NOW - 3600e3).toISOString(), session, build: 'test', scene: 'campus', place, seconds: 60,
  fps_typical: typical, fps_low: low, secs_below_30: below20, secs_below_20: below20, long_frames: 6, worst_ms: 120, taps: 3, tap_ms: 70, walks: 5, stalls: 0,
  stall_at: [], load_ms: 3000, device: 'SM-A135F Android 14', gpu: 'Mali-G52', mem: 4, cores: 8, screen: '412x915@2.6', net: '4g', installed: false, ...extra,
})
const stall = (i, k = 'npc') => ({ k, h: `walk ${(1.5 + i / 10).toFixed(1)} m short`, x: i, z: -i })
const ROWS = [
  row('quad', 's1', 58, 40, 1), row('quad', 's2', 60, 44, 1),
  row('cafeteria', 's1', 50, 18, 2, { gpu: 'Adreno 610', device: 'Redmi 9A Android 11', stall_at: Array.from({ length: 8 }, (_, i) => stall(i)), stalls: 8, net: '3g', load_ms: 9000 }),
  row('cafeteria', 's3', 52, 19, 3, { gpu: 'Adreno 610', stall_at: Array.from({ length: 8 }, (_, i) => stall(i + 20, 'player')), stalls: 8, created_at: new Date(NOW - 1800e3).toISOString() }),
  row('cafeteria', 's4', 49, 17, 1, { gpu: 'Adreno 610', stall_at: Array.from({ length: 8 }, (_, i) => stall(i + 40, 'against')), stalls: 8, created_at: new Date(NOW - 900e3).toISOString() }),
  row('library', 's1', 28, 24, 1, { gpu: 'Adreno 610' }),
  row('greenway', 's2', 45, 30, 4), // 6.7% of the time under 20 fps: red
  row('gate', 's2', 40, 30, 3), // exactly 5%: not red
  row('paths', 's1', 59, 45, 0, { scene: 'campus' }),
  row('morning', 's1', 35, 25, 0, { scene: 'morning' }), // typical 35: fine
  row('lecture', 's5', 61, 48, 0, { scene: 'lecture', load_ms: null, net: null }),
]
for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`S4 #/smooth at ${w}x${h}: worst first, red and amber, the stall list`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.addInitScript((rows) => { window.__smoothRows = rows }, ROWS)
    await page.goto('/?smooth=test#/smooth')
    await expect(page.locator('main[data-screen="smooth"]')).toBeVisible()
    // Range buttons: 7 days is the default.
    await expect(page.locator('[data-act="smooth-range"][data-v="7d"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-act="smooth-range"][data-v="24h"]')).toHaveAttribute('aria-pressed', 'false')
    // Places: red first (lowest worst-10% first), then amber, then the rest.
    const places = page.locator('table[data-table="places"] tbody tr')
    const order = await places.evaluateAll((trs) => trs.map((tr) => `${tr.dataset.key}:${tr.dataset.status}`))
    console.log('S4 places:', order.join(' '))
    expect(order).toEqual(['cafeteria:red', 'greenway:red', 'library:amber', 'morning:ok', 'gate:ok', 'quad:ok', 'paths:ok', 'lecture:ok'])
    const cafe = places.nth(0)
    await expect(cafe).toContainText('cafeteria')
    const cells = await cafe.locator('th, td').allTextContents()
    expect(cells[1], 'players: 3 sessions').toBe('3')
    expect(cells[2], 'minutes').toBe('3')
    expect(cells[3], 'typical fps (median of 50, 52, 49)').toBe('50')
    expect(cells[4], 'worst 10% fps (median of 18, 19, 17)').toBe('18')
    // Colours: red and amber rows are tinted, ok rows aren't, and they differ.
    const bg = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const red = await bg('table[data-table="places"] tr[data-status="red"]')
    const amber = await bg('table[data-table="places"] tr[data-status="amber"]')
    const ok = await bg('table[data-table="places"] tr[data-status="ok"]')
    console.log('S4 colours:', JSON.stringify({ red, amber, ok }))
    expect(new Set([red, amber, ok]).size, 'three different colours').toBe(3)
    // Devices: by gpu, with the device as the fallback; the worst gpu first.
    const devices = await page.locator('table[data-table="devices"] tbody tr').evaluateAll((trs) => trs.map((tr) => `${tr.querySelector('th').textContent}:${tr.dataset.status}`))
    expect(devices[0]).toBe('Adreno 610:red')
    expect(devices.length).toBeGreaterThanOrEqual(2)
    // The load line: median and slowest 10%, split by connection.
    await expect(page.locator('[data-load]')).toContainText('median')
    await expect(page.locator('.sm-net')).toContainText('3g')
    await expect(page.locator('.sm-net')).toContainText('4g')
    // No sideways scroll on the page itself (the tables scroll inside their boxes).
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(wide, 'the page never scrolls sideways').toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${OUT}/smooth-${w}x${h}.png`, fullPage: true })
    // Tap a place: its last 20 stalls, newest first (24 stalls were sent for the cafeteria: 20 shown).
    await cafe.click()
    const stalls = page.locator('[data-stalls="cafeteria"] tbody tr')
    await expect(stalls).toHaveCount(20)
    const kinds = await stalls.evaluateAll((trs) => trs.map((tr) => tr.children[0].textContent))
    expect(kinds.slice(0, 8), 'the newest report first (against), then player, then npc').toEqual(Array(8).fill('against'))
    expect(kinds.slice(8, 16)).toEqual(Array(8).fill('player'))
    expect(kinds.slice(16)).toEqual(Array(4).fill('npc'))
    const first = await stalls.first().locator('td').allTextContents()
    expect(first[1]).toMatch(/m short/)
    expect(first[5], 'the device').toBeTruthy()
    await page.screenshot({ path: `${OUT}/smooth-stalls-${w}x${h}.png`, fullPage: true })
    // Tap it again: closed.
    await cafe.click()
    await expect(page.locator('[data-stalls]')).toHaveCount(0)
  })
}

test('S4b a visitor who is not an admin sees nothing', async ({ page }) => {
  await page.goto('/#/smooth')
  await expect(page.locator('main[data-screen="smooth"]')).toContainText('Admins only')
  await expect(page.locator('table')).toHaveCount(0)
})
