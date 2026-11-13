// Sound job (11 Nov), the quick test: the zone changes as you cross a border (ambience and music), a place has
// its murmur, a track is only downloaded when its zone needs it, the Music switch silences the music alone and
// the Sound switch silences everything, and nothing lands in the console on the way.
import { test, expect } from '@playwright/test'
import { atGate, city, intoCity, leavePlace, toDoor } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)

const sound = (page) => page.evaluate(() => window.mzansiSound.state())

test('Sound: zones fade at a border, a murmur inside, tracks load when needed, the switches silence', async ({ page }) => {
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|supabase|realtime/i.test(m.text())) consoleErrors.push(m.text()) })
  const errors = await atGate(page)

  // campus: the crowd and the campus track, started by the first tap (phones allow no sound before one)
  await page.locator('.tb-time').tap()
  await expect.poll(async () => (await sound(page)).running, { timeout: 20000 }).toBe(true)
  let s = await sound(page)
  expect(s.zone).toBe('campus')
  expect(s.level.crowd).toBeGreaterThan(0)
  await expect.poll(async () => (await sound(page)).trackPlaying, { timeout: 20000 }).toBe('music_campus')
  expect(s.master).toBeGreaterThan(0.9)

  // out of the gate: the street outside the campus
  await intoCity(page)
  await expect.poll(async () => (await sound(page)).zone).toBe('city.campus')
  s = await sound(page)
  expect(s.level.street).toBeGreaterThan(0)
  expect(s.level.crowd).toBe(0)
  expect(s.layers).toContain('street')
  expect(s.loaded, 'the beach track is not downloaded before the beach').not.toContain('alt_sunday_braai')

  // walk east over the border into the Beachfront: waves in, street out, no music (job L: the beach has the waves and the kids)
  await page.evaluate(() => window.mzansiCity.teleport(145, 14, Math.PI / 2))
  await page.waitForTimeout(400)
  expect((await sound(page)).zone).toBe('city.campus')
  await page.evaluate(() => window.mzansiCity.walkTo(160, 14))
  await expect.poll(async () => (await sound(page)).zone, { timeout: 60000 }).toBe('city.beachfront')
  await expect(page.locator('body')).toHaveAttribute('data-zone', 'city.beachfront')
  s = await sound(page)
  expect(s.level.waves).toBe(1)
  expect(s.level.street).toBe(0)
  expect(s.layers).toContain('waves')
  await expect.poll(async () => (await sound(page)).track, { timeout: 30000 }).toBe(null)
  // (a layer that has faded out is taken down)
  await expect.poll(async () => (await sound(page)).layers, { timeout: 15000 }).not.toContain('street')

  // inside a place: the murmur; back on the street: the district's mix again
  await toDoor(page, 'lifecup')
  await expect(city(page)).toHaveAttribute('data-place', 'lifecup')
  s = await sound(page)
  expect(s.zone).toBe('inside')
  expect(s.level.murmur).toBe(1)
  expect(s.level.street).toBe(0)
  await leavePlace(page)
  await expect.poll(async () => (await sound(page)).zone).toBe('city.town')
  expect((await sound(page)).level.street).toBe(1)
  // (job L) the bowling and arcade hall: upbeat but quieter
  await toDoor(page, 'arcade')
  await expect(city(page)).toHaveAttribute('data-place', 'arcade')
  await expect.poll(async () => (await sound(page)).track, { timeout: 10000 }).toBe('alt_sunday_braai')
  expect((await sound(page)).trackLevel).toBeLessThan(1)
  await leavePlace(page)
  await expect.poll(async () => (await sound(page)).track, { timeout: 10000 }).toBe(null)

  // the Music switch: the music alone goes quiet
  await page.locator('.tb-menu').tap()
  await page.locator('.g-menu [data-act="music"]').tap()
  await expect.poll(async () => (await sound(page)).musicBus, { timeout: 5000 }).toBeLessThan(0.01)
  expect((await sound(page)).master).toBeGreaterThan(0.9)
  await expect(page.locator('.g-menu [data-act="music"]')).toContainText('Off')
  // the Sound switch: everything (every sound in the game plays through this one gain)
  await page.locator('.g-menu [data-act="sound"]').tap()
  await expect.poll(async () => (await sound(page)).master, { timeout: 5000 }).toBeLessThan(0.01)
  // and back on
  await page.locator('.g-menu [data-act="sound"]').tap()
  await expect(page.locator('.g-menu [data-act="sound"]')).toContainText('On')
  await expect.poll(async () => (await sound(page)).master, { timeout: 5000 }).toBeGreaterThan(0.9)
  await page.locator('.g-menu [data-act="music"]').tap()
  await expect(page.locator('.g-menu [data-act="music"]')).toContainText('On')
  await expect.poll(async () => { const now = await sound(page); return Math.min(now.master, now.musicBus) }, { timeout: 5000 }).toBeGreaterThan(0.9)

  expect(errors, 'no page errors').toEqual([])
  expect(consoleErrors, 'no console errors').toEqual([])
})
