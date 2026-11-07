// Faces on every skin tone, close up, women and men (QA pass 1: faces on Deep and Ebony).
import { test } from '@playwright/test'
const OUT = 'docs/sprints/creator-redesign'
test('faces', async ({ page }) => {
  test.setTimeout(120000)
  const skins = ['fair', 'sand', 'amber', 'brown', 'deep', 'ebony']
  for (const gender of ['female', 'male']) {
    await page.setViewportSize({ width: 6 * 220, height: 300 })
    await page.goto('/tests/creator/lineup.html')
    await page.evaluate(async ([skins, gender]) => window.lineup({ looks: skins.map((skin) => ({ gender, skin, hair: 'crop', outfit: 'organt' })), angle: 0.3, w: 220, h: 300, zoom: 4.2 }), [skins, gender])
    await page.screenshot({ path: `${OUT}/faces-${gender}.png` })
  }
})
