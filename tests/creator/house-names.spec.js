// The renamed houses (Cursor, 7 Nov: Thekwini -> Wave House, Braam -> Goldrush House) show
// everywhere a house name shows: enrolment's house cards, the map, your card; and an old save
// that still says "Thekwini House" becomes Wave House.
import { test, expect } from '@playwright/test'
import { enrolUI } from '../enrol.js'

test('Wave House and Goldrush House everywhere, the old names nowhere', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  for (let i = 0; i < 3; i++) await page.locator('[data-act="enrol-next"]').tap()
  const houses = await page.locator('[data-house-pick]').allTextContents()
  console.log('enrolment', houses.join(' | '))
  expect(houses.join(' ')).toContain('Wave')
  expect(houses.join(' ')).toContain('Goldrush')
  expect(houses.join(' ')).not.toMatch(/Thekwini|Braam/)
  for (let i = 0; i < 3; i++) await page.locator('[data-act="enrol-back"]').tap()
  // an old save in "Thekwini House"
  await enrolUI(page, { name: 'Ayanda', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(s.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    s.run.character.residence = 'Thekwini House'
    localStorage.setItem('mzansiville.v1', JSON.stringify(s))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&spawn=quad#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character.residence)
  expect(saved, 'the old save moved into Wave House').toBe('Wave House')
  for (let i = 0; i < 4 && !(await page.locator('.map-overlay [data-place]').first().isVisible()); i++) { await page.locator('#world .minimap').tap(); await page.waitForTimeout(1000) }
  const pins = (await page.locator('.map-overlay').textContent()) || ''
  expect(pins).toContain('Wave')
  expect(pins).toContain('Goldrush')
  expect(pins).not.toMatch(/Thekwini|Braam/)
  await page.goto('/?morning=0#/profile')
  await expect(page.locator('.pcard')).toContainText(/Wave House/i, { timeout: 20000 })
  const body = await page.locator('body').textContent()
  expect(body).not.toMatch(/Thekwini|Braam/)
})
