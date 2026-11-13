// Job G (owner, 13 Nov): #/owner, the owner's reports. The server (supabase/chat.sql OWNER REPORTS, checked in
// sql-check) decides who may read them; here a stand-in answers the calls, so nothing reaches the live project:
// every section shows, the time range asks again, Keep takes a reported post off the list, and a player who is not
// the owner sees "Owner only". Readable at 390 px, palette rule.
import { test, expect } from '@playwright/test'
import { paletteFaults } from '../palette.js'

const REPORTS = {
  growth: { today: 12, week: 40, range: 40, d1: { of: 30, back: 12 }, d7: { of: 10, back: 3 }, countries: [{ country: 'South Africa', n: 30 }, { country: 'Nigeria', n: 6 }], byDay: [] },
  time: { sessions: 88, avgSession: 14.2, minutesPerPlayerDay: 31.5, sessionsPerPlayerDay: 1.8, byDay: [{ day: '2026-11-12', sessions: 40, players: 22, minutes: 600 }] },
  hot: { areas: [{ area: 'campus', minutes: 900 }, { area: 'city.town', minutes: 300 }], hours: [{ hour: 13, minutes: 400 }], places: [{ place: 'cafeteria', visits: 120 }] },
  feedback: { rows: [{ at: '2026-11-13T08:00:00Z', stars: 4, message: 'Love the Caf', kind: 'menu', build: 'abc', device: 'Android' }] },
  support: { posts: [{ id: 41, name: 'Sam', body: 'a reported post', hidden: true, reports: 3 }], groups: [{ id: 'g:1', name: 'Gym rats', topic: 'leg day', hidden: false, reports: 1 }], blocks: [{ day: '2026-11-13', n: 2 }], filter: [{ day: '2026-11-13', n: 5 }], lineReports: 1 },
  chat: { perHour: [{ hour: 20, n: 50 }], lines: 300, quad: 120, activeGroups: 9, pings: 40, pingsOn: 17 },
  errors: { rows: [{ at: '2026-11-13T09:00:00Z', kind: 'boot', message: 'A game file did not load', screen: '#/', step: 'boot', device: 'iPhone', build: 'boot' }], byKind: [{ kind: 'boot', n: 1 }] },
  economy: { players: 30, spread: { p10: 200, p50: 1500, p90: 4000, max: 9000 }, bands: [], invites: [{ inviter: 'x', name: 'Ayanda', claimed: 9, back: 1 }] },
}

async function stand(page, { denied = false } = {}) {
  const asked = []
  await page.route('**/rest/v1/rpc/owner_report', async (route) => {
    const { p_kind, p_days } = route.request().postDataJSON()
    asked.push([p_kind, p_days])
    if (denied) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'owner only' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...REPORTS[p_kind], kind: p_kind, days: p_days }) })
  })
  await page.route('**/rest/v1/rpc/owner_moderate', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))
  await page.route('**/rest/v1/rpc/cap_status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ online: 5, waiting: 0, max: 200 }) }))
  return asked
}

test('O1 the owner reports: every section, the range, Keep on a reported post, the palette', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const asked = await stand(page)
  await page.goto('/?room=ownertest#/owner')
  for (const id of ['live', 'growth', 'time', 'hot', 'feedback', 'support', 'chat', 'errors', 'economy']) await expect(page.locator(`[data-ow="${id}"]`)).toBeVisible()
  await expect(page.locator('[data-ow="growth"]')).toContainText('40% (12 of 30)')
  await expect(page.locator('[data-ow="feedback"]')).toContainText('Love the Caf')
  await expect(page.locator('[data-ow="errors"]')).toContainText('A game file did not load')
  await expect(page.locator('[data-ow="economy"]')).toContainText('9 claimed, 1 came back')
  await expect(page.locator('[data-ow="live"]')).toContainText('5 in of 200')
  // the range: 30 days asks every report again
  await page.locator('[data-act="owner-days"][data-days="30"]').tap()
  await expect.poll(() => asked.filter(([, d]) => d === 30).length).toBe(8)
  await expect(page.locator('[data-act="owner-days"][data-days="30"]')).toHaveAttribute('aria-pressed', 'true')
  // Keep: the post leaves the review list
  await page.locator('[data-ow-post="41"] .ow-keep').tap()
  await expect(page.locator('[data-ow-post="41"]')).toHaveCount(0)
  await page.screenshot({ path: 'docs/sprints/owner/owner-390.png', fullPage: true })
  // one phone screen wide, readable
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect(await paletteFaults(page, '.ow')).toEqual([])
})

test('O2 not the owner: "Owner only", nothing else', async ({ page }) => {
  await stand(page, { denied: true })
  await page.goto('/?room=ownertest#/owner')
  await expect(page.locator('[data-ow="denied"]')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('[data-ow="growth"]')).toHaveCount(0)
})
