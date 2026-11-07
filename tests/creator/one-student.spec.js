// QA pass 1: "two students on the stage". Quick picks, one after another before the last has
// loaded, must leave exactly one student standing (read only: window.mzansiStudio().students).
import { test, expect } from '@playwright/test'

test('quick picks leave one student on the stage', async ({ browser }) => {
  test.setTimeout(120000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  const counts = []
  for (const round of [['jacket', 'dress', 'organt'], ['shirt', 'skirt', 'hoodie']]) {
    for (const id of round) {
      const b = page.locator(`[data-part="outfit"][data-id="${id}"]`)
      await b.scrollIntoViewIfNeeded()
      await b.tap({ delay: 0 })
    }
    // while they load and after
    for (let i = 0; i < 12; i++) { counts.push((await page.evaluate(() => window.mzansiStudio())).students); await page.waitForTimeout(400) }
  }
  console.log('students on stage over time', counts.join(' '))
  expect(counts.at(-1), 'one student in the end').toBe(1)
  expect(Math.max(...counts.slice(-8)), 'never two once the last pick is in').toBe(1)
  await ctx.close()
})
