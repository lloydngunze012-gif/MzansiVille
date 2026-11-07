import { test } from '@playwright/test'
const OUT = 'docs/sprints/creator-studio'
test('women\'s hoodie from the front, three-quarter and side', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 3 * 300, height: 520 })
  await page.goto('/tests/creator/lineup.html')
  const looks = [0, 0.7, 1.57].map(() => ({ gender: 'female', skin: 'amber', hair: 'crop', outfit: 'hoodie' }))
  await page.evaluate(async (looks) => window.lineup({ looks, angle: 0, w: 300, h: 520 }), looks)
  await page.screenshot({ path: `${OUT}/hoodie-front.png` })
  await page.goto('/tests/creator/lineup.html')
  await page.evaluate(async (looks) => window.lineup({ looks, angle: 0.6, w: 300, h: 520 }), looks)
  await page.screenshot({ path: `${OUT}/hoodie-34.png` })
})
