// The 33 common-room, cafeteria and sports rows added in 13d00e1 each play an existing
// scene. One student; for each activity the save is moved to that activity's phase,
// the game reloads at the place (your common room's Things to do, or the place's sheet)
// and the action is tapped like a player would. Each must open (a scene starts) and
// close (the scene is done) within 20 s of the tap, with no page errors. The test runs
// all 33, then lists every one that failed and why (it doesn't stop at the first).
// Results: test-results/new-activities/report.json, a screenshot per activity.
// Run: npx playwright test tests/e2e/new-activities.spec.js --config playwright.gpu.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/new-activities'
const LIMIT = 20000
test.setTimeout(45 * 60 * 1000)

// The activity's phase (activities.csv, through meta.json phaseAliases) and a time in it.
const PHASE = { morning: ['wake', 7 * 60 + 30], lecture: ['lecture', 10 * 60], social: ['social', 14 * 60], leisure: ['leisure', 16 * 60], night: ['night', 22 * 60] }
const ACTIVITIES = [
  ['house_noodles', 'morning', 'house'], ['house_dishes', 'morning', 'house'], ['house_airtime', 'morning', 'house'], ['house_toast', 'morning', 'house'],
  ['house_leftovers', 'lecture', 'house'], ['house_notes', 'lecture', 'house'], ['house_nap', 'lecture', 'house'], ['house_tut', 'lecture', 'house'], ['house_wifi', 'lecture', 'house'],
  ['house_fifty', 'social', 'house'], ['house_partner', 'social', 'house'], ['house_speaker', 'social', 'house'], ['house_visitor', 'social', 'house'],
  ['house_braai', 'leisure', 'house'], ['house_hair', 'leisure', 'house'], ['house_laundry', 'leisure', 'house'], ['house_meeting', 'leisure', 'house'],
  ['house_couch_study', 'night', 'house'], ['house_shedding', 'night', 'house'], ['house_oil', 'night', 'house'],
  ['caf_coffee', 'morning', 'cafeteria'], ['caf_porridge', 'morning', 'cafeteria'], ['caf_russian', 'lecture', 'cafeteria'], ['caf_tut', 'lecture', 'cafeteria'],
  ['caf_window', 'social', 'cafeteria'], ['caf_supper', 'leisure', 'cafeteria'], ['caf_plug', 'leisure', 'cafeteria'],
  ['sport_track', 'morning', 'sports_centre'], ['sport_hoops', 'lecture', 'sports_centre'], ['sport_aerobics', 'social', 'sports_centre'],
  ['sport_lineup', 'social', 'sports_centre'], ['sport_trials', 'leisure', 'sports_centre'], ['sport_fountain', 'leisure', 'sports_centre'],
]

async function student(page) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
}

// Move the save to the phase, fresh enough for anything (money, energy, nothing queued).
// (the page leaves the game first, for a plain file on the same site, so the game can't
// write its own copy of the save back over this one; every load is then a fresh one)
let loads = 0
async function setPhase(page, phase, minutes) {
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(([p, m]) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: p, minutes: m, lectureResolved: true, slotsLeft: 5 })
    Object.assign(save.run.stats, { money: 1500, energy: 100, hunger: 50 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, [phase, minutes])
}

async function dismissCards(page) {
  const go = page.locator('[role="dialog"] button:has-text("Continue")')
  for (let i = 0; i < 4 && await go.first().isVisible().catch(() => false); i++) {
    await go.first().tap()
    await page.waitForTimeout(500)
  }
}

// Open the place's actions: your common room (Things to do), or the place's sheet.
async function openPlace(page, place) {
  if (place === 'house') {
    // (you start at the Quad now, owner 6 Nov: at your house's door, its sheet)
    await page.goto(`/?fast=1&morning=0&spawn=res_o&load=${++loads}#/play`)
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
    await dismissCards(page)
    await page.evaluate(() => { location.hash = '#/place/res_o' })
    await page.waitForTimeout(1500)
    await dismissCards(page)
    return
  }
  await page.goto(`/?fast=1&morning=0&spawn=${place}&load=${++loads}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await dismissCards(page)
  await page.evaluate((id) => { location.hash = `#/place/${id}` }, place)
  await page.waitForTimeout(1500)
  await dismissCards(page)
}

// Tap the action; times (ms from the tap) to the scene starting and to it being done.
async function playOne(page, id) {
  const btn = page.locator(`[data-act="do"][data-id="${id}"]`)
  try { await btn.waitFor({ state: 'visible', timeout: 8000 }) } catch {
    const shown = await page.locator('[data-act="do"]').evaluateAll((els) => els.map((e) => e.dataset.id))
    return { ok: false, why: `no ${id} button at the place (shown: ${shown.join(', ') || 'none'})` }
  }
  if (await btn.isDisabled()) return { ok: false, why: `button disabled: ${(await btn.textContent()).replace(/\s+/g, ' ').trim().slice(0, 120)}` }
  await page.evaluate(() => {
    const w = document.querySelector('#world')
    const t = window.__act = { t0: 0, open: null, done: null, scene: null, steps: [] }
    const look = () => {
      if (!t.t0) return
      const now = performance.now() - t.t0
      if (w.dataset.activity && t.open === null) { t.open = Math.round(now); t.scene = w.dataset.activity }
      const s = w.dataset.activityStep
      if (s && t.steps[t.steps.length - 1] !== s) t.steps.push(s)
      if (t.open !== null && t.done === null && (s === 'done' || !w.dataset.activity)) t.done = Math.round(now)
    }
    new MutationObserver(look).observe(w, { attributes: true })
    document.addEventListener('pointerdown', () => { if (!t.t0) t.t0 = performance.now() }, { capture: true, once: true })
  })
  await btn.tap()
  const end = Date.now() + LIMIT + 2000
  let r = null
  while (Date.now() < end) {
    r = await page.evaluate(() => window.__act)
    if (r.done !== null) break
    await page.waitForTimeout(250)
  }
  await page.screenshot({ path: `${OUT}/${id}.png` })
  if (r.open === null) return { ok: false, why: 'never opened (no scene started)', ...r }
  if (r.done === null) return { ok: false, why: `opened (${r.scene}) but not closed within ${LIMIT / 1000} s`, ...r }
  if (r.done > LIMIT) return { ok: false, why: `took ${(r.done / 1000).toFixed(1)} s to close`, ...r }
  return { ok: true, ...r }
}

test('all 33 new activities open and close within 20 s', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  let errors = []
  page.on('pageerror', (e) => errors.push(String(e.message || e)))
  await student(page)
  const results = []
  for (const [id, phase, place] of ACTIVITIES) {
    const [p, m] = PHASE[phase]
    errors = []
    let r
    try {
      await setPhase(page, p, m)
      await openPlace(page, place)
      r = await playOne(page, id)
    } catch (e) {
      r = { ok: false, why: `setup failed: ${String(e.message || e).split('\n')[0].slice(0, 160)}` }
    }
    if (r.ok && errors.length) r = { ...r, ok: false, why: `page error: ${errors[0].slice(0, 160)}` }
    const { t0, ...keep } = r
    results.push({ id, phase, place, ...keep })
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${id} (${place}, ${p})${r.scene ? ` ${r.scene}` : ''}${r.open != null ? ` open ${r.open} ms` : ''}${r.done != null ? ` close ${r.done} ms` : ''}${r.ok ? '' : ` -- ${r.why}`}`)
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length} of ${results.length} passed`)
  if (failed.length) console.log(`FAILED:\n${failed.map((r) => `- ${r.id} (${r.place}, ${r.phase}): ${r.why}`).join('\n')}`)
  // (passed, but over in under 0.3 s, 3 s of real play at ?fast=1: probably nothing visibly
  // played; listed, not failed)
  const quick = results.filter((r) => r.ok && r.done < 300)
  if (quick.length) console.log(`SUSPICIOUS (closed in under 0.3 s):\n${quick.map((r) => `~ ${r.id} (${r.scene}): open ${r.open} ms, close ${r.done} ms, steps ${r.steps.join(' > ')}`).join('\n')}`)
  expect(failed.map((r) => `${r.id}: ${r.why}`)).toEqual([])
})
