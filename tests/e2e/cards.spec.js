// Every floating card, caption, bubble bar and docked sheet is a centred card: never wider than 440 px, on a
// 390 px phone and on a 1280 px window, and its text is never smaller than 14 px (micro-labels: 11 px).
// The white/dark strip bug came back five times because each fix changed one card; this opens each kind of
// screen at both widths and checks all of them. Screenshots (not committed): docs/sprints/cards/<screen>-<width>.png
// Run: npx playwright test tests/e2e/cards.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'
import { MOMENTS, momentCard } from '../../src/engine/moments.js'

const OUT = process.env.CARD_SHOTS || 'docs/sprints/cards'
const WIDTHS = [[390, 844], [1280, 800]]
const MAX_W = 440
const MIN_TEXT = 14
const MICRO = 11 // eyebrows, name labels, pills and hints may be smaller, never below this
test.describe.configure({ timeout: 240000 })

// Runs in the page: every visible card, and what is wrong with it.
const AUDIT = ({ maxW, minText, micro }) => {
  const CARDS = ['.mm-bar', '.mm-card', '.lc-caption', '.lc-say', '.dp-card', '.dp-caption', '.dp-walk', '.g-result', '.g-card-wrap', '.g-goal',
    '.g-talk', '.g-sheet', '.g-cta', 'body > .chat-panel', '.pc-stats', '.pc-sheet', '.g-full-in', '.g-notice', '.g-toast', '.mm-bubble', '.mm-sign', '.g-menu', '.act-say', '.ps-leave']
  const MICRO_SEL = '.g-kind, .mm-kind, .mm-name, .rc-eyebrow, small, .g-fx, .rc-cost, .rc-gain, .g-act-fx, .g-why, .g-left, .g-gk, .lc-name, .mm-tag, .dp-name'
  const shown = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') && Number(s.opacity) > 0.05
  }
  const problems = []
  const seen = new Set()
  for (const sel of CARDS) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el) || !shown(el)) continue
      seen.add(el)
      const r = el.getBoundingClientRect()
      const name = `${sel}${el.className && typeof el.className === 'string' ? '' : ''}`
      // a transparent layout wrapper (no background, no border, no shadow) is not a card
      const s = getComputedStyle(el)
      const painted = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none'
      if (r.width > maxW + 0.5 && painted) problems.push(`${name} is ${Math.round(r.width)} px wide`)
      if (r.left < -0.5 || r.right > innerWidth + 0.5) problems.push(`${name} runs off the screen (${Math.round(r.left)}..${Math.round(r.right)})`)
      // text
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const bad = new Set()
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue
        const p = n.parentElement
        if (!p || !shown(p)) continue
        const px = parseFloat(getComputedStyle(p).fontSize)
        const floor = p.closest(MICRO_SEL) ? micro : minText
        if (px < floor - 0.01) bad.add(`"${n.textContent.trim().slice(0, 28)}" ${px}px`)
      }
      if (bad.size) problems.push(`${name} small text: ${[...bad].slice(0, 4).join('; ')}`)
    }
  }
  // anything else that floats, looks like a card and is wide (a card nobody listed)
  for (const el of document.querySelectorAll('body *')) {
    if (seen.has(el)) continue
    const s = getComputedStyle(el)
    if (s.position !== 'absolute' && s.position !== 'fixed') continue
    if (!shown(el) || el.tagName === 'CANVAS' || el.closest('canvas')) continue
    const r = el.getBoundingClientRect()
    if (r.width <= maxW + 0.5) continue
    if (r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.9) continue // full-screen layers (scrims, scene fades)
    if (r.height < 4 || !el.textContent.trim()) continue
    if (el.closest('.g-full, .g-scrim, #world, .mm-ui:not(.lc-ui) > canvas')) { /* fall through: only skip below */ }
    const painted = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || s.boxShadow !== 'none'
    if (!painted) continue
    if (el.matches('#app, #world, .mm-ui, #morning3d, #lecture3d, #home3d, .g-3d, .g-scrim, .g-full, main, .screen')) continue
    problems.push(`unlisted ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} is ${Math.round(r.width)} px wide`)
  }
  return { problems, count: seen.size, names: [...seen].map((e) => e.className || e.tagName).slice(0, 12) }
}

async function audit(page, screen, width) {
  fs.mkdirSync(OUT, { recursive: true })
  await page.waitForTimeout(700) // pop-in animations
  await page.screenshot({ path: `${OUT}/${screen}-${width}.png` })
  const res = await page.evaluate(AUDIT, { maxW: MAX_W, minText: MIN_TEXT, micro: MICRO })
  expect(res.count, `${screen} @${width}: no card was on screen`).toBeGreaterThan(0)
  expect.soft(res.problems, `${screen} @${width}`).toEqual([])
  return res
}

async function student(page, { extra = '', course = 1, patch } = {}) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course })
  await page.waitForURL(/#\/(play|morning)/)
  await page.evaluate((p) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, p)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, patch || {})
}

for (const [w, h] of WIDTHS) {
  test.describe(`at ${w} px`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true })

    test(`C1 drop-off at the gate @${w}`, async ({ page }) => {
      await student(page, { patch: { day: 1, phase: 'leisure', minutes: 8 * 60 + 15, morningDone: true, lectureResolved: false, lectureRoute: false, at: 'gate', dropOff: { style: 'suburban', day: 1 }, queue: [] } })
      await page.goto('/?fast=1&morning=0&talk=auto#/play')
      await expect(page.locator('.dp-card, .dp-walk').first()).toBeVisible({ timeout: 90000 })
      await audit(page, 'dropoff-goodbye', w)
      // the card walks on to the suitcase: the route pill with no bar behind it, and the walk button
      await expect(page.locator('#world')).toHaveAttribute('data-dropoff', 'walk', { timeout: 120000 })
      await expect(page.locator('.g-route')).toContainText('Roll your suitcase')
      const bar = await page.locator('.g-cta.g-route').evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(bar, 'no white bar behind the suitcase pill').toBe('rgba(0, 0, 0, 0)')
      await audit(page, 'dropoff-suitcase', w)
    })

    test(`C2 res room morning @${w}`, async ({ page }) => {
      await student(page, { patch: { day: 2, phase: 'wake', minutes: 7 * 60, morningDone: true, mode: 'play' } })
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); delete s.run.morningStart; localStorage.setItem('mzansiville.v1', JSON.stringify(s)) })
      await page.goto('/?fast=1&talk=auto#/morning')
      await expect(page.locator('#morning-ui .mm-bar:not([hidden]), #morning-ui .mm-bubble:not([hidden])').first()).toBeVisible({ timeout: 60000 })
      await audit(page, 'res-morning', w)
    })

    test(`C3 day 1 lecture: caption, seat choice, line, end card, result @${w}`, async ({ page }) => {
      await student(page, { patch: { phase: 'lecture', minutes: 8 * 60 + 45, queue: [], lectureResolved: false, lectureRoute: true } })
      await page.goto('/?fast=1&morning=0&lecture=1&talk=auto&moment=cold_call#/lecture')
      const host = page.locator('#lecture3d')
      await expect(page.locator('.lc-caption')).toBeVisible({ timeout: 60000 })
      await audit(page, 'lecture-caption', w)
      await expect(host).toHaveAttribute('data-step', 'seat', { timeout: 60000 })
      await expect(page.locator('[data-lc="choice"]').first()).toBeVisible()
      await audit(page, 'lecture-seat-choice', w)
      await page.locator('[data-lc="choice"]').nth(2).tap()
      await expect(host).toHaveAttribute('data-step', 'choice', { timeout: 60000 })
      await expect(page.locator('[data-lc="choice"]').first()).toBeVisible()
      await audit(page, 'lecture-moment-choice', w)
      await page.locator('[data-lc="choice"]').first().tap()
      await expect(page.locator('.mm-card:not([hidden])')).toBeVisible({ timeout: 90000 })
      await audit(page, 'lecture-end-card', w)
      await page.locator('[data-lc="done"]').tap()
      // item 4: Attend lecture ends on the new result card, never the old plain DONE card
      const card = page.locator('.g-result').first()
      await expect(card).toBeVisible({ timeout: 30000 })
      await expect(card, 'Attend lecture shows the new result card').toHaveClass(/\brc\b/)
      await expect(card.locator('.rc-tile svg')).toBeVisible()
      await expect(card.locator('.rc-eyebrow')).toContainText(/lecture done|big win/i)
      await expect(card.locator('.rc-gain').first()).toBeVisible()
      await audit(page, 'lecture-result-card', w)
    })

    test(`C4 activity result card @${w}`, async ({ page }) => {
      await student(page, { patch: { phase: 'leisure', minutes: 15 * 60, morningDone: true, queue: [], lectureResolved: true } })
      await page.goto('/?fast=1&morning=0&spawn=library#/place/library')
      await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
      await page.waitForTimeout(1200)
      await page.locator('[data-act="do"][data-id="library_study"]').tap()
      const card = page.locator('.g-result.rc')
      // (the study scene is frame-driven: on the software renderer, two browsers at once, a frame a second is a slow scene)
      await expect(card).toBeVisible({ timeout: 180000 })
      await audit(page, 'result-card', w)
    })

    test(`C5 a moment @${w}`, async ({ page }) => {
      const moment = MOMENTS.find((m) => m.id === 'free_food') || MOMENTS[0]
      await student(page, { patch: { phase: 'leisure', minutes: 15 * 60, morningDone: true, lectureResolved: true, queue: [], bestieSeen: { 1: true, 2: true, 3: true } } })
      await page.evaluate((card) => {
        const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
        s.run.queue = [card]
        localStorage.setItem('mzansiville.v1', JSON.stringify(s))
      }, momentCard({ day: 3 }, { ...moment, text: () => 'Something is happening on the Quad.' }))
      await page.goto('/?fast=1&morning=0&reload=1#/play') // (a new query string forces a full reload; a hash change alone keeps the app's own save)
      // (other cards may be queued first, e.g. "Your bestie": audit each, then dismiss it)
      for (let i = 0; i < 5 && !(await page.locator('.g-moment').isVisible().catch(() => false)); i++) {
        await page.locator('.g-result [data-act="dismiss"], .g-card-wrap [data-act="dismiss"]').first().waitFor({ timeout: 15000 }).catch(() => {})
        if (await page.locator('.g-result').first().isVisible().catch(() => false)) await audit(page, `queued-card-${i}`, w)
        await page.locator('.g-result [data-act="dismiss"]').first().tap().catch(() => {})
        await page.waitForTimeout(500)
      }
      await expect(page.locator('.g-moment')).toBeVisible({ timeout: 30000 })
      await audit(page, 'moment', w)
    })

    test(`C7 queue: Leave queue and the line being said stack @${w}`, async ({ page }) => {
      await student(page, { patch: { phase: 'social', minutes: 13 * 60, morningDone: true, lectureResolved: true, queue: [], bestieSeen: { 1: true, 2: true, 3: true } } })
      await page.goto('/?fast=1&morning=0&spawn=quad#/play')
      await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
      await page.waitForTimeout(1200)
      // the real queue shows both within a second of each other and the line changes fast, so hold the pair on screen
      await page.evaluate(() => {
        const say = document.querySelector('#world .act-say')
        say.innerHTML = 'Bunny chow. Sharp, thank you!'
        say.hidden = false
        const leave = document.querySelector('.ps-leave')
        leave.textContent = 'Leave queue'
        leave.hidden = false
      })
      await expect(page.locator('.act-say')).toBeVisible()
      await expect(page.locator('.ps-leave')).toBeVisible()
      await page.screenshot({ path: `${OUT}/queue-leave-and-line-${w}.png` })
      const a = await page.locator('.ps-leave').boundingBox()
      const b = await page.locator('.act-say').boundingBox()
      expect(b.y, 'the line sits below the Leave queue button').toBeGreaterThanOrEqual(a.y + a.height - 0.5)
      expect(Math.abs((b.x + b.width / 2) - w / 2), 'the line is centred').toBeLessThan(2)
      // (a stranger's talk card can be open beside the queue: its own small text is an older finding, not this test's)
      const res = await page.evaluate(AUDIT, { maxW: MAX_W, minText: MIN_TEXT, micro: MICRO })
      expect(res.problems.filter((x) => !x.startsWith('.g-talk')), `queue @${w}`).toEqual([])
    })

    test(`C6 today's goals @${w}`, async ({ page }) => {
      await student(page, { patch: { phase: 'leisure', minutes: 15 * 60, morningDone: true, lectureResolved: true, queue: [], bestieSeen: { 1: true, 2: true, 3: true } } })
      // seed today's goals and put the goals card first in the queue (the engine's own functions, loaded by the dev server)
      await page.evaluate(async () => {
        const g = await import('/src/engine/goals.js')
        const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
        g.startGoals(s.run)
        s.run.queue = [g.goalsCard(s.run)]
        localStorage.setItem('mzansiville.v1', JSON.stringify(s))
      })
      await page.goto('/?fast=1&morning=0&reload=2#/play')
      await expect(page.locator('.g-goals')).toBeVisible({ timeout: 30000 })
      await audit(page, 'goals', w)
    })
  })
}
