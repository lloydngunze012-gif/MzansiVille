// Bug 1 (plan 2): the student looks the same in the creator, morning, campus and lecture.
// Run: npx playwright test tests/e2e/avatar.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'

test('a dark-skinned female in a dress looks identical in every scene', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('/?morning=1&roommate=0&latebus=0&snooze=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=1&roommate=0&latebus=0&snooze=0#/new')
  for (const [part, id] of [['gender', 'female'], ['skin', 'ebony'], ['hair', 'braids'], ['outfit', 'dress'], ['body', 'curvy']]) {
    await page.locator(`[data-part="${part}"][data-id="${id}"]`).tap()
  }
  // The creator stage shows the real 3D student.
  const stage = page.locator('.cc-stage')
  await expect(stage).toHaveClass(/cc-has3d/, { timeout: 20000 })
  const look = JSON.parse(await stage.getAttribute('data-look'))
  expect(look).toMatchObject({ gender: 'female', outfitFile: 'dress', headFile: 'long', skin: '#2c1b12', top: '#e8497a', dress: true, curvy: true })
  await page.screenshot({ path: 'test-results/avatar-1-creator.png' })

  await page.locator('#name').fill('Naledi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character.avatar)
  expect(saved).toMatchObject({ gender: 'female', skin: 'ebony', hair: 'braids', outfit: 'dress', body: 'curvy' })

  // Morning
  await expect(page.locator('#morning3d')).toHaveAttribute('data-look', /"outfitFile":"dress"/, { timeout: 30000 })
  expect(JSON.parse(await page.locator('#morning3d').getAttribute('data-look'))).toEqual(look)

  // Campus (a reload without the forced morning)
  await page.goto('/?morning=0#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-look', /"outfitFile":"dress"/, { timeout: 30000 })
  expect(JSON.parse(await page.locator('#world').getAttribute('data-look'))).toEqual(look)

  // Lecture
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { phase: 'lecture', minutes: 525, queue: [], lectureResolved: false })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&lecture=1&talk=auto#/lecture')
  await expect(page.locator('#lecture3d')).toHaveAttribute('data-look', /"outfitFile":"dress"/, { timeout: 30000 })
  expect(JSON.parse(await page.locator('#lecture3d').getAttribute('data-look'))).toEqual(look)
})

// Two students on the same base model keep their own colours (clones used to share geometry).
test('same model, different looks: colours do not leak between students', async ({ page }) => {
  await page.goto('/?morning=0#/')
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
