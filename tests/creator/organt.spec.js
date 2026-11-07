// The Organt print close up, women and men, front and three-quarter (QA pass 1: ORGANT legible).
import { test } from '@playwright/test'
const OUT = 'docs/sprints/creator-redesign'
test('organt print', async ({ page }) => {
  test.setTimeout(120000)
  for (const angle of [0, 0.5]) {
    await page.setViewportSize({ width: 800, height: 500 })
    await page.goto('/tests/creator/lineup.html')
    await page.evaluate(async (a) => window.lineup({ looks: [{ gender: 'female', skin: 'amber', hair: 'crop', outfit: 'organt', body: 'curvy' }, { gender: 'male', skin: 'ebony', hair: 'crop', outfit: 'organt' }], angle: a, w: 400, h: 500, zoom: 2.3, pose: 'dance', t: 0.6 }), angle)
    await page.screenshot({ path: `${OUT}/organt-${angle ? 'threequarter' : 'front'}.png` })
  }
})
