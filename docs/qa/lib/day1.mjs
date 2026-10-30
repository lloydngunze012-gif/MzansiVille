// Shared QA helpers for the day-1 specs. Test-side only; never touches game code.
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const GOAL = 'Get to your 9:00 lecture on time.'
export const GAME_DIR = process.env.QA_GAME_DIR || fileURLToPath(new URL('../../../../MzansiVille-qa-main', import.meta.url))

export async function diffPct(page, a, b) {
  return page.evaluate(async ({ a, b }) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const w = ia.width, h = ia.height, c = new OffscreenCanvas(w, h), x = c.getContext('2d')
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, w, h).data
    x.clearRect(0, 0, w, h); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, w, h).data
    const y0 = Math.floor(h * 0.17); let n = 0, tot = 0 // skip HUD rows (numbers, goal bar)
    for (let y = y0; y < h; y += 2) for (let xx = 0; xx < w; xx += 2) { const k = (y * w + xx) * 4; tot++; if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 40) n++ }
    return +(100 * n / tot).toFixed(2)
  }, { a: a.toString('base64'), b: b.toString('base64') })
}
const strip = (t) => t.replace(/[\d:.,R%+\-\u2212]+/g, '#').replace(/\s+/g, ' ')

export function harness(page, info, outName, tag) {
  const dir = new URL(`../img/${outName}/${info.project.name}-${tag}/`, import.meta.url); mkdirSync(dir, { recursive: true })
  const h = { dir, errors: [], taps: [], result: {}, n: 0 }
  page.on('pageerror', (e) => h.errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && h.errors.push('console: ' + m.text().slice(0, 200)))
  const host = page.locator('#morning3d')
  h.attr = (k) => host.getAttribute(`data-${k}`, { timeout: 500 }).catch(() => null)
  h.state = async () => ({ step: await h.attr('step'), px: +(await h.attr('px')), pz: +(await h.attr('pz')), busx: +(await h.attr('busx')), clock: await h.attr('clock') })
  h.shot = async (label) => { const b = await page.screenshot(); writeFileSync(new URL(`${String(++h.n).padStart(2, '0')}-${label}.png`, dir), b); return b }
  h.atStep = (s, t = 30000) => expect(host, `MISSING STEP: scene never reached step "${s}"`).toHaveAttribute('data-step', s, { timeout: t })
  // A player tap: screenshots before / +0.4 s / +1.8 s plus scene state -> verdict.
  h.tap = async (label, loc) => {
    const s0 = await h.state(), b0 = await page.screenshot(), t0 = await page.evaluate(() => document.body.innerText)
    await loc.click({ timeout: 8000 })
    await page.waitForTimeout(400); const b1 = await page.screenshot()
    await page.waitForTimeout(1400); const b2 = await h.shot(label); const s2 = await h.state()
    const t2 = await page.evaluate(() => document.body.innerText)
    const d = await diffPct(page, b0, b2), motion = await diffPct(page, b1, b2)
    const moved = +(Math.hypot(s2.px - s0.px, s2.pz - s0.pz) || 0).toFixed(2), busMoved = +((s2.busx - s0.busx) || 0).toFixed(2)
    const verdict = moved > 0.3 || busMoved > 1 || motion > 0.5 ? 'MOVES' : d > 1.5 || strip(t0) !== strip(t2) ? 'changes' : (t0 !== t2 ? 'NUMBERS-ONLY' : 'DEAD')
    h.taps.push({ label, stepBefore: s0.step, stepAfter: s2.step, screenDiffPct: d, motionPct: motion, playerMoved: moved, busMoved, verdict })
    return verdict
  }
  h.check = (name, fn) => test.step(name, async () => {
    try { await fn(); if (!h.result[name]) h.result[name] = 'pass' } catch (e) { const m = e.message.split('\n')[0].slice(0, 240); h.result[name] = 'FAIL: ' + m; expect.soft(null, `${name}: ${m}`).toBe('ok') }
  })
  h.finish = () => {
    const dead = h.taps.filter((t) => /DEAD|NUMBERS/.test(t.verdict))
    writeFileSync(new URL('summary.json', dir), JSON.stringify({ result: h.result, taps: h.taps, dead, errors: h.errors }, null, 2))
    expect.soft(dead.map((t) => t.label), 'taps with no visible action').toEqual([])
    expect.soft(h.errors, 'console/page errors').toEqual([])
  }
  return h
}

// Record every text the morning UI shows (bubble, bar, sign, card, float) for the content check.
export async function recordMorningText(page) {
  await page.addInitScript(() => {
    window.__qaTexts = new Set()
    const grab = () => document.querySelectorAll('#morning-ui > *:not([hidden]), .mm-bar:not([hidden]) *, .mm-card:not([hidden]) *').forEach((el) => {
      if (el.children.length && !['P', 'BUTTON', 'H2'].includes(el.tagName)) return
      const t = (el.innerText || '').trim(); if (t) window.__qaTexts.add(t)
    })
    new MutationObserver(grab).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] })
  })
}

export function contentLines() {
  let raw = null, src = ''
  const p = `${GAME_DIR}/data/campusville/day1_morning.json`
  if (existsSync(p)) { raw = readFileSync(p, 'utf8'); src = 'tested tree' }
  else { try { raw = execSync('git show origin/content-writer:data/campusville/day1_morning.json', { cwd: fileURLToPath(new URL('.', import.meta.url)) }).toString(); src = 'origin/content-writer (NOT on tested tree)' } catch { /* none */ } }
  if (!raw) return { src: 'missing', lines: [] }
  const j = JSON.parse(raw), lines = [j.goal?.text, j.goal?.hint, ...(j.tap_feedback || [])]
  for (const s of j.steps || []) lines.push(s.title, s.caption, s.tap, s.after)
  return { src, lines: lines.filter(Boolean) }
}

// Play the morning by taps. opts: { query, init (Math.random), choice, late (minutes) }
export async function playMorning(page, h, v = {}) {
  const go = () => page.locator('.mm-bar:not([hidden]) .mm-go:not(.mm-choice)').first()
  await h.check('M01 new game, creator picks O Block', async () => {
    await page.goto('/'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }); await page.goto('/' + (v.query || ''))
    await page.waitForTimeout(1200); await h.shot('cover')
    await h.tap('start', page.locator('[data-act=start]').first())
    if (await page.locator('#agree').count()) await page.check('#agree')
    await h.tap('agree-rules', page.locator('[data-act=agree]').first())
    await page.fill('#name', 'QA Player')
    await page.selectOption('#residence', 'O Block')
    await page.selectOption('#course', v.course || { index: 1 })
    await h.tap('begin', page.locator('[data-act=begin]').first())
  })
  await h.check('M02 wake inside O Block room', async () => {
    await expect(page, 'MISSING STEP: no #/morning room scene after Begin').toHaveURL(/#\/morning/, { timeout: 15000 })
    if (v.late) { // storage-only: start the morning at v.late minutes so the 9:00 goal can fail
      await page.evaluate((m) => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); s.run.minutes = m; if (s.run.morningStart) s.run.morningStart.minutes = m; else s.run.morningStart = { stats: { ...s.run.stats }, minutes: m }; localStorage.setItem('mzansiville.v1', JSON.stringify(s)) }, v.late)
      await page.reload(); await page.waitForTimeout(1500)
    }
    await expect(page.locator('#morning3d'), 'MISSING STEP: 3D room (#morning3d) not shown').toBeVisible()
    await h.shot('wake-room')
  })
  await h.check('M03 goal text on screen', async () => {
    await expect(page.getByText(GOAL, { exact: true }), `MISSING STEP: exact goal "${GOAL}" not visible`).toBeVisible({ timeout: 5000 })
  })
  await h.check('M04 walk to kettle', async () => { await h.atStep('kettle'); expect(await h.tap('tap-kettle', go())).toBe('MOVES') })
  await h.check('M05 noodles / roommate branch', async () => {
    const roomie = await h.attr('roommate'); h.result.roommateTookPacket = roomie
    if (roomie === '1') {
      await h.atStep('roommate'); await page.waitForTimeout(600); await h.shot('roommate-takes-packet')
      h.result.roommateMoment = { bubbleWho: await page.locator('.mm-bubble').getAttribute('data-who').catch(() => null), screenText: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300) }
      await expect(page.locator('.mm-choice'), 'no choice after roommate').toHaveCount(2, { timeout: 10000 })
      const pick = v.choice ?? 0
      expect(await h.tap(pick ? 'choose-skip-breakfast' : 'choose-tuckshop', page.locator('.mm-choice').nth(pick))).not.toMatch(/DEAD|NUMBERS/)
      h.result.staleChoicesAfterPick = await page.locator('.mm-choice:visible, [data-act=choice]:visible').count()
    } else { await page.waitForTimeout(1200); await h.shot('kettle-noodles') }
  })
  await h.check('M06 walk out to bus stop', async () => {
    await h.atStep('door', 40000); await h.shot('at-door')
    expect(await h.tap('tap-door', go()), 'door tap').toBe('MOVES')
    await h.atStep('to-stop')
    expect(await h.tap('tap-walk-to-stop', go()), 'walk-to-stop tap').toBe('MOVES')
    await h.atStep('stop', 15000); await h.shot('at-bus-stop')
  })
  await h.check('M07 bus arrives', async () => {
    await h.atStep('bus-arriving', 15000); await page.waitForTimeout(1500); await h.shot('bus-arriving')
    await h.atStep('board', 15000); expect(+(await h.attr('busx')), 'bus did not drive in').toBeGreaterThan(10)
  })
  await h.check('M08 ride the bus', async () => {
    expect(await h.tap('tap-get-on-bus', go())).toBe('MOVES')
    await h.atStep('riding', 15000); const b0 = +(await h.attr('busx')); await page.waitForTimeout(1500); await h.shot('riding')
    expect(+(await h.attr('busx')) - b0, 'bus not moving during ride').toBeGreaterThan(5)
  })
  await h.check('M09 arrive on campus', async () => {
    await h.atStep('done', 20000); await expect(page.locator('.mm-card')).toBeVisible()
    h.result.onTime = await h.attr('ontime'); h.result.arrivalCard = (await page.locator('.mm-card').innerText()).replace(/\s+/g, ' ')
    h.result.goalBar = (await page.locator('.g-goal').innerText().catch(() => '')).replace(/\s+/g, ' ')
    h.result.goalBarLateClass = await page.locator('.g-goal.late').count()
    await h.shot('arrival-card')
    h.result.texts = await page.evaluate(() => [...(window.__qaTexts || [])])
    await h.tap('continue-to-lecture', page.locator('[data-mm=continue]'))
    await expect(page).toHaveURL(/#\/play/)
  })
}
