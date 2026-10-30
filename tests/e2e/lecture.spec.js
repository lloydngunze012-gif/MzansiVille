// Day 1 lecture in SMIG, played by taps only.
// Run: npx playwright test tests/e2e/lecture.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

test.describe.configure({ mode: 'serial' })
const OUT = process.env.LECTURE_SHOTS || 'test-results/lecture'

// A new student, moved straight to the start of the 9:00 lecture.
async function atLecture(page, minutes) {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate((m) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { phase: 'lecture', minutes: m, morningDone: true, queue: [], lectureResolved: false })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  }, minutes)
  // A new query string forces a full reload, so the edited save is read fresh.
  await page.goto('/?morning=0&lecture=1&talk=auto#/lecture')
}

test('lecture: walk in, seat, moment, choice, result', async ({ page }) => {
  test.setTimeout(180000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await atLecture(page, 8 * 60 + 45)
  const host = page.locator('#lecture3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 30000 })
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.grades)

  await atStep('walk-in')
  await expect(page.locator('.lc-caption')).toBeVisible()
  await page.screenshot({ path: `${OUT}/1_walk_in.png` })
  await atStep('seat')
  await expect(page.locator('[data-lc="choice"]')).toHaveCount(3)
  await expect(page.locator('[data-lc="choice"]').nth(2)).toContainText('Next to Zanele')
  await page.screenshot({ path: `${OUT}/2_seat_choice.png` })
  await page.locator('[data-lc="choice"]').nth(2).tap()
  await expect(host).toHaveAttribute('data-seat', 'zanele')

  await atStep('moment')
  await page.screenshot({ path: `${OUT}/3_moment.png` })
  await atStep('choice')
  await expect(page.locator('[data-lc="choice"]')).toHaveCount(2)
  await page.locator('[data-lc="choice"]').first().tap()
  await atStep('result')
  await expect(host).toHaveAttribute('data-tone', /good|neutral|bad/)
  await page.screenshot({ path: `${OUT}/4_result.png` })

  await atStep('done')
  await expect(page.locator('.mm-card')).toContainText('Lecture done')
  await page.screenshot({ path: `${OUT}/5_done.png` })
  await page.locator('[data-lc="done"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.lectureResolved).toBe(true)
  expect(run.stats.grades).toBeGreaterThan(before) // the normal +8 lecture gain applied
  // The lecture is over for today: the route sends you back to campus.
  await page.goto('/?morning=0#/lecture')
  await expect(page).toHaveURL(/#\/play/)
  expect(errors).toEqual([])
})

test('lecture: late, so the front row is taken', async ({ page }) => {
  test.setTimeout(120000)
  await atLecture(page, 9 * 60 + 6)
  const host = page.locator('#lecture3d')
  await expect(host).toHaveAttribute('data-step', 'seat', { timeout: 30000 })
  await expect(page.locator('[data-lc="choice"]').first()).toBeDisabled()
  await expect(page.locator('[data-lc="choice"]').first()).toContainText('Taken')
})
