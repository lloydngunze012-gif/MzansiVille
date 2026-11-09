// QA B02: the gear menu must close when it opens a screen, so the new screen's
// buttons get the taps (Chat Send, Save "Send a magic link").
// Run: npx playwright test tests/e2e/menu.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import { enrolUI } from '../enrol.js'

// The game loads the 3D campus behind these screens; give slower runs room.
test.describe.configure({ mode: 'serial', timeout: 180000 })

async function newGame(page) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  // Cards that greet a new student (results, goals, and someone starting a chat: the roommate): the
  // player deals with each, then the menu is theirs. They can arrive a moment apart, so look twice.
  for (let quiet = 0, i = 0; quiet < 2 && i < 12; i++) {
    const card = page.locator('.g-result [data-act], .g-talk [data-act="talk-bye"]').first()
    if (await card.count()) { await card.tap(); quiet = 0 } else { quiet++ }
    await page.waitForTimeout(500)
  }
}

// Open the gear menu like a player: if a card has landed on top (someone starting a chat, a result),
// deal with it and try again.
async function openMenu(page) {
  for (let i = 0; i < 6; i++) {
    try { await page.locator('[data-act="gear"]').first().tap({ timeout: 4000 }); return } catch { /* a card is on top */ }
    const card = page.locator('.g-result [data-act], .g-talk [data-act="talk-bye"]').first()
    if (await card.count()) await card.tap().catch(() => {})
    await page.waitForTimeout(400)
  }
  await page.locator('[data-act="gear"]').first().tap()
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
    await openMenu(page)
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
  await openMenu(page)
  await page.locator('.g-menu [data-go="chat"]').tap()
  await page.waitForURL(/#\/chat/)
  await page.locator('#composer, [data-act="chat-retry"]').first().waitFor({ timeout: 15000 }) // (the lobby paints a moment after the route changes)
  if (await page.locator('#composer').count()) {
    // A guest who taps the box to write gets the "Make a free account to post" card (the game's rule);
    // the player says Not now, and the lobby, and the menu, are theirs again.
    await page.locator('#composer').fill('Hello campus')
    const notNow = page.getByRole('button', { name: 'Not now' })
    if (await notNow.count() || await notNow.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
      await notNow.tap()
      await expect(page.locator('.sc-prompt')).toHaveCount(0)
    } else {
      await page.locator('[data-act="send"]').tap()
    }
  } else {
    await page.locator('[data-act="chat-retry"]').tap()
  }
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(/#\/chat/)

  await openMenu(page)
  await page.locator('.g-menu [data-go="save"]').tap()
  await page.waitForURL(/#\/save/)
  await page.locator('[data-act="magic"]').click({ force: true })
  await page.waitForTimeout(500)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run?.character?.name).toBe(name)
  await expect(page.getByText('Tap again: delete this student')).toHaveCount(0)
})
