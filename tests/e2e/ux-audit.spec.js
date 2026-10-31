// UX audit: on a phone-sized screen, visit every screen of a new player's day,
// list every button and tap target, tap each one and record what happened.
// A tap that changes nothing (same screen, same page, same world state) is a dead end.
// Writes test-results/ux-audit.json and .md.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ timeout: 600000 })

const SKIP = /^(Sign in|Sign out|Admin|This links to a real shop|Download|Share image|Copy link|Reset|Start over|New character)/i

let SAVE = null
async function freshPlayer(page, extra = {}) {
  if (!SAVE) {
    await page.goto('/?fast=1&morning=0#/new')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?fast=1&morning=0#/new')
    await page.locator('#name').fill('Thandeka')
    await page.locator('#residence').selectOption({ index: 1 })
    await page.locator('#course').selectOption({ index: 1 })
    await page.locator('[data-act="begin"]').tap()
    await page.locator('[data-step="story"] [data-act="begin"]').tap()
    await page.waitForURL(/#\/play/)
    SAVE = await page.evaluate(() => localStorage.getItem('mzansiville.v1'))
  }
  await page.goto('/?fast=1&morning=0&seed=1#/title')
  await page.evaluate(([raw, x]) => {
    localStorage.clear()
    const save = JSON.parse(raw)
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true, crush: { id: 'amahle', name: 'Amahle', met: 'bus', nameKnown: false, closeness: 3 } }, x)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, [SAVE, extra])
}

async function signature(page) {
  return page.evaluate(() => {
    const w = document.getElementById('world')
    const app = document.getElementById('app')
    return JSON.stringify({
      hash: location.hash,
      app: app ? app.innerHTML.length + ':' + (app.querySelector('[data-screen]')?.dataset.screen || '') + ':' + (app.querySelector('[role="dialog"]')?.getAttribute('aria-label') || '') : '',
      world: w ? [w.dataset.going, w.dataset.talking, w.dataset.activity, w.dataset.walk].join('|') : '',
      overlay: !!document.querySelector('.map-overlay:not([hidden])'),
      stats: localStorage.getItem('mzansiville.v1')?.length,
      pressed: [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent.trim()).join(','),
      toast: document.getElementById('toast') && !document.getElementById('toast').hidden ? document.getElementById('toast').textContent : '',
    })
  })
}

async function targets(page) {
  return page.evaluate(() => {
    const out = []
    const seen = new Set()
    for (const el of document.querySelectorAll('button, a[href], [data-act], [role="button"]')) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none' || el.disabled) continue
      if (r.bottom < 0 || r.top > window.innerHeight * 3) continue
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      const key = `${el.dataset.act || el.tagName}|${label}|${el.dataset.id || el.dataset.mode || el.dataset.part || el.dataset.kind || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      // Covered by a menu or a card in front of it: not a tap target right now.
      const inView = r.top >= 0 && r.bottom <= window.innerHeight
      const top = inView ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : el
      const covered = inView && top && !el.contains(top) && !top.contains(el)
      out.push({ key, label, covered, act: el.dataset.act || (el.tagName === 'A' ? `link ${el.getAttribute('href')}` : el.tagName.toLowerCase()), small: r.width < 40 || r.height < 40 })
    }
    return out
  })
}

async function tapByKey(page, key) {
  return page.evaluate((k) => {
    for (const el of document.querySelectorAll('button, a[href], [data-act], [role="button"]')) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      const kk = `${el.dataset.act || el.tagName}|${label}|${el.dataset.id || el.dataset.mode || el.dataset.part || el.dataset.kind || ''}`
      if (kk === k) { el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
    }
    return null
  }, key)
}

const SCREENS = [
  { name: 'Cover', setup: async (p) => { await p.goto('/?fast=1#/'); await p.evaluate(() => localStorage.clear()); await p.goto('/?fast=1#/') } },
  { name: 'Creator: look', setup: async (p) => { await p.goto('/?fast=1&morning=0#/new'); await p.evaluate(() => localStorage.clear()); await p.goto('/?fast=1&morning=0#/new') } },
  { name: 'Creator: story', setup: async (p) => { await p.goto('/?fast=1&morning=0#/'); await p.evaluate(() => localStorage.clear()); await p.goto(`/?fast=1&morning=0&r=${Math.random()}#/new`); await p.locator('#name').fill('T'.repeat(3)); await p.locator('#residence').selectOption({ index: 1 }); await p.locator('#course').selectOption({ index: 1 }); await p.locator('[data-act="begin"]').tap() } },
  { name: 'Campus (3D)', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=1#/play'); await expect(p.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 }) } },
  { name: 'Campus map (2D)', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=2#/play'); await expect(p.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 }); await p.locator('[data-act="view"][data-mode="map"]').tap() } },
  { name: 'Menu (gear)', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=3#/play'); await p.locator('[data-act="gear"]').first().tap() } },
  { name: 'Place sheet: Cafeteria', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=4#/place/cafeteria'); await p.waitForTimeout(1500) } },
  { name: 'Talk: a student', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&spawn=quad&a=5#/play'); await expect(p.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 }); await p.evaluate(() => window.mzansiTalkTo('naledi')); await expect(p.locator('.g-talk')).toBeVisible({ timeout: 20000 }) } },
  { name: 'Talk: Mam’ Gugu', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&spawn=quad&a=6#/play'); await expect(p.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 }); await p.evaluate(() => window.mzansiTalkTo('mam_gugu')); await expect(p.locator('.g-talk')).toBeVisible({ timeout: 20000 }) } },
  { name: 'Goals card', setup: async (p) => { await freshPlayer(p, { goals: { day: 1, list: [{ id: 'lecture1', kind: 'must', done: true }, { id: 'crushName', kind: 'story', done: false }, { id: 'study1', kind: 'dream', done: false }] } }); await p.goto('/?fast=1&morning=0&a=7#/play'); await p.locator('[data-act="goals"]').tap() } },
  { name: 'You (student card)', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=8#/profile') } },
  { name: 'Leaderboards', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=9#/board') } },
  { name: 'Campus lobby (chat)', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=10#/chat') } },
  { name: 'Milestones', setup: async (p) => { await freshPlayer(p); await p.goto('/?fast=1&morning=0&a=11#/milestones') } },
]

for (const screen of SCREENS.filter((s) => !process.env.AUDIT || process.env.AUDIT.split(',').includes(s.name))) {
  test(`UX audit: ${screen.name}`, async ({ page }) => {
    const report = []
    await screen.setup(page)
    await page.waitForTimeout(1200)
    const list = await targets(page)
    for (const t of list) {
      const entry = { screen: screen.name, button: t.label || '(icon)', act: t.act, small: t.small }
      if (SKIP.test(t.label)) { entry.result = 'not tapped (leaves the game or signs out)'; report.push(entry); continue }
      if (t.covered) { entry.result = 'covered (behind the open menu or card, not tappable now)'; report.push(entry); continue }
      await screen.setup(page)
      await page.waitForTimeout(700)
      const at = await tapByKey(page, t.key)
      if (!at) { entry.result = 'not found after reload'; report.push(entry); continue }
      const before = await signature(page)
      await page.mouse.click(at.x, at.y)
      await page.waitForTimeout(1100)
      const after = await signature(page)
      const a = JSON.parse(before)
      const b = JSON.parse(after)
      const changed = Object.keys(a).filter((k) => a[k] !== b[k])
      entry.result = changed.length ? `ok: ${changed.join(', ')} changed${b.hash !== a.hash ? ` (to ${b.hash})` : ''}` : 'DEAD END: nothing visible changed'
      report.push(entry)
    }
    fs.mkdirSync('test-results/ux-audit', { recursive: true })
    fs.writeFileSync(`test-results/ux-audit/${screen.name.replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(report, null, 2))
    console.log(`audit ${screen.name}: ${report.length} targets, ${report.filter((r) => r.result.startsWith('DEAD')).length} dead ends`)
  })
}
