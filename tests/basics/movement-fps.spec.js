// Movement (owner, 11 Nov), M5: every district of SunnyBay with the traffic, the processor slowed 4 times: the frame
// rate, reported (docs/sprints/movement/fps.json). In the timing project (tests/basics), one browser at a time: with
// two browsers on one machine they share the graphics card and every number halves.
// Run: npx playwright test tests/basics/movement-fps.spec.js --config playwright.gpu.config.js --workers=1 --project=timing
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, intoCity } from '../city.js'

const OUT = 'docs/sprints/movement'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.setTimeout(300000)
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
const traffic = (page) => page.evaluate(() => window.mzansiCity.traffic())

test('M5 every district at a 4x slower processor: the frame rate with the traffic', async ({ page }) => {
  const errors = await atGate(page)
  await intoCity(page)
  await expect.poll(async () => (await traffic(page))?.ready, { timeout: 30000 }).toBe(true)
  const spots = { campus: [-19, 128], town: [-16, 230], suburbs: [14, -145], beachfront: [170, 14], township: [-205, 8], industrial: [-215, 206] } // (on the pavements, by each district's stop: standing in a road stops the traffic, as it should)
  const cdp = await page.context().newCDPSession(page)
  const out = {}
  for (const [part, [x, z]] of Object.entries(spots)) {
    await page.evaluate(([a, b]) => window.mzansiCity.teleport(a, b, 0), [x, z])
    await page.waitForTimeout(2500)
    const measure = async () => {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      const times = await page.evaluate(() => new Promise((done) => { const t = []; let t0 = 0; const f = (n) => { if (!t0) t0 = n; t.push(n); if (n - t0 < 4000) requestAnimationFrame(f); else done(t) }; requestAnimationFrame(f) }))
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
      return { fps: +(gaps.length / ((times.at(-1) - times[0]) / 1000)).toFixed(1), p95_ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) }
    }
    // (the same spot without the traffic, then with it: what the traffic itself costs, whatever else the machine is doing)
    await page.evaluate(() => window.mzansiCity.trafficOn(false))
    await page.waitForTimeout(800)
    const without = await measure()
    await page.evaluate(() => window.mzansiCity.trafficOn(true))
    await page.waitForTimeout(800)
    const withT = await measure()
    const tr = await traffic(page)
    out[part] = { ...withT, without: without.fps, vehicles: tr.cars + tr.kombis, calls: (await page.evaluate(() => window.mzansiCity.info())).calls }
  }
  console.log('MOVEMENT FPS', JSON.stringify(out))
  fs.writeFileSync(`${OUT}/fps.json`, JSON.stringify(out, null, 2))
  // (the frame rate without the traffic is reported beside it, not checked: on this PC, shared with whatever else is
  // running, two 4 s readings of the same spot differ by more than the traffic costs)
  for (const [part, r] of Object.entries(out)) expect(r.fps, `${part} at 4x, with the traffic`).toBeGreaterThanOrEqual(30)
  expect(errors).toEqual([])
})
