// Builds the Soft Life website from the repo's data, so nothing drifts from the game:
//   data/site/website.json      the words (Cursor owns them)
//   data/campusville/houses.json the seven houses: name, vibe, blurb, colours
//   data/campusville/meta.json   the day's six slots and their start times
//   data/campusville/shop.json   the Organt shop link (the button hides while it's empty)
// A Vite plugin: fills index.html (head + body + the inlined CSS), and at build time also
// writes sitemap.xml, robots.txt and share.jpg (the game's own link-preview image).
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(SITE, '..')
export const DATA_FILES = [
  join(REPO, 'data', 'site', 'website.json'),
  join(REPO, 'data', 'campusville', 'houses.json'),
  join(REPO, 'data', 'campusville', 'meta.json'),
  join(REPO, 'data', 'campusville', 'shop.json'),
  join(SITE, 'src', 'site.css'),
]
const SHARE_IMAGE = join(REPO, 'public', 'share.jpg')

const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const trimSlash = (u) => String(u || '').replace(/\/+$/, '')

export function load() {
  const site = json(DATA_FILES[0])
  const houses = json(DATA_FILES[1]).houses || []
  const phases = json(DATA_FILES[2]).phases || []
  const shop = json(DATA_FILES[3])
  const css = readFileSync(DATA_FILES[4], 'utf8')
  const gameUrl = trimSlash(site.gameUrl)
  const siteUrl = trimSlash(site.siteUrl)
  const game = gameUrl.replace(/^https?:\/\//, '')
  const fill = (s) => String(s ?? '').replaceAll('{game}', game)
  // Only a real https link counts; anything else keeps the Shop button hidden.
  const shopUrl = /^https:\/\/[^\s"'<>]+$/.test(shop.url || '') ? shop.url : ''
  const email = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(site.brands?.email || '') ? site.brands.email : ''
  return { site, houses, phases, shopUrl, email, css, gameUrl, siteUrl, game, fill }
}

// ---- colour contrast (WCAG 2) -------------------------------------------------------
function lum(hex) {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const INK = '#1c1915'
const WHITE = '#ffffff'
/** White or ink on a house colour, whichever reads better (always 4.5:1 or more for the seven houses). */
export function textOn(bg) {
  const w = contrast(bg, WHITE)
  const k = contrast(bg, INK)
  return w >= k ? { colour: WHITE, ratio: w } : { colour: INK, ratio: k }
}

// ---- images ---------------------------------------------------------------------------
/** Width and height of a WebP file, read from its header (VP8, VP8L or VP8X). */
export function webpSize(file) {
  const b = readFileSync(file)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
  const kind = b.toString('ascii', 12, 16)
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) }
  }
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  return null
}

/** An <img> for a WebP in site/public/img/, or '' when the file isn't there yet. */
function picture(rel, alt, { lazy = true, sizes = '', priority = false } = {}) {
  if (!rel) return ''
  const file = join(SITE, 'public', rel)
  if (!existsSync(file)) return ''
  const size = webpSize(file)
  if (!size) return ''
  // The smaller copies npm run images makes (name-240.webp, name-600.webp), when they're there.
  const set = [240, 600].map((w) => ({ w, rel: rel.replace(/\.webp$/, `-${w}.webp`) }))
    .filter((x) => existsSync(join(SITE, 'public', x.rel)))
    .map((x) => `/${esc(x.rel)} ${x.w}w`)
  const srcset = set.length ? ` srcset="${[...set, `/${esc(rel)} ${size.w}w`].join(', ')}"${sizes ? ` sizes="${esc(sizes)}"` : ''}` : ''
  return `<img src="/${esc(rel)}"${srcset} width="${size.w}" height="${size.h}" alt="${esc(alt)}" decoding="async"${lazy ? ' loading="lazy"' : ''}${priority ? ' fetchpriority="high"' : ''}>`
}

/** A drawn tee: stands in for an Organt photo until it's in site/public/img/. */
function teeSvg(tee = {}, label = '') {
  const body = tee.cropped
    ? 'M33 18 L42 14 Q50 20 58 14 L67 18 L84 29 L77 42 L69 37 L69 66 Q50 70 31 66 L31 37 L23 42 L16 29 Z'
    : 'M31 14 L41 10 Q50 17 59 10 L69 14 L88 27 L80 41 L71 36 L71 88 L29 88 L29 36 L20 41 L12 27 Z'
  const print = String(tee.print || '')
  const long = print.length > 4
  const y = tee.cropped ? 46 : 50
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${esc(label)}" focusable="false">`
    + `<path d="${body}" fill="${esc(tee.colour || '#333')}"/>`
    + `<path d="M41 10 Q50 17 59 10" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.6"/>`
    + (print ? `<text x="50" y="${y}" text-anchor="middle" font-family="Graduate, Georgia, serif" font-size="${long ? 7.5 : 15}" fill="${esc(tee.ink || '#eee')}"${long ? ' font-style="italic"' : ''}>${esc(print)}</text>` : '')
    + '</svg>'
}

/** The lookbook stand-in: "New, limited collection" over three drawn tees. */
function lookbookSvg(lb, items) {
  // Left, right, then the middle one in front, overlapping like a rail of tees.
  const spots = [{ x: -8, y: 178 }, { x: 100, y: 240 }, { x: 208, y: 178 }]
  const tees = [0, 2, 1].filter((i) => items[i]).map((i) => {
    const inner = teeSvg(items[i].tee, '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    return `<g transform="translate(${spots[i].x} ${spots[i].y}) scale(2)">${inner}</g>`
  }).join('')
  return `<svg viewBox="0 0 400 480" role="img" aria-label="${esc(lb.alt)}" focusable="false">`
    + '<rect width="400" height="480" fill="#efe9dc"/>'
    + `<text x="200" y="108" text-anchor="middle" font-family="Graduate, Georgia, serif" font-size="84" fill="#7a5220">${esc(String(lb.heading || '').toUpperCase())}</text>`
    + `<text x="200" y="146" text-anchor="middle" font-family="Figtree, sans-serif" font-size="13" letter-spacing="5" fill="#5b4a33">${esc(String(lb.sub || '').toUpperCase())}</text>`
    + tees + '</svg>'
}

// ---- the page ----------------------------------------------------------------------------
export function head(d) {
  const { site, siteUrl } = d
  const m = site.meta || {}
  const img = `${siteUrl}/share.jpg`
  return `<title>${esc(m.title)}</title>
    <meta name="description" content="${esc(m.description)}">
    <link rel="canonical" href="${esc(siteUrl)}/">
    <meta name="theme-color" content="#f4efe4">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="preload" href="/fonts/graduate-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/figtree-latin.woff2" as="font" type="font/woff2" crossorigin>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(site.header?.wordmark || 'Soft Life')}">
    <meta property="og:url" content="${esc(siteUrl)}/">
    <meta property="og:title" content="${esc(m.title)}">
    <meta property="og:description" content="${esc(m.description)}">
    <meta property="og:image" content="${esc(img)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(m.shareAlt)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(m.title)}">
    <meta name="twitter:description" content="${esc(m.description)}">
    <meta name="twitter:image" content="${esc(img)}">
    <meta name="twitter:image:alt" content="${esc(m.shareAlt)}">
    <style>${minifyCss(d.css)}</style>`
}

function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim()
}

function header(d) {
  const h = d.site.header || {}
  const links = (h.links || []).map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')
  return `<header class="top"><div class="wrap top-row">
    <a class="wordmark" href="/">${esc(h.wordmark)}</a>
    <nav aria-label="Sections"><ul>${links}</ul></nav>
    <a class="btn small" href="${esc(d.gameUrl)}/">${esc(h.play)}</a>
  </div></header>`
}

function hero(d) {
  const h = d.site.hero || {}
  const c = h.card || {}
  const blanks = '<span class="blank"></span>'.repeat(Math.max(0, Number(c.blanks) || 0))
  const poster = picture(h.poster?.image, h.poster?.alt, { lazy: false, priority: true, sizes: '(min-width: 900px) 420px, min(82vw, 340px)' })
  return `<section class="hero" aria-labelledby="hero-title"><div class="wrap hero-grid">
    <div>
      <h1 id="hero-title">${esc(h.title)}</h1>
      <p class="lede">${esc(h.text)}</p>
      <div class="btns">
        <a class="btn" href="${esc(d.gameUrl)}/">${esc(h.play)}</a>
        <a class="btn ghost" href="#phone">${esc(h.phone)}</a>
      </div>
      <div class="student">
        <p class="student-label">${esc(c.label)}</p>
        <p class="student-num"><span class="vh">${esc(c.spoken)}</span><span class="num" aria-hidden="true"><span class="prefix">${esc(c.prefix)}</span>${blanks}</span></p>
        <p class="student-note">${esc(c.note)}</p>
      </div>
    </div>
    ${poster ? `<div class="poster">${poster}</div>` : ''}
  </div></section>`
}

function day(d) {
  const s = d.site.day || {}
  const slots = d.phases.map((p) => {
    const copy = s.slots?.[p.id] || {}
    return `<li class="slot"><time datetime="${esc(p.start)}">${esc(p.start)}</time><h3>${esc(copy.label || p.label)}</h3>${copy.text ? `<p>${esc(copy.text)}</p>` : ''}</li>`
  }).join('')
  return `<section id="day" class="band band-paper" aria-labelledby="day-title"><div class="wrap">
    <h2 id="day-title">${esc(s.title)}</h2>
    <p class="lede">${esc(s.text)}</p>
    <ol class="slots">${slots}</ol>
  </div></section>`
}

/** "The loud house: a speaker on the balcony..." -> "A speaker on the balcony...." */
export function blurbOf(house) {
  const b = String(house.blurb || '').trim()
  const i = b.indexOf(': ')
  let t = i >= 0 ? b.slice(i + 2) : b
  t = t.charAt(0).toUpperCase() + t.slice(1)
  return t && !/[.!?]$/.test(t) ? `${t}.` : t
}

function housesSection(d) {
  const s = d.site.houses || {}
  const items = d.houses.map((h) => {
    const text = textOn(h.main).colour
    return `<li>
      <div class="pennant" style="--house:${esc(h.main)};--house-accent:${esc(h.accent)};--house-text:${text}">
        <h3>${esc(h.name)}</h3>
        <p class="vibe">${esc(h.vibe)}</p>
      </div>
      <p class="house-blurb">${esc(blurbOf(h))}</p>
    </li>`
  }).join('')
  return `<section id="houses" class="band" aria-labelledby="houses-title"><div class="wrap">
    <h2 id="houses-title">${esc(s.title)}</h2>
    <p class="lede">${esc(s.text)}</p>
    <ul class="houses">${items}</ul>
  </div></section>`
}

function organt(d) {
  const o = d.site.organt || {}
  const lb = o.lookbook || {}
  const items = o.items || []
  const look = picture(lb.image, lb.alt, { sizes: '(min-width: 900px) 460px, min(calc(100vw - 32px), 460px)' }) || lookbookSvg(lb, items)
  const list = items.map((it) => {
    const pic = picture(it.image, it.alt, { sizes: '72px' }) || teeSvg(it.tee, it.alt)
    return `<li class="tee"><div class="tee-pic">${pic}</div><div><h3>${esc(it.name)}</h3><p>${esc(it.text)}</p></div></li>`
  }).join('')
  const shop = d.shopUrl ? `<p class="shop"><a class="btn" href="${esc(d.shopUrl)}" rel="noopener">${esc(o.shop)}</a></p>` : ''
  return `<section id="organt" class="band dark" aria-labelledby="organt-title"><div class="wrap organt-grid">
    <div class="lookbook">${look}</div>
    <div>
      <h2 id="organt-title">${esc(o.title)}</h2>
      <p class="lede">${esc(o.text)}</p>
      <ul class="tees">${list}</ul>
      ${shop}
      ${o.note ? `<p class="hometown">${esc(o.note)}</p>` : ''}
    </div>
  </div></section>`
}

async function phone(d) {
  const p = d.site.phone || {}
  const steps = (list) => (list || []).map((s) => `<li>${esc(d.fill(s))}</li>`).join('')
  const card = (k) => `<div class="how"><h3>${esc(p[k]?.title)}</h3><ol>${steps(p[k]?.steps)}</ol></div>`
  const qr = await QRCode.toString(`${d.gameUrl}/`, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#1c1915', light: '#ffffff' } })
  const svg = qr.replace('<svg ', `<svg role="img" aria-label="${esc(d.fill(p.qrAlt))}" focusable="false" `)
  return `<section id="phone" class="band band-paper" aria-labelledby="phone-title"><div class="wrap">
    <h2 id="phone-title">${esc(p.title)}</h2>
    <p class="lede">${esc(p.text)}</p>
    <div class="phone-grid">
      ${card('android')}
      ${card('iphone')}
      <div class="qr"><div class="qr-code">${svg}</div><p>${esc(d.fill(p.qr))}</p></div>
    </div>
  </div></section>`
}

function next(d) {
  const n = d.site.next || {}
  if (!n.show) return ''
  const items = (n.items || []).map((it) => `<li><h3>${esc(it.name)}</h3><p>${esc(it.text)}</p></li>`).join('')
  return `<section id="next" class="band" aria-labelledby="next-title"><div class="wrap">
    <h2 id="next-title">${esc(n.title)}</h2>
    <ul class="next-list">${items}</ul>
  </div></section>`
}

function brands(d) {
  const b = d.site.brands || {}
  if (!d.email) return ''
  const href = `mailto:${d.email}${b.subject ? `?subject=${encodeURIComponent(b.subject)}` : ''}`
  return `<section id="brands" class="band band-yellow" aria-labelledby="brands-title"><div class="wrap brands-row">
    <div><h2 id="brands-title">${esc(b.title)}</h2><p>${esc(b.text)}</p></div>
    <a class="btn inky" href="${esc(href)}">${esc(b.button)}</a>
  </div></section>`
}

function footer(d) {
  const f = d.site.footer || {}
  const links = (f.links || []).map((l) => `<li><a href="${esc(d.gameUrl + (l.path || '/'))}">${esc(l.label)}</a></li>`).join('')
  return `<footer class="foot"><div class="wrap foot-row">
    <div>
      <p class="wordmark">${esc(f.wordmark)}</p>
      <p>${esc(f.text)}</p>
      <p>${esc(f.copyright)}</p>
    </div>
    <nav aria-label="The game"><ul>${links}</ul></nav>
  </div></footer>`
}

export async function body(d) {
  return `<a class="skip" href="#main">Skip to the page</a>
  ${header(d)}
  <main id="main">
    ${hero(d)}
    ${day(d)}
    ${housesSection(d)}
    ${organt(d)}
    ${await phone(d)}
    ${next(d)}
    ${brands(d)}
  </main>
  ${footer(d)}`
}

export function sitemap(d) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(d.siteUrl)}/</loc><changefreq>weekly</changefreq></url>
</urlset>
`
}

export function robots(d) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${d.siteUrl}/sitemap.xml\n`
}

/** Warnings the build prints (and scripts/check.mjs fails on): missing copy, weak contrast. */
export function problems(d) {
  const out = []
  for (const h of d.houses) {
    const t = textOn(h.main)
    if (t.ratio < 4.5) out.push(`${h.name}: pennant text contrast ${t.ratio.toFixed(2)} is under 4.5:1`)
    if (!h.vibe) out.push(`${h.name}: no vibe in houses.json`)
    if (!h.blurb) out.push(`${h.name}: no blurb in houses.json`)
  }
  for (const p of d.phases) if (!d.site.day?.slots?.[p.id]) out.push(`day slot ${p.id}: no words in website.json day.slots`)
  if (!d.siteUrl.startsWith('https://')) out.push('siteUrl must start with https://')
  if (!d.gameUrl.startsWith('https://')) out.push('gameUrl must start with https://')
  return out
}

export default function softLifePage() {
  let built = null
  return {
    name: 'soft-life-page',
    configureServer(server) {
      for (const f of DATA_FILES) server.watcher.add(f)
      server.watcher.on('change', (f) => {
        if (DATA_FILES.some((p) => p.toLowerCase() === f.toLowerCase())) server.ws.send({ type: 'full-reload' })
      })
    },
    async transformIndexHtml(html) {
      const d = load()
      built = d
      for (const p of problems(d)) console.warn(`[site] ${p}`)
      return html.replace('<!--head-->', head(d)).replace('<!--body-->', await body(d))
    },
    generateBundle() {
      const d = built || load()
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(d) })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots(d) })
      this.emitFile({ type: 'asset', fileName: 'share.jpg', source: readFileSync(SHARE_IMAGE) })
    },
  }
}
