// C4: a curvy student still walks and sits properly (the reshaping touches the outfit
// mesh only, not the skeleton): she walks to a tapped spot, sits on the SMIG steps with
// her seat on the step (no more than 3 cm in), and stands up. Real GPU.
import { test, expect } from '@playwright/test'
import { PHONE, finger, groundAhead, student, tapOn, read, dist } from '../basics/touch.js'

test.use(PHONE)
test.setTimeout(300000)

for (const outfit of ['hoodie', 'dress']) {
  test(`C4: a curvy student in a ${outfit} walks and sits`, async ({ page }) => {
    await student(page, { spawn: 'smig', gender: 'female', avatar: { body: 'curvy', outfit } })
    const f = await finger(page)
    // walk
    const a = await read.pos(page)
    await tapOn(page, f, page.locator('[data-act="view"][data-mode="top"]'))
    await page.waitForTimeout(1200)
    const spot = await groundAhead(page, 6)
    expect(spot).toBeTruthy()
    await f.tap(spot.s.x, spot.s.y)
    await expect.poll(async () => dist(await read.pos(page), a), { timeout: 20000 }).toBeGreaterThan(2)
    // sit on the steps
    const pin = page.locator('.map-pin[data-place="smig"]')
    for (let i = 0; i < 4 && !(await pin.isVisible()); i++) { await tapOn(page, f, page.locator('.minimap')); await page.waitForTimeout(1000) }
    await tapOn(page, f, pin)
    await expect(page.locator('.g-sheet')).toBeVisible({ timeout: 40000 })
    await tapOn(page, f, page.locator('.g-sheet [data-act="do"][data-id="smig_steps"]'))
    await expect.poll(() => page.evaluate(() => window.mzansiPlayerData().phase), { timeout: 60000 }).toBe('seated')
    await page.waitForTimeout(300)
    const rows = await page.evaluate(() => window.mzansiSeats().filter((r) => r.id === 'player'))
    console.log(outfit, JSON.stringify(rows))
    expect(rows.length).toBe(1)
    expect(rows[0].gap === null || rows[0].gap >= -0.03, 'seat of the trousers no more than 3 cm into the step').toBe(true)
    await page.screenshot({ path: `docs/sprints/creator-studio/curvy-seated-${outfit}.png` })
    await tapOn(page, f, page.locator('.ps-leave'))
    await expect.poll(() => page.evaluate(() => window.mzansiPlayerData().phase), { timeout: 10000 }).toBe('up')
  })
}
