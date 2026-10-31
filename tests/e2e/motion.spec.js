// Motion sprint finish line (M1-M7) at 412x915 and normal speed: bodies measured
// from their skinned vertices (window.mzansiBodies), plus a video of each journey
// and screenshots in docs/sprints/motion/ for the owner to watch.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/motion'
test.use({ viewport: { width: 412, height: 915 }, video: { mode: 'on', size: { width: 412, height: 915 } } })
test.describe.configure({ timeout: 240000 })

// A new student on campus at 13:00, after the morning and the lecture.
async function campus(page, spawn, extra = '') {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
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
  await page.goto(`/?morning=0&spawn=${spawn}${extra}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(3000)
}

// Keep the journey's video next to its screenshots.
async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

const bodies = (page) => page.evaluate(() => window.mzansiBodies())
const CM = 0.03

test('M6 every outfit, player and NPC: shoes on', async ({ page }) => {
  await campus(page, 'quad')
  const male = ['hoodie', 'shirt', 'organt', 'jacket', 'punk', 'beach'].map((outfit) => ({ gender: 'male', outfit, hair: 'crop', skin: 'brown' }))
  const female = ['hoodie', 'shirt', 'organt', 'jacket', 'dress', 'shweshwe', 'skirt', 'punk'].map((outfit) => ({ gender: 'female', outfit, hair: 'curls', skin: 'deep' }))
  const groups = [['M6-male-1', male.slice(0, 3)], ['M6-male-2', male.slice(3)], ['M6-female-1', female.slice(0, 4)], ['M6-female-2', female.slice(4)]]
  for (const [name, looks] of groups) {
    await page.evaluate((l) => window.mzansiLineup(l), looks)
    const p = await page.evaluate(() => window.mzansiPlayerPos())
    await page.evaluate(([q, n]) => window.mzansiCam([q.x, 1.0, q.z + 3 + n * 2], [q.x, 0.75, q.z + 3]), [p, looks.length])
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/${name}.png` })
  }
  // Everyone in the world, the player included: no skin on the feet, soles on the ground.
  const all = await bodies(page)
  console.log('people checked', all.length)
  const bare = all.filter((b) => b.bareFeet).map((b) => b.id)
  expect(bare).toEqual([])
  for (const b of all.filter((x) => x.pose === 'stand')) expect(Math.abs(b.sole - b.ground), b.id).toBeLessThan(CM)
  await saveVideo(page, 'M6')
})
