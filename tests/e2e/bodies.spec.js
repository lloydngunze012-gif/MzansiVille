// Look-test bodies in the world: feet on the ground, hips on seats, nobody frozen
// mid-stride, queues as lines. Close side views at phone size.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/bodies'
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ mode: 'serial', timeout: 150000 })

async function campus(page, spawn) {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto(`/?morning=0&spawn=${spawn}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2500)
}

async function side(page, id, name, dist = 3.2, h = 1.1) {
  const p = await page.evaluate((who) => window.mzansiPersonPos(who), id)
  if (!p) return null
  await page.evaluate(([q, d, hh]) => window.mzansiCam([q.x + d, hh, q.z + 0.4], [q.x, 0.8, q.z]), [p, dist, h])
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  return p
}

test('bodies at the cafeteria: seated on chairs, the queue a line', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await campus(page, 'cafeteria')
  console.log('people', JSON.stringify(await page.evaluate(() => window.mzansiPeople())))
  await side(page, 'naledi', 'caf-naledi-seated')
  await side(page, 'luke', 'caf-luke-seated')
  await side(page, 'priya', 'caf-queue', 5, 1.6)
  await side(page, 'auntie_pinky', 'caf-auntie')
})

test('bodies at the Quad: benches, the stall queue, walkers', async ({ page }) => {
  await campus(page, 'quad')
  console.log('people', JSON.stringify(await page.evaluate(() => window.mzansiPeople())))
  const ppl = await page.evaluate(() => window.mzansiPeople())
  const sitter = ppl.find((p) => p.pose === 'sit')
  if (sitter) await side(page, sitter.id, 'quad-bench-sitter')
  await side(page, 'kea', 'quad-stall-queue', 5, 1.6)
  await side(page, 'lethabo', 'quad-performer')
  await side(page, 'x0', 'quad-walker-x0')
  await side(page, 'x3', 'quad-walker-x3')
  await side(page, 'amahle', 'quad-crush')
})
