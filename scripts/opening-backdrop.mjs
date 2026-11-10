// The opening page's backdrop (owner, 10 Nov): one golden-hour still of the real SunnyBay,
// rendered from the game itself (not drawn by hand). Run with the dev server up:
//   npm run dev -- --host 127.0.0.1 --port 5173   (in one terminal)
//   node scripts/opening-backdrop.mjs             (in another)
// Writes public/opening-bg-1600.webp and public/opening-bg-900.webp (sharp does the WebP pass).
// Not a test: a one-off asset job, like scripts/app-icons.mjs.
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const BASE = 'http://127.0.0.1:5173'
const W = 1600, H = 900

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

// A brand-new phone, playing one of the nicer-looking presets, straight into a save.
await page.goto(`${BASE}/?fast=1&enrol=quick&morning=0#/new`)
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload()
await page.locator('[data-preset="q-amy"]').click()
await page.locator('#name').fill('Amy')
await page.locator('[data-act="qs-play"]').click()
await page.waitForURL(/#\/play/, { timeout: 30000 })

// Stand them in SunnyBay's Town centre, on the street past the library, bank and Lifecup.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
  Object.assign(s.run, { cityAt: { x: -20, z: 150 }, morningDone: true, resMorningDone: true, queue: [], phase: 'social', minutes: 18 * 60, lectureResolved: true, lectureRoute: false })
  localStorage.setItem('mzansiville.v1', JSON.stringify(s))
  localStorage.setItem('mzansiville.mapHint', '1')
})
await page.goto(`${BASE}/?fast=1&morning=0&hour=18#/play`)
await page.locator('#city3d[data-ready="1"]').waitFor({ timeout: 60000 })
await page.waitForTimeout(600) // (a card at the house door, if any, settles)

// A wide 3/4 establishing shot down the street, warm light, no HUD.
await page.evaluate(() => {
  document.getElementById('city-ui')?.setAttribute('hidden', '')
  document.querySelectorAll('.g-hud, .g-menu, .g-scrim').forEach((el) => { el.style.visibility = 'hidden' })
  window.mzansiCity.teleport(60, -40) // (out of frame: a clean street, nobody in it)
  window.mzansiCity.shot([-15, 19, 70], [-15, 0, 190], 560)
})
await page.waitForTimeout(500)

const png = await page.screenshot({ type: 'png' })
await browser.close()

for (const [name, width] of [['opening-bg-1600', 1600], ['opening-bg-900', 900]]) {
  const out = `public/${name}.webp`
  const i = await sharp(png).resize(width).webp({ quality: width > 1200 ? 72 : 68 }).toFile(out)
  console.log(name, `${i.width}x${i.height}`, `${(i.size / 1024).toFixed(1)} kB`)
}
