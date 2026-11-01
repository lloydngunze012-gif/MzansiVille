// Motion round 2 finish line (M1-M7) at 412x915 and normal speed. Bodies are
// recorded every rendered frame (window.mzansiRecord) and measured from their
// skinned vertices; every journey saves a video and screenshots in docs/sprints/motion2/.
// One worker: the checks time real motion.
// npx playwright test tests/e2e/motion2.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/motion2'
test.use({ viewport: { width: 412, height: 915 }, video: { mode: 'on', size: { width: 412, height: 915 } } })
test.describe.configure({ timeout: 300000 })

// A new student on campus at 13:00, after the morning and the lecture.
async function campus(page, spawn, extra = '', run = {}) {
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
  await page.evaluate((r) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, r)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, run)
  await page.goto(`/?morning=0&spawn=${spawn}${extra}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  let n = -1
  await expect.poll(async () => { const m = await page.evaluate(() => window.mzansiBodies('campus').length); const done = m === n && m > 0; n = m; return done }, { timeout: 60000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1500)
}

async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const DEG = 180 / Math.PI

// Sideways sliding from consecutive frames: the angle between each step and the way
// the body faces. Only real walking counts (faster than 0.3 m/s).
function crabs(frames, id) {
  const out = []
  const last = new Map()
  for (const f of frames) {
    for (const p of f.people) {
      if (id && p.id !== id) continue
      const key = p.id + (p.id === 'extra' ? `${Math.round(p.x)}` : '')
      const prev = last.get(p.id)
      last.set(p.id, { ...p, t: f.t })
      if (!prev || p.pose === 'sit' || p.pose === 'lie' || key === undefined) continue
      const dx = p.x - prev.x
      const dz = p.z - prev.z
      const dist = Math.hypot(dx, dz)
      const dt = (f.t - prev.t) / 1000
      if (dt <= 0 || dist > 1 || dist / dt < 0.3 || dist < 0.004) continue
      const step = Math.atan2(dx, dz)
      // The body as drawn at the end of the step (headless renders ~6 frames a second,
      // so each frame turns as much as ten phone frames; the step is judged on arrival).
      const facing = p.yaw
      out.push({ id: p.id, deg: Math.abs(wrap(step - facing)) * DEG, speed: dist / dt })
    }
  }
  return out
}

export { campus, saveVideo, crabs, wrap, DEG, OUT }

test('M1 zig-zag across the Quad: no sideways sliding', async ({ page }) => {
  await campus(page, 'quad')
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', every: 0 }))
  // Sharp zig-zag with the stick: 120-degree swings, then a full reverse.
  const legs = [[0.87, 0.5], [-0.87, 0.5], [0.87, 0.5], [-0.87, 0.5], [0, -1], [1, 0], [-1, 0], [0.5, 0.87]]
  let i = 0
  for (const [x, z] of legs) {
    await page.evaluate(([a, b]) => window.mzansiSteer(a, b), [x, z])
    await page.waitForTimeout(2600)
    if (i++ === 3) await page.screenshot({ path: `${OUT}/M1-1.png` })
  }
  await page.evaluate(() => window.mzansiSteer(0, 0))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/M1-2.png` })
  const frames = await page.evaluate(() => window.mzansiRecordStop())
  const all = crabs(frames)
  const player = all.filter((c) => c.id === 'player')
  const worst = (list) => list.reduce((m, c) => Math.max(m, c.deg), 0)
  const over = all.filter((c) => c.deg > 15)
  console.log('frames', frames.length, 'player steps', player.length, 'worst player', worst(player).toFixed(1), 'everyone steps', all.length, 'worst', worst(all).toFixed(1), 'over 15', over.length, JSON.stringify(over.slice(0, 8)))
  expect(player.length).toBeGreaterThan(40)
  expect(worst(player)).toBeLessThan(15)
  expect(over.length).toBe(0)
  // Soles on the ground for everyone measured on the way.
  const soles = frames.flatMap((f) => f.people.filter((p) => p.sole !== undefined && p.pose !== 'sit' && p.pose !== 'lie').map((p) => ({ id: p.id, gap: p.sole - p.ground })))
  const sunk = soles.filter((s) => Math.abs(s.gap) > 0.02)
  console.log('sole samples', soles.length, 'off', sunk.length, JSON.stringify(sunk.slice(0, 8)))
  expect(sunk.length).toBe(0)
  await saveVideo(page, 'M1-zigzag')
})
