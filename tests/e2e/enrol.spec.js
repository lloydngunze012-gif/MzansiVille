// Enrolment (owner, 6 Nov): the start screen is one line and one button; then three
// quick screens (look, who you are, your vibe), each one question with big cards, a
// progress dot, Back and Skip; then your card, "This is what other students see", and
// Enter campus. Tapped through like a new player at phone size, under 45 seconds.
// Shots: docs/sprints/enrol/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/enrol'
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(180000)

test('start screen -> look -> who -> vibe -> card -> campus, under 45 s, by taps', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?morning=0#/')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true })) })
  await page.goto('/?morning=0#/')
  // The start screen: one line about UMzansi, one button.
  const foot = page.locator('.tc-foot')
  await expect(foot.locator('button')).toHaveCount(1)
  const line = await foot.locator('.tc-tag').textContent()
  await page.waitForTimeout(1300) // (it fades in)
  await page.screenshot({ path: `${OUT}/0-start.png` })
  let taps = 0
  const tap = async (loc) => { taps += 1; await loc.tap() }
  const t0 = Date.now()
  await tap(page.locator('[data-act="start"]'))
  if (await page.locator('#agree').isVisible().catch(() => false)) { await page.locator('#agree').check(); await tap(page.locator('[data-act="agree"]')) }

  // 1. Your look: the student fills the screen; a hair card.
  await expect(page.locator('.en[data-step="look"]')).toBeVisible()
  const stage = await page.locator('.en-stage').boundingBox()
  await expect(page.locator('.en-dots li.now')).toHaveCount(1)
  await tap(page.locator('[data-part="hair"]').nth(1))
  await page.waitForTimeout(2500) // (the 3D student dresses; its portrait is made for the card)
  await page.screenshot({ path: `${OUT}/1-look.png` })
  await tap(page.locator('[data-act="enrol-next"]'))

  // 2. Who you are: Next without a name says so; then name, house, where from.
  await expect(page.locator('.en[data-step="who"]')).toBeVisible()
  await tap(page.locator('[data-act="enrol-next"]'))
  const needName = await page.locator('.en-err').textContent()
  await page.locator('#name').fill('Thandeka')
  await tap(page.locator('[data-house-pick]').nth(4))
  await tap(page.locator('[data-k="from"][data-v="Durban"]'))
  await page.screenshot({ path: `${OUT}/2-who.png` })
  // Back keeps what you chose.
  await tap(page.locator('[data-act="enrol-back"]'))
  await expect(page.locator('.en[data-step="look"]')).toBeVisible()
  await tap(page.locator('[data-act="enrol-next"]'))
  await expect(page.locator('#name')).toHaveValue('Thandeka')
  const house = await page.locator('[data-house-pick][aria-pressed="true"] b').textContent()
  await tap(page.locator('[data-act="enrol-next"]'))

  // 3. Your vibe: three tags and a line (a suggestion, then typed with a phone number).
  await expect(page.locator('.en[data-step="vibe"]')).toBeVisible()
  await tap(page.locator('[data-pick="course"]').nth(0))
  await tap(page.locator('[data-pick="vibe"][data-v="Music head"]'))
  await tap(page.locator('[data-pick="looking"][data-v="Study buddy"]'))
  await tap(page.locator('.en-line').first())
  const suggested = await page.locator('#bio').inputValue()
  await page.locator('#bio').fill('Amapiano Fridays, call 082 555 1234')
  await page.screenshot({ path: `${OUT}/3-vibe.png` })
  await tap(page.locator('[data-act="enrol-next"]'))

  // 4. Your card, as others see it.
  await expect(page.locator('.en[data-step="card"]')).toBeVisible()
  await expect(page.locator('.en-q')).toHaveText('This is what other students see')
  const card = {
    name: await page.locator('.pcard .pc-name').textContent(),
    house: await page.locator('.pcard .pc-house').textContent(),
    bio: await page.locator('.pcard .pc-bio').textContent(),
    tags: await page.locator('.pcard .pc-tags li').allTextContents(),
    from: await page.locator('.en-from').textContent().catch(() => ''),
  }
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/4-card.png` })
  await tap(page.locator('[data-act="enrol-enter"]'))
  await page.waitForURL(/#\/(play|morning)/, { timeout: 20000 })
  const seconds = (Date.now() - t0) / 1000
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character)
  console.log('ENROL', JSON.stringify({ line, stage, needName, house, suggested, card, seconds: +seconds.toFixed(1), taps, run: { name: run.name, residence: run.residence, course: run.course, bio: run.bio, vibe: run.vibe, looking: run.looking, from: run.from } }, null, 1))

  expect(line.length, 'one line').toBeLessThan(110)
  expect(stage.height, 'the student fills the screen').toBeGreaterThan(915 * 0.4)
  expect(needName).toContain('name')
  expect(suggested.length).toBeGreaterThan(5)
  expect(card.name).toBe('Thandeka')
  expect(card.house.toLowerCase()).toContain(house.toLowerCase())
  expect(card.bio).toContain('Amapiano Fridays')
  expect(card.bio).not.toMatch(/082|555/)
  expect(card.tags.join(' ')).toContain('Music head')
  expect(card.tags.join(' ')).toContain('Study buddy')
  expect(card.from).toContain('Durban')
  expect(run).toMatchObject({ name: 'Thandeka', vibe: 'Music head', looking: 'Study buddy', from: 'Durban' })
  expect(seconds, 'under 45 seconds start to finish').toBeLessThan(45)
  expect(errors).toEqual([])
})

test('Skip all the way: a valid student anyway', async ({ page }) => {
  await page.goto('/?morning=0#/')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true })) })
  await page.goto('/?morning=0#/new')
  for (const step of ['look', 'who', 'vibe']) {
    await expect(page.locator(`.en[data-step="${step}"]`)).toBeVisible()
    await page.locator('[data-act="enrol-skip"]').tap()
  }
  await expect(page.locator('.en[data-step="card"]')).toBeVisible()
  await page.locator('[data-act="enrol-enter"]').tap()
  await page.waitForURL(/#\/(play|morning)/, { timeout: 20000 })
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character)
  expect(c.name.length).toBeGreaterThanOrEqual(2)
  expect(c.residence).toBeTruthy()
  expect(c.course).toBeTruthy()
})
