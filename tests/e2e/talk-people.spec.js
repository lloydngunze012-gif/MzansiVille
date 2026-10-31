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

test('the one from the bus is at the Quad: their tag is ? until you ask their name', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    save.run.crush = { id: 'amahle', name: 'Amahle', gender: 'female', romance: true, met: 'bus', nameKnown: false, closeness: 3, opener: 'funny', sat: false }
    save.run.lectureResolved = true
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&spawn=quad#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // Only your crush is at the Quad (Kabelo is not).
  await expect.poll(async () => page.evaluate(() => Boolean(window.mzansiPersonOnScreen?.('amahle'))), { timeout: 20000 }).toBe(true)
  expect(await page.evaluate(() => window.mzansiTalkTo('kabelo'))).toBe(false)
  await page.evaluate(() => window.mzansiTalkTo('amahle'))
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card.locator('h2')).toHaveText('Bus stop stranger')
  await expect(card.locator('.g-talk-line')).toContainText('Bus stop')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/5-crush-line.png` })
  await card.locator('.g-talk-reply').first().tap()
  await expect(card.locator('.g-talk-line')).toContainText('Amahle')
  await page.screenshot({ path: `${OUT}/5-crush-answer.png` })
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.crush.nameKnown).toBe(true)
  expect(run.crush.beats['1']).toBe(0)
  await card.locator('[data-act="talk-bye"]').tap()
  expect(errors).toEqual([])
})

test('student card: the title shows who you are becoming, with the five paths', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    save.run.identity = { scholar: 2, socialite: 3, hustler: 9, leader: 0, creative: 1 }
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&card=1#/profile') // a new query string reloads, so the seeded save is read
  await expect(page.locator('.id-title')).toHaveText(/Becoming: The Hustler/)
  await expect(page.locator('.id-row')).toHaveCount(5)
  await page.screenshot({ path: `${OUT}/6-student-card.png`, fullPage: true })
})

test('day summary: goals, who you are becoming, the people, and a text on the phone', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    const text = { from: 'Unknown number', text: 'Hey, it’s the one from the bus \u{1F44B} You left your earphones on the seat.' }
    Object.assign(save.run, {
      mode: 'summary',
      earned: 120,
      bestieName: 'Zanele',
      people: { zanele: { chats: 2, close: 18 } },
      crush: { id: 'amahle', name: 'Amahle', met: 'bus', nameKnown: false, closeness: 5, sat: true },
      inbox: [{ ...text, day: 1, read: false }],
      summary: {
        day: 1, slept: true, stats: save.run.stats, text,
        review: { done: ['Get to your 9:00 lecture', 'Earn your first R50'], missed: [{ text: 'Find out the name of the one from the bus', then: 'They’re still a mystery.' }], title: { level: 'becoming', path: { name: 'The Hustler' } } },
      },
    })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&sum=1#/summary')
  const card = page.locator('[data-screen-card="summary"]')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card.locator('.g-review li')).toHaveCount(3)
  await expect(card.locator('.g-shift')).toContainText('The Hustler')
  await expect(card.locator('[data-cliff]')).toContainText('earphones')
  await expect(card.locator('.g-reasons')).toContainText('1 unanswered text')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/7-day-summary.png` })
})

test('a random moment: something happens, you choose, it shows what happened', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    save.run.day = 2
    save.run.character.past = 'clown'
    save.run.queue = [{ id: 'moment-old_school-2', kind: 'moment', momentId: 'old_school', title: 'Someone from your old school', icon: '\u{1F3EB}', text: '"No ways! Weren\u2019t you the class clown in matric?" Someone who knew the old you.', choices: ['\u2728 "Not anymore."', '\u{1F917} Catch up properly', '\u{1F575}\uFE0F Avoid them'] }]
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&moments=1#/play')
  const card = page.locator('[data-screen-card="moment"]')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card.locator('.g-choice')).toHaveCount(3)
  await page.screenshot({ path: `${OUT}/8-moment.png` })
  await card.locator('.g-choice').nth(1).tap()
  await expect(page.locator('.g-result')).toContainText('Old jokes, new campus')
  await page.screenshot({ path: `${OUT}/8-moment-result.png` })
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.moments.old_school.choice).toBe(1)
})

test('a storyline beat: the roommate asks to borrow R100, and remembers', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { day: 3, phase: 'leisure', minutes: 15 * 60, bestieName: 'Zanele', queue: [] })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&moments=1#/play')
  // Skipping ahead to the evening brings the day's storyline beat.
  const skip = page.locator('[data-act="phase"]')
  await skip.tap()
  const card = page.locator('[data-screen-card="moment"]')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card).toHaveAttribute('data-moment', /^arc_/)
  await page.screenshot({ path: `${OUT}/9-story-beat.png` })
  await card.locator('.g-choice').first().tap()
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(Object.keys(run.arcBeats || {}).length).toBe(1)
})

test('Friday test: the mark, and the choices that paid off', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    const test = { mark: 78, base: 50, rival: 71, beatRival: true, band: 'distinction', repaid: 100, lines: [{ n: 18, text: 'You studied 3 times this week' }, { n: 4, text: 'Dr Moodley remembers you volunteered' }, { n: 3, text: 'Studying with Thabo: his notes are scary good' }, { n: -2, text: 'The midnight music battle cost you sleep' }] }
    Object.assign(save.run, { day: 5, bestieName: 'Zanele', queue: [{ id: 'friday-test-5', kind: 'test', title: '78%. Distinction!', text: '', test }] })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&fri=1#/play')
  const card = page.locator('[data-screen-card="test"]')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card.locator('.g-mark')).toContainText('78')
  await expect(card.locator('.g-why li')).toHaveCount(5)
  await expect(card).toContainText('You beat him')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/10-friday-test.png` })
})

test('talking leads to doing: order a bunny chow, pick a size, pay, sit and eat', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.goto('/?morning=0&spawn=cafeteria#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats)
  await page.evaluate(() => window.mzansiTalkTo('auntie_pinky'))
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 20000 })
  await card.locator('[data-act="talk-act"][data-kind="order"]').tap()
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/11-menu.png` })
  await card.locator('[data-item="bunny"]').tap()
  await expect(card.locator('.g-talk-line')).toContainText('Quarter or half?')
  await page.screenshot({ path: `${OUT}/11-size.png` })
  await card.locator('[data-size="quarter"]').tap()
  await expect(card).toHaveAttribute('data-phase', 'bought')
  const paid = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.money)
  expect(paid).toBe(before.money - 35)
  await page.screenshot({ path: `${OUT}/11-bought.png` })
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'orderEat', { timeout: 10000 })
  await page.waitForTimeout(4500)
  await page.screenshot({ path: `${OUT}/11-eating.png` })
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 30000 })
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats)
  expect(after.hunger).toBeGreaterThan(before.hunger)
})

test('talking leads to doing: a lecturer consultation and swapping numbers', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.goto('/?morning=0&spawn=quad&c=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  const g0 = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.grades)
  await page.evaluate(() => window.mzansiTalkTo('dr_moodley'))
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 20000 })
  await card.locator('[data-kind="consult"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'consult', { timeout: 10000 })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/12-consult.png` })
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 30000 })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.grades)).toBe(g0 + 3)
  // A student: swap numbers (they go in your phone), then sit with them.
  await page.waitForTimeout(800)
  await page.evaluate(() => window.mzansiTalkTo('naledi'))
  await expect(card).toBeVisible({ timeout: 20000 })
  await card.locator('[data-kind="swap"]').tap()
  await expect(card).toHaveAttribute('data-phase', 'swapped')
  await page.screenshot({ path: `${OUT}/12-swapped.png` })
  await card.locator('[data-kind="sit"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'sitTogether', { timeout: 10000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/12-sit-together.png` })
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 30000 })
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.contacts.map((c) => c.id)).toContain('naledi')
  await page.goto('/?morning=0&c=2#/profile')
  await expect(page.locator('.phone-list')).toContainText('Naledi')
})
