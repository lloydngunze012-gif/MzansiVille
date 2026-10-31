// Part 2 + 5: the Quad and the cafeteria, by day and by night, and the place sheet.
// Run: npx playwright test tests/e2e/places.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/places'
test.describe.configure({ mode: 'serial', timeout: 120000 })

async function newGame(page) {
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
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

for (const [place, hour] of [['quad', 12], ['quad', 21], ['cafeteria', 21], ['cafeteria', 12]]) {
  test(`${place} at ${hour}:00`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await newGame(page)
    await page.goto(`/?fast=1&morning=0&spawn=${place}&hour=${hour}#/play`)
    const world = page.locator('#world')
    await expect(world).toHaveAttribute('data-ready', '1', { timeout: 30000 })
    await expect(world).toHaveAttribute('data-night', hour > 18 ? '1.00' : '0.00', { timeout: 15000 })
    await page.waitForTimeout(3500) // props and people load
    await page.screenshot({ path: `${OUT}/${place}-${hour}.png` })
    // The place sheet: live flavour line, spots with a walk, action cards.
    await page.goto(`/?fast=1&morning=0&spawn=${place}&hour=${hour}#/place/${place}`)
    await expect(page.locator('.g-sheet2')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    await expect(page.locator('.g-flavour')).not.toBeEmpty()
    expect(await page.locator('.g-spot').count()).toBeGreaterThanOrEqual(3)
    await page.screenshot({ path: `${OUT}/${place}-${hour}-sheet.png` })
    await page.locator('.g-spot').first().tap()
    await expect(page).toHaveURL(/#\/play/)
    await expect(world).toHaveAttribute('data-walking-to', new RegExp(`^${place}:`))
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/${place}-${hour}-walked.png` })
    expect(errors).toEqual([])
  })
}

// Overview shots from the Top camera, for reviewing the layout.
for (const [place, hour] of [['quad', 21], ['quad', 12], ['cafeteria', 21]]) {
  test(`top view of ${place} at ${hour}:00`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.goto(`/?fast=1&shot=cam-top&spawn=${place}&hour=${hour}`)
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `${OUT}/top-${place}-${hour}.png` })
  })
}

// Look-check shots (owner rule): buildings, labels and surroundings from the player's camera.
for (const [place, hour, cam] of [['gate', 12, 'sims'], ['library', 12, 'sims'], ['smig', 12, 'sims'], ['res_o', 12, 'sims'], ['sports_centre', 12, 'sims'], ['bus_station', 12, 'sims'], ['gate', 21, 'sims'], ['smig', 21, 'sims'], ['gate', 12, 'top']]) {
  test(`look: ${place} ${cam} at ${hour}:00`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.goto(`/?fast=1&shot=cam-${cam}&spawn=${place}&hour=${hour}`)
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
    await page.waitForTimeout(5000)
    await page.screenshot({ path: `${OUT}/look-${place}-${cam}-${hour}.png` })
  })
}

// Looking out of campus: roads, fence, taxi rank and town, never an empty blue edge.
for (const [cam, hour] of [['sims', 12], ['eye', 12], ['sims', 21]]) {
  test(`look: outside the gate ${cam} at ${hour}:00`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.goto(`/?fast=1&shot=cam-${cam}&spawn=gate&facing=0&hour=${hour}`)
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
    await page.waitForTimeout(6000)
    await page.screenshot({ path: `${OUT}/look-outside-${cam}-${hour}.png` })
  })
}

test('look: eye view among people at the Quad', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&shot=cam-eye&spawn=quad&facing=0.9&hour=12')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${OUT}/look-quad-eye.png` })
})
