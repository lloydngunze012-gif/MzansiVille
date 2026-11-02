// K10: open and close every card type (event, map, talk, place, day summary) by touch,
// then the stick moves the player on the first frame (within 100 ms at 20 fps or
// more). Only an open card pauses movement.
// npx playwright test tests/basics/cards.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, OUT, student, finger, stickBox, read, saveVideo, tapOn } from './touch.js'

test.use(PHONE)
test.describe.configure({ timeout: 400000 })

// No card left on screen (the next one in a queue is dismissed too).
async function clearCards(page, f) {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(400)
    const open = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((el) => { const r = el.getBoundingClientRect(); return r.height && r.top < innerHeight - 4 && r.bottom > 4 }) || Boolean(document.querySelector('.map-overlay:not([hidden])')))
    if (!open) return
    const next = page.locator('[role="dialog"] [data-act="dismiss"], [role="dialog"] [data-act="talk-bye"], [role="dialog"] [data-act="close-sheet"]').first()
    if (await next.count()) await tapOn(page, f, next)
  }
}

// Push the stick: how long from the finger going down (its event time) to the first
// frame the player has moved (read from the page, nothing driven by it).
async function stickLatency(page, f) {
  const s = await stickBox(page)
  await page.evaluate(() => new Promise((resolve) => {
    const world = document.querySelector('#world')
    const k = { from: `${world.dataset.px},${world.dataset.pz}`, down: 0, moved: 0 }
    window.__k10 = k
    document.querySelector('.stick').addEventListener('pointerdown', (e) => { k.down = e.timeStamp }, { once: true })
    const watch = (t) => {
      if (k.down) k.frames = (k.frames || 0) + 1
      if (k.down && `${world.dataset.px},${world.dataset.pz}` !== k.from) { k.moved = t; k.at = performance.now(); k.fps = world.dataset.fps; return }
      requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
    resolve()
  }))
  await f.down(s.x, s.y - s.r * 0.6)
  await f.move(s.x, s.y - s.r * 0.65)
  await expect.poll(() => page.evaluate(() => window.__k10.moved), { timeout: 5000 }).toBeGreaterThan(0)
  await page.waitForTimeout(400)
  await f.up()
  return page.evaluate(() => ({ ms: Math.round(window.__k10.moved - window.__k10.down), frames: window.__k10.frames, fps: Number(window.__k10.fps) }))
}

test('K10 open and close every card type, then the stick moves you within 100 ms', async ({ page }) => {
  // (setup, not play: an event waiting in the save, as the day would bring one)
  await student(page, { spawn: 'quad', run: { queue: [{ id: 'k10-event', kind: 'event', title: 'NSFAS is late', text: 'Your allowance has not landed.', choices: ['Call home', 'Wait it out'], eventId: 'nsfas_delayed' }] } })
  const f = await finger(page)
  const results = {}

  // 1. Event.
  await expect(page.locator('.g-event')).toBeVisible({ timeout: 20000 })
  await tapOn(page, f, page.locator('.g-event [data-act="choice"]').first())
  await clearCards(page, f)
  results.event = await stickLatency(page, f)

  // 2. Map.
  await tapOn(page, f, page.locator('.minimap'))
  await expect(page.locator('.map-overlay')).toBeVisible()
  await tapOn(page, f, page.locator('.map-overlay [data-map="close"]'))
  await clearCards(page, f)
  results.map = await stickLatency(page, f)

  // 3. Talk: the nearest person on screen (you walk up, the chat opens on arrival).
  for (let i = 0; i < 6 && !(await page.locator('.g-talk').isVisible()); i++) {
    const who = await page.evaluate(() => {
      const p = window.mzansiPlayerPos()
      return window.mzansiPeople()
        .filter((o) => !['auntie_pinky', 'mam_gugu'].includes(o.id))
        .map((o) => ({ s: window.mzansiPersonOnScreen(o.id), d: Math.hypot(o.x - p.x, o.z - p.z) }))
        .filter((o) => o.s && !o.s.behind && o.s.x > 40 && o.s.x < 372 && o.s.y > 230 && o.s.y < 700)
        .sort((a, b) => a.d - b.d)[0]?.s || null
    })
    if (who) await f.tap(who.x, who.y)
    await page.locator('.g-talk').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  }
  await expect(page.locator('.g-talk')).toBeVisible()
  await page.screenshot({ path: `${OUT}/K10-talk.png` })
  await clearCards(page, f)
  results.talk = await stickLatency(page, f)

  // 4. Place: the map's pin for the Quad; its sheet opens on arrival.
  await tapOn(page, f, page.locator('.minimap'))
  await expect(page.locator('.map-overlay')).toBeVisible()
  await page.waitForTimeout(800)
  await tapOn(page, f, page.locator('.map-pin[data-place="quad"]'))
  await expect(page.locator('.g-sheet')).toBeVisible({ timeout: 40000 })
  await page.screenshot({ path: `${OUT}/K10-place.png` })
  await tapOn(page, f, page.locator('.g-sheet [data-act="close-sheet"]'))
  await clearCards(page, f)
  results.place = await stickLatency(page, f)

  // 5. Day summary (setup: the day is over in the save), then the next day.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { mode: 'summary', queue: [], summary: { day: 1, slept: true, stats: { ...save.run.stats } } })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.reload()
  await expect(page.locator('.g-summary')).toBeVisible({ timeout: 30000 })
  await page.screenshot({ path: `${OUT}/K10-summary.png` })
  await tapOn(page, f, page.locator('.g-summary [data-act="next"]'))
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  await clearCards(page, f)
  await page.waitForTimeout(1500)
  results.summary = await stickLatency(page, f)

  console.log('K10', JSON.stringify(results))
  // The game's part: you move on the first frame drawn after the finger goes down.
  // In time that's one frame: under 100 ms wherever the screen draws 20 fps or more (a
  // phone draws 60, 17 ms); a test machine drawing fewer can't show it any sooner.
  for (const [card, r] of Object.entries(results)) {
    expect(r.frames, `${card}: the stick moves you on the first frame`).toBeLessThanOrEqual(1)
    if (r.fps >= 20) expect(r.ms, `${card}: the stick moves you within 100 ms`).toBeLessThan(100)
  }
  await saveVideo(page, 'K10-cards')
})
