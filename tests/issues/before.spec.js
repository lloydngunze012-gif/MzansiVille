// Lloyd's phone play-through, 7 Nov: screenshots of each issue, TAG=before|after, at 390x844 and
// 360x740, real GPU. Not committed (docs/sprints/play-fixes/).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { PHONE, student } from '../basics/touch.js'

const OUT = 'docs/sprints/play-fixes'
const TAG = process.env.TAG || 'before'
fs.mkdirSync(OUT, { recursive: true })

const w = Number(process.env.W || 390)
const h = Number(process.env.H || 844)
test.use({ ...PHONE, viewport: { width: w, height: h }, video: 'off' })
test.setTimeout(300000)
for (const [spawn, name] of [['gate', 'gate'], ['quad', 'quad']]) {
  test(`${TAG} ${name} ${w}`, async ({ page }) => {
    await student(page, { spawn })
    for (const mode of ['top', 'sims', 'eye']) {
      await page.locator(`[data-act="view"][data-mode="${mode}"]`).tap({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${OUT}/${TAG}-${name}-${mode}-${w}.png` })
    }
    const fps = await page.locator('#world').getAttribute('data-fps')
    console.log(`FPS ${name} ${w}: ${fps}`)
  })
}
