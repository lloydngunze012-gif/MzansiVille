// Home country on the name tag (owner, 9 Nov): a Nigerian player and a South African one on the same campus see
// each other's name tag with a small drawn flag. Two phones side by side, as in presence.spec.js (own test room, so
// nobody on the live campus sees them). Screenshots (on the PC, not committed): docs/sprints/cast-roommates/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/cast-roommates'
const ROOM = `test-flag-${Date.now().toString(36)}`
const W = 390
const H = 844
const GAP = 12
const A_ORIGIN = 'http://127.0.0.1:5173'
const B_ORIGIN = 'http://localhost:5173'

test.use({ viewport: { width: W * 2 + GAP, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
test.setTimeout(400000)
test.use({ actionTimeout: 30000, navigationTimeout: 60000 })
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] } })

async function enrol(frame, origin, name, gender, extra = {}) {
  const q = `morning=0&room=${ROOM}`
  await frame.goto(`${origin}/?${q}#/new`)
  await frame.evaluate(() => localStorage.clear())
  await frame.goto(`${origin}/?${q}#/new`)
  await enrolUI(frame, { name, house: 1, course: 1, gender, ...extra })
  await frame.waitForURL(/#\/play/, { timeout: 30000 })
  await frame.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

let opens = 0
async function open(frame, origin) {
  await frame.goto(`${origin}/?morning=0&room=${ROOM}&visit=${++opens}#/play`)
  await expect(frame.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  for (let i = 0; i < 3; i++) {
    const card = frame.locator('[role="dialog"] button:visible').first()
    if (!(await card.isVisible().catch(() => false))) break
    await card.tap()
    await frame.waitForTimeout(800)
  }
  const out = frame.locator('.house-out')
  if (await out.isVisible().catch(() => false)) { await out.tap(); await frame.waitForTimeout(800) }
}

const others = (frame) => frame.evaluate(() => window.mzansiOthers())

test('a Nigerian player and a South African one: each name tag carries its flag', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.route('http://phones.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;display:flex;gap:${GAP}px;background:#222">
    <iframe name="a" style="border:0;width:${W}px;height:${H}px" allow="autoplay"></iframe>
    <iframe name="b" style="border:0;width:${W}px;height:${H}px" allow="autoplay"></iframe></body>` }))
  await page.goto('http://phones.test/')
  const A = page.frame({ name: 'a' })
  const B = page.frame({ name: 'b' })
  await enrol(A, A_ORIGIN, 'Thandeka', 'female')
  await open(A, A_ORIGIN)
  await enrol(B, B_ORIGIN, 'Chinedu', 'male', { country: 'Nigeria' })
  await open(B, B_ORIGIN)
  await expect.poll(async () => (await others(A)).length === 1 && (await others(B)).length === 1, { timeout: 30000, intervals: [250] }).toBe(true)
  // A sees Chinedu with the Nigerian flag; B sees Thandeka with South Africa's.
  await expect.poll(async () => (await others(A))[0]?.flagDrawn, { timeout: 20000 }).toBe(true)
  await expect.poll(async () => (await others(B))[0]?.flagDrawn, { timeout: 20000 }).toBe(true)
  const [oa, ob] = [(await others(A))[0], (await others(B))[0]]
  expect(oa).toMatchObject({ country: 'Nigeria' })
  expect(oa.tag).toContain('Chinedu')
  expect(ob).toMatchObject({ country: 'South Africa' })
  expect(ob.tag).toContain('Thandeka')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/name-tag-flags-390.png` })
})
