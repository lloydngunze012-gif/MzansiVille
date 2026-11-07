// The stage stays perfectly still while the options scroll underneath (owner, 7 Nov: "the student
// moves up and down when you scroll"). On a phone the address bar slides away as you scroll, which
// changes the viewport height; here the viewport shrinks and grows by 56 px mid-scroll to do the same.
// Read only: the stage's box, the canvas size and where the student's feet are on screen.
import { test, expect } from '@playwright/test'

for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`the stage does not move while scrolling (${w}x${h})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto('/?morning=0#/new')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?morning=0#/new')
    await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
    await page.waitForTimeout(800)
    const read = () => page.evaluate(() => {
      const s = document.querySelector('.en-stage').getBoundingClientRect()
      const c = document.querySelector('.cc-3d')
      const f = window.mzansiStudioFrame()
      return { top: Math.round(s.top), height: Math.round(s.height), cw: c.width, ch: c.height, sole: f ? +f.soleLine.toFixed(4) : null }
    })
    const first = await read()
    const seen = [first]
    for (const [dy, vh] of [[120, h], [120, h - 56], [200, h - 56], [-150, h], [300, h - 56], [-500, h]]) {
      await page.setViewportSize({ width: w, height: vh })
      await page.mouse.wheel(0, dy)
      await page.waitForTimeout(250)
      seen.push(await read())
    }
    console.log(JSON.stringify(seen))
    for (const r of seen) {
      expect(r.top, 'the stage stays where it is').toBe(first.top)
      expect(r.height, 'the stage keeps its height').toBe(first.height)
      expect([r.cw, r.ch], 'the 3D view is never resized').toEqual([first.cw, first.ch])
      expect(r.sole, 'the student stands at the same spot on screen').toBe(first.sole)
    }
    await ctx.close()
  })
}
