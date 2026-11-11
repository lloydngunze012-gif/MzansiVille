// Cast, roommates and home country (owner, 9 Nov; docs/cast.md). Tapped through at phone size (390 px):
//   - the default roommate follows your res and your skin (a woman with deep skin gets Zoe; a man with fair skin, Ethan)
//   - the pick sticks (Ravi, after a reload) and the roommate at your door is the one you chose
//   - Nigeria: the roommate's welcome at the drop-off (one line), and the flag on your card
//   - an old save (no country, the old roommate ids) gets the "Where are you from?" step once, then never again
// Screenshots (on the PC, not committed): docs/sprints/cast-roommates/.
// Run: npx playwright test tests/e2e/cast-country.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/cast-roommates'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(300000)

const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')))

// (morning=0 skips the day-1 home scene; the Nigeria test plays it)
async function fresh(page, query = '&morning=0') {
  await page.goto(`/?fast=1${query}#/new`)
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true })) })
  await page.goto(`/?fast=1${query}#/new`)
}

test('the default roommate: same res, the skin closest to yours', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  // A woman with deep skin: Zoe, with the pool of four for the women's res.
  await fresh(page)
  await page.locator('[data-act="avatar"][data-part="skin"][data-id="deep"]').tap()
  // The country is a dropdown on the first page: South Africa selected, African countries first (alphabetical),
  // then the rest of the world (alphabetical), a flag emoji before each name, no "Other", no intro line.
  const pick = page.locator('select[data-country]')
  await expect(pick).toHaveValue('South Africa')
  await expect(page.locator('.en-ctyrow h3')).toHaveText('Where are you from?')
  await expect(page.locator('.en-lede')).toHaveCount(0)
  const opts = await pick.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent, g: o.parentElement.label })))
  expect(opts.length).toBeGreaterThan(190)
  expect(opts.some((o) => o.v === 'Other')).toBe(false)
  expect(opts.every((o) => /^[\u{1F1E6}-\u{1F1FF}]{2} /u.test(o.t))).toBe(true)
  const africa = opts.filter((o) => o.g === 'Africa').map((o) => o.v)
  const world = opts.filter((o) => o.g === 'Rest of the world').map((o) => o.v)
  // (V2.1, 11 Nov: seven countries first, in this order; they are in their own groups below too)
  const first = opts.filter((o) => o.g === 'Most picked').map((o) => o.v)
  expect(first).toEqual(['United States', 'South Africa', 'United Kingdom', 'Australia', 'Nigeria', 'India', 'China'])
  expect(opts.slice(0, 7).map((o) => o.v)).toEqual(first)
  expect(first.length + africa.length + world.length).toBe(opts.length)
  expect(africa.slice(0, 2)).toEqual(['South Africa', 'Algeria'])
  expect(africa).toContain('Nigeria')
  expect(world).toContain('United Kingdom')
  expect(africa.slice(1)).toEqual([...africa.slice(1)].sort((a, b) => a.localeCompare(b, 'en')))
  expect(world).toEqual([...world].sort((a, b) => a.localeCompare(b, 'en')))
  expect(opts.findIndex((o) => o.g === 'Rest of the world')).toBeGreaterThan(opts.findIndex((o) => o.v === 'Zimbabwe'))
  // The pill is as big as the dropdowns on the who step and sits inside the screen at 390 px.
  const box = await page.locator('[data-country-pick]').boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(48)
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/enrol-first-page-390.png` })
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('.en[data-step="roommate"]').waitFor()
  await expect(page.locator('.en-roomie')).toHaveCount(4)
  await expect(page.locator('.en-roomie b')).toHaveText(['Zoe', 'Megan', 'Jade', 'Anisha'])
  await expect(page.locator('.en-roomie[aria-pressed="true"]')).toHaveAttribute('data-roommate', 'zoe')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/roommate-step-390.png` })
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('#name').fill('Thandeka')
  await page.locator('[data-house-pick]').first().tap()
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('[data-act="enrol-skip"]').tap()
  await page.locator('[data-act="enrol-enter"]').tap()
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
  let s = await save(page)
  expect(s.run.character).toMatchObject({ country: 'South Africa', roommate: 'zoe' })
  expect(s.run.bestieName).toBe('Zoe')

  // A man with fair skin: Ethan, from the men's res.
  await fresh(page)
  await enrolUI(page, { name: 'Lethabo', house: 1, course: 1, gender: 'male', skin: 'fair' })
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
  s = await save(page)
  expect(s.run.character).toMatchObject({ roommate: 'ethan' })
  expect(s.run.bestieName).toBe('Ethan')
})

test('the roommate you pick sticks after a reload (Ravi)', async ({ page }) => {
  await fresh(page)
  await page.locator('[data-act="avatar"][data-part="gender"][data-id="male"]').tap()
  await page.locator('[data-act="avatar"][data-part="skin"][data-id="fair"]').tap()
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('.en[data-step="roommate"]').waitFor()
  await expect(page.locator('.en-roomie b')).toHaveText(['Ethan', 'Marcus', 'Ryan', 'Ravi'])
  await expect(page.locator('.en-roomie[aria-pressed="true"]')).toHaveAttribute('data-roommate', 'ethan')
  await page.locator('[data-roommate="ravi"]').tap()
  await expect(page.locator('.en-roomie[aria-pressed="true"]')).toHaveAttribute('data-roommate', 'ravi')
  // (back and forward keeps it)
  await page.locator('[data-act="enrol-back"]').tap()
  await page.locator('[data-act="enrol-next"]').tap()
  await expect(page.locator('.en-roomie[aria-pressed="true"]')).toHaveAttribute('data-roommate', 'ravi')
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('#name').fill('Lethabo')
  await page.locator('[data-house-pick]').first().tap()
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('[data-act="enrol-skip"]').tap()
  await page.locator('[data-act="enrol-enter"]').tap()
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
  await page.goto('/?fast=1&morning=0&again=1#/')
  let s = await save(page)
  expect(s.run.character.roommate).toBe('ravi')
  expect(s.run.bestieName).toBe('Ravi')
  // (Edit your student: the creator opens on the same roommate)
  await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('mzansiville.v1')); v.run.countryAsked = true; localStorage.setItem('mzansiville.v1', JSON.stringify(v)) })
  await page.goto('/?fast=1&morning=0&again=2#/profile')
  await page.waitForTimeout(500)
  s = await save(page)
  expect(s.run.character.roommate, 'still Ravi').toBe('ravi')
})

test('Nigeria: the roommate you chose welcomes you at the drop-off, and your card shows the flag', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await fresh(page, '&talk=auto')
  await enrolUI(page, { name: 'Lethabo', house: 1, course: 1, gender: 'male', skin: 'fair', country: 'Nigeria', roommate: 'ravi' })
  const s = await save(page)
  expect(s.run.character).toMatchObject({ country: 'Nigeria', roommate: 'ravi', from: 'Nigeria' })
  await expect(page).toHaveURL(/#\/morning/)
  const host = page.locator('#home3d')
  await expect(host).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  const atStep = (st) => expect(host).toHaveAttribute('data-step', st, { timeout: 60000 })
  const go = () => page.locator('#home-ui .mm-bar:not([hidden]) .mm-go').first().tap()
  await atStep('window'); await go()
  await atStep('stairs'); await go()
  await atStep('breakfast'); await go()
  await expect(host).toHaveAttribute('data-seated', '1', { timeout: 30000 })
  await expect(page.locator('#home-ui .mm-choice')).toHaveCount(3, { timeout: 30000 })
  await page.locator('#home-ui .mm-choice').nth(1).tap()
  await atStep('bags'); await go()
  await atStep('door'); await go()
  await atStep('yard'); await go()
  await expect(page).toHaveURL(/#\/play/, { timeout: 90000 })
  const world = page.locator('#world')
  await page.evaluate(() => {
    window.__dpLines = []
    new MutationObserver(() => { const t = document.querySelector('.dp-line')?.textContent; if (t && !window.__dpLines.includes(t)) window.__dpLines.push(t) }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  await expect(world).toHaveAttribute('data-dropoff', 'walk', { timeout: 90000 })
  await page.locator('.dp-walk').tap()
  await expect(world).toHaveAttribute('data-dropoff', 'door', { timeout: 90000 })
  // The roommate's own line, then one welcome about Nigeria.
  await expect.poll(() => page.evaluate(() => window.__dpLines.join(' | ')), { timeout: 30000 }).toContain('All the way from Nigeria')
  await expect(page.locator('.dp-line')).toContainText('Nigeria', { timeout: 5000 }).catch(() => {})
  await page.screenshot({ path: `${OUT}/dropoff-nigeria-390.png` })
  const lines = await page.evaluate(() => window.__dpLines)
  expect(lines.some((l) => l.includes("I'm Ravi"))).toBe(true)
  expect(lines.filter((l) => /All the way from Nigeria/.test(l))).toHaveLength(1)
  await expect(world).toHaveAttribute('data-dropoff', 'done', { timeout: 30000 })
  expect((await save(page)).run.bestieName).toBe('Ravi')
  // The flag on your card (Profile)
  await page.goto('/?fast=1&morning=0&card=1#/profile')
  await expect(page.locator('.pc-from')).toContainText('Nigeria', { timeout: 20000 })
  await expect(page.locator('.pc-from svg.flag')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('an old save is asked where it is from once, and its roommate and cast follow the renames', async ({ page }) => {
  await fresh(page)
  await enrolUI(page, { name: 'Lethabo', house: 1, course: 1, gender: 'male', skin: 'fair' })
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
  // Make it an old save: no country, no roommate, the first roommate as it was, an old friend and crush.
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('mzansiville.v1'))
    delete v.run.character.country
    delete v.run.character.roommate
    delete v.run.countryAsked
    v.run.bestieName = 'Sipho'
    v.run.people = { sipho: { chats: 2, close: 18 }, kea: { chats: 1, close: 4 } }
    v.run.crush = { id: 'kabelo', name: 'Kabelo', romance: true, met: null, nameKnown: false, closeness: 0 }
    localStorage.setItem('mzansiville.v1', JSON.stringify(v))
  })
  await page.goto('/?fast=1&morning=0&old=1#/play')
  await expect(page.locator('.en[data-country-only="1"]')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('select[data-country]')).toHaveValue('South Africa')
  await page.screenshot({ path: `${OUT}/old-save-country-390.png` })
  await page.locator('[data-act="enrol-country-save"]').tap()
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
  let s = await save(page)
  expect(s.run.character).toMatchObject({ country: 'South Africa', roommate: 'ethan' })
  expect(s.run.bestieName).toBe('Ethan')
  expect(Object.keys(s.run.people).sort()).toEqual(['ethan', 'kayla'])
  expect(s.run.people.ethan.close).toBe(18)
  expect(s.run.crush).toMatchObject({ id: 'daniel', name: 'Daniel' })
  // Never again.
  await page.goto('/?fast=1&morning=0&old=2#/play')
  await page.waitForTimeout(2500)
  await expect(page.locator('.en[data-country-only="1"]')).toHaveCount(0)
  await page.goto('/?fast=1&morning=0&old=3#/play')
  await page.waitForTimeout(1500)
  await expect(page.locator('.en')).toHaveCount(0)
  s = await save(page)
  expect(s.run.countryAsked).toBe(true)
})

// The new classmates from abroad (docs/cast.md, 9 Nov): friendly lines, and their home country as a small flag
// by the name. Grace (Kenya) and Tendai (Zimbabwe) sit on the Quad's benches.
test('the international students talk, with a flag by their name', async ({ page }) => {
  await fresh(page)
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(v.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(v))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?fast=1&morning=0&intl=1&spawn=quad#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  for (const [id, country, who] of [['grace', 'Kenya', 'Grace Wanjiru'], ['tendai', 'Zimbabwe', 'Tendai Moyo']]) {
    // (they sit on different benches: stand in front of them, as a player who walked over would, then talk)
    await expect.poll(() => page.evaluate((p) => Boolean(window.mzansiPersonPos(p)), id), { timeout: 20000 }).toBe(true)
    await page.evaluate((p) => {
      const a = window.mzansiPersonPos(p)
      window.mzansiPlace(a.x + Math.sin(a.rot) * 1.4, a.z + Math.cos(a.rot) * 1.4, a.x, a.z)
    }, id)
    await page.waitForTimeout(600)
    await page.evaluate((p) => window.mzansiTalkTo(p), id)
    const card = page.locator('.g-talk')
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toHaveAttribute('data-talk', id)
    await expect(card.locator('h2')).toContainText(who)
    await expect(card.locator('.g-talk-flag')).toHaveAttribute('title', country)
    await expect(card.locator('.g-talk-flag svg.flag')).toHaveCount(1)
    await page.screenshot({ path: `${OUT}/intl-${id}-390.png` })
    await card.locator('[data-act="talk-bye"]').tap()
    await expect(card).toHaveCount(0)
    await page.waitForTimeout(800)
  }
})
