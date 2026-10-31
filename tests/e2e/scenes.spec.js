// Item 2: every activity is a visible scene. One action per scene type, on a
// phone-sized screen, with screenshots mid-scene.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/scenes'
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ timeout: 150000 })

// [action, place, phase, minutes]
const CASES = [
  ['cafeteria_meal', 'cafeteria', 'social', 780],
  ['library_study', 'library', 'leisure', 960],
  ['smig_board', 'smig', 'lecture', 600],
  ['hs_lawn', 'health_sciences', 'social', 780],
  ['eng_workshop', 'engineering', 'leisure', 960],
  ['gate_vetkoek', 'gate', 'transit', 500],
  ['sport_pickup', 'sports_centre', 'social', 780],
  ['bus_town', 'bus_station', 'social', 780],
  ['res_o_cook', 'res_o', 'leisure', 960],
  ['call_home', 'res_o', 'leisure', 960],
  ['sleep', 'res_o', 'night', 1290],
  ['law_sitin', 'law', 'lecture', 600],
]

async function setup(page, place, phase, minutes) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ label: 'O Block' }).catch(() => page.locator('#residence').selectOption({ index: 1 }))
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(([ph, m]) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: ph, minutes: m, day: 4, doneToday: [], slotsLeft: 5 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, [phase, minutes])
  await page.goto(`/?fast=1&morning=0&spawn=${place}&talk=auto#/place/${place}`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2500)
}

for (const [id, place, phase, minutes] of CASES) {
  test(`${id} plays a scene`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    const errors = []
    page.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 300)) })
    page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)) })
    await setup(page, place, phase, minutes)
    const btn = page.locator(`[data-act="do"][data-id="${id}"]`)
    await expect(btn).toBeVisible({ timeout: 10000 })
    await expect(btn).toBeEnabled()
    await btn.tap()
    const world = page.locator('#world')
    await expect(world).toHaveAttribute('data-activity-step', 'running', { timeout: 10000 })
    const scene = await world.getAttribute('data-activity')
    expect(scene).not.toBe('stand')
    for (const at of [3, 7]) {
      await page.waitForTimeout(at === 3 ? 3000 : 4000)
      await page.screenshot({ path: `${OUT}/${id}-${at}s.png` })
    }
    await expect(world).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
    expect(errors).toEqual([])
  })
}
