// The cast's hair colours on campus (Mam' Gugu purple, Auntie Pinky pink, Zanele yellow) with the new
// hair shading, as the game's own camera sees them. Screenshots: docs/sprints/creator-studio/ (not committed).
import { test } from '@playwright/test'
import { PHONE, student } from '../basics/touch.js'

const OUT = 'docs/sprints/creator-studio'
test.use(PHONE)
test.setTimeout(400000)
for (const [spawn, shot, who] of [['quad', 'cast-quad', 'mam_gugu'], ['cafeteria', 'cast-cafeteria', 'auntie_pinky'], ['quad', 'cast-quad-zanele', 'zanele']]) {
  test(`${shot}`, async ({ page }) => {
    await student(page, { spawn })
    // walk up to her (Top view: tap where she stands), then the game's closer cameras
    await page.locator('[data-act="view"][data-mode="top"]').tap({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(1600)
    const p = await page.evaluate((id) => window.mzansiPersonOnScreen?.(id) || null, who)
    console.log(shot, who, JSON.stringify(p))
    if (p && !p.behind && p.x > 20 && p.x < 392 && p.y > 150 && p.y < 760) await page.touchscreen.tap(p.x, p.y)
    await page.waitForTimeout(14000)
    await page.locator('[data-act="view"][data-mode="sims"]').tap({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${OUT}/${shot}.png` })
  })
}

