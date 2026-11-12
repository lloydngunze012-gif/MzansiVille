// Character in 3D (owner, 11 Nov, job D), in the quick project.
//   D1 The character screen: your own 3D student, turning slowly, on the look step AND in the card's photo on the
//      steps after it; it updates when the look changes; light (at most 1.5 device pixels per CSS pixel) and paused
//      when it is off screen; the roommate cards show head shots from the 3D characters, not the cartoon.
//   D2 The chat's avatars are head shots from the 3D character (a quick-start student's look: their ready portrait).
//   D3 A low-end phone profile (360 x 740, CPU 4x slower): the frame rate of the turning student, reported.
// Screenshots and the numbers at 390 px (not committed): docs/sprints/char3d/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/char3d'
test.setTimeout(240000)
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 }) }
const run = (page) => page.evaluate(() => window.mzansiStudioRun())
const frames = async (page, ms = 1500) => { const a = (await run(page)).frames; await page.waitForTimeout(ms); return (await run(page)).frames - a }

// (a new quick-start student, on campus with the top bar: the face-and-pencil button opens the character screen)
async function newStudent(page) {
  const errors = await atGate(page, { name: 'Lerato', preset: 'q-emma' })
  await expect(page.locator('.tb-me')).toBeVisible({ timeout: 30000 })
  return errors
}

test('D1 the character screen: the turning 3D student on every step, updated by picks, light, paused off screen; 3D roommate faces', async ({ page }) => {
  const errors = await newStudent(page)
  await page.locator('.tb-me').tap()
  const stage = page.locator('.en-look .cc-stage')
  await expect(stage).toHaveClass(/cc-has3d/, { timeout: 30000 })
  await expect(stage.locator('canvas.cc-3d')).toHaveCount(1)
  expect(await frames(page), 'the student is drawn, frame after frame').toBeGreaterThan(5)
  const r = await run(page)
  expect(r.ratio).toBeLessThanOrEqual(1.5)
  // turning slowly: about a tenth of a turn a second
  const a0 = (await page.evaluate(() => window.mzansiStudio())).angle
  await page.waitForTimeout(1000)
  const a1 = (await page.evaluate(() => window.mzansiStudio())).angle
  expect(Math.abs(a1 - a0)).toBeGreaterThan(0.2); expect(Math.abs(a1 - a0)).toBeLessThan(1.2)
  await shot(page, 'look-390')
  // a pick updates the student on the stage
  const before = await stage.getAttribute('data-look')
  await page.locator('.cc-chip[data-part="outfit"][aria-pressed="false"]').first().tap()
  await expect.poll(() => stage.getAttribute('data-look'), { timeout: 15000 }).not.toBe(before)
  // off screen: the frame loop stops; back on screen: it runs again
  await page.evaluate(() => { document.querySelector('.cc-stage').style.transform = 'translateY(-4000px)' })
  await expect.poll(async () => (await run(page)).inView, { timeout: 5000 }).toBe(false)
  await page.waitForTimeout(300)
  expect(await frames(page, 1000), 'paused off screen').toBe(0)
  await page.evaluate(() => { document.querySelector('.cc-stage').style.transform = '' })
  await expect.poll(async () => frames(page, 800), { timeout: 10000 }).toBeGreaterThan(3)
  // the next step (your roommate): the card's photo is the same turning student, smaller
  await page.locator('.en-more').tap()
  const mini = page.locator('.en-id .cc-mini')
  await expect(mini).toHaveClass(/cc-has3d/, { timeout: 30000 })
  await expect(mini.locator('canvas.cc-3d')).toHaveCount(1)
  expect(await frames(page)).toBeGreaterThan(5)
  // the four roommates: head shots from their 3D characters, not the cartoon
  await expect(page.locator('.en-roomie .en-rface img')).toHaveCount(4, { timeout: 60000 })
  await expect(page.locator('.en-roomie .en-rface svg')).toHaveCount(0)
  await shot(page, 'roommate-390')
  expect(errors).toEqual([])
})

test('D2 the chat avatars are head shots from the 3D character', async ({ page }) => {
  const server = await chatServer()
  const BONGA = { p_id: 'bonga-face-player-0001', p_secret: 'bonga-secret-0123456789abcdef' }
  // a look that is not one of the eight quick-start students: drawn from the 3D model
  await server.call('chat_sync', { ...BONGA, p_name: 'Bonga Dube', p_look: { gender: 'male', skin: 'deep', hair: 'fade', outfit: 'hoodie', body: 'regular', hairColor: '#1b1410' } })
  await server.routeChat(page)
  const errors = await atGate(page, { query: `&chat=1&room=test-faces-${Date.now().toString(36)}`, name: 'Ayanda', preset: 'q-priya' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const mine = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.presence')).id)
  const dm = (await server.call('chat_dm', { ...BONGA, p_other: mine })).body.thread
  await server.call('chat_send', { ...BONGA, p_thread: dm, p_body: 'Howzit!' })
  await page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
  await page.locator('.tb-chat').tap()
  const row = page.locator('.cht-sheet .cht-av').filter({ has: page.locator('[data-f3d]') }).first()
  await expect(row.locator('img')).toHaveCount(1, { timeout: 60000 })
  expect(await row.locator('img').getAttribute('src')).toMatch(/^data:image\/png/)
  await page.locator('.cht-sheet [data-thread]').filter({ hasText: 'Bonga' }).first().tap()
  await expect(page.locator('.cht-sheet .cht-back + .cht-av img')).toHaveCount(1, { timeout: 30000 }) // (the thread's header)
  await shot(page, 'chat-390')
  expect(errors).toEqual([])
})

test('D3 a low-end phone profile: the turning student at 4x CPU slowdown, measured', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await newStudent(page)
  await page.locator('.tb-me').tap()
  await expect(page.locator('.en-look .cc-stage')).toHaveClass(/cc-has3d/, { timeout: 30000 })
  await page.waitForTimeout(1500)
  const measure = () => page.evaluate(() => new Promise((done) => {
    const times = []
    let t0 = 0
    const step = (t) => { if (!t0) t0 = t; times.push(t); if (t - t0 < 5000) requestAnimationFrame(step); else done(times) }
    requestAnimationFrame(step)
  }))
  const stats = (times) => {
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
    const secs = (times.at(-1) - times[0]) / 1000
    return { fps: +(gaps.length / secs).toFixed(1), median_ms: +gaps[Math.floor(gaps.length / 2)].toFixed(1), p95_ms: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) }
  }
  const normal = stats(await measure())
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const slow = stats(await measure())
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const report = { screen: '360x740 at 2x', canvas: await run(page), normal, cpu4x: slow }
  console.log('CHARACTER 3D', JSON.stringify(report))
  fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(report, null, 2))
  expect(slow.fps, 'still moves smoothly enough on a slow phone').toBeGreaterThan(20)
})
