// "Where you're from": the nine provinces, then Elsewhere in Africa, then Overseas, in that order;
// old saves (a city) still load, show as their province, and keep their day-1 home style.
import { test, expect } from '@playwright/test'

test('From: provinces in order, old saves still work', async ({ page }) => {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('.en[data-step="who"]').waitFor()
  const shown = await page.locator('[data-k="from"]').allTextContents()
  expect(shown).toEqual(['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape', 'Elsewhere in Africa', 'Overseas'])
  const r = await page.evaluate(async () => {
    const f = await import('/src/from.js')
    const h = await import('/src/world/home.js')
    const style = (from) => h.homeStyleId({ from })
    return {
      places: ['Durban', 'Joburg', 'Soweto', 'Pretoria', 'Cape Town', 'Limpopo', 'Overseas'].map(f.fromPlace),
      styles: { Soweto: style('Soweto'), Durban: style('Durban'), Limpopo: style('Limpopo'), 'KwaZulu-Natal': style('KwaZulu-Natal'), Gauteng: style('Gauteng'), 'Northern Cape': style('Northern Cape') },
    }
  })
  expect(r.places).toEqual(['KwaZulu-Natal', 'Gauteng', 'Gauteng', 'Gauteng', 'Western Cape', 'Limpopo', 'Overseas'])
  expect(r.styles.Soweto).toBe('township') // an old save keeps its home
  expect(r.styles.Durban).toBe('suburban')
  expect(r.styles.Limpopo).toBe('township')
  expect(r.styles['KwaZulu-Natal']).toBe('suburban')
  console.log('home styles', JSON.stringify(r.styles))
})

test('an old save with "From: Soweto" loads and shows Gauteng on the card', async ({ page }) => {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  const { enrolUI } = await import('../enrol.js')
  await enrolUI(page, { name: 'Sipho', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  // (edit the save away from the game, which writes its own save as it leaves)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); s.run.character.from = 'Soweto'; localStorage.setItem('mzansiville.v1', JSON.stringify(s)) })
  await page.goto('/?morning=0#/profile')
  await expect(page.locator('.pc-from')).toContainText('Gauteng', { timeout: 20000 })
})
