// Tester fixes 2 (owner, 11 Nov), in the quick project (the NPC pile-up is in npc-crowd.spec.js):
//   F2 no fixed button overlaps another at 360, 390 and 414 px: in your house's common room (where the Home button
//      was hidden under the round map), out on campus, in the Caf and in SunnyBay. Home is visible and tappable.
//   F3 nothing is pre-picked on the student card: the course and every other choice start empty.
//   F4 "+ Group" and the chat tabs are readable (ink on yellow or on a light surface, 4.5:1 or better).
// Screenshots at 390 px (not committed): docs/sprints/tester-fixes2/.
import fs from 'node:fs'
import { test, expect } from '@playwright/test'
import { atGate, city, intoCity } from '../city.js'

test.setTimeout(300000)
const SHOTS = 'docs/sprints/tester-fixes2'
fs.mkdirSync(SHOTS, { recursive: true })

// Every button, link and tappable thing that is on screen and can take a finger, with its box. Two overlap when
// their boxes share more than a sliver and neither is inside the other in the page.
const overlaps = (page) => page.evaluate(() => {
  const seen = []
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input, select, .door-prompt')) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || Number(cs.opacity) < 0.05 || el.closest('[hidden]')) continue
    let dead = false
    for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) { dead = true; break } }
    if (dead) continue
    // (a sheet or a card that is open over the screen covers what is under it on purpose: those are not on show)
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
    const cover = top && top.closest('[role="dialog"], .g-sheet, .g-menu')
    if (cover && !cover.contains(el)) continue
    const name = (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)
    seen.push({ el, name, cls: String(el.className).slice(0, 30), l: r.left, t: r.top, r: r.right, b: r.bottom })
  }
  const out = []
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      const a = seen[i]
      const b = seen[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      const w = Math.min(a.r, b.r) - Math.max(a.l, b.l)
      const h = Math.min(a.b, b.b) - Math.max(a.t, b.t)
      if (w > 3 && h > 3) out.push(`"${a.name}" (${a.cls}) and "${b.name}" (${b.cls}) share ${Math.round(w)}x${Math.round(h)} px`)
    }
  }
  return out
})

for (const [w, h] of [[360, 740], [390, 844], [414, 896]]) {
  test(`F2 no fixed button overlaps another at ${w} px: house, campus, Caf, SunnyBay`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = await atGate(page)
    // at your own house's door, standing still: "Tap to enter <your house>" is the way home
    const door = await page.evaluate(() => window.mzansiDoorOf(window.mzansiHomeId()))
    await page.evaluate(([x, z]) => window.mzansiPlace(x, z + 0.6, x, z - 4), [door.x, door.z])
    const home = page.locator('.door-prompt')
    await expect(home).toBeVisible({ timeout: 20000 })
    await expect(home).toContainText('Tap to enter')
    await page.waitForTimeout(900)
    if (w === 390) await page.screenshot({ path: `${SHOTS}/home-prompt-390.png` })
    expect(await overlaps(page), 'at the house door').toEqual([])
    const box = await home.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(w)
    const hit = await home.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === top || el.contains(top) })
    expect(hit, 'the way home is the top thing where it is drawn').toBe(true)
    // turn the view all the way round, as a finger does: wherever the door lands on the screen (it was under the
    // round map), the prompt is clear of every fixed button
    const cdp = await context.newCDPSession(page)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 })) })
    // (tilted right down first: at a low tilt a door on the camera's side of you sits low on the screen, where the map is)
    await touch('touchStart', [[w / 2 + 60, 520]])
    for (let k = 1; k <= 12; k++) { await touch('touchMove', [[w / 2 + 60, 520 - k * 28]]); await page.waitForTimeout(25) }
    await touch('touchEnd', [])
    await page.waitForTimeout(600)
    let lowest = 0
    for (let turn = 0; turn < 8; turn++) {
      await touch('touchStart', [[w / 2 + 60, 330]])
      for (let k = 1; k <= 6; k++) { await touch('touchMove', [[w / 2 + 60 - k * 17, 330]]); await page.waitForTimeout(25) }
      await touch('touchEnd', [])
      await page.waitForTimeout(700)
      if (await home.isVisible()) { lowest = Math.max(lowest, (await home.boundingBox()).y); expect(await overlaps(page), `at the house door, view turned ${turn + 1} times`).toEqual([]) }
      if (w === 390 && turn === 5) await page.screenshot({ path: `${SHOTS}/home-prompt-turned-390.png` })
    }
    console.log(`F2 ${w} px: the prompt's lowest top edge ${Math.round(lowest)} of ${h}`)
    await expect(home).toBeVisible()
    // ...and it takes a tap: into the common room
    await home.tap()
    await expect(page.locator('#world')).toHaveAttribute('data-house', /.+/, { timeout: 30000 })
    // (its Things to do sheet opens with it: nothing on the sheet overlaps; then closed, the room's own buttons)
    await expect(page.locator('.g-sheet')).toBeVisible()
    expect(await overlaps(page), 'the house sheet').toEqual([])
    await page.locator('.g-sheet .g-sheet-head button').tap()
    await expect(page.locator('.g-sheet')).toHaveCount(0)
    await page.waitForTimeout(600)
    if (w === 390) await page.screenshot({ path: `${SHOTS}/house-390.png` })
    expect(await overlaps(page), 'in the house').toEqual([])
    await page.locator('.house-out').tap()
    await expect(page.locator('#world')).not.toHaveAttribute('data-house', /.+/)
    // out on campus, on the Quad
    await page.evaluate(() => { const q = window.mzansiPlaceOf('quad'); window.mzansiPlace(q.x + 6, q.z + 9, q.x, q.z) })
    await page.waitForTimeout(900)
    if (w === 390) await page.screenshot({ path: `${SHOTS}/campus-390.png` })
    expect(await overlaps(page), 'on campus').toEqual([])
    // the Caf
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
    await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
    await page.waitForTimeout(600)
    expect(await overlaps(page), 'in the Caf').toEqual([])
    await page.locator('.caf-out').tap()
    await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
    // SunnyBay
    await page.evaluate(() => window.mzansiPlace(0, 99, 0, 104))
    await intoCity(page)
    await page.waitForTimeout(600)
    if (w === 390) await page.screenshot({ path: `${SHOTS}/sunnybay-390.png` })
    expect(await overlaps(page), 'in SunnyBay').toEqual([])
    expect(errors).toEqual([])
    await context.close()
  })
}

// ---------- F3 nothing is pre-picked on the student card ----------
test('F3 the student card: no course (or anything else) is picked for you', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = await atGate(page, { patch: { cardDone: false, cardAsked: '' } })
  const run0 = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run0.quick).toBe(true)
  expect(run0.character.course, 'the game still has a course for your lectures').toBeTruthy()
  expect(run0.character.courseAuto).toBe(true)
  // on the card other players see: no course until you pick one
  const card0 = await page.evaluate(async () => (await import('/src/cards.js')).cardOf(JSON.parse(localStorage.getItem('mzansiville.v1')).run))
  expect(card0.tags).toEqual({ course: '', vibe: '', looking: '' })
  // the editor: every choice of the vibe step starts empty
  await page.evaluate(() => window.mzansiLaunch.promptCard())
  await page.locator('.sl-pop [data-lp="card-now"]').tap()
  await page.locator('.en[data-step="look"]').waitFor()
  for (const step of ['roommate', 'who', 'vibe']) {
    await page.locator('[data-act="enrol-next"]').tap()
    await page.locator(`.en[data-step="${step}"]`).waitFor()
  }
  for (const key of ['course', 'vibe', 'looking']) await expect(page.locator(`[data-pick="${key}"][aria-pressed="true"]`), `${key}: nothing picked`).toHaveCount(0)
  await expect(page.locator('[data-k="bio"][aria-pressed="true"]')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/card-nothing-picked-390.png` })
  // Next without a course asks for one, and stays
  await page.locator('[data-act="enrol-next"]').tap()
  await expect(page.locator('.en-note')).toHaveText('Pick your course.')
  await expect(page.locator('.en[data-step="vibe"]')).toBeVisible()
  // pick one that is not the drawn one: it is yours, and on your card
  const other = await page.evaluate((mine) => [...document.querySelectorAll('[data-pick="course"]')].map((b) => b.dataset.v).find((v) => v !== mine), run0.character.course)
  await page.locator(`[data-pick="course"][data-v="${other}"]`).tap()
  await expect(page.locator(`[data-pick="course"][data-v="${other}"]`)).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-act="enrol-next"]').tap()
  await page.locator('.en[data-step="card"]').waitFor()
  await page.locator('[data-act="enrol-enter"]').tap()
  await page.waitForURL(/#\/play/, { timeout: 30000 })
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)).cardDone, { timeout: 15000 }).toBe(true)
  const run1 = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run1.character.course).toBe(other)
  expect(run1.character.courseAuto).toBe(false)
  const card1 = await page.evaluate(async () => (await import('/src/cards.js')).cardOf(JSON.parse(localStorage.getItem('mzansiville.v1')).run))
  expect(card1.tags.course).toBe(other)
  expect(errors).toEqual([])
  await context.close()
})

// ---------- F4 "+ Group" and the chat tabs can be read ----------
test('F4 "+ Group" and the chat tabs: ink on yellow, 4.5:1 or better', async ({ browser }) => {
  const { chatServer } = await import('../chat-server.js')
  const server = await chatServer()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await server.routeChat(page)
  const errors = await atGate(page, { query: `&chat=1&room=test-tf2-${Date.now().toString(36)}`, name: 'Ayanda' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  await page.locator('.tb-chat').tap()
  await expect(page.locator('.cht-sheet')).toBeVisible()
  const look = (sel) => page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el)
    const rgb = (v) => v.match(/[\d.]+/g).slice(0, 3).map(Number)
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const fg = rgb(cs.color)
    const bg = rgb(cs.backgroundColor)
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    return { fg: fg.join(','), bg: bg.join(','), ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), h: Math.round(el.getBoundingClientRect().height) }
  })
  const group = await look('.cht-sheet [data-ct="new"]')
  expect(group).toMatchObject({ fg: '28,25,21', bg: '240,196,0' })
  expect(group.ratio).toBeGreaterThanOrEqual(4.5)
  expect(group.h).toBeLessThan(60) // (a button, not a screen-tall block)
  const tab = await look('.cht-tabs button[aria-selected="true"]')
  expect(tab).toMatchObject({ fg: '28,25,21', bg: '240,196,0' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/chat-group-button-390.png` })
  // the form it opens: Create is ink on yellow too
  await page.locator('.cht-sheet [data-ct="new"]').tap()
  const create = await look('.cht-new button[type="submit"]')
  expect(create.ratio).toBeGreaterThanOrEqual(4.5)
  expect(errors).toEqual([])
  await context.close()
})
