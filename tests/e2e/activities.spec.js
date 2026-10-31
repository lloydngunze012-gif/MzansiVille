// Item 2: activities you can see. At the Quad each action plays out before its result.
// Run: npx playwright test tests/e2e/activities.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/activities'
test.describe.configure({ mode: 'serial', timeout: 150000 })

async function atQuad(page) {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&spawn=quad#/place/quad')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(3000)
}

for (const [id, script, shots] of [['quad_vendor', 'queueFood', [1.5, 4, 7, 10]], ['quad_friends', 'benchChat', [2.5, 4.5]], ['quad_busker', 'watchStage', [2.5, 4.5]]]) {
  test(`${id} plays out (${script})`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await atQuad(page)
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats)
    await page.locator(`[data-act="do"][data-id="${id}"]`).tap()
    const world = page.locator('#world')
    await expect(world).toHaveAttribute('data-activity', script, { timeout: 10000 })
    let t = 0
    for (const at of shots) {
      await page.waitForTimeout((at - t) * 1000)
      t = at
      await page.screenshot({ path: `${OUT}/${id}-${at}s.png` })
    }
    await expect(world).toHaveAttribute('data-activity-step', 'done', { timeout: 40000 })
    await page.waitForTimeout(800)
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats)
    expect(after).not.toEqual(before) // the result landed after the scene
    expect(errors).toEqual([])
  })
}
