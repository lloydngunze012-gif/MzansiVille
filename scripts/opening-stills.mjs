// The opening page's pictures (OPENING PAGE V2.2, owner 12 Nov): ONE background for every student, from the owner's
// own picture (public/opening/bg-source.png: the campus courtyard, lawn in front, the sea behind), and each
// quick-start student photographed alone, on a transparent background, lit from the upper left like the picture,
// with a soft contact shadow under the feet. The page puts the student on the lawn (src/ui/quick.css).
// Run with the dev server up (npm run dev), then:  node scripts/opening-stills.mjs
// Writes into public/opening/:
//   bg.webp           the background: cropped to the part a phone shows, 828 px wide (a 414 px screen at 2x; the
//                     source is 941 px wide and is never scaled up), blurred a little and a touch less saturated,
//                     so the low-poly students sit in it rather than look pasted on
//   <id>.webp         the student, head to feet, transparent, 440 x 840 (the page shows it at half that: 2x),
//                     rendered at twice that again and scaled down for clean edges; up to about 50 KB
//   <id>-face.webp    the round portrait: the head and shoulders over a soft piece of the same background
//   logo.webp         from the owner's logo-transparent.png (if it is in the repo root)
// A one-off asset job like scripts/app-icons.mjs: not a test. The passes come from window.mzansiPortrait
// (src/world/scene.js): the student alone over black and over white; the difference is the outline.
// Env for tuning: ONLY=<id>, RAW=<folder> (also keeps PNGs to look at), BONES='{"Name":[x,y,z]}', DIST, CAMY, LOOKY.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import fs from 'node:fs'
import DATA from '../data/campusville/quickstart.json' with { type: 'json' }

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = 'public/opening'
const W = 440, H = 840 // the student's picture (the page shows it 220 x 420 CSS px at most: 2x)
const SS = 2 // rendered this many times bigger, then scaled down
const ONLY = process.env.ONLY
const RAW = process.env.RAW
fs.mkdirSync(OUT, { recursive: true })
if (RAW) fs.mkdirSync(RAW, { recursive: true })

// ---------- the background ----------
// The source is 941 x 1672. A phone shows it from the top of the sky down to the middle of the lawn, where the
// student stands; the flowers at the very bottom go under the page's panel. Bottom row kept: BG_BOTTOM.
const SRC = `${OUT}/bg-source.png`
const BG_W = 828
const BG_BOTTOM = 1500
const meta = await sharp(SRC).metadata()
if (meta.width < BG_W) throw new Error(`bg-source.png is ${meta.width} px wide: it would have to be scaled up`)
const bgBase = sharp(SRC).extract({ left: 0, top: 0, width: meta.width, height: Math.min(meta.height, BG_BOTTOM) }).resize({ width: BG_W, kernel: 'lanczos3' })
// (a slight blur, about 2.5 px on a phone at 2x, and the colours pulled back a touch)
const bgImg = bgBase.clone().blur(2.4).modulate({ saturation: 0.88, brightness: 1.0 })
const bgBuf = await bgImg.clone().webp({ quality: 80, effort: 6, smartSubsample: true }).toBuffer()
fs.writeFileSync(`${OUT}/bg.webp`, bgBuf)
const bgMeta = await sharp(bgBuf).metadata()
console.log('bg', `${bgMeta.width}x${bgMeta.height}`, `${(bgBuf.length / 1024).toFixed(1)} kB`)
if (RAW) await bgImg.clone().png().toFile(`${RAW}/bg.png`)
// (behind the round portraits: a soft piece of the same picture, sky over green)
const faceBack = await sharp(bgBuf).extract({ left: Math.round(BG_W * 0.3), top: Math.round(bgMeta.height * 0.42), width: Math.round(BG_W * 0.4), height: Math.round(BG_W * 0.4) }).blur(14).modulate({ saturation: 0.85 }).resize(128, 128).removeAlpha().raw().toBuffer()

// ---------- the students ----------
const SHOT = {
  w: W * SS, h: H * SS, fov: 26, time: 2.4, hide: ['far-city'],
  // (the place pass is not used any more; it still needs a sky to draw)
  sky: [[0, '#3f8fdc'], [1, '#e6f1f8']], haze: '#dcecf5', fog: [90, 1100],
  sun: ['#fff4e0', 1.7], hemi: ['#ffffff', '#b9d48f', 1.2],
}
// A relaxed stance on top of the idle: the weight on one leg (the other knee eased), the hips and shoulders
// tilted against each other, the body turned a little, one forearm bent, the head towards the camera.
const EXTRA = process.env.BONES ? JSON.parse(process.env.BONES) : {}
const OWN = { 'q-naledi': { UpperArmL: [0, 0, -0.04], UpperArmR: [0, 0, -0.04] } } // (her braids hang over the shoulders)
const stance = (lean) => {
  const free = lean > 0 ? 'R' : 'L' // (the leg that is not carrying the weight)
  const bent = lean > 0 ? 'L' : 'R' // (the arm that is bent)
  return {
    Hips: [0, 0, 0.07 * lean], Abdomen: [0, 0, -0.05 * lean], Torso: [0, 0, -0.05 * lean], Chest: [0.02, 0.07 * lean, -0.04 * lean],
    Neck: [0, -0.1 * lean, 0], Head: [-0.05, -0.16 * lean, 0.03 * lean],
    UpperArmL: [0, 0, -0.3], UpperArmR: [0, 0, -0.3], LowerArmL: [-0.12, 0, 0], LowerArmR: [-0.12, 0, 0],
    [`UpperArm${bent}`]: [0, 0, -0.26], [`LowerArm${bent}`]: [-0.3, 0, 0],
    // (the women's model stands narrow: without the last numbers one foot hides the other in a three-quarter view)
    [`UpperLeg${free}`]: [-0.11, 0, lean > 0 ? 0.09 : 0.03], [`LowerLeg${free}`]: [0.24, 0, 0], [`Foot${free}`]: [-0.1, 0, 0],
    ...(lean > 0 ? { UpperLegL: [0, 0, -0.06] } : {}),
    ...EXTRA,
  }
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('page error:', String(e)))
await page.goto(`${BASE}/?enrol=quick&morning=0#/new`)
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload()
await page.locator('#name').fill('Photo')
await page.locator('[data-act="qs-play"]').click()
await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
  Object.assign(s.run, { day: 2, morningDone: true, resMorningDone: true, queue: [], phase: 'leisure', minutes: 11 * 60, lectureResolved: true, lectureRoute: false, at: 'gate' })
  delete s.run.dropOff
  localStorage.setItem('mzansiville.v1', JSON.stringify(s))
})
await page.goto(`${BASE}/?morning=0&hour=11#/play`)
await page.reload()
await page.locator('#world[data-ready="1"]').waitFor({ timeout: 90000 })
await page.waitForTimeout(3000)
const gate = await page.evaluate(() => window.mzansiPlaceOf('gate'))

// The student stands on the lawn east of the gate; the camera is in front, at chest height, far enough back to
// see them from head to feet with a little room all round.
const at = [gate.x + 22, gate.z]
const dir = 0 // (the camera looks along +z)
const dist = Number(process.env.DIST || 4.7)
const cam = [at[0] - Math.sin(dir) * dist, Number(process.env.CAMY || 1.15), at[1] - Math.cos(dir) * dist]
const look = [at[0], Number(process.env.LOOKY || 0.9), at[1]]
const png = (url) => Buffer.from(url.split(',')[1], 'base64')
const under = async (img, limit, opts = {}) => {
  for (let q = 90; q >= 40; q -= 4) { const buf = await img.clone().webp({ quality: q, alphaQuality: 90, effort: 6, ...opts }).toBuffer(); if (buf.length <= limit) return [buf, q] }
  throw new Error('cannot fit the budget')
}

for (const [i, s] of DATA.students.entries()) {
  if (ONLY && s.id !== ONLY) continue
  const lean = i % 2 ? -1 : 1
  // facing the camera, turned a little to one side (a three-quarter view), alternating sides
  const rot = dir + Math.PI + 0.34 * lean
  // the light: the key from the upper left like the sun in the picture, a soft fill from the right, a rim behind
  const right_ = [Math.cos(dir), -Math.sin(dir)]
  const rel = (back_, right, y, col, power) => [col, power, -Math.sin(dir) * back_ + right_[0] * right, y, -Math.cos(dir) * back_ + right_[1] * right]
  const lights = { key: rel(3.2, -4.2, 5.2, '#fff1d6', 2.5), rim: rel(-3.5, 3.5, 3.2, '#ffffff', 1.3), fill: rel(4, 4.5, 1.2, '#dbeaff', 0.75) }
  const r = await page.evaluate(([look_, o]) => window.mzansiPortrait(look_, o), [s.avatar, { ...SHOT, ...lights, at, rot, cam, look, bones: { ...stance(lean), ...(OWN[s.id] || {}) } }])
  // the outline: the student over black and over white; where the two agree it is the student, where they differ, air
  const big = { width: W * SS, height: H * SS, channels: 3 }
  const raw = (b) => sharp(b).removeAlpha().raw().toBuffer()
  const [black, white] = await Promise.all([png(r.black), png(r.white)].map(raw))
  const n = big.width * big.height
  const rgba = Buffer.alloc(n * 4)
  for (let p = 0; p < n; p++) {
    const k = p * 3
    const a = Math.max(0, Math.min(1, 1 - ((white[k] - black[k]) + (white[k + 1] - black[k + 1]) + (white[k + 2] - black[k + 2])) / 765))
    // (the black pass is "colour times alpha": divide it back out)
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = a > 0.003 ? Math.max(0, Math.min(255, Math.round(black[k + c] / a))) : 0
    rgba[p * 4 + 3] = Math.round(a * 255)
  }
  const small = await sharp(rgba, { raw: { ...big, channels: 4 } }).resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer()
  // where the student is in the picture
  let top = H, bottom = 0, left = W, right = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (small[(y * W + x) * 4 + 3] > 40) { if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x }
  // the feet: the lowest tenth of the body
  let fx0 = W, fx1 = 0
  for (let y = Math.round(bottom - (bottom - top) * 0.06); y <= bottom; y++) for (let x = 0; x < W; x++) if (small[(y * W + x) * 4 + 3] > 40) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x }
  // a soft contact shadow on the lawn, under the feet and falling a little to the right (the sun is upper left)
  const out = Buffer.from(small)
  const cx = (fx0 + fx1) / 2 + (fx1 - fx0) * 0.16
  const cy = bottom - 5
  const rx = (fx1 - fx0) * 0.86 + 26
  const ry = 15
  for (let y = Math.max(0, Math.round(cy - ry * 2.4)); y < Math.min(H, Math.round(cy + ry * 2.4)); y++) {
    for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      if (d > 5) continue
      const sh = 0.46 * Math.exp(-d * 1.15)
      const p = (y * W + x) * 4
      const a = out[p + 3] / 255
      // (under the student: the shadow shows only where the student is not)
      const oa = a + sh * (1 - a)
      if (oa <= 0) continue
      for (let c = 0; c < 3; c++) out[p + c] = Math.round((out[p + c] * a + [20, 34, 12][c] * sh * (1 - a)) / oa)
      out[p + 3] = Math.round(oa * 255)
    }
  }
  const img = sharp(out, { raw: { width: W, height: H, channels: 4 } })
  if (RAW) {
    await img.clone().png().toFile(`${RAW}/${s.id}.png`)
    // (to look at: the student where the page puts them, feet on the lawn)
    const bh = bgMeta.height
    await sharp(bgBuf).composite([{ input: await img.clone().png().toBuffer(), left: Math.round((BG_W - W) / 2), top: Math.round(bh - H - 70) }]).png().toFile(`${RAW}/${s.id}-on-bg.png`)
  }
  const [buf, q] = await under(img, 50 * 1024)
  fs.writeFileSync(`${OUT}/${s.id}.webp`, buf)
  // the round portrait: head and shoulders, over a soft piece of the background
  const hx = Math.round(r.head[0] * W), hy = Math.round(r.head[1] * H)
  const side = 150
  const fl = Math.max(0, Math.min(W - side, hx - side / 2)), ft = Math.max(0, Math.min(H - side, hy - Math.round(side * 0.42)))
  const head = await img.clone().extract({ left: fl, top: ft, width: side, height: side }).resize(128, 128).png().toBuffer()
  const [face] = await under(sharp(faceBack, { raw: { width: 128, height: 128, channels: 3 } }).composite([{ input: head }]), 6 * 1024)
  fs.writeFileSync(`${OUT}/${s.id}-face.webp`, face)
  console.log(s.id, `${(buf.length / 1024).toFixed(1)} kB q${q}`, `face ${(face.length / 1024).toFixed(1)} kB`, `body rows ${top}-${bottom} of ${H}, cols ${left}-${right} of ${W}`)
}
await browser.close()

// The logo: the SL monogram (glossy purple and lilac, the gold ring and crown), from the owner's transparent file.
if (!ONLY && fs.existsSync('logo-transparent.png')) {
  const logo = await sharp('logo-transparent.png').trim().resize({ height: 220 }).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toBuffer()
  fs.writeFileSync(`${OUT}/logo.webp`, logo)
  console.log('logo', `${(logo.length / 1024).toFixed(1)} kB`)
}
