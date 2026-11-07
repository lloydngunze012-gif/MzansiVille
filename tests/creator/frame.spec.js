// F1: the student fills the stage (head near the top, feet on the plinth, about 75-80% of its
// height from head to feet) and no pose of the dance, nor any angle of the turn, leaves the frame,
// at 390x844 and 360x740, women and men. Read only (window.mzansiStudioFrame). Real GPU.
import { test, expect } from '@playwright/test'

for (const [w, h] of [[390, 844], [360, 740]]) {
  for (const gender of ['female', 'male']) {
    test(`F1: framing ${gender} at ${w}x${h}`, async ({ browser }) => {
      test.setTimeout(120000)
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      await page.goto('/?morning=0#/new')
      await page.evaluate(() => localStorage.clear())
      await page.goto('/?morning=0#/new')
      await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
      if (gender === 'male') { await page.locator('[data-gender="male"]').first().tap(); await page.waitForTimeout(2500) }
      // one full turn and a bit, sampled every 120 ms
      const agg = await page.evaluate(async () => {
        const a = { minX: 9, maxX: -9, minY: 9, maxY: -9, headTop: -9, sole: 9 }
        const t0 = performance.now()
        while (performance.now() - t0 < 11500) {
          const f = window.mzansiStudioFrame()
          if (f) { a.minX = Math.min(a.minX, f.minX); a.maxX = Math.max(a.maxX, f.maxX); a.minY = Math.min(a.minY, f.minY); a.maxY = Math.max(a.maxY, f.maxY); a.headTop = Math.max(a.headTop, f.headTop); a.sole = Math.min(a.sole, f.soleLine) }
          await new Promise((r) => setTimeout(r, 120))
        }
        return a
      })
      const body = (agg.headTop - agg.sole) / 2 // head top to soles, as a share of the stage height
      console.log(`${gender} ${w}x${h}`, JSON.stringify(agg), 'head-to-feet share', body.toFixed(2))
      expect(agg.maxY, 'top of the highest hand inside the frame').toBeLessThan(0.98)
      expect(agg.minY, 'bottom (plinth is not part of the student)').toBeGreaterThan(-0.98)
      expect(agg.minX).toBeGreaterThan(-0.98)
      expect(agg.maxX).toBeLessThan(0.98)
      expect(body, 'fills about 75-80% of the stage height').toBeGreaterThan(0.72)
      expect(body).toBeLessThan(0.84)
      await ctx.close()
    })
  }
}
