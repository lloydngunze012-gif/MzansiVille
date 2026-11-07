// Bug 1 (plan 2): the student looks the same in the creator, morning, campus and lecture.
// Run: npx playwright test tests/e2e/avatar.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import { enrolUI } from '../enrol.js'

test('a dark-skinned female in a dress looks identical in every scene', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('/?fast=1&morning=1&roommate=0&latebus=0&snooze=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=1&roommate=0&latebus=0&snooze=0#/new')
  for (const [part, id] of [['gender', 'female'], ['skin', 'ebony'], ['hair', 'braids'], ['outfit', 'dress'], ['body', 'curvy']]) {
    await page.locator(`[data-part="${part}"][data-id="${id}"]`).tap()
  }
  // The creator stage shows the real 3D student.
  const stage = page.locator('.cc-stage')
  await expect(stage).toHaveClass(/cc-has3d/, { timeout: 20000 })
  const creatorLook = JSON.parse(await stage.getAttribute('data-look'))
  expect(creatorLook.studio, 'the creator draws the print big').toBe(true)
  const look = { ...creatorLook, studio: false }
  expect(creatorLook).toMatchObject({ gender: 'female', outfitFile: 'dress', headFile: 'bob', hairStyle: 'locs', skin: '#2c1b12', top: '#e8497a', dress: true, curvy: true })
  await page.screenshot({ path: 'test-results/avatar-1-creator.png' })

  await enrolUI(page, { name: 'Naledi', house: 1, course: 1 })
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character.avatar)
  expect(saved).toMatchObject({ gender: 'female', skin: 'ebony', hair: 'braids', outfit: 'dress', body: 'curvy' })

  // Home (day 1 opens in the family home scene, which carries the player's look like the others)
  await expect(page.locator('#home3d')).toHaveAttribute('data-look', /"outfitFile":"dress"/, { timeout: 60000 })
  expect(JSON.parse(await page.locator('#home3d').getAttribute('data-look'))).toEqual(look)

  // Campus (a reload without the forced morning)
  await page.goto('/?fast=1&morning=0#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-look', /"outfitFile":"dress"/, { timeout: 30000 })
  expect(JSON.parse(await page.locator('#world').getAttribute('data-look'))).toEqual(look)

  // Lecture
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { phase: 'lecture', minutes: 525, queue: [], lectureResolved: false })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?fast=1&morning=0&lecture=1&talk=auto#/lecture')
  await expect(page.locator('#lecture3d')).toHaveAttribute('data-look', /"outfitFile":"dress"/, { timeout: 30000 })
  expect(JSON.parse(await page.locator('#lecture3d').getAttribute('data-look'))).toEqual(look)
})

// Two students on the same base model keep their own colours (clones used to share geometry).
test('same model, different looks: colours do not leak between students', async ({ page }) => {
  await page.goto('/?fast=1&morning=0#/')
  const result = await page.evaluate(async () => {
    const A = await import('/src/world/avatar3d.js')
    const a = A.createAvatar({ model: 'female-b', skin: 'sand', topColor: '#00ff00' })
    const b = A.createAvatar({ model: 'female-b', skin: 'ebony', topColor: '#ff0000' })
    const ready = (g) => new Promise((r) => (g.userData.rigged ? r() : g.addEventListener('rigged', r)))
    await Promise.all([ready(a), ready(b)])
    const colours = (g) => { let geo; g.traverse((n) => { if (n.isSkinnedMesh && !geo) geo = n.material }); return geo }
    return colours(a) !== colours(b)
  })
  expect(result).toBe(true)
})
