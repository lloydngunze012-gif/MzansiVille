// Day 1 lecture in SMIG, played by taps only.
// Run: npx playwright test tests/e2e/lecture.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

test.describe.configure({ mode: 'serial' })
const OUT = process.env.LECTURE_SHOTS || 'test-results/lecture'

// A new student, moved straight to the start of the 9:00 lecture.
async function atLecture(page, minutes, extra = '', course = null) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  if (course) await page.locator('#course').selectOption(course)
  else await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate((m) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { phase: 'lecture', minutes: m, morningDone: true, queue: [], lectureResolved: false, lectureRoute: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  }, minutes)
  // A new query string forces a full reload, so the edited save is read fresh.
  await page.goto(`/?fast=1&morning=0&lecture=1&talk=auto${extra}#/lecture`)
}

test('lecture: walk in, seat, moment, choice, result', async ({ page }) => {
  test.setTimeout(180000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await atLecture(page, 8 * 60 + 45, '&moment=cold_call')
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

  // (with ?fast=1 the moment can pass before the test looks: moment or the choice after it)
  await expect(host).toHaveAttribute('data-step', /moment|choice/, { timeout: 30000 })
  await page.screenshot({ path: `${OUT}/3_moment.png` })
  await atStep('choice')
  await expect(host).toHaveAttribute('data-moment', 'cold_call')
  await page.screenshot({ path: `${OUT}/3b_cold_call.png` })
  await expect(page.locator('[data-lc="choice"]')).toHaveCount(2)
  await page.locator('[data-lc="choice"]').first().tap()
  await expect(host).toHaveAttribute('data-step', /result|done/, { timeout: 30000 }) // fast mode can pass the result
  await expect(host).toHaveAttribute('data-tone', /good|neutral|bad/)
  await page.screenshot({ path: `${OUT}/4_result.png` })

  await atStep('done')
  await expect(page.locator('.mm-card')).toContainText('Lecture done')
  await page.screenshot({ path: `${OUT}/5_done.png` })
  await page.locator('[data-lc="done"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.lectureResolved).toBe(true)
  expect(run.lectureRoute).toBeFalsy()
  await expect(page.locator('.g-route')).toHaveCount(0) // "Your lecture is at SMIG" is gone
  expect(run.stats.grades).toBeGreaterThan(before) // the normal +8 lecture gain applied
  // The lecture is over for today: the route sends you back to campus.
  await page.goto('/?fast=1&morning=0#/lecture')
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

test('your course decides your lecture: a Law student goes to Law, with Prof Naidoo', async ({ page }) => {
  test.setTimeout(120000)
  fs.mkdirSync(OUT, { recursive: true })
  await atLecture(page, 8 * 60 + 45, '', 'Law')
  const host = page.locator('#lecture3d')
  await expect(host).toHaveAttribute('data-step', /walk-in|seat/, { timeout: 30000 })
  await expect(host).toHaveAttribute('data-venue', 'law')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/law_walk_in.png` })
  await expect(host).toHaveAttribute('data-lecturer', 'Prof Naidoo')
  await page.screenshot({ path: `${OUT}/law_lecturer.png` })
  // On campus, the route and the chip point to Law, not SMIG.
  await page.goto('/?fast=1&morning=0&campus=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await expect(page.locator('.g-now')).toContainText('Lecture at Law')
  await expect(page.locator('.g-route')).toContainText('Your lecture is at Law')
  const end = await page.evaluate(() => { const r = window.mzansiRoute(); return r.path[r.path.length - 1] })
  const law = await page.evaluate(() => window.mzansiDoorOf?.('law'))
  if (law) expect(Math.hypot(end.x - law.x, end.z - law.z)).toBeLessThan(1)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/law_route.png` })
})

test('the other students sit on the benches, not between them', async ({ page }) => {
  test.setTimeout(120000)
  fs.mkdirSync(OUT, { recursive: true })
  await atLecture(page, 8 * 60 + 45)
  await expect(page.locator('#lecture3d')).toHaveAttribute('data-step', /walk-in|seat/, { timeout: 30000 })
  await page.waitForTimeout(3000)
  const students = await page.evaluate(() => window.mzansiLectureStudents())
  expect(students.length).toBeGreaterThan(10)
  for (const s of students) { expect(s.pose).toBe('sit'); expect(s.y).toBeGreaterThan(0.4) }
  // From the side of the hall, across the rows.
  await page.evaluate(() => window.mzansiLectureShot([6.2, 4.2, 6], [-1, 1.2, 1]))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/6_rows_side.png` })
  await page.evaluate(() => window.mzansiLectureShot([0, 3.6, -5.6], [0, 1.4, 4]))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/7_rows_front.png` })
})
