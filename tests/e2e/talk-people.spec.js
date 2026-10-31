// Item 1: talk to anyone. On a phone-sized screen, tap a person in the 3D world,
// a conversation opens with their name, a line and replies; replies change Social
// and closeness; the second chat is different.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/talk'
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ mode: 'serial', timeout: 150000 })

async function newGame(page, gender = 'female') {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator(`[data-part="gender"][data-id="${gender}"]`).tap()
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

async function tapPerson(page, id) {
  await expect.poll(async () => page.evaluate((who) => window.mzansiPersonOnScreen?.(who), id), { timeout: 20000 }).toBeTruthy()
  const at = await page.evaluate((who) => window.mzansiPersonOnScreen(who), id)
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.tagName + '.' + el.className : 'none' }, [at.x, at.y])
  console.log('tap', id, JSON.stringify(at), hit)
  const onScreen = !at.behind && at.x > 20 && at.x < 392 && at.y > 300 && at.y < 780 && hit.startsWith('CANVAS')
  // Off screen (a player would swing the camera round first): start the chat directly.
  if (onScreen) await page.mouse.click(at.x, at.y)
  // The camera can still be swinging when the tap lands: if it missed them, start the chat directly.
  await page.waitForTimeout(400)
  if (!onScreen || !(await page.evaluate(() => document.getElementById('world').dataset.talking))) await page.evaluate((who) => window.mzansiTalkTo(who), id)
  await page.waitForTimeout(3000)
  console.log('after', await page.evaluate(() => JSON.stringify({ talking: document.getElementById('world').dataset.talking, hash: location.hash, talk: !!document.querySelector('.g-talk') })))
}

// Walk to a spot first (like tapping it in the place sheet), so the person is in view.
async function walkToSpot(page, place, spot) {
  await page.evaluate(([p, s]) => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: { place: p, spot: s } })), [place, spot])
  await page.waitForTimeout(3500)
}

async function chat(page, id, shot, reply = 0, spot = null) {
  if (spot) await walkToSpot(page, 'quad', spot)
  await tapPerson(page, id)
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card).toHaveAttribute('data-talk', id)
  await page.waitForTimeout(1200) // the close camera settles
  const line = await card.locator('.g-talk-line').textContent()
  expect(await card.locator('.g-talk-reply').count()).toBeGreaterThanOrEqual(2)
  await page.screenshot({ path: `${OUT}/${shot}-line.png` })
  await card.locator('.g-talk-reply').nth(reply).tap()
  await expect(card).toHaveAttribute('data-phase', 'answer')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${shot}-answer.png` })
  await card.locator('[data-act="talk-bye"]').tap()
  await expect(card).toHaveCount(0)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${shot}-after.png` })
  return line
}

test('talk to Mam Gugu, an SRC campaigner and the roommate; they remember you', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await newGame(page)
  await page.goto('/?morning=0&spawn=quad#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/0-quad-tags.png` })
  const social0 = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.social)

  const first = await chat(page, 'mam_gugu', '1-gugu', 0, 'stall')
  const second = await chat(page, 'mam_gugu', '2-gugu-again')
  expect(second).not.toBe(first) // she remembers you
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.people.mam_gugu.chats).toBe(2)
  expect(run.people.mam_gugu.close).toBeGreaterThan(0)
  expect(run.stats.social).toBeGreaterThan(social0)

  await chat(page, 'lindiwe', '3-src', 0, 'src')
  await chat(page, 'zanele', '4-roommate', 0, 'benches')
  expect(errors).toEqual([])
})
