// QA B02: the gear menu must close when it opens a screen, so the new screen's
// buttons get the taps (Chat Send, Save "Send a magic link").
// Run: npx playwright test tests/e2e/menu.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'

// The game loads the 3D campus behind these screens; give slower runs room.
test.describe.configure({ mode: 'serial', timeout: 90000 })

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
  for (let i = 0; i < 6 && await page.locator('.g-result [data-act]').count(); i++) {
    await page.locator('.g-result [data-act]').first().tap()
    await page.waitForTimeout(250)
  }
}

// Whatever sits on top at a button's centre must be that button.
// Offline (no Supabase keys) chat shows "Try again" instead of Send; either counts.
async function onTop(page, selector) {
  return page.evaluate((sel) => {
    const el = sel.split('|').map((one) => document.querySelector(one)).find(Boolean)
    if (!el) return 'missing'
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit === el || el.contains(hit) ? 'ok' : (hit?.closest('[data-act]')?.outerHTML || hit?.outerHTML || 'nothing').slice(0, 120)
  }, selector)
}

for (const [label, go, button] of [['chat', 'chat', '[data-act="send"]|[data-act="chat-retry"]'], ['save', 'save', '[data-act="magic"]']]) {
  test(`menu -> ${label}: the menu closes and ${button} gets the tap`, async ({ page }) => {
    await newGame(page)
    await page.locator('[data-act="gear"]').first().tap()
    await expect(page.locator('.g-menu')).toBeVisible()
    await page.locator(`.g-menu [data-go="${go}"]`).tap()
    await expect(page).toHaveURL(new RegExp(`#/${go}`))
    await page.waitForTimeout(600)
    await expect(page.locator('.g-menu')).toHaveCount(0)
    await expect(page.locator('.g-scrim')).toHaveCount(0)
    expect(await onTop(page, button)).toBe('ok')
  })
}

test('chat Send stays on chat and magic link keeps the student', async ({ page }) => {
  await newGame(page)
  const name = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character.name)
  await page.locator('[data-act="gear"]').first().tap()
  await page.locator('.g-menu [data-go="chat"]').tap()
  await page.waitForURL(/#\/chat/)
  if (await page.locator('#composer').count()) {
    await page.locator('#composer').fill('Hello campus')
    await page.locator('[data-act="send"]').tap()
  } else {
    await page.locator('[data-act="chat-retry"]').tap()
  }
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(/#\/chat/)

  await page.locator('[data-act="gear"]').first().tap()
  await page.locator('.g-menu [data-go="save"]').tap()
  await page.waitForURL(/#\/save/)
  await page.locator('[data-act="magic"]').click({ force: true })
  await page.waitForTimeout(500)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run?.character?.name).toBe(name)
  await expect(page.getByText('Tap again: delete this student')).toHaveCount(0)
})
