// K8: 10 minutes of random real taps and finger walks across campus. The controls must
// never lock for more than 3 s: whenever a finger touches the ground in a free state you move, and
// whenever you're doing something, there's a way out on screen (and it works).
// RANDOM_MIN=10 npx playwright test tests/basics/random.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, OUT, student, finger, nearMe, read, saveVideo, dist } from './touch.js'

test.use(PHONE)
const MINUTES = Number(process.env.RANDOM_MIN || 10)
test.describe.configure({ timeout: (MINUTES * 60 + 240) * 1000 })

test('K8 random taps and stick moves: the controls never lock for more than 3 s', async ({ page }) => {
  await student(page, { spawn: 'quad', run: { money: 500 } })
  const f = await finger(page)
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const end = Date.now() + MINUTES * 60 * 1000
  const tapEl = async (loc) => { const b = await loc.boundingBox(); if (b) await f.tap(b.x + b.width / 2, b.y + b.height / 2) }
  const log = { taps: 0, sticks: 0, chats: 0, sheets: 0, leaves: 0, worstLock: 0, locks: [] }
  let lockedSince = 0
  while (Date.now() < end) {
    const st = await read.state(page)
    const open = ['free', 'walking', 'running'].includes(st)
    // Something open on top (a chat, a place sheet, the map, a card): deal with it as a player would.
    if (await page.locator('.g-talk').isVisible().catch(() => false)) {
      log.chats += 1
      const bye = page.locator('.g-talk [data-act="talk-bye"]').first()
      const reply = page.locator('.g-talk [data-act="talk-reply"]').first()
      if (rnd() < 0.5 && await reply.count()) await tapEl(reply)
      else if (await bye.count()) await tapEl(bye)
      else await tapEl(page.locator('.ps-leave'))
      await page.waitForTimeout(500)
      continue
    }
    // (a random tap can land on the Talk button: the chat panel is a card like the rest, and a player closes it)
    if (await page.locator('.chat-panel:not([hidden])').count()) { await tapEl(page.locator('.chat-panel .chat-x')); await page.waitForTimeout(300); continue }
    if (await page.locator('.map-overlay:not([hidden])').count()) { await tapEl(page.locator('.map-overlay [data-map="close"]')); continue }
    if (await page.locator('.g-sheet').isVisible().catch(() => false)) {
      log.sheets += 1
      await tapEl(page.locator('.g-sheet [data-act="close-sheet"]'))
      await page.waitForTimeout(300)
      continue
    }
    const card = page.locator('.g-card-modal button, .g-choice, [data-act="dismiss"]').first()
    if (await card.isVisible().catch(() => false)) { await tapEl(card); await page.waitForTimeout(300); continue }
    if (!open) {
      // Doing something: there must be a way out on screen within 3 s.
      if (!lockedSince) lockedSince = Date.now()
      const leave = page.locator('.ps-leave')
      if (await leave.isVisible()) {
        if (rnd() < 0.5 || Date.now() - lockedSince > 2500) { await tapEl(leave); log.leaves += 1; await page.waitForTimeout(500) }
        else await page.waitForTimeout(400)
        lockedSince = 0
        continue
      }
      const held = Date.now() - lockedSince
      log.worstLock = Math.max(log.worstLock, held)
      if (held > 3000) log.locks.push({ st, held })
      await page.waitForTimeout(300)
      continue
    }
    lockedSince = 0
    if (rnd() < 0.55) {
      // A tap anywhere on the open part of the screen (ground, people, buildings).
      log.taps += 1
      await f.tap(30 + rnd() * 352, 230 + rnd() * 480)
      await page.waitForTimeout(400 + rnd() * 1800)
    } else {
      // A swipe (it turns the view, never walks), then check a tap still moves you.
      log.sticks += 1
      const a = rnd() * Math.PI * 2
      const p = await nearMe(page, Math.sin(a) * 170, -Math.cos(a) * 170)
      const before = await read.pos(page)
      await f.down(p.x, p.y)
      await f.move(p.x + 30, p.y + 10)
      await page.waitForTimeout(700 + rnd() * 1500)
      const after = await read.pos(page)
      // (the game answering: moving, or striding with the walk or run clip; on a slow
      // test machine a walk covers little ground in real time)
      const answer = await page.evaluate(() => window.mzansiBodies('campus', 'player')[0]?.clip)
      await f.up()
      const stNow = await read.state(page)
      if (dist(before, after) < 0.15 && !/Walk|Run/.test(answer || '') && ['free', 'walking', 'running'].includes(stNow)) {
        // Against a wall, a bench or the stage (a tap on a solid spot walks to the nearest open one,
        // or gives up after half a second: that is the game's rule, not a lock)? Try six other ways, a
        // finger each, before calling it locked: only a player who moves for none of them is stuck.
        let moved = false
        let here = after
        let lastQ = null
        for (let k = 1; k <= 6 && !moved; k++) {
          const b = a + Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5
          const q = await nearMe(page, Math.sin(b) * 170, -Math.cos(b) * 170)
          lastQ = q
          if (q.x > 300 && q.y > 540) continue // (the Talk and Stop buttons are bottom right)
          await f.tap(q.x, q.y)
          await page.waitForTimeout(1500)
          const now = await read.pos(page)
          const clip = await page.evaluate(() => window.mzansiBodies('campus', 'player')[0]?.clip)
          if (dist(here, now) >= 0.15 || /Walk|Run/.test(clip || '')) moved = true
          here = now
        }
        if (!moved && ['free', 'walking', 'running'].includes(await read.state(page))) log.locks.push({ st: stNow, stick: true, at: after, q: lastQ, last: await page.evaluate(() => window.mzansiLastTap) })
      }
    }
  }
  await page.screenshot({ path: `${OUT}/K8-end.png` })
  console.log('K8', JSON.stringify(log))
  expect(log.locks).toEqual([])
  await saveVideo(page, 'K8-random')
})
