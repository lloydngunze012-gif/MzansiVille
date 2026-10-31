// Item 7: from the gate, walk to SMIG by tapping the path (like a player), and the
// day-1 lecture opens. Taps on the ground walk; they never start a conversation.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/walk'
test.use({ viewport: { width: 412, height: 915 } })

test('gate to SMIG by tapping the path opens the lecture', async ({ page }) => {
  test.setTimeout(240000)
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'lecture', minutes: 520, at: 'gate', lectureRoute: true, lectureResolved: false })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&talk=auto#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-spawn', 'gate', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/0-gate.png` })
  let taps = 0
  for (; taps < 40; taps++) {
    if (/#\/lecture/.test(page.url())) break
    const target = await page.evaluate(() => {
      const r = window.mzansiRoute()
      if (!r) return null
      // A point about 7 m along the path, so each tap is a visible walk.
      let left = 7
      let from = r.player
      for (const p of r.path) {
        const d = Math.hypot(p.x - from.x, p.z - from.z)
        if (d >= left) { const k = left / d; return window.mzansiScreenOf(from.x + (p.x - from.x) * k, from.z + (p.z - from.z) * k) }
        left -= d
        from = p
      }
      return window.mzansiScreenOf(from.x, from.z)
    })
    if (!target) break
    expect(target.behind).toBe(false)
    const x = Math.max(30, Math.min(382, target.x))
    const y = Math.max(320, Math.min(760, target.y))
    await page.mouse.click(x, y)
    await page.waitForTimeout(1800)
    await expect(page.locator('.g-talk')).toHaveCount(0) // a ground tap never opens a chat
    if (taps === 3) await page.screenshot({ path: `${OUT}/1-walking.png` })
  }
  await expect(page).toHaveURL(/#\/lecture/, { timeout: 15000 })
  await expect(page.locator('#lecture3d')).toHaveAttribute('data-step', /arrive|walk-in|seat/, { timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/2-lecture.png` })
  console.log('taps', taps)
})

test('the SMIG sheet\'s Attend lecture plays the lecture on day 1', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'lecture', minutes: 520, at: 'gate', lectureRoute: true, lectureResolved: false })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&talk=auto#/place/smig')
  const attend = page.locator('[data-act="do"][data-id="lecture_attend"]')
  await expect(attend).toBeVisible({ timeout: 20000 })
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.minutes)
  await attend.tap()
  await expect(page).toHaveURL(/#\/lecture/)
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.minutes)
  expect(after).toBe(before) // no clock jump: the lecture is played, not skipped
})
