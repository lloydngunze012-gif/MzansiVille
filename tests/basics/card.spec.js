// C1 (Piece 1a): your card. One phone screen, nothing scrolling (viewing and editing);
// the bio filter on save takes out a phone number, a link and a handle and says why;
// Stats opens and closes; Notices is in the menu. Touch only; hooks only READ.
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(300000)

const scrolls = (page) => page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight)

test('C1 your card: one screen, bio filtered with reasons, Stats, Notices', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  await page.goto('/?morning=0#/profile')
  await expect(page.locator('.pcard')).toBeVisible()
  await page.waitForTimeout(800)
  const view = { overflow: await scrolls(page) }
  await page.screenshot({ path: `${OUT}/C1-card.png` })

  await tapOn(page, f, page.locator('[data-act="pc-edit"]'))
  await expect(page.locator('#pc-bio')).toBeVisible()
  const edit = { overflow: await scrolls(page) }
  await page.locator('#pc-bio').fill('Law girl, amapiano Fridays. Call 072 123 4567 wa.me/27721 @thandi_x')
  await page.locator('#pc-vibe').selectOption('Music head')
  await page.locator('#pc-looking').selectOption('Study buddy')
  await page.screenshot({ path: `${OUT}/C1-edit.png` })
  await tapOn(page, f, page.locator('[data-act="pc-save"]'))
  await expect(page.locator('.pc-notice')).toBeVisible()
  const notice = await page.locator('.pc-notice').textContent()
  const bio = await page.locator('.pc-bio').textContent()
  const tags = await page.locator('.pc-tags li').allTextContents()
  const saved = { overflow: await scrolls(page) }
  await page.screenshot({ path: `${OUT}/C1-saved.png` })

  await tapOn(page, f, page.locator('.pc-stats-btn'))
  await expect(page.locator('.pc-stats')).toBeVisible()
  await page.screenshot({ path: `${OUT}/C1-stats.png` })
  await tapOn(page, f, page.locator('.pc-stats-btn'))
  await expect(page.locator('.pc-stats')).toHaveCount(0)

  await page.goto('/?morning=0#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await tapOn(page, f, page.locator('[data-act="gear"]').first())
  await tapOn(page, f, page.locator('.g-menu [data-go="notices"]'))
  await expect(page.locator('main[data-screen="notices"]')).toBeVisible()
  await page.screenshot({ path: `${OUT}/C1-notices.png` })
  const out = { view, edit, saved, notice, bio, tags }
  console.log('C1', JSON.stringify(out))
  expect(view.overflow, 'the card fits one screen').toBeLessThanOrEqual(1)
  expect(edit.overflow, 'editing fits one screen').toBeLessThanOrEqual(1)
  expect(bio).not.toMatch(/072|wa\.me|@thandi/)
  expect(bio).toContain('amapiano Fridays')
  expect(notice).toMatch(/Phone numbers/)
  expect(notice).toMatch(/WhatsApp/)
  expect(notice).toMatch(/Social handles/)
  expect(tags.join(' ')).toContain('Music head')
})
