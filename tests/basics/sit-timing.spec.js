// K16 (owner, 4 Nov): "the getting up and sitting down is too slow". How long sitting
// down and standing up take, frame by frame, at normal speed: lunch on the SMIG steps
// (walk up, step in front of the seat, turn round, lower), then Stand up. Touch only;
// the sit phase (avatar3d: turn, lower, seated, rise, up) is only READ, and times run
// from the real click on the button, recorded in the page.
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, read, saveVideo, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(300000)

test('K16 sitting down and standing up: how long each takes', async ({ page }) => {
  await student(page, { spawn: 'smig' })
  const f = await finger(page)
  await page.evaluate(() => {
    const log = []
    const k = { log, clicks: {} }
    window.__k16 = k
    // (when the finger actually hit each button)
    document.addEventListener('click', (e) => {
      if (e.target.closest?.('[data-id="smig_steps"]')) k.clicks.sit = performance.now()
      if (e.target.closest?.('.ps-leave')) k.clicks.stand = performance.now()
    }, true)
    const tick = () => {
      const d = window.mzansiPlayerData()
      log.push({ t: performance.now(), phase: d?.phase || '', pose: d?.pose || '', move: Boolean(d?.move) })
      if (log.length < 30000) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  // The minimap opens the map (tap again if the first tap came too soon), then SMIG.
  const pin = page.locator('.map-pin[data-place="smig"]')
  for (let i = 0; i < 4 && !(await pin.isVisible()); i++) {
    await tapOn(page, f, page.locator('.minimap'))
    await page.waitForTimeout(1000)
  }
  await tapOn(page, f, pin)
  await expect(page.locator('.g-sheet')).toBeVisible({ timeout: 40000 })
  await tapOn(page, f, page.locator('.g-sheet [data-act="do"][data-id="smig_steps"]'))
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerData().phase), { timeout: 60000 }).toBe('seated')
  // (straight away: lunch on the steps lasts only a few seconds)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/K16-seated.png` })
  const leave = page.locator('.ps-leave')
  await expect(leave).toHaveText('Stand up')
  const b = await leave.boundingBox()
  await f.tap(b.x + b.width / 2, b.y + b.height / 2)
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerData().phase), { timeout: 10000 }).toBe('up')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/K16-stood.png` })
  const r = await page.evaluate(() => {
    const { log, clicks } = window.__k16
    const first = (from, fn) => log.find((e) => e.t >= from && fn(e))?.t
    const turn = first(clicks.sit, (e) => e.phase === 'turn')
    const lower = first(turn, (e) => e.phase === 'lower')
    const seated = first(lower, (e) => e.phase === 'seated')
    const rise = first(clicks.stand, (e) => e.phase === 'rise')
    const up = first(rise, (e) => e.phase === 'up')
    const ms = (a, b) => (a && b ? Math.round(b - a) : null)
    return { tapToSeated: ms(clicks.sit, seated), turn: ms(turn, lower), lower: ms(lower, seated), sitDown: ms(turn, seated), tapToRise: ms(clicks.stand, rise), rise: ms(rise, up), tapToStanding: ms(clicks.stand, up) }
  })
  console.log('K16', JSON.stringify(r))
  expect(r.sitDown, 'the sit-down played (turn and lower)').toBeGreaterThan(0)
  expect(r.rise, 'the stand-up played').toBeGreaterThan(0)
  await saveVideo(page, 'K16-sit-stand')
})
