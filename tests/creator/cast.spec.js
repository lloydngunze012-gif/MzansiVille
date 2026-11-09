// The cast with hair colours (Zoe yellow, Mam' Gugu purple, Mama Liz pink) must still read as
// those colours with the hair shading: close up (lineup) and as the game's own camera sees them.
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = 'docs/sprints/creator-studio'
test('cast hair colours, close up', async ({ page }) => {
  test.setTimeout(120000)
  fs.mkdirSync(OUT, { recursive: true })
  const looks = [
    { model: 'female-b', skin: 'deep', outfit: 'hoodie', topColor: '#d9534f', hairColor: '#f0c400', bottomColor: '#2b3a55', gender: 'female' },
    { model: 'female-d', skin: 'brown', outfit: 'dress', topColor: '#e8497a', hairColor: '#7b3fe4', gender: 'female' },
    { model: 'female-f', skin: 'deep', outfit: 'dress', topColor: '#f7f4ee', hairColor: '#e8497a', gender: 'female' },
  ]
  await page.setViewportSize({ width: 1200, height: 520 })
  await page.goto('/tests/creator/lineup.html')
  await page.evaluate(async (looks) => window.lineup({ looks, angle: 0.4, w: 400, h: 520, zoom: 2.2 }), looks)
  await page.screenshot({ path: `${OUT}/cast-hair-close.png` })
})
