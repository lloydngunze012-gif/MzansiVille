// QA: Day 1 morning, played like a player. Spec (Lloyd, 30 Oct 2026). Read-only vs game code.
// Run (from C:\Users\organ\Projects\MzansiVille-qa): npx playwright test -c docs/qa/day1.config.mjs docs/qa/day1-morning.spec.js
import { test, expect } from '@playwright/test'
import { harness, playMorning, recordMorningText, contentLines, GOAL } from './lib/day1.mjs'

const VARIANTS = [
  { id: 'natural', projects: ['w390', 'w360', 'w430'] },
  { id: 'no-roommate', projects: ['w390'], init: 0.99 },
  { id: 'roommate-tuckshop', projects: ['w390'], query: '?roommate=1', choice: 0 },
  { id: 'roommate-skip', projects: ['w390'], query: '?roommate=1', choice: 1 },
  { id: 'late-storage', projects: ['w390'], late: 8 * 60 + 30 },
]
for (const v of VARIANTS) {
  test(`day 1 morning [${v.id}]`, async ({ page }, info) => {
    test.skip(!v.projects.includes(info.project.name), 'variant only at 390')
    if (v.init != null) await page.addInitScript((r) => { Math.random = () => r }, v.init)
    await recordMorningText(page)
    const h = harness(page, info, 'day1-morning', v.id)
    await playMorning(page, h, v)

    // A1: after any choice, no stale clickable choices.
    if (h.result.staleChoicesAfterPick !== undefined) await h.check('A1 choices gone after pick', async () => {
      expect(h.result.staleChoicesAfterPick, 'stale choice buttons still visible after picking').toBe(0)
    })
    // A2: a way to be late exists, and the goal can visibly fail.
    if (v.id === 'natural' && info.project.name === 'w390') await h.check('A2a natural late path exists (snooze or late bus)', async () => {
      const src = await page.evaluate(async () => (await (await fetch('/src/world/morning.js')).text()))
      const snooze = /snooze/i.test(src), lateBus = /bus.{0,40}late|late.{0,40}bus|delay/i.test(src)
      expect(snooze || lateBus, 'MISSING: no snooze and no sometimes-late bus in the morning scene; only storage can make you late').toBe(true)
    })
    if (v.late) await h.check('A2b goal visibly fails when late', async () => {
      expect(h.result.onTime, 'arrived on time despite 08:30 start').toBe('0')
      expect(h.result.arrivalCard, 'arrival card does not say late').toMatch(/late/i)
      expect(h.result.goalBar, 'goal bar does not show "min late"').toMatch(/min late/)
    })
    // A3: roommate is Zanele (the bestie), visible in person in the room.
    if (v.query) await h.check('A3 roommate is Zanele, met in person', async () => {
      const m = h.result.roommateMoment || {}
      expect(m.bubbleWho, 'roommate line is not pinned to the roommate character').toBe('roommate')
      expect(m.screenText, 'name "Zanele" not shown in the room during the noodles moment').toMatch(/Zanele/)
    })
    // A4: morning lines come from Content Writer's day1_morning.json.
    if (v.id === 'natural' || v.query) await h.check('A4 on-screen morning text comes from day1_morning.json', async () => {
      const { src, lines } = contentLines(); h.result.contentSource = src
      expect(lines.length, 'day1_morning.json not found anywhere').toBeGreaterThan(0)
      const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
      const set = new Set(lines.map(norm))
      const shown = (h.result.texts || []).map((t) => t.split('\n')[0]).filter((t) => t.length > 3)
      h.result.textMatched = shown.filter((t) => set.has(norm(t)))
      h.result.textNotInJson = shown.filter((t) => !set.has(norm(t)) && !/^\d|^arrived|^lecture \d/i.test(t))
      expect(h.result.textNotInJson.length, `${h.result.textNotInJson.length} on-screen lines not in day1_morning.json (source: ${src}), e.g. "${h.result.textNotInJson.slice(0, 3).join('" | "')}"`).toBe(0)
    })
    h.finish()
  })
}
