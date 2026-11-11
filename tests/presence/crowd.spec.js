// Tester fixes 2 (owner, 11 Nov), item 1, with two real players: A and B stand talking on a spot walkers head for
// (the library's door), B with A's card open. For about five game minutes, on BOTH phones: neither player ever
// has more than 3 NPCs within 4 m, and no walker stands on one spot longer than its pause between trips allows.
// (Before the fix walkers "gave way" to a standing player for ever, and did not see the other player at all.)
// Run: npx playwright test tests/presence/crowd.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/tester-fixes2'
const W = 412
const H = 915
const GAP = 12
const A_ORIGIN = 'http://127.0.0.1:5173'
const B_ORIGIN = 'http://localhost:5173'

test.use({ viewport: { width: W * 2 + GAP, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
test.use({ actionTimeout: 30000, navigationTimeout: 60000 })
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(600000)

const ROOM = `test-crowd-${Date.now().toString(36)}`
async function enrol(frame, origin, name, gender) {
  const q = `morning=0&room=${ROOM}`
  await frame.goto(`${origin}/?${q}#/new`)
  await frame.evaluate(() => localStorage.clear())
  await frame.goto(`${origin}/?${q}#/new`)
  await enrolUI(frame, { name, house: gender === 'male' ? 3 : 5, course: 1, gender })
  await frame.waitForURL(/#\/play/, { timeout: 30000 })
  await frame.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}
// (the game clock runs 10x fast, so five game minutes take half a real one)
async function campus(frame, origin) {
  await frame.goto(`${origin}/?fast=1&morning=0&room=${ROOM}&spawn=quad#/play`)
  await expect(frame.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
}

test('two players talking at the library door: no pile-up on either phone', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.route('http://phones.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0c0c10;display:flex;gap:${GAP}px">
    <iframe name="a" style="border:0;width:${W}px;height:${H}px"></iframe><iframe name="b" style="border:0;width:${W}px;height:${H}px"></iframe></body>` }))
  await page.goto('http://phones.test/')
  const A = page.frame({ name: 'a' })
  const B = page.frame({ name: 'b' })
  await enrol(A, A_ORIGIN, 'Thandeka', 'female')
  await campus(A, A_ORIGIN)
  await enrol(B, B_ORIGIN, 'Kabelo', 'male')
  await campus(B, B_ORIGIN)
  for (const f of [A, B]) await expect.poll(async () => (await f.evaluate(() => window.mzansiOthers())).length, { timeout: 30000 }).toBe(1)
  // both to the library's door spot, facing each other, a metre and a half apart
  const d = await A.evaluate(() => window.mzansiDoorOf('library'))
  for (const f of [A, B]) { const out = f.locator('.house-out'); if (await out.isVisible().catch(() => false)) await out.tap() }
  await A.evaluate(([x, z]) => window.mzansiPlace(x, z, x + 2, z), [d.x, d.z])
  await B.evaluate(([x, z]) => window.mzansiPlace(x + 1.5, z, x, z), [d.x, d.z])
  await expect.poll(async () => { const o = (await B.evaluate(() => window.mzansiOthers()))[0]; return o ? Math.hypot(o.x - d.x, o.z - d.z) : 99 }, { timeout: 20000 }).toBeLessThan(0.6)
  // B taps A where A stands on B's screen: A's card comes up (the two are "talking")
  const o = (await B.evaluate(() => window.mzansiOthers()))[0]
  const s = await B.evaluate(([x, z]) => window.mzansiScreenOf(x, z, 1.0), [o.x, o.z])
  await page.touchscreen.tap(W + GAP + s.x, s.y)
  await expect(B.locator('.pc-mini, .pc-sheet-wrap.on').first()).toBeVisible({ timeout: 15000 })

  const worst = { A: { near: 0, still: 0, who: '' }, B: { near: 0, still: 0, who: '' } }
  let limits = null
  const t0 = Date.now()
  while (Date.now() - t0 < 32000) {
    await page.waitForTimeout(400)
    for (const [k, f] of [['A', A], ['B', B]]) {
      const c = await f.evaluate(() => window.mzansiCrowd())
      limits = c
      if (Date.now() - t0 < 4000) continue // (whoever was already walking past moves on first)
      expect(c.near.length, 'the crowd sees both players').toBe(2)
      for (const me of c.near) worst[k].near = Math.max(worst[k].near, me.fixed + me.walkers)
      for (const p of c.people) if (p.kind === 'walker' && !p.talking && p.still > worst[k].still) { worst[k].still = p.still; worst[k].who = p.id }
    }
  }
  console.log('CROWD', JSON.stringify(worst))
  await page.screenshot({ path: `${OUT}/npc-two-players-talking.png` })
  for (const k of ['A', 'B']) {
    expect(worst[k].near, `phone ${k}: NPCs within 4 m of a player`).toBeLessThanOrEqual(limits.limit)
    expect(worst[k].still, `phone ${k}: ${worst[k].who} stood still`).toBeLessThanOrEqual(limits.stillLimit + 1)
  }
})
