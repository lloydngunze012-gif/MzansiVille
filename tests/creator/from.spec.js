// "Where you're from": the nine provinces, then Elsewhere in Africa, then Overseas, in that order;
// old saves (a city) still load, show as their province, and keep their day-1 home style.
import { test, expect } from '@playwright/test'

test('From: provinces in order, old saves still work', async ({ page }) => {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  for (let i = 0; i < 2; i++) await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('.en[data-step="who"]').waitFor()
  // (three pickers since 8 Nov: South Africa lists the provinces; Rest of Africa and World their
  // countries, then "somewhere else", saved as the old Elsewhere in Africa / Overseas answers)
  await expect(page.locator('.en-frompick span')).toHaveText(['South Africa', 'Rest of Africa', 'World'])
  const shown = await page.locator('[data-from-group="za"] option:not([value=""])').evaluateAll((o) => o.map((x) => x.value))
  expect(shown).toEqual(['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'])
  const africa = await page.locator('[data-from-group="africa"] option').evaluateAll((o) => o.map((x) => x.value))
  const world = await page.locator('[data-from-group="world"] option').evaluateAll((o) => o.map((x) => x.value))
  expect(africa).toContain('Zimbabwe'); expect(africa.at(-1)).toBe('Elsewhere in Africa')
  expect(world).toContain('United Kingdom'); expect(world.at(-1)).toBe('Overseas')
  // A country: the pill shows it with its flag, and so does the card.
  await page.locator('[data-from-group="africa"] select').selectOption('Zimbabwe')
  await expect(page.locator('[data-from-group="africa"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-from-group="africa"] svg.flag')).toHaveCount(1)
  await expect(page.locator('.en-fromnow')).toHaveText('Zimbabwe')
  await expect(page.locator('.en-id .en-idfrom')).toHaveText('Zimbabwe')
  await expect(page.locator('.en-id .en-idfrom svg.flag')).toHaveCount(1)
  const r = await page.evaluate(async () => {
    const f = await import('/src/from.js')
    const h = await import('/src/world/home.js')
    const style = (from) => h.homeStyleId({ from })
    return {
      places: ['Durban', 'Joburg', 'Soweto', 'Pretoria', 'Cape Town', 'Limpopo', 'Overseas'].map(f.fromPlace),
      zim: style('Zimbabwe'), uk: style('United Kingdom'),
      styles: { Soweto: style('Soweto'), Durban: style('Durban'), Limpopo: style('Limpopo'), 'KwaZulu-Natal': style('KwaZulu-Natal'), Gauteng: style('Gauteng'), 'Northern Cape': style('Northern Cape') },
    }
  })
  expect(r.places).toEqual(['KwaZulu-Natal', 'Gauteng', 'Gauteng', 'Gauteng', 'Western Cape', 'Limpopo', 'Overseas'])
  expect(r.styles.Soweto).toBe('township') // an old save keeps its home
  expect(r.styles.Durban).toBe('suburban')
  expect(r.styles.Limpopo).toBe('township')
  expect(r.styles['KwaZulu-Natal']).toBe('suburban')
  expect(r.zim, 'a country takes the home style of its region').toBe('suburban')
  expect(r.uk).toBe('suburban')
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
