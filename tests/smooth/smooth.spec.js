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
const anySeconds = (page) => page.evaluate(() => [...window.mzansiSmooth.buckets.values()].reduce((a, b) => a + b.seconds, 0))
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
    expect(intOrNull(r.boot_ms)).toBe(true)
    expect(typeof r.device).toBe('string')
    expect(r.device.length).toBeGreaterThan(2)
    expect(r.gpu === null || typeof r.gpu === 'string').toBe(true)
    expect(r.mem === null || typeof r.mem === 'number').toBe(true)
    expect(r.cores === null || isInt(r.cores)).toBe(true)
    expect(r.screen).toMatch(/^\d+x\d+@[\d.]+$/)
    expect(r.net === null || typeof r.net === 'string').toBe(true)
    expect(typeof r.installed).toBe('boolean')
    // The load time rides on the session's first row only.
    // The two clocks ride on the session's first row only.
    if (i === 0) {
      expect(r.load_ms, 'load_ms on the first row').toBeGreaterThan(10)
      expect(r.boot_ms, 'boot_ms on the first row').toBeGreaterThan(50)
    } else {
      expect(r.load_ms).toBeNull()
      expect(r.boot_ms).toBeNull()
    }
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
  await page.waitForTimeout(700) // (the card pops in: shoot once it has settled)
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

// ---- S7: the two load clocks ------------------------------------------------------------------
// boot_ms: page start -> the first screen is shown and usable (the title, cover loaded).
// load_ms: the last tap on a button or link -> the first frame of the first 3D scene; with no tap
// (the page opens straight into a 3D scene) from page start. Both on the session's first row only.
test('S7 boot_ms is the title with its cover loaded; load_ms starts at the tap that opens the scene', async ({ page }) => {
  await page.goto('/?smooth=test&morning=0&spawn=quad#/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?smooth=test&morning=0&spawn=quad&again=1#/') // the title, on a fresh phone
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.timing.boot), { timeout: 30000 }).not.toBeNull()
  const title = await page.evaluate(() => {
    const entry = performance.getEntriesByType('resource').find((r) => /cover\.(webp|jpg)/.test(r.name))
    return { boot: window.mzansiSmooth.timing.boot, coverEnd: entry?.responseEnd ?? null, loaded: document.querySelector('.tc-art img')?.complete ?? null, scene: window.mzansiSmooth.timing.firstFrame }
  })
  console.log('S7 title:', JSON.stringify(title))
  expect(title.loaded, 'the title has its cover image').toBe(true)
  expect(title.coverEnd, 'the cover was fetched').not.toBeNull()
  expect(title.boot, 'boot is after the cover arrived').toBeGreaterThanOrEqual(title.coverEnd)
  expect(title.scene, 'no 3D scene yet: load has not started').toBeNull()
  // Enrol by taps (a few seconds), then Enter campus: load_ms starts at that last tap, not at page start.
  await page.evaluate(() => { location.hash = '#/new' })
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.timing.firstFrame), { timeout: 30000 }).not.toBeNull()
  const t = await page.evaluate(() => window.mzansiSmooth.timing)
  console.log('S7 timing:', JSON.stringify(t))
  expect(t.boot).toBe(title.boot)
  expect(t.click, 'the last tap came after the title was up').toBeGreaterThan(t.boot)
  expect(t.firstFrame).toBeGreaterThan(t.click)
  expect(t.load, 'load is the last tap to the first frame').toBe(Math.round(t.firstFrame - t.click))
  expect(t.load, 'and does not include the title and the enrolment').toBeLessThan(t.firstFrame - t.boot - 1000)
  await expect.poll(() => anySeconds(page), { timeout: 60000, intervals: [500] }).toBeGreaterThan(2.2)
  const rows = await page.evaluate(() => window.mzansiSmoothFlush())
  expect(rows.length).toBeGreaterThan(0)
  expect(rows[0].boot_ms).toBe(t.boot)
  expect(rows[0].load_ms).toBe(t.load)
  expect(rows.slice(1).every((r) => r.boot_ms === null && r.load_ms === null), 'the clocks ride on the first row only').toBe(true)
  // The next report's rows carry neither.
  await expect.poll(() => anySeconds(page), { timeout: 60000, intervals: [500] }).toBeGreaterThan(2.2)
  const later = await page.evaluate(() => window.mzansiSmoothFlush())
  expect(later.length).toBeGreaterThan(0)
  expect(later.every((r) => r.boot_ms === null && r.load_ms === null)).toBe(true)
})

test('S7b a page that opens straight into a 3D scene has no tap: load_ms runs from page start', async ({ page }) => {
  await student(page, '&smooth=test') // (leaves a saved student on day 1)
  await page.goto('/?morning=0&spawn=quad&smooth=test&direct=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.timing.firstFrame), { timeout: 30000 }).not.toBeNull()
  const t = await page.evaluate(() => window.mzansiSmooth.timing)
  console.log('S7b timing:', JSON.stringify(t))
  expect(t.click, 'no tap on a button or link').toBeNull()
  expect(t.load).toBe(Math.round(t.firstFrame))
  expect(t.boot, 'the first screen (the 3D view) counts as shown and usable').not.toBeNull()
})

// ---- S8: the real send (?smooth=live), against a stand-in server ----------------------------------
// The POST is answered by the test (page.route): nothing reaches Supabase. A network failure and a 5xx
// keep the rows for the next flush (one try per flush); a 4xx gives up for the session, once, quietly.
async function liveRun(page, replies) {
  const posts = []
  await page.route('**/rest/v1/smooth_reports**', async (route) => {
    const reply = replies.shift() ?? 201
    posts.push({ reply, url: route.request().url(), rows: route.request().postDataJSON() })
    if (reply === 'abort') await route.abort('failed')
    else await route.fulfill({ status: reply, body: '' })
  })
  const warnings = []
  page.on('console', (m) => { if (/smoothness reports are off/.test(m.text())) warnings.push(m.text()) })
  await student(page, '&smooth=live&smoothmin=2')
  return { posts, warnings }
}
const flushOnce = async (page, posts) => {
  const before = posts.length
  await expect.poll(() => anySeconds(page), { timeout: 60000, intervals: [500] }).toBeGreaterThan(2.2)
  const rows = await page.evaluate(() => window.mzansiSmoothFlush())
  return { rows, sent: before }
}
test('S8a a network failure and a 5xx keep the rows and try again at the next flush', async ({ page }) => {
  const { posts, warnings } = await liveRun(page, ['abort', 503, 201])
  const a = await flushOnce(page, posts)
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0].url).toContain('/rest/v1/smooth_reports')
  expect(posts[0].rows.every((r) => r.build === 'qa-live'), 'live rows say qa-live').toBe(true)
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.pending.length), { timeout: 5000 }).toBe(posts[0].rows.length)
  const b = await flushOnce(page, posts)
  await expect.poll(() => posts.length).toBe(2)
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.pending.length), { timeout: 5000 }).toBe(posts[1].rows.length)
  expect(posts[1].rows.length, 'the kept rows went again, with the new ones').toBe(posts[0].rows.length + b.rows.length)
  const c = await flushOnce(page, posts)
  await expect.poll(() => posts.length).toBe(3)
  expect(posts[2].reply).toBe(201)
  expect(posts[2].rows.length).toBe(posts[1].rows.length + c.rows.length)
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.pending.length)).toBe(0)
  // The clocks stay on the one first row all the way through, never copied.
  expect(posts[2].rows.filter((r) => r.load_ms !== null || r.boot_ms !== null).length).toBe(1)
  expect(posts[2].rows[0].load_ms, 'the first row, kept through two failures').not.toBeNull()
  expect(posts[2].rows.length, 'within the 40-row session cap').toBeLessThanOrEqual(40)
  expect(warnings, 'a failure that will be retried says nothing').toEqual([])
  expect(a.rows.length).toBeGreaterThan(0)
  const statuses = await page.evaluate(() => window.__smoothPosts.map((p) => p.status))
  expect(statuses).toEqual([0, 503, 201])
})

test('S8b a 4xx gives up for the session, with one warning, and sends nothing more', async ({ page }) => {
  const { posts, warnings } = await liveRun(page, [404, 201, 201])
  await flushOnce(page, posts)
  await expect.poll(() => posts.length).toBe(1)
  await expect.poll(() => warnings.length, { timeout: 5000 }).toBe(1)
  expect(await page.evaluate(() => window.mzansiSmooth.pending.length)).toBe(0)
  await page.waitForTimeout(3500)
  const again = await page.evaluate(() => window.mzansiSmoothFlush())
  expect(again, 'switched off for the session: nothing is built or sent').toEqual([])
  await page.waitForTimeout(500)
  expect(posts.length).toBe(1)
  expect(warnings.length).toBe(1)
})

// ---- S9: the device name ---------------------------------------------------------------------------
test('S9 the device name comes from userAgentData once it answers, and reports never wait on it', async ({ page }) => {
  await page.addInitScript(() => {
    // A phone's answer arrives late (a second); until then the user agent has to do.
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'Android', getHighEntropyValues: () => new Promise((resolve) => setTimeout(() => resolve({ model: 'SM-A055F', platformVersion: '14.0.0' }), 1200)) } })
  })
  await page.goto('/?smooth=test#/')
  await page.waitForFunction(() => window.mzansiSmooth)
  const early = await page.evaluate(() => window.mzansiSmooth.device)
  expect(early, 'before it answers: the user agent parsing, not blank').toMatch(/\w/)
  expect(early).not.toContain('SM-A055F')
  await expect.poll(() => page.evaluate(() => window.mzansiSmooth.device), { timeout: 5000 }).toBe('SM-A055F Android 14')
})

test('S9b no userAgentData, or an empty model: the user agent parsing stays', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'Android', getHighEntropyValues: async () => ({ model: '', platformVersion: '14.0.0' }) } })
  })
  await page.goto('/?smooth=test#/')
  await page.waitForFunction(() => window.mzansiSmooth)
  await page.waitForTimeout(500)
  const device = await page.evaluate(() => window.mzansiSmooth.device)
  expect(device).toMatch(/Edge|Chrome|Windows|Android/)
  expect(device).not.toMatch(/^ Android/)
})

// ---- S4 ---------------------------------------------------------------------------------------
const NOW = Date.now()
const row = (place, session, typical, low, below20, extra = {}) => ({
  id: Math.random(), created_at: new Date(NOW - 3600e3).toISOString(), session, build: 'test', scene: 'campus', place, seconds: 60,
  fps_typical: typical, fps_low: low, secs_below_30: below20, secs_below_20: below20, long_frames: 6, worst_ms: 120, taps: 3, tap_ms: 70, walks: 5, stalls: 0,
  stall_at: [], boot_ms: 1200, load_ms: 3000, device: 'SM-A135F Android 14', gpu: 'Mali-G52', mem: 4, cores: 8, screen: '412x915@2.6', net: '4g', installed: false, ...extra,
})
const stall = (i, k = 'npc') => ({ k, h: `walk ${(1.5 + i / 10).toFixed(1)} m short`, x: i, z: -i })
const ROWS = [
  row('quad', 's1', 58, 40, 1), row('quad', 's2', 60, 44, 1),
  row('cafeteria', 's1', 50, 18, 2, { gpu: 'Adreno 610', device: 'Redmi 9A Android 11', stall_at: Array.from({ length: 8 }, (_, i) => stall(i)), stalls: 8, net: '3g', boot_ms: 4000, load_ms: 9000 }),
  row('cafeteria', 's3', 52, 19, 3, { gpu: 'Adreno 610', stall_at: Array.from({ length: 8 }, (_, i) => stall(i + 20, 'player')), stalls: 8, created_at: new Date(NOW - 1800e3).toISOString() }),
  row('cafeteria', 's4', 49, 17, 1, { gpu: 'Adreno 610', stall_at: Array.from({ length: 8 }, (_, i) => stall(i + 40, 'against')), stalls: 8, created_at: new Date(NOW - 900e3).toISOString() }),
  row('library', 's1', 28, 24, 1, { gpu: 'Adreno 610' }),
  row('greenway', 's2', 45, 30, 4), // 6.7% of the time under 20 fps: red
  row('gate', 's2', 40, 30, 3), // exactly 5%: not red
  row('paths', 's1', 59, 45, 0, { scene: 'campus' }),
  row('morning', 's1', 35, 25, 0, { scene: 'morning' }), // typical 35: fine
  row('lecture', 's5', 61, 48, 0, { scene: 'lecture', boot_ms: null, load_ms: null, net: null }),
  row('common:thekwini', 's1', 57, 41, 0), row('home:township', 's2', 55, 40, 0, { scene: 'home' }), row('room', 's2', 54, 41, 0),
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
    expect(order).toEqual(['cafeteria:red', 'greenway:red', 'library:amber', 'morning:ok', 'gate:ok', 'home:township:ok', 'common:thekwini:ok', 'room:ok', 'quad:ok', 'paths:ok', 'lecture:ok'])
    // Names, not ids: places.csv names, houses' common rooms, the scene buckets (ids stay in the tooltip).
    const labels = await places.evaluateAll((trs) => Object.fromEntries(trs.map((tr) => [tr.dataset.key, tr.querySelector('th').textContent])))
    expect(labels).toMatchObject({ cafeteria: 'Cafeteria', greenway: 'Greenway Grocer', gate: 'Main Gate', quad: 'The Quad', paths: 'Paths between places', room: 'Activity rooms', 'common:thekwini': 'Thekwini House common room', 'home:township': 'Day 1 home (township)' })
    const cafe = places.nth(0)
    await expect(cafe).toContainText('Cafeteria')
    await expect(cafe.locator('th')).toHaveAttribute('title', 'cafeteria')
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
    await expect(page.locator('[data-load="boot"]')).toContainText('Open to title')
    await expect(page.locator('[data-load="load"]')).toContainText('Tap to playing')
    await expect(page.locator('[data-load="boot"]')).toContainText('median')
    for (const kind of ['boot', 'load']) {
      await expect(page.locator(`[data-net="${kind}"]`)).toContainText('3g')
      await expect(page.locator(`[data-net="${kind}"]`)).toContainText('4g')
    }
    // No sideways scroll on the page itself.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(wide, 'the page never scrolls sideways').toBeLessThanOrEqual(0)
    const shownHeads = (table) => page.locator(`table[data-table="${table}"] thead th`).evaluateAll((ths) => ths.filter((th) => getComputedStyle(th).display !== 'none').map((th) => th.textContent.trim()))
    if (w <= 480) {
      // A phone: five columns, and no table scrolls sideways.
      expect(await shownHeads('places')).toEqual(['Place', 'Typical', 'Worst 10%', '<20 fps', 'Stalls'])
      expect(await shownHeads('devices')).toEqual(['Device', 'Typical', 'Worst 10%', '<20 fps', 'Stalls'])
      const over = await page.locator('.sm-wrap').evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
      expect(Math.max(...over), 'no table needs sideways scrolling').toBeLessThanOrEqual(1)
    } else {
      // A computer: every column, as before.
      expect((await shownHeads('places')).length).toBe(9)
      expect((await shownHeads('devices')).length).toBe(9)
    }
    await page.screenshot({ path: `${OUT}/smooth-${w}x${h}.png`, fullPage: true })
    // Tap a place: its last 20 stalls, newest first (24 stalls were sent for the cafeteria: 20 shown).
    await cafe.click()
    const stalls = page.locator('[data-stalls="cafeteria"] tbody tr')
    await expect(page.locator('[data-stalls="cafeteria"] h2')).toContainText('Cafeteria')
    await expect(page.locator('[data-stalls="cafeteria"] h2')).toContainText('(cafeteria)')
    await expect(stalls).toHaveCount(20)
    const kinds = await stalls.evaluateAll((trs) => trs.map((tr) => tr.children[1].textContent))
    expect(kinds.slice(0, 8), 'the newest report first (against), then player, then npc').toEqual(Array(8).fill('against'))
    expect(kinds.slice(8, 16)).toEqual(Array(8).fill('player'))
    expect(kinds.slice(16)).toEqual(Array(4).fill('npc'))
    const first = await stalls.first().locator('td').allTextContents()
    expect(first[0], 'the id stays in the stall list').toBe('cafeteria')
    expect(first[2]).toMatch(/m short/)
    expect(first[6], 'the device').toBeTruthy()
    // The rest of a row's numbers, under it on a phone (a computer shows them as columns).
    const detail = page.locator('tr[data-detail="cafeteria"]')
    if (w <= 480) {
      await expect(detail).toBeVisible()
      await expect(detail).toContainText('Players')
      await expect(detail).toContainText('Minutes')
      await expect(detail).toContainText('Long/min')
      await expect(detail).toContainText('Tap ms')
      await expect(detail.locator('dd').first()).toHaveText('3')
      const stallHeads = await page.locator('.sm-stall-table thead th').evaluateAll((ths) => ths.filter((th) => getComputedStyle(th).display !== 'none').map((th) => th.textContent.trim()))
      expect(stallHeads, 'Kind, How, x, z, When').toEqual(['Kind', 'How', 'x', 'z', 'When'])
      // When is short ("13:47" for today), with the device on a second line, small.
      const when = page.locator('.sm-stall-table tbody tr').first().locator('.sm-when')
      await expect(when.locator('.when-short')).toBeVisible()
      await expect(when.locator('.when-long')).toBeHidden()
      expect((await when.locator('.when-short').textContent()).length, 'short').toBeLessThanOrEqual(12)
      await expect(when.locator('.sm-dev')).toBeVisible()
      expect(await when.locator('.sm-dev').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 'small').toBeLessThan(12)
      expect(await page.locator('.sm-stall-table tbody tr').first().locator('.sm-xz').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 'x and z stay, small').toBeLessThan(12)
      const over = await page.locator('.sm-wrap').evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
      expect(Math.max(...over), 'the stall list needs no sideways scrolling either').toBeLessThanOrEqual(1)
    } else {
      await expect(detail).toBeHidden()
    }
    // The selected row is outlined all the way round, the place name included.
    const edges = await cafe.locator('> *').evaluateAll((cells) => cells.map((c) => getComputedStyle(c).boxShadow))
    expect(edges[0], 'left edge, drawn on the name cell').toMatch(/inset/)
    expect(edges.every((e) => e !== 'none'), 'every cell of the row carries the top and bottom of the outline').toBe(true)
    const lastEdge = edges[edges.length - 1]
    expect(lastEdge).toMatch(/-2px 0px 0px|-2px 0 0/)
    expect(edges[0]).toMatch(/2px 0px 0px|2px 0 0/)
    await page.screenshot({ path: `${OUT}/smooth-stalls-${w}x${h}.png`, fullPage: true })
    // A device row opens its numbers on a phone.
    const devRow = page.locator('table[data-table="devices"] tbody tr.sm-row').first()
    await devRow.click()
    if (w <= 480) await expect(page.locator('tr[data-detail="Adreno 610"]')).toBeVisible()
    await devRow.click()
    await expect(page.locator('tr[data-detail]').filter({ hasText: 'Players' })).toHaveCount(1) // (only the cafeteria's is still open)
    // Tap it again: closed.
    await cafe.click()
    await expect(page.locator('[data-stalls]')).toHaveCount(0)
    await expect(page.locator('tr[data-detail]')).toHaveCount(0)
  })
}

test('S4c #/smooth at 360x800: no table scrolls sideways, even with a place open', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.addInitScript((rows) => { window.__smoothRows = rows }, ROWS)
  await page.goto('/?smooth=test#/smooth')
  await page.locator('table[data-table="places"] tbody tr.sm-row').first().click()
  await expect(page.locator('[data-stalls]')).toBeVisible()
  const over = await page.locator('.sm-wrap').evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth))
  expect(Math.max(...over)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

// Settings buttons keep the space before the bold value ("Sound: On"): flex had dropped it.
test('S10 every Settings button keeps a gap before its bold value', async ({ page }) => {
  await page.goto('/#/settings')
  const buttons = page.locator('main[data-screen="settings"] .btn:has(b)')
  await expect(buttons.first()).toBeVisible()
  expect(await buttons.count(), 'Sound and the smoothness switch').toBeGreaterThanOrEqual(2)
  const gaps = await buttons.evaluateAll((els) => els.map((el) => {
    const b = el.querySelector('b')
    const label = [...el.childNodes].find((n) => n.nodeType === 3)
    const range = document.createRange()
    range.selectNodeContents(label)
    return { text: el.textContent.trim(), gap: Math.round((b.getBoundingClientRect().left - range.getBoundingClientRect().right) * 10) / 10, size: parseFloat(getComputedStyle(el).fontSize) }
  }))
  console.log('S10 gaps:', JSON.stringify(gaps))
  for (const g of gaps) expect(g.gap, `${g.text}: a space between the label and the value`).toBeGreaterThanOrEqual(g.size * 0.2)
})

test('S4b a visitor who is not an admin sees nothing', async ({ page }) => {
  await page.goto('/#/smooth')
  await expect(page.locator('main[data-screen="smooth"]')).toContainText('Admins only')
  await expect(page.locator('table')).toHaveCount(0)
})
