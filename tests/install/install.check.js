// Install Soft Life (owner, 7 Nov), on the built game, served the way vercel.json serves it.
// I1 the manifest, icons and theme colour.
// I2 Edge's own installability check passes (no errors), the service worker controls the
//    page, and it only answers page loads: game files and Supabase never go through it.
// I3 no signal: the offline page, not the browser's dinosaur.
// I4 the menu's "Install Soft Life" at phone sizes (screenshots), the install screen,
//    the iPhone steps, #install, and hidden once installed.
// I6 the start screen: Install Soft Life and Website beside Rules, Privacy, Terms (phone and
//    computer), Install hidden once installed. On a phone (8 Nov) Install is a small pill with
//    an icon on its own line, and Rules, Privacy, Terms, Website one row.
// I7 the title on phones (8 Nov), in the browser and as the installed app: the poster from the
//    top, fading into plum under the logo, the tagline and button over the fade and on screen;
//    the bars plum on the title, cream on the game's cream screens; the top fade in the
//    installed app; the slow zoom off under reduced motion.
// I5 a deploy: build A open, build B deployed (switched in one step, A's files gone), reload,
//    build B runs; and an old page that asks for a game file that's gone reloads into B.
import { test, expect, chromium } from '@playwright/test'
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import sharp from 'sharp'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/install'
const ROOM = 'room=install-test' // never the live campus
mkdirSync(OUT, { recursive: true })

// The built game, served the way vercel.json serves it: a file if it exists; a missing
// /assets/ file is a 404; any other path gets index.html (no-cache); /assets/ immutable.
// A deploy builds into its own folder and switches in one step, as Vercel does (no gap
// where the site is down).
const BUILDS = 'node_modules/.cache/softlife-install'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' }
let root = ''
let server = null
function build(tag) {
  const dir = `${BUILDS}/${tag}`
  execSync(`npx vite build --outDir ${dir} --emptyOutDir`, { stdio: 'ignore', env: { ...process.env, BUILD_TAG: tag } })
  return dir
}
function serve() {
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = join(root, path)
    const asset = path.startsWith('/assets/')
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (asset) { res.writeHead(404); res.end(); return }
      file = join(root, 'index.html')
    }
    const html = file.endsWith('index.html')
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': asset ? 'public, max-age=31536000, immutable' : (html || path === '/sw.js' || path.endsWith('.webmanifest') ? 'no-cache' : 'public, max-age=3600'),
    })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve))
}
// The built page's own entry script (a build has more than one index-*.js chunk).
const mainScript = () => readFileSync(join(root, 'index.html'), 'utf8').match(/src="\/assets\/(index-[^"]+\.js)"/)[1]

test.beforeAll(async () => { root = build('A'); await serve() })
test.afterAll(async () => { await new Promise((r) => (server ? server.close(r) : r())) })

test('I1 manifest, icons and theme colour', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json()
  expect(m.name).toBe('Soft Life: University of Mzansi')
  expect(m.short_name).toBe('Soft Life')
  expect(m.start_url).toBe('/')
  expect(m.scope).toBe('/')
  expect(m.display).toBe('standalone')
  // Night plum (8 Nov): the splash and the bars around the title, not cream.
  expect(m.background_color.toLowerCase()).toBe('#1a0d33')
  expect(m.theme_color.toLowerCase()).toBe('#1a0d33')
  const want = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]
  for (const [sizes, purpose] of want) {
    const icon = m.icons.find((i) => i.sizes === sizes && i.purpose === purpose && i.type === 'image/png')
    expect(icon, `${sizes} ${purpose}`).toBeTruthy()
    const buf = Buffer.from(await (await request.get(icon.src)).body())
    const meta = await sharp(buf).metadata()
    expect(`${meta.width}x${meta.height}`).toBe(sizes)
  }
  const apple = await sharp(Buffer.from(await (await request.get('/icons/apple-touch-icon.png')).body())).metadata()
  expect(apple.width).toBe(180)
  await page.goto(`/?${ROOM}#/`)
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#1a0d33')
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/icons/apple-touch-icon.png')
})

test('I2 installable, and the worker only answers page loads', async () => {
  // A normal (not private) Edge profile: test windows are private, and the browser never
  // offers to install from a private window ("in-incognito").
  const dir = mkdtempSync(join(tmpdir(), 'softlife-install-'))
  const context = await chromium.launchPersistentContext(dir, { channel: 'msedge', viewport: { width: 412, height: 915 } })
  const page = context.pages()[0] || await context.newPage()
  await page.goto(`http://127.0.0.1:4173/?${ROOM}#/`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  const responses = []
  page.on('response', (r) => responses.push({ url: r.url(), sw: r.fromServiceWorker(), nav: r.request().isNavigationRequest() }))
  await page.reload()
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  console.log('installability errors:', JSON.stringify(installabilityErrors))
  expect(installabilityErrors).toEqual([])
  const { url, errors } = await cdp.send('Page.getAppManifest')
  console.log('manifest:', url, errors.length ? JSON.stringify(errors) : 'no errors')
  expect(errors).toEqual([])
  const nav = responses.find((r) => r.nav)
  expect(nav?.sw, 'the page load goes through the worker (network first)').toBe(true)
  const assets = responses.filter((r) => /\/assets\//.test(r.url))
  expect(assets.length).toBeGreaterThan(0)
  expect(assets.filter((r) => r.sw), 'game files never go through the worker').toEqual([])
  expect(responses.filter((r) => /supabase/.test(r.url) && r.sw), 'Supabase never goes through the worker').toEqual([])
  await context.close()
  rmSync(dir, { recursive: true, force: true })
})

test('I3 no signal: the offline page', async ({ page, context }) => {
  await page.goto(`/?${ROOM}#/`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.goto(`/?${ROOM}#/`).catch(() => {})
  await expect(page.locator('h1')).toHaveText("You're offline")
  await page.screenshot({ path: `${OUT}/offline-390.png` })
  await context.setOffline(false)
})

for (const [w, h] of [[360, 800], [412, 915]]) {
  test(`I4 the menu option and install screen at ${w}x${h}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await context.newPage()
    await page.goto(`/?${ROOM}&morning=0#/new`)
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.view', 'map') })
    await page.goto(`/?${ROOM}&morning=0#/new`)
    await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
    await page.locator('[data-act="gear"]').first().waitFor({ timeout: 30000 })
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
      Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
      localStorage.setItem('mzansiville.v1', JSON.stringify(save))
      localStorage.setItem('mzansiville.mapHint', '1')
    })
    // (a new query string, so the page really reloads with the saved day)
    await page.goto(`/?${ROOM}&morning=0&at=13#/play`)
    await page.locator('[data-act="gear"]').first().tap()
    const option = page.locator('.g-menu .g-install')
    await expect(option).toBeVisible()
    await expect(option).toHaveText(/Install Soft Life/)
    const box = await option.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(40)
    await page.screenshot({ path: `${OUT}/menu-${w}x${h}.png` })
    await option.tap()
    await page.waitForURL(/#\/install/)
    const mode = await page.locator('main[data-screen="install"]').getAttribute('data-mode')
    console.log(`${w}x${h}: install screen mode ${mode}`)
    expect(['prompt', 'manual']).toContain(mode)
    if (mode === 'prompt') await expect(page.locator('[data-act="install-go"]')).toBeVisible()
    else await expect(page.locator('.in-steps li')).toHaveCount(3)
    await page.screenshot({ path: `${OUT}/install-${mode}-${w}x${h}.png` })
    // Installed: the option hides (appinstalled marks it; launched from the home screen
    // counts the same way).
    await page.evaluate(() => localStorage.setItem('mzansiville.installed', '1'))
    await page.goto(`/?${ROOM}&morning=0&at=installed#/play`)
    await page.locator('[data-act="gear"]').first().tap()
    await expect(page.locator('.g-menu')).toBeVisible()
    await expect(page.locator('.g-menu .g-install')).toHaveCount(0)
    await context.close()
  })
}

test('I4b iPhone: the Share > Add to Home Screen steps; #install opens the screen', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  await page.goto(`/?${ROOM}#install`)
  await expect(page.locator('main[data-screen="install"]')).toHaveAttribute('data-mode', 'ios')
  await expect(page.locator('.in-steps li')).toHaveCount(3)
  await expect(page.locator('.in-steps')).toContainText('Share')
  await expect(page.locator('.in-steps')).toContainText('Add to Home Screen')
  await page.screenshot({ path: `${OUT}/install-ios-390x844.png` })
  // Opened from the home screen (standalone): it says it's installed, no steps.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q))
  })
  await page.goto(`/?${ROOM}&home=1#/install`)
  await expect(page.locator('main[data-screen="install"]')).toHaveAttribute('data-mode', 'done')
  await context.close()
})

test('I4c Android: Chrome offers to install, our button opens its prompt, then it hides', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(`/?${ROOM}#/install`)
  await expect(page.locator('main[data-screen="install"]')).toHaveAttribute('data-mode', 'manual')
  // What Chrome does when the game can be installed (headless never offers, so a stand-in).
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    e.prompt = () => { window.promptShown = true }
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await expect(page.locator('main[data-screen="install"]')).toHaveAttribute('data-mode', 'prompt')
  await expect(page.locator('[data-act="install-go"]')).toBeVisible()
  await page.screenshot({ path: `${OUT}/install-prompt-412x915.png` })
  await page.locator('[data-act="install-go"]').tap()
  expect(await page.evaluate(() => window.promptShown)).toBe(true)
  await expect(page.locator('main[data-screen="install"]')).toHaveAttribute('data-mode', 'done')
  await page.screenshot({ path: `${OUT}/install-done-412x915.png` })
  await context.close()
})

for (const [w, h] of [[390, 844], [1440, 900]]) {
  test(`I6 the start screen at ${w}x${h}: Install and Website, Install hidden once installed`, async ({ browser }) => {
    const site = JSON.parse(readFileSync('data/site/website.json', 'utf8')).siteUrl
    const phone = w < 900
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 3 : 1 })
    const page = await context.newPage()
    await page.goto(`/?${ROOM}#/`)
    const links = page.locator('.tc-links a')
    await expect(links).toHaveText(['Rules', 'Privacy', 'Terms', 'Install Soft Life', 'Website'])
    await expect(page.locator('.tc-links [data-link="install"]')).toHaveAttribute('href', '#/install')
    const web = page.locator('.tc-links [data-link="website"]')
    await expect(web).toHaveAttribute('href', site)
    await expect(web).toHaveAttribute('target', '_blank')
    // Website: same look as Rules (font, colour, padding). Install: the same on the computer;
    // on a phone a pill with an icon, on its own line above the other four (one row).
    const look = (sel) => page.locator(sel).evaluate((el) => { const c = getComputedStyle(el); return [c.font, c.color, c.padding, c.textDecorationLine].join('|') })
    expect(await look('.tc-links [data-link="website"]')).toBe(await look('.tc-links a[href="#/rules"]'))
    const install = page.locator('.tc-links [data-link="install"]')
    if (phone) {
      const pill = await install.evaluate((el) => { const c = getComputedStyle(el); const b = el.getBoundingClientRect(); return { radius: parseFloat(c.borderTopLeftRadius), border: c.borderTopStyle, icon: getComputedStyle(el.querySelector('.tc-ico')).display, top: b.top, h: b.height } })
      expect(pill.radius).toBeGreaterThanOrEqual(pill.h / 2 - 1)
      expect(pill.border).toBe('solid')
      expect(pill.icon).toBe('block')
      const tops = await page.locator('.tc-links a:not([data-link="install"])').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
      expect(new Set(tops).size, 'Rules, Privacy, Terms, Website in one row').toBe(1)
      expect(pill.top).toBeLessThan(tops[0])
    } else {
      expect(await look('.tc-links [data-link="install"]')).toBe(await look('.tc-links a[href="#/rules"]'))
      expect(await install.locator('.tc-ico').evaluate((el) => getComputedStyle(el).display)).toBe('none')
    }
    // Every link on the screen and none wider than it.
    for (const box of await links.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(w)
      expect(box.bottom).toBeLessThanOrEqual(h)
    }
    await page.waitForTimeout(1300) // the row fades in
    await page.screenshot({ path: `${OUT}/start-${w}x${h}-before.png` })
    // Install opens the install screen; Website opens the site in a new tab.
    await page.locator('.tc-links [data-link="install"]').click()
    await expect(page.locator('main[data-screen="install"]')).toBeVisible()
    await page.goto(`/?${ROOM}#/`)
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('.tc-links [data-link="website"]').click()])
    await tab.waitForLoadState('domcontentloaded').catch(() => {})
    expect(tab.url()).toContain(new URL(site).host)
    await tab.close()
    // Installed (appinstalled marks it; launched from the home screen counts the same).
    await page.evaluate(() => localStorage.setItem('mzansiville.installed', '1'))
    await page.goto(`/?${ROOM}&installed=1#/`)
    await expect(links).toHaveText(['Rules', 'Privacy', 'Terms', 'Website'])
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${OUT}/start-${w}x${h}-after.png` })
    // Running as the installed app (display-mode standalone), with nothing stored.
    await page.evaluate(() => localStorage.removeItem('mzansiville.installed'))
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window)
      window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q))
    })
    await page.goto(`/?${ROOM}&standalone=1#/`)
    await expect(page.locator('.tc-links [data-link="install"]')).toHaveCount(0)
    await context.close()
  })
}

// The installed app, as the page sees it: display-mode standalone answered by matchMedia (Edge's
// DevTools protocol has no display-mode emulation), and a 32 px status bar the page may draw under.
async function asInstalled(context, page) {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window)
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q))
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 32, bottom: 16 } }).catch(() => {})
}
for (const [w, h] of [[390, 844], [360, 740], [390, 664]]) {
  for (const mode of ['browser', 'standalone']) {
    test(`I7 the title at ${w}x${h} (${mode}): poster from the top, fade, button over it`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
      const page = await context.newPage()
      if (mode === 'standalone') await asInstalled(context, page)
      await page.goto(`/?${ROOM}#/`)
      await page.waitForTimeout(1300) // the foot fades in
      const g = await page.evaluate(() => {
        const box = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON() || null
        const art = document.querySelector('.tc-art')
        const cs = getComputedStyle(art)
        return {
          display: document.documentElement.dataset.display,
          theme: document.querySelector('meta[name="theme-color"]').content,
          art: box('.tc-art'), tag: box('.tc-tag'), start: box('.tc-start'), links: box('.tc-links'),
          mask: cs.maskImage || cs.webkitMaskImage,
          topFade: getComputedStyle(art, '::before').content,
          bg: getComputedStyle(document.querySelector('.tc')).backgroundColor,
        }
      })
      expect(g.display).toBe(mode)
      expect(g.theme).toBe('#1a0d33')
      expect(g.bg).toBe('rgb(26, 13, 51)')
      // The poster starts at the very top (no strip above it), never narrower than the screen.
      expect(g.art.top).toBe(0)
      expect(g.art.width).toBeGreaterThanOrEqual(w)
      expect(g.art.width).toBeLessThanOrEqual(w * 1.1 + 1)
      // It fades out: the mask ends transparent; the tagline sits below the logo (62% down).
      expect(g.mask).toMatch(/linear-gradient.*(transparent|rgba\(0, 0, 0, 0\))\)$/)
      expect(g.tag.top, 'the tagline sits below the logo').toBeGreaterThan(g.art.top + g.art.height * 0.62)
      // The tagline over the fade or just under it; the button and links on the first screen.
      expect(g.tag.top).toBeLessThan(g.art.bottom + 100)
      expect(g.start.bottom).toBeLessThanOrEqual(h)
      expect(g.links.bottom).toBeLessThanOrEqual(h)
      expect(g.start.height).toBeGreaterThanOrEqual(48)
      expect(g.start.height).toBeLessThanOrEqual(56)
      // Thumb reach: the button in the lower 40% of the screen.
      expect(g.start.top).toBeGreaterThan(h * 0.6)
      // The installed app: a dark fade at the very top for the clock; no Install pill.
      if (mode === 'standalone') {
        expect(g.topFade).not.toBe('none')
        await expect(page.locator('[data-link="install"]')).toHaveCount(0)
      } else {
        expect(g.topFade).toBe('none')
        await expect(page.locator('[data-link="install"]')).toHaveCount(1)
      }
      await page.screenshot({ path: `${OUT}/title-${mode}-${w}x${h}.png` })
      await context.close()
    })
  }
}

test('I7b the bars follow the screen; the slow zoom stops under reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const bar = () => page.locator('meta[name="theme-color"]').getAttribute('content')
  await page.goto(`/?${ROOM}#/`)
  await page.locator('.tc-start').waitFor()
  expect(await bar()).toBe('#1a0d33')
  expect(await page.locator('.tc-art img').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await page.goto(`/?${ROOM}#/rules`)
  await page.locator('main[data-screen="rules"]').waitFor()
  expect(await bar(), "cream on the game's cream screens").toBe('#f4efe4')
  await page.goto(`/?${ROOM}#/`)
  await page.locator('.tc-start').waitFor()
  expect(await bar()).toBe('#1a0d33')
  await context.close()
  // Without reduced motion the poster zooms, slowly.
  const moving = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const p2 = await moving.newPage()
  await p2.goto(`/?${ROOM}#/`)
  const anim = await p2.locator('.tc-art img').evaluate((el) => { const c = getComputedStyle(el); return [c.animationName, parseFloat(c.animationDuration)] })
  expect(anim[0]).toBe('tc-zoom')
  expect(anim[1]).toBeGreaterThanOrEqual(24)
  await moving.close()
})

test('I5 a deploy: the new build loads on reload, and an old page reloads into it', async ({ page, context }) => {
  const scriptOf = (p) => p.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-/.test(s)) || '')
  await page.goto(`/?${ROOM}#/`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  // A second tab left open on build A at the title screen (the creator not opened yet).
  const old = await context.newPage()
  await old.goto(`/?${ROOM}&tab=old#/`)
  const a = await scriptOf(page)
  expect(a).toContain(mainScript())
  expect(await scriptOf(old)).toBe(a)
  console.log('build A:', a.replace(/^.*\/assets\//, ''))
  // Deploy B: built into its own folder, then the site switches to it in one step.
  const next = build('B')
  root = next
  const bFile = mainScript()
  expect(a).not.toContain(bFile)
  // 1. Reopening the game (a reload) runs B: the page comes from the network, not a cache.
  await page.reload()
  const b = await scriptOf(page)
  console.log('after the deploy, reload:', b.replace(/^.*\/assets\//, ''))
  expect(b).toContain(bFile)
  // 2. The old tab opens the creator: its lazy game file (build A's) is gone from the
  //    server, so stale.js shows Updating... and reloads, and the tab runs B.
  const gone = []
  old.on('requestfailed', (r) => { if (/\/assets\//.test(r.url())) gone.push(r.url().replace(/^.*\/assets\//, '')) })
  await old.evaluate(() => { location.hash = '#/new' })
  await old.waitForTimeout(4000)
  await expect.poll(async () => (await scriptOf(old).catch(() => '')).includes(bFile), { timeout: 15000 }).toBe(true)
  console.log('old tab: build A files gone:', gone.join(', ') || 'none')
  console.log('old tab after opening the creator:', (await scriptOf(old)).replace(/^.*\/assets\//, ''))
  expect(gone.length, 'the old tab asked for build A files that are gone').toBeGreaterThan(0)
})
