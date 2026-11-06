// Bug 3 (plan 2): a spoken line stays until the player taps, with a hint.
import { test, expect } from '@playwright/test'
import { enrolUI } from '../enrol.js'

test('morning lines wait for a tap', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  const bubble = page.locator('.mm-bubble')
  await expect(bubble).toHaveClass(/tap/, { timeout: 30000 })
  const first = await bubble.textContent()
  await page.waitForTimeout(4000)
  await expect(bubble).toBeVisible()
  expect(await bubble.textContent()).toBe(first) // still the same line after 4 s
  const hint = await bubble.evaluate((el) => getComputedStyle(el, '::after').content)
  expect(hint).toContain('Tap to continue')
  await page.mouse.click(200, 650)
  await expect.poll(async () => bubble.textContent(), { timeout: 5000 }).not.toBe(first)
})
