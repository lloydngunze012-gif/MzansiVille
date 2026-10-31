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

// Tap a person where they are on screen (like a player), else start the chat directly.
async function tapPerson(page, id) {
  const at = await page.evaluate((who) => window.mzansiPersonOnScreen(who), id)
  const ok = at && !at.behind && at.x > 20 && at.x < 392 && at.y > 300 && at.y < 780
  if (ok) await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(600)
  const started = await page.evaluate(() => Boolean(document.getElementById('world').dataset.talking))
  if (!ok || !started) await page.evaluate((who) => window.mzansiTalkTo(who), id)
}

// Side view of a seated body (campus camera), then its measurements.
async function sideOf(page, body, name, scene = 'campus') {
  const a = Math.atan2(1, 0) // 90 degrees: square to the body
  const view = await page.evaluate(([b, sc]) => window.mzansiBodies(sc).find((x) => x.id === b), [body, scene])
  const rot = scene === 'campus' ? await page.evaluate((id) => (id === 'player' ? null : window.mzansiPersonPos(id)?.rot), body) : null
  if (scene === 'campus') {
    const r = rot ?? (await page.evaluate(() => window.mzansiPlayerRot?.() ?? 0))
    const s = Math.sin(r + a)
    const c = Math.cos(r + a)
    await page.evaluate(([v, s, c]) => window.mzansiCam([v.x + s * 2.4, v.y + 0.75, v.z + c * 2.4], [v.x, v.y + 0.25, v.z]), [view, s, c])
    await page.waitForTimeout(1600)
  }
  await page.screenshot({ path: `${OUT}/${name}.png` })
  return view
}

const playerBody = (page) => page.evaluate(() => window.mzansiBodies('campus').find((b) => b.id === 'player'))

function expectSeated(b, what) {
  console.log(what, JSON.stringify({ id: b.id, seat: b.y, seatGap: b.seatGap, footGap: b.footGap, sole: b.sole, fit: b.fit, clip: b.walking, hips: b.hips }))
  expect(b.pose, what).toBe('sit')
  expect(Math.abs(b.seatGap), `${what}: hips on the seat`).toBeLessThan(CM)
  expect(Math.abs(b.footGap), `${what}: feet on the floor`).toBeLessThan(0.05)
}

test('M2a sit on a Quad bench (Sit with them)', async ({ page }) => {
  await campus(page, 'quad', '&a=21')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="sit"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(800)
  expectSeated(await playerBody(page), 'player on a Quad bench')
  await page.screenshot({ path: `${OUT}/M2-quad-bench.png` })
  await sideOf(page, 'player', 'M2-quad-bench-side')
  for (const b of (await bodies(page)).filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} seated on the Quad`)
  await saveVideo(page, 'M2-quad-bench')
})

test('M2b sit on a cafeteria chair (queue at Auntie Pinky, sit and eat)', async ({ page }) => {
  await campus(page, 'cafeteria', '&a=22')
  await tapPerson(page, 'auntie_pinky')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 120000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(800)
  expectSeated(await playerBody(page), 'player on a caf chair')
  await page.screenshot({ path: `${OUT}/M2-caf-chair.png` })
  await sideOf(page, 'player', 'M2-caf-chair-side')
  for (const b of (await bodies(page)).filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} seated at the caf`)
  await saveVideo(page, 'M2-caf-chair')
})

test('M2c sit on a library chair (Let\'s study)', async ({ page }) => {
  await campus(page, 'quad', '&a=23')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="study"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 90000 }).toBe('sit')
  await page.waitForTimeout(800)
  expectSeated(await playerBody(page), 'player on a library chair')
  await page.screenshot({ path: `${OUT}/M2-library-chair.png` })
  const all = await bodies(page)
  for (const b of all.filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} seated in the library`)
  await saveVideo(page, 'M2-library-chair')
})

test('M2d sit on a lecture bench (day 1 lecture)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { phase: 'lecture', minutes: 8 * 60 + 45, morningDone: true, queue: [], lectureResolved: false, lectureRoute: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&lecture=1&talk=auto#/lecture')
  const host = page.locator('#lecture3d')
  await expect(host).toHaveAttribute('data-step', 'seat', { timeout: 90000 })
  await page.locator('[data-lc="choice"]').nth(2).tap()
  await expect.poll(() => page.evaluate(() => window.mzansiBodies('lecture').find((b) => b.id === 'player')?.pose), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/M2-lecture-bench.png` })
  const all = await page.evaluate(() => window.mzansiBodies('lecture'))
  for (const b of all.filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} on a lecture bench`)
  await saveVideo(page, 'M2-lecture-bench')
})

function expectLying(b, what) {
  console.log(what, JSON.stringify({ id: b.id, y: b.y, bedGap: b.bedGap, low: b.low, hips: b.hips }))
  expect(b.pose, what).toBe('lie')
  expect(Math.abs(b.bedGap), `${what}: on top of the mattress, not in it`).toBeLessThan(CM)
}

test('M3 night in res: into bed, sleep, get up next morning', async ({ page }) => {
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
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'night', minutes: 22 * 60, lectureResolved: true, eventSeen: true, dailyEventId: null })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&m=3#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.locator('.g-cta [data-act="place-open"]').tap()
  await page.locator('[data-act="do"][data-id="sleep"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'sleep', { timeout: 10000 })
  // Getting in: sit on the edge first, then lie back.
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000, intervals: [50] }).toBe('sit')
  await page.waitForTimeout(150)
  expectSeated(await playerBody(page), 'player on the bed edge')
  await page.screenshot({ path: `${OUT}/M3-1-edge.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('lie')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/M3-2-lying-back.png` })
  await page.waitForTimeout(1200)
  expectLying(await playerBody(page), 'player in bed')
  await page.screenshot({ path: `${OUT}/M3-3-in-bed.png` })
  await expect.poll(async () => {
    if (await page.getByRole('button', { name: /Start day 2/ }).first().isVisible()) return true
    const next = page.locator('.g-result button[data-act="dismiss"], [data-screen-card] button[data-act="dismiss"]').first()
    if (await next.isVisible()) await next.tap({ timeout: 2000 }).catch(() => {})
    return false
  }, { timeout: 90000, intervals: [1500] }).toBe(true)
  await page.getByRole('button', { name: /Start day 2/ }).tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'wakeUp', { timeout: 20000 })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('lie')
  await page.waitForTimeout(1200)
  expectLying(await playerBody(page), 'player waking in bed')
  await page.screenshot({ path: `${OUT}/M3-4-waking.png` })
  await page.waitForTimeout(1300)
  await page.screenshot({ path: `${OUT}/M3-5-getting-up.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000, intervals: [50] }).toBe('sit')
  await page.waitForTimeout(200)
  expectSeated(await playerBody(page), 'player sitting up on the bed edge')
  await page.screenshot({ path: `${OUT}/M3-6-sitting-up.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('stand')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/M3-7-up.png` })
  await saveVideo(page, 'M3-bed')
})

test('M3b day 1 morning: on the mattress, then a natural get-up', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await expect(page).toHaveURL(/#\/morning/)
  // Back to normal speed for the get-up itself.
  await page.goto('/?roommate=1&latebus=0&snooze=0&talk=auto#/morning')
  await expect(page.locator('#morning3d')).toHaveAttribute('data-step', /greet|wake/, { timeout: 45000 })
  await page.waitForTimeout(2500)
  expectLying((await page.evaluate(() => window.mzansiBodies('morning'))).find((b) => b.id === 'player'), 'player in bed (morning)')
  await page.screenshot({ path: `${OUT}/M3b-1-in-bed.png` })
  await expect(page.locator('#morning3d')).toHaveAttribute('data-wakeup', 'sit', { timeout: 60000 })
  await page.waitForTimeout(300)
  expectSeated((await page.evaluate(() => window.mzansiBodies('morning'))).find((b) => b.id === 'player'), 'player on the bed edge (morning)')
  await page.screenshot({ path: `${OUT}/M3b-2-sitting-up.png` })
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${OUT}/M3b-3-up.png` })
  await saveVideo(page, 'M3b-morning')
})
