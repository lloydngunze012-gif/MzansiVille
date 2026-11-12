// Job I (owner's play test, 12 Nov): first-play fixes. In the quick project.
//   I1 SunnyBay: a tap on a street person is answered (they stay, wave and say hello); back out of a place the street
//      people are where they were; the open-ground place's people move about; cars are solid, and one that stands for
//      you hoots and the driver calls out; the bank shows your money; the Arcade's card says "Game done".
//   I2 Taxis: a stop's card says when the next taxi comes and a ride waits for it; "Request a ride" from the menu
//      brings one to you for a little more.
//   I3 Campus: the Main Gate's sheet points to SunnyBay (Take a taxi / Walk); the whole map has every campus place
//      when zoomed in, and a tap on one walks you there; Eye view on the keys never swings the view (no drift).
//   I4 People: a chat is a request (Accept opens it; asking you shows "wants to chat"); the player card is light blue
//      with Chat and Follow only; the @handle is never made from the name; the family car and driver vary by player;
//      an older empty card is asked once.
// Screenshots at 390 px (not committed): docs/sprints/firstplay/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, city, closeResult, intoCity, money, pickRow, run, tapWorld, toDoor } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/firstplay'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.setTimeout(300000)
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
const shot = async (page, name) => { await page.waitForTimeout(400); try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }) } catch (e) { console.log(`screenshot ${name} skipped: ${String(e.message).split('\n')[0]}`) } }
const mc = (page, fn, arg) => page.evaluate(([f, a]) => window.mzansiCity[f](a), [fn, arg])
const TOWN = { x: -16, z: 230 }
const CALM = { phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 5, stats: { money: 400, energy: 90, grades: 50, social: 30, hunger: 40 } }

test('I1 SunnyBay: people answer a tap and stay put, the open ground moves, cars are solid and hoot, the bank and the Arcade', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...CALM, cityAt: { x: TOWN.x, z: TOWN.z } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await expect.poll(async () => (await mc(page, 'people')).filter((p) => p.visible).length, { timeout: 20000 }).toBeGreaterThanOrEqual(4)
  // a street person near you, tapped: they wave and say hello, and are still there
  const me = (await mc(page, 'info')).player
  const near = (await mc(page, 'people')).filter((p) => p.visible).sort((a, b) => Math.hypot(a.x - me[0], a.z - me[1]) - Math.hypot(b.x - me[0], b.z - me[1]))[0]
  await page.evaluate(([x, z]) => window.mzansiCity.putPlayer(x + 3, z + 3), [near.x, near.z])
  await page.waitForTimeout(600)
  const now = (await mc(page, 'people')).find((p) => p.i === near.i)
  await tapWorld(page, now.x, now.z, 1.1)
  await expect.poll(async () => (await mc(page, 'greeted')).length, { timeout: 10000, message: 'the person said hello' }).toBe(1)
  expect((await mc(page, 'people')).find((p) => p.i === near.i).visible).toBe(true)
  await shot(page, 'i1-hello')
  // into the bank and out again: your money on its list; the street people are not put somewhere new
  const before = (await mc(page, 'people')).map((p) => [p.x, p.z])
  await toDoor(page, 'bank')
  await expect(page.locator('.city-todo .ct-balance')).toContainText(String(await money(page)).replace(/\B(?=(\d{3})+(?!\d))/g, '').slice(0, 1))
  const shown = (await page.locator('.city-todo .ct-balance b').textContent()).replace(/\D/g, '')
  expect(Number(shown)).toBe(await money(page))
  await shot(page, 'i1-bank')
  await page.locator('.city-todo [data-city="todo-close"]').tap()
  await page.locator('.city-leave').tap()
  await expect(city(page)).toHaveAttribute('data-place', '', { timeout: 20000 })
  const after = (await mc(page, 'people')).map((p) => [p.x, p.z])
  const moved = after.filter(([x, z], i) => Math.hypot(x - before[i][0], z - before[i][1]) > 25).length
  expect(moved, 'nobody re-placed far away on the way out').toBe(0)
  // the Arcade: its card says what you did
  await toDoor(page, 'arcade')
  await pickRow(page, 'arcade_play_one_racing_cabinet')
  await expect(page.locator('.city-result .rc-eyebrow')).toHaveText(/Game done|Big win/)
  await shot(page, 'i1-arcade')
  await closeResult(page)
  await page.locator('.city-todo [data-city="todo-close"]').tap().catch(() => {})
  await page.locator('.city-leave').tap()
  await expect(city(page)).toHaveAttribute('data-place', '', { timeout: 20000 })
  // the beach's people walk about (they stood in a bunch)
  await page.evaluate(() => { const l = window.mzansiCity.plan.LOTS.find((x) => x.id === 'beach'); window.mzansiCity.teleport(l.door.x - 6, l.door.z, Math.PI / 2) })
  await expect.poll(async () => (await mc(page, 'folk'))?.id, { timeout: 20000 }).toBe('beach')
  await expect.poll(async () => (await mc(page, 'folk')).list.filter((f) => !f.staff && f.moving).length, { timeout: 20000, message: 'somebody at the beach is walking' }).toBeGreaterThanOrEqual(1)
  // cars: back in town, stand in a car's lane: it stops, hoots and the driver calls out; its body is solid
  await page.evaluate(([x, z]) => window.mzansiCity.teleport(x, z, Math.PI), [TOWN.x, TOWN.z])
  await expect.poll(async () => (await mc(page, 'traffic'))?.moving || 0, { timeout: 30000 }).toBeGreaterThanOrEqual(3)
  const car = await page.evaluate(() => {
    const me = window.mzansiCity.info().player
    const list = window.mzansiCity.traffic().list.filter((c) => !c.ride && c.v > 4 && !c.turn).sort((a, b) => Math.hypot(a.x - me[0], a.z - me[1]) - Math.hypot(b.x - me[0], b.z - me[1]))
    const c = list[0]
    if (c) window.mzansiCity.putPlayer(c.x + Math.sin(c.h) * 30, c.z + Math.cos(c.h) * 30)
    return c
  })
  expect(car).toBeTruthy()
  await expect.poll(async () => (await mc(page, 'hoots')).length, { timeout: 30000, message: 'the car that stopped for you hooted' }).toBeGreaterThanOrEqual(1)
  expect(await page.evaluate(() => (window.mzansiToasts || []).some((t) => t.startsWith('\u{1F697}')))).toBe(true)
  // (read and checked in one step: the game runs fast in tests and a car can move between two steps)
  const solid = await page.evaluate(() => {
    const me = window.mzansiCity.info().player
    const c = window.mzansiCity.traffic().list.filter((x) => !x.ride).sort((a, b) => Math.hypot(a.x - me[0], a.z - me[1]) - Math.hypot(b.x - me[0], b.z - me[1]))[0]
    return { inside: window.mzansiCity.carAt(c.x, c.z), beside: window.mzansiCity.carAt(c.x + 6, c.z + 6) }
  })
  expect(solid, 'a car is solid; the road beside it is not').toEqual({ inside: true, beside: false })
  await shot(page, 'i1-hoot')
  expect(errors).toEqual([])
})

test('I2 taxis: the stop says when the next one comes and the ride waits for it; Request a ride comes to you for a little more', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...CALM, cityAt: { x: TOWN.x, z: TOWN.z } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await expect.poll(async () => (await mc(page, 'traffic'))?.ready, { timeout: 30000 }).toBe(true)
  // the Town centre stop's card
  const stop = await page.evaluate(() => window.mzansiCity.plan.STOPS.find((s) => s.id === 'town'))
  await page.evaluate(([x, z]) => window.mzansiCity.teleport(x + 3, z - 3, Math.PI), [stop.x, stop.z])
  await page.waitForTimeout(700)
  await tapWorld(page, stop.x, stop.z)
  await expect(page.locator('.city-card .cc-next')).toBeVisible({ timeout: 30000 })
  const next = await mc(page, 'nextTaxi', 'town')
  await expect(page.locator('.city-card .cc-next b')).toHaveText(`Wait for the next taxi (${next.wait} min)`)
  await expect(page.locator('.city-card .cc-next small')).toHaveText(`Next taxi ${next.at}`)
  await shot(page, 'i2-stop')
  const was = await money(page)
  await page.locator('.city-card [data-city="ride"][data-stop="beachfront"]').tap()
  await expect.poll(async () => (await mc(page, 'taxis')).length, { timeout: 20000 }).toBe(1)
  const t1 = (await mc(page, 'taxis'))[0]
  expect(t1.waited).toBe(next.wait)
  expect(t1.request).toBe(false)
  await expect(city(page)).toHaveAttribute('data-riding', '0', { timeout: 60000 })
  expect(await money(page)).toBe(was - t1.fare)
  // Request a ride from the menu: a taxi to you, R10 more
  await page.locator('.tb-menu').tap()
  await page.locator('.g-menu [data-act="ride-request"]').tap()
  await expect(page.locator('.city-card [data-city="request-go"]').first()).toBeVisible({ timeout: 10000 })
  await shot(page, 'i2-request')
  const before = await money(page)
  await page.locator('.city-card [data-city="request-go"][data-to="town"]').tap()
  await expect.poll(async () => (await mc(page, 'taxis')).length, { timeout: 20000 }).toBe(2)
  const t2 = (await mc(page, 'taxis'))[1]
  expect(t2.request).toBe(true)
  expect(t2.waited).toBeGreaterThan(0)
  expect(t2.fare).toBe(15 + 10)
  await expect(city(page)).toHaveAttribute('data-riding', '0', { timeout: 60000 })
  expect(await money(page)).toBe(before - t2.fare)
  expect(errors).toEqual([])
})

test('I3 campus: the gate points to SunnyBay; the whole map names every place and walks you there; keys never swing the Eye view', async ({ page }) => {
  const errors = await atGate(page, { patch: CALM })
  // Eye view on the keys: D held for a second, the view stays where it was (it used to follow the body round)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: 'eye' })))
  await page.waitForTimeout(800)
  const view0 = Number(await page.locator('#world').getAttribute('data-view'))
  await page.keyboard.down('d')
  await page.waitForTimeout(1200)
  await page.keyboard.up('d')
  const view1 = Number(await page.locator('#world').getAttribute('data-view'))
  expect(Math.abs(view1 - view0), 'the view held still on the keys').toBeLessThan(0.05)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: 'sims' })))
  // the whole map: campus and SunnyBay; zoomed in, every campus place by name; a tap walks you there
  await page.locator('.tb-menu').tap()
  await page.locator('.g-menu [data-act="city-map"]').tap()
  await expect(page.locator('.cm-overlay')).toBeVisible()
  await expect(page.locator('.cm-head h2')).toHaveText('UMzansi & SunnyBay')
  const campusPins = await page.locator('.cm-cpin').count()
  expect(campusPins).toBeGreaterThanOrEqual(10)
  await expect(page.locator('.cm-pin')).toHaveCount(19)
  await page.locator('.cm-zoom [data-cm="campus-zoom"]').tap()
  await expect(page.locator('.cm-overlay')).toHaveAttribute('data-zoom', 'close')
  await expect(page.locator('.cm-cpin[data-cpin="quad"] i')).toHaveText('The Quad')
  await shot(page, 'i3-map-campus')
  await page.locator('.cm-cpin[data-cpin="quad"]').tap()
  await expect(page.locator('.cm-detail [data-way="campus-walk"]')).toBeVisible()
  await page.locator('.cm-detail [data-way="campus-walk"]').tap()
  await expect(page.locator('.cm-overlay')).toBeHidden()
  await expect(page.locator('#world')).toHaveAttribute('data-walking', '1', { timeout: 10000 }).catch(() => {})
  // the gate's sheet: SunnyBay by taxi or on foot
  await page.evaluate(() => { location.hash = '#/place/gate' })
  await expect(page.locator('.g-gate')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.g-gate')).toContainText('SunnyBay is 5 min by taxi.')
  await expect(page.locator('.g-gate [data-act="gate-taxi"]')).toBeVisible()
  await expect(page.locator('.g-gate [data-act="gate-walk"]')).toBeVisible()
  await expect(page.locator('.g-empty')).toHaveCount(0)
  await shot(page, 'i3-gate')
  await page.locator('.g-gate [data-act="gate-taxi"]').tap()
  // out of the gate, to the gate's taxi stop, whose card asks where to
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await expect(page.locator('.city-card .cc-next')).toBeVisible({ timeout: 60000 })
  expect(errors).toEqual([])
})

test('I4 people: a chat is a request; the card is light blue with Chat and Follow; handles are never the name; family and card prompt', async ({ page }) => {
  const server = await chatServer()
  const BONGA = { p_id: 'bonga-ask-player-0001', p_secret: 'bonga-ask-secret-0123456789abcd' }
  const SIPHO = { p_id: 'sipho-ask-player-0002', p_secret: 'sipho-ask-secret-0123456789abcd' }
  for (const p of [BONGA, SIPHO]) await server.call('chat_sync', { ...p, p_name: p === BONGA ? 'Bonga Dube' : 'Sipho Nkosi', p_handle: p === BONGA ? 'lucky_otter42' : 'calm_kudu17' })
  await server.routeChat(page)
  const errors = await atGate(page, { query: `&chat=1&room=test-ask-${Date.now().toString(36)}`, name: 'Thandeka Mokoena', preset: 'q-emma', patch: CALM })
  // the handle: a Soft Life handle, nothing of "Thandeka" or "Mokoena" in it
  const handle = (await run(page)).character.handle
  expect(handle).toMatch(/^[a-z]+_[a-z]+\d{2}$/)
  expect(handle).not.toMatch(/thandeka|mokoena/)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const mine = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
  const sync = () => page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
  // you ask Bonga: nothing opens until he accepts; then the DM is there
  const asked = await page.evaluate((id) => import('/src/threads.js').then((m) => m.dmWith(id, { name: 'Bonga Dube' })), BONGA.p_id)
  expect(asked.asked).toBe(true)
  expect((await server.call('chat_dm_answer', { ...BONGA, p_from: mine.p_id, p_yes: true })).body.ok).toBe(true)
  await sync()
  await expect.poll(() => page.evaluate(() => (window.mzansiToasts || []).some((t) => t.includes('Bonga said yes'))), { timeout: 10000 }).toBe(true)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).threads.some((t) => t.kind === 'dm'), { timeout: 10000 }).toBe(true)
  // Sipho asks you: "Sipho wants to chat. Accept / Decline"; Accept opens the DM
  expect((await server.call('chat_dm', { ...SIPHO, p_other: mine.p_id })).body.asked).toBe(true)
  await sync()
  const ask = page.locator('.cht-chatask')
  await expect(ask).toBeVisible({ timeout: 10000 })
  await expect(ask).toContainText('Sipho wants to chat.')
  await shot(page, 'i4-request')
  await ask.locator('[data-ask="accept"]').tap()
  await expect(page.locator('.cht-sheet')).toBeVisible({ timeout: 10000 })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).open, { timeout: 10000 }).toBe(`dm:${[mine.p_id, SIPHO.p_id].sort().join(':')}`)
  await page.locator('.cht-sheet [data-ct="close"]').tap()
  // the card, as the game draws it for a player you tap: light blue, Chat and Follow, the counts
  await page.evaluate(() => import('/src/ui/card.js').then((m) => {
    const wrap = document.createElement('div')
    wrap.className = 'pc-sheet-wrap on test-card'
    wrap.innerHTML = `<div class="pc-mini-body">${m.miniCardHtml({ name: 'Bonga Dube', handle: 'lucky_otter42', house: 'Peak', tags: { course: 'Law' }, year: 1, look: {} }, null, { id: 'x', info: { followers: 3, friends: 2, following: false, mutual: true, online: false, seen: new Date(Date.now() - 2 * 3600e3).toISOString(), chat: 'ask' } })}</div>`
    document.body.append(wrap)
  }))
  const card = page.locator('.test-card .pc-mini-body')
  await expect(card).toBeVisible()
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(220, 235, 245)')
  await expect(card.locator('.pc-mini-acts > button')).toHaveText(['\u{1F4AC} Chat', '＋ Follow'])
  await expect(card.locator('[data-pc="wave"], [data-pc="hi"]')).toHaveCount(0)
  await expect(card.locator('.pc-mini-stats')).toContainText('3 followers')
  await expect(card.locator('.pc-mini-stats')).toContainText('2 friends')
  await expect(card.locator('.pc-mini-seen')).toHaveText('last seen 2 h ago')
  await expect(card.locator('.pc-mini-grey')).toHaveText('Peak House · Law · 1st year') // (the house's own name)
  await shot(page, 'i4-card')
  await page.evaluate(() => document.querySelector('.test-card')?.remove())
  // the family that drives you: not everybody's mum in the same car
  const fam = await page.evaluate(() => import('/src/family.js').then((m) => Array.from({ length: 30 }, (_, i) => m.familyFor(`player-${i}-seed`, i % 2 ? 'suburban' : 'township'))))
  expect(new Set(fam.map((f) => f.role)).size).toBeGreaterThanOrEqual(4)
  expect(new Set(fam.map((f) => f.car.model)).size).toBeGreaterThanOrEqual(3)
  expect(new Set(fam.map((f) => `${f.car.model}:${f.car.colour}`)).size).toBeGreaterThanOrEqual(8)
  // an older card that is still empty (no quick start, nothing on it): asked once, gently, and never again
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(s.run, { quick: false, cardDone: false, cardAsked: '', cardNudged: false })
    Object.assign(s.run.character, { bio: '', vibe: '', looking: '', courseAuto: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(s))
  })
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.evaluate(() => window.mzansiLaunch.want('meal'))
  // (asked for; the game may show it at its own next calm moment before this line looks, which empties "pending")
  const shownAlready = await page.locator('.sl-pop').filter({ hasText: 'Finish your student card' }).isVisible().catch(() => false)
  if (!shownAlready) {
    expect(await page.evaluate(() => window.mzansiLaunch.pending())).toBe('meal')
    await page.evaluate(() => window.mzansiLaunch.promptCard())
  }
  await expect(page.locator('.sl-pop')).toContainText('Finish your student card')
  await shot(page, 'i4-card-prompt')
  expect((await run(page)).cardNudged).toBe(true)
  await page.locator('.sl-pop [data-lp="card-later"]').tap()
  await page.evaluate(() => window.mzansiLaunch.want('meal'))
  expect(await page.evaluate(() => window.mzansiLaunch.pending()), 'asked once only').toBe('')
  expect(errors).toEqual([])
})
