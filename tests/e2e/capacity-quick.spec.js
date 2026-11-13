// Job F (owner, 13 Nov): never break when full. Past max_players a new arrival sees "Campus is busy. You're in
// line: #N" (cap_enter answered by a stand-in server here), is not in the live rooms while waiting, and comes in by
// itself when there is room. A missing function (the SQL not run) lets everybody in.
import { test, expect } from '@playwright/test'
import { atGate } from '../city.js'

test('C1 the busy line: in line with your number, then in by yourself', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/rpc/cap_enter', (route) => {
    calls++
    const body = calls <= 2 ? { ok: true, admitted: false, position: 4 - calls, online: 3000, max: 3000 } : { ok: true, admitted: true, online: 3000, max: 3000 }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/rest/v1/rpc/cap_leave', (route) => route.fulfill({ status: 204, body: '' }))
  await atGate(page, { query: '&cap=1&capwait=1' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCapacity())).admitted, { timeout: 30000 }).toBe(true)
  expect(calls, 'asked while in line, then let in').toBeGreaterThanOrEqual(3)
  await expect(page.locator('.cap-line')).toHaveCount(0)
})

test('C2 the line on screen, and a missing function lets you in', async ({ page }) => {
  await page.route('**/rest/v1/rpc/cap_enter', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, admitted: false, position: 7, online: 3000, max: 3000 }) }))
  await page.goto('/?fast=1&enrol=quick&morning=0&cap=1&capwait=60#/new')
  await page.evaluate(() => { localStorage.clear() })
  await page.reload()
  await page.locator('[data-preset="q-priya"]').tap()
  await page.locator('#name').fill('Lerato')
  await page.locator('[data-act="qs-play"]').tap()
  await expect(page.locator('.cap-line')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.cap-line')).toContainText('Campus is busy.')
  await expect(page.locator('.cap-line [data-cap-pos]')).toHaveText('#7')
  // the function not there yet: straight in
  await page.unroute('**/rest/v1/rpc/cap_enter')
  await page.route('**/rest/v1/rpc/cap_enter', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.cap_enter in the schema cache' }) }))
  await page.reload()
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCapacity?.()))?.admitted, { timeout: 30000 }).toBe(true)
  expect((await page.evaluate(() => window.mzansiCapacity())).missing).toBe(true)
  await expect(page.locator('.cap-line')).toHaveCount(0)
})
