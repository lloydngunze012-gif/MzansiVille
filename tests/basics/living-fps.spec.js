// A living world (owner, 12 Nov, job J), item 8: at least 30 fps on a low-end phone profile in every district, with
// the crowds, the traffic, the beach life, the Caf full at lunch and the campus outside. The processor slowed 4
// times (CDP), 390 x 844 at 2x. In the timing project (tests/basics): one browser at a time.
// Run: npx playwright test tests/basics/living-fps.spec.js --config playwright.gpu.config.js --workers=1 --project=timing
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'

const OUT = 'docs/sprints/living'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.setTimeout(480000)
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))

async function measure(page, cdp) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const times = await page.evaluate(() => new Promise((done) => { const t = []; let t0 = 0; const f = (n) => { if (!t0) t0 = n; t.push(n); if (n - t0 < 4000) requestAnimationFrame(f); else done(t) }; requestAnimationFrame(f) }))
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  return { fps: +(gaps.length / ((times.at(-1) - times[0]) / 1000)).toFixed(1), p95_ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) }
}

test('J8 every district at a 4x slower processor, with the crowds: the frame rate', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  const out = {}
  // the campus outside (the Quad: the full students of crowd.js and dress.js, and the cheap ones of campuslife.js)
  const errors = await atGate(page, { patch: { minutes: 12 * 60 + 30, phase: 'social' } })
  await page.waitForTimeout(2500)
  out.campus_quad = { ...(await measure(page, cdp)), people: (await page.evaluate(() => window.mzansiCampusLife?.()))?.total }
  // the Caf at lunch (busy)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-enter-caf')))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.waitForTimeout(2500)
  const caf = await page.evaluate(() => window.mzansiCafPeople?.())
  out.caf_lunch = { ...(await measure(page, cdp)), staff: caf?.staff?.length, patrons: caf?.patrons }
  // every district of SunnyBay, by its stop, then the beach itself (a save left in the city loads straight there)
  await atGate(page, { patch: { minutes: 12 * 60 + 30, phase: 'social', cityAt: { x: -16, z: 230 } } })
  await expect(page.locator('#city3d')).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCity.traffic()))?.ready, { timeout: 30000 }).toBe(true)
  const spots = { campus: [-19, 128], town: [-16, 230], suburbs: [14, -145], beachfront: [170, 14], township: [-205, 8], industrial: [-215, 206], beach: [280, 30] }
  for (const [part, [x, z]] of Object.entries(spots)) {
    await page.evaluate(([a, b]) => window.mzansiCity.teleport(a, b, 0), [x, z])
    await page.waitForTimeout(3000)
    const r = await measure(page, cdp)
    const crowd = await page.evaluate(() => window.mzansiCity.crowd())
    const tr = await page.evaluate(() => window.mzansiCity.traffic())
    out[part] = { ...r, walkers: crowd?.walkers, beach: crowd?.beach, people: crowd?.total, target: crowd?.target, vehicles: tr.cars + tr.kombis, calls: (await page.evaluate(() => window.mzansiCity.info())).calls }
  }
  console.log('LIVING FPS', JSON.stringify(out))
  fs.writeFileSync(`${OUT}/fps.json`, JSON.stringify(out, null, 2))
  for (const [k, r] of Object.entries(out)) expect(r.fps, `${k} at 4x`).toBeGreaterThanOrEqual(30)
  expect(errors).toEqual([])
})
