// The Soft Life website: the owner's quality bar (7 Nov), checked on the built page.
// W1 each width: no sideways scroll, 44 px tap targets, keyboard focus shows, screenshots.
// W2 images: width/height set, alt text, lazy below the first screen, WebP, max 1000 px.
// W3 page weight on a phone: under 250 kB before images, under 1 MB in all.
// W4 every link: in-page anchors land on a section, outside links answer (no 404s).
// W5 data: houses, slots, shop and brands follow the data files; head tags are all there.
// W6 reduced motion: no smooth scrolling.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const SIZES = [[360, 800], [390, 844], [768, 1024], [1440, 900]]
const OUT = 'docs/sprints/website'
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const site = json('data/site/website.json')
const houses = json('data/campusville/houses.json').houses
const phases = json('data/campusville/meta.json').phases
const shop = json('data/campusville/shop.json')

async function open(page) {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 50))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState('networkidle')
}

for (const [w, h] of SIZES) {
  test(`W1 ${w}x${h}: no sideways scroll, 44 px targets, focus, screenshots`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await open(page)
    const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    expect(scroll.sw, 'page wider than the screen').toBeLessThanOrEqual(scroll.iw)
    const small = await page.evaluate(() => [...document.querySelectorAll('a, button')]
      .filter((el) => !el.classList.contains('skip'))
      .map((el) => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) } })
      .filter((r) => r.w < 44 || r.h < 44))
    expect(small, 'tap targets under 44 px').toEqual([])
    // Keyboard: the first Tab shows the skip link; the next lands on the wordmark with an outline.
    await page.keyboard.press('Tab')
    const skip = await page.evaluate(() => { const el = document.activeElement; return { cls: el.className, top: el.getBoundingClientRect().top } })
    expect(skip.cls).toBe('skip')
    expect(skip.top).toBeGreaterThanOrEqual(0)
    await page.keyboard.press('Tab')
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
    expect(ring).not.toBe('none')
    await page.evaluate(() => document.activeElement.blur())
    await page.screenshot({ path: `${OUT}/${w}x${h}-first-screen.png` })
    await scrollThrough(page)
    await page.screenshot({ path: `${OUT}/${w}x${h}-full.png`, fullPage: true })
  })
}

test('W2 images: sizes set, alt text, lazy below the first screen, WebP max 1000 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  const imgs = await page.evaluate(() => [...document.images].map((img) => ({
    src: img.getAttribute('src'), w: img.getAttribute('width'), h: img.getAttribute('height'), alt: img.getAttribute('alt'),
    lazy: img.getAttribute('loading'), top: img.getBoundingClientRect().top + window.scrollY,
  })))
  expect(imgs.length).toBeGreaterThan(0)
  for (const i of imgs) {
    expect(i.src, i.src).toMatch(/\.webp$/)
    expect(Number(i.w), `${i.src} width`).toBeGreaterThan(0)
    expect(Number(i.w), `${i.src} over 1000 px`).toBeLessThanOrEqual(1000)
    expect(Number(i.h), `${i.src} height`).toBeGreaterThan(0)
    expect(i.alt?.length, `${i.src} alt`).toBeGreaterThan(5)
    // The poster is the hero (first screen on a computer); anything else that low is lazy.
    if (i.top > 900 && !/poster/.test(i.src)) expect(i.lazy, `${i.src} is below the first screen but not lazy`).toBe('lazy')
  }
  // Drawn stand-ins (an Organt photo not there yet) are labelled images too.
  const svgs = await page.evaluate(() => [...document.querySelectorAll('svg[role="img"]')].map((s) => s.getAttribute('aria-label')))
  for (const label of svgs) expect(label?.length).toBeGreaterThan(5)
})

test('W3 page weight on a phone: under 250 kB before images, under 1 MB in all', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await scrollThrough(page)
  const list = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const res = performance.getEntriesByType('resource')
    return [{ name: 'index.html', bytes: nav.encodedBodySize }, ...res.map((r) => ({ name: r.name, bytes: r.encodedBodySize }))]
  })
  const isImg = (r) => /\.(webp|png|jpe?g)(\?|$)/.test(r.name)
  const total = list.reduce((s, r) => s + r.bytes, 0)
  const before = list.filter((r) => !isImg(r)).reduce((s, r) => s + r.bytes, 0)
  console.log(`page weight at 390 px: ${(before / 1024).toFixed(1)} kB before images, ${(total / 1024).toFixed(1)} kB in all (uncompressed)`)
  for (const r of list) console.log(`  ${(r.bytes / 1024).toFixed(1).padStart(7)} kB  ${r.name.replace(/^https?:\/\/[^/]+/, '')}`)
  expect(before).toBeLessThan(250 * 1024)
  expect(total).toBeLessThan(1024 * 1024)
})

test('W4 every link works', async ({ page, request }) => {
  await open(page)
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))
  const bad = []
  for (const href of [...new Set(links)]) {
    if (href.startsWith('#')) {
      if (!(await page.locator(href).count())) bad.push(`${href}: no such section`)
    } else if (href.startsWith('mailto:')) {
      if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/.test(href)) bad.push(`${href}: not an email`)
    } else {
      const url = new URL(href, 'http://127.0.0.1:4180/')
      const res = await request.get(url.href.split('#')[0], { maxRedirects: 5 })
      console.log(`${res.status()}  ${href}`)
      if (res.status() >= 400) bad.push(`${href}: ${res.status()}`)
      // A game screen (#/rules, #/privacy, #/terms) must be one the game draws (src/ui/render.js view()).
      const screen = url.hash.replace(/^#\/?/, '')
      if (screen && !['rules', 'privacy', 'terms'].includes(screen)) bad.push(`${href}: unknown game screen`)
    }
  }
  for (const f of ['/sitemap.xml', '/robots.txt', '/share.jpg', '/favicon.svg', '/apple-touch-icon.png']) {
    const res = await request.get(f)
    console.log(`${res.status()}  ${f}`)
    if (res.status() !== 200) bad.push(`${f}: ${res.status()}`)
  }
  expect(bad).toEqual([])
})

test('W5 the page follows the data files, and the head is complete', async ({ page }) => {
  await open(page)
  expect(await page.locator('.pennant h3').allTextContents()).toEqual(houses.map((x) => x.name))
  expect(await page.locator('.slot time').allTextContents()).toEqual(phases.map((p) => p.start))
  expect(await page.locator('.shop a').count()).toBe(/^https:\/\//.test(shop.url || '') ? 1 : 0)
  expect(await page.locator('#brands').count()).toBe(site.brands.email ? 1 : 0)
  expect(await page.locator('#next').count()).toBe(site.next.show ? 1 : 0)
  expect(await page.locator('.qr-code svg path').count()).toBeGreaterThan(0)
  const head = await page.evaluate(() => {
    const m = (sel) => document.querySelector(sel)?.getAttribute('content') || document.querySelector(sel)?.getAttribute('href') || ''
    return {
      title: document.title, description: m('meta[name="description"]'), ogImage: m('meta[property="og:image"]'),
      twImage: m('meta[name="twitter:image"]'), twCard: m('meta[name="twitter:card"]'),
      icon: m('link[rel="icon"]'), canonical: m('link[rel="canonical"]'), lang: document.documentElement.lang,
      cookies: document.cookie, scripts: document.scripts.length,
    }
  })
  expect(head.title).toBe(site.meta.title)
  expect(head.description).toBe(site.meta.description)
  expect(head.ogImage).toBe(`${site.siteUrl}/share.jpg`)
  expect(head.twImage).toBe(`${site.siteUrl}/share.jpg`)
  expect(head.twCard).toBe('summary_large_image')
  expect(head.icon).toBe('/favicon.svg')
  expect(head.canonical).toBe(`${site.siteUrl}/`)
  expect(head.lang).toBeTruthy()
  expect(head.cookies).toBe('')
  expect(head.scripts, 'no scripts on the page (no trackers)').toBe(0)
  // Rules: no invented player counts, no real university names.
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/\b\d[\d,.]*\s*k?\s*(players|students online|downloads)\b/i)
  expect(text).not.toMatch(/\b(UKZN|Wits|UCT|Stellenbosch|UJ|Tuks|University of Pretoria|Rhodes|Westville)\b/)
})

test('W6 reduced motion: no smooth scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('smooth')
})
