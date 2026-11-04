// K17 (owner, 4 Nov): tap someone standing behind a bench (Sizwe/Bandile, x12, beside a
// Quad bench). The walk up is held up by the bench; the chat must still open where you
// stop, never a tap that ends in nothing. Touch only; hooks only READ.
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, read, saveVideo, student } from './touch.js'

test.use(PHONE)
test.setTimeout(300000)

test('K17 tap someone behind a bench: you walk up and the chat opens where you stop', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  // On screen, clear of the HUD and the buttons (a swipe turns the view if not).
  let at = null
  for (let i = 0; i < 8; i++) {
    at = await read.person(page, 'x12')
    if (at && !at.behind && at.x > 30 && at.x < 382 && at.y > 200 && at.y < 700) break
    at = null
    await f.drag([[300, 470], [200, 470]], 300)
    await page.waitForTimeout(500)
  }
  expect(at, 'x12 on screen').not.toBeNull()
  const from = await read.pos(page)
  const t0 = Date.now()
  await f.tap(at.x, at.y)
  await expect(page.locator('.g-talk')).toBeVisible({ timeout: 20000 })
  const openedMs = Date.now() - t0
  const me = await read.pos(page)
  const who = (await read.people(page)).find((p) => p.id === 'x12')
  await page.screenshot({ path: `${OUT}/K17-chat-open.png` })
  const out = { openedMs, walked: +Math.hypot(me.x - from.x, me.z - from.z).toFixed(2), apart: +Math.hypot(me.x - who.x, me.z - who.z).toFixed(2), state: await read.state(page) }
  console.log('K17', JSON.stringify(out))
  expect(out.state).toBe('talking')
  await saveVideo(page, 'K17-held-up-chat')
})
