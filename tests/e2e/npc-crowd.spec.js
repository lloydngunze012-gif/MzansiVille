// Tester fixes 2 (owner, 11 Nov), item 1, in the quick project: NPCs never pile up round a player.
// The owner and another player talked on campus and about eight NPCs crowded round them and stayed. The cause: a
// walker whose way led through a player who was standing still "gave way" for half a second, again and again, for
// ever, so every walker whose path crossed the spot ended up standing there.
//   N1 a player standing on a door spot that walkers head for (the library's: two were stuck there within a minute
//      before the fix), for about six game minutes: never more than 3 NPCs within 4 m, and no walker stands on one
//      spot longer than its pause between trips allows.
//   N2 the same with the tour card open (the game is "paused" for you, not for them), in the middle of the Quad.
// Two real players talking: tests/presence/crowd.spec.js.
import { test, expect } from '@playwright/test'
import { atGate } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(300000)

const crowd = (page) => page.evaluate(() => window.mzansiCrowd())
// Stand at a spot for `seconds` (the game runs 10x fast under test) and keep the worst that was seen.
async function watch(page, seconds, settle = 4) {
  const worst = { near: 0, fixed: 0, still: 0, who: '', samples: 0 }
  const t0 = Date.now()
  while (Date.now() - t0 < seconds * 1000) {
    await page.waitForTimeout(400)
    const c = await crowd(page)
    if (Date.now() - t0 < settle * 1000) continue // (whoever was already walking past when you arrived moves on first)
    const me = c.near[0]
    worst.samples++
    worst.fixed = Math.max(worst.fixed, me.fixed)
    worst.near = Math.max(worst.near, me.fixed + me.walkers)
    for (const p of c.people) if (p.kind === 'walker' && !p.talking && p.still > worst.still) { worst.still = p.still; worst.who = p.id }
  }
  return worst
}

test('N1 standing on the library door spot: never more than 3 NPCs within 4 m, nobody stuck', async ({ page }) => {
  const errors = await atGate(page)
  const d = await page.evaluate(() => window.mzansiDoorOf('library'))
  await page.evaluate(([x, z]) => window.mzansiPlace(x, z, x, z + 5), [d.x, d.z])
  const limits = await crowd(page)
  const w = await watch(page, 40)
  console.log('N1', JSON.stringify(w))
  expect(w.samples).toBeGreaterThan(50)
  expect(w.near, 'NPCs within 4 m of the player').toBeLessThanOrEqual(limits.limit)
  expect(w.still, `${w.who} stood still`).toBeLessThanOrEqual(limits.stillLimit + 1)
  await page.screenshot({ path: 'docs/sprints/tester-fixes2/npc-library-door.png' })
  expect(errors).toEqual([])
})

test('N2 the tour card open in the middle of the Quad: the same rule holds', async ({ page }) => {
  const errors = await atGate(page)
  const q = await page.evaluate(() => window.mzansiPlaceOf('quad'))
  await page.evaluate(([x, z]) => window.mzansiPlace(x, z + 2, x, z + 8), [q.x, q.z])
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-help')))
  await expect(page.locator('.onboard')).toBeVisible()
  const limits = await crowd(page)
  const w = await watch(page, 30)
  console.log('N2', JSON.stringify(w))
  expect(w.near, 'NPCs within 4 m of the player').toBeLessThanOrEqual(limits.limit)
  expect(w.still, `${w.who} stood still`).toBeLessThanOrEqual(limits.stillLimit + 1)
  await page.screenshot({ path: 'docs/sprints/tester-fixes2/npc-quad-tour.png' })
  expect(errors).toEqual([])
})
