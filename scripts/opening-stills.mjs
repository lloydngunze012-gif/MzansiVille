// The opening page's stills (owner, 11 Nov, OPENING PAGE V2): one picture per quick-start student,
// photographed INSIDE the real campus (not pasted on a backdrop): on the lawn by the Main Gate at
// golden hour, the gate and SunnyBay softly out of focus behind, a warm key light and a rim light.
// Run with the dev server up (npm run dev), then:  node scripts/opening-stills.mjs
// Writes public/opening/<id>.webp (720x900, under 60 KB), public/opening/<id>-face.webp (the round
// portrait, cut from the same picture) and public/opening/logo.webp (from logo-transparent.png).
// A one-off asset job like scripts/app-icons.mjs: not a test. The three passes come from
// window.mzansiPortrait (src/world/scene.js); this script blurs the place and puts the student on it.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import fs from 'node:fs'
import DATA from '../data/campusville/quickstart.json' with { type: 'json' }

const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = 'public/opening'
const W = 720, H = 900
const ONLY = process.env.ONLY // (one student's id, while tuning)
const RAW = process.env.RAW // (a folder: also keep the PNG there, to look at)
fs.mkdirSync(OUT, { recursive: true })

// The shot. The student stands on the lawn inside the gate; the camera is at chest height, a little
// to one side (a three-quarter view), looking past them at the gate with the town and the sea beyond.
const SHOT = {
  w: W, h: H, fov: 30, time: 2.4,
  sky: [[0, '#2b1650'], [0.1, '#3d2140'], [0.24, '#93582f'], [0.37, '#eaa64f'], [0.5, '#f9d98f'], [1, '#f9d98f']],
  haze: '#eebb7c', fog: [50, 700],
  sun: ['#ffc680', 1.9], hemi: ['#ffe6c4', '#7f7f4c', 1.3], sea: ['#3a7fa3', 0.035],
  
}
// A relaxed stance on top of the idle: the weight on one hip, shoulders dropped, arms in to the
// sides, the head turned a little to the camera. Women and men lean opposite ways, for variety.
const EXTRA = process.env.BONES ? JSON.parse(process.env.BONES) : {}
const stance = (lean) => ({ UpperArmL: [0, 0, -0.26], UpperArmR: [0, 0, -0.26], ...EXTRA,
  Hips: [0, 0, 0.05 * lean], Abdomen: [0, 0, -0.04 * lean], Torso: [0, 0, -0.04 * lean], Chest: [0.02, 0.06 * lean, -0.03 * lean],
  Neck: [0, -0.1 * lean, 0], Head: [-0.06, -0.14 * lean, 0.02 * lean],
})

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
  Object.assign(s.run, { day: 2, morningDone: true, resMorningDone: true, queue: [], phase: 'leisure', minutes: 17 * 60 + 30, lectureResolved: true, lectureRoute: false, at: 'gate' })
  delete s.run.dropOff
  localStorage.setItem('mzansiville.v1', JSON.stringify(s))
})
await page.goto(`${BASE}/?morning=0&hour=17.5#/play`)
await page.reload()
await page.locator('#world[data-ready="1"]').waitFor({ timeout: 90000 })
await page.waitForTimeout(1500)
const gate = await page.evaluate(() => window.mzansiPlaceOf('gate'))
console.log('gate', JSON.stringify(gate))

// Where they stand and where the camera is, from the gate (x east, z south).
const gx = gate.x, gz = gate.z
const env = (k, d) => (process.env[k] ? process.env[k].split(',').map(Number) : d)
const at = env('AT', [gx + 2.4, gz - 1.6])
const aim = env('AIM', [gx + 60, gz + 3]) // (past the gate, towards the town and the sea)
const dir = Math.atan2(aim[0] - at[0], aim[1] - at[1])
const dist = Number(process.env.DIST || 3.7)
const cam = env('CAM', [at[0] - Math.sin(dir) * dist, 1.32, at[1] - Math.cos(dir) * dist])
const look = env('LOOK', [at[0] + Math.sin(dir) * 2, 1.14, at[1] + Math.cos(dir) * 2])

const under = async (img, limit, opts = {}) => {
  for (let q = 82; q >= 30; q -= 4) { const buf = await img.clone().webp({ quality: q, effort: 6, ...opts }).toBuffer(); if (buf.length <= limit) return [buf, q] }
  throw new Error('cannot fit the budget')
}
const png = (url) => Buffer.from(url.split(',')[1], 'base64')

for (const [i, s] of DATA.students.entries()) {
  if (ONLY && s.id !== ONLY) continue
  const lean = i % 2 ? -1 : 1
  // facing the camera, turned a quarter away (three-quarter view), alternating sides
  const rot = dir + Math.PI + 0.5 * lean
  // lights, from where the camera stands: the key low over its left shoulder, the rim behind the student
  const right_ = [Math.cos(dir), -Math.sin(dir)] // (the camera's right)
  const rel = (back_, right, y, col, power) => [col, power, -Math.sin(dir) * back_ + right_[0] * right, y, -Math.cos(dir) * back_ + right_[1] * right]
  const lights = { key: rel(5, -3 * lean, 2.4, '#ffd7a1', 2.6), rim: rel(-3.5, 4 * lean, 2.2, '#ffb14a', 4.5), fill: rel(4, 4 * lean, 1.2, '#fff1dc', 0.5) }
  const r = await page.evaluate(([look_, o]) => window.mzansiPortrait(look_, o), [s.avatar, { ...SHOT, ...lights, at, rot, cam, look, bones: stance(lean), shadow: dir }])
  if (RAW) { fs.mkdirSync(RAW, { recursive: true }); fs.writeFileSync(`${RAW}/${s.id}-back.png`, png(r.back)) }
  const raw = (b) => sharp(b).removeAlpha().raw().toBuffer()
  const [back, black, white] = await Promise.all([png(r.back), png(r.black), png(r.white)].map(raw))
  // depth of field: the place is out of focus, more so the further up the frame (the further away)
  const soft = await sharp(back, { raw: { width: W, height: H, channels: 3 } }).blur(9).raw().toBuffer()
  const softer = await sharp(back, { raw: { width: W, height: H, channels: 3 } }).blur(4).raw().toBuffer()
  const out = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    const near = Math.min(1, Math.max(0, (y / H - 0.62) / 0.3)) // 0 far (top), 1 near (the lawn at the bottom)
    // a gentle vignette, and the bottom settling towards plum so the portraits and panel sit on it
    const dusk = Math.min(1, Math.max(0, (y / H - 0.72) / 0.28)) ** 1.5 * 0.55
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3
      const a = 1 - ((white[p] - black[p]) + (white[p + 1] - black[p + 1]) + (white[p + 2] - black[p + 2])) / 765
      const vx = (x / W - 0.5) * 2
      const vig = 1 - 0.22 * vx * vx
      for (let k = 0; k < 3; k++) {
        let b = (soft[p + k] * (1 - near) + softer[p + k] * near) * vig
        b = b * (1 - dusk) + [26, 13, 51][k] * dusk
        // (the student's pass is already multiplied by its own outline: black is "colour times alpha")
        out[p + k] = Math.max(0, Math.min(255, Math.round(b * (1 - a) + black[p + k])))
      }
    }
  }
  const img = sharp(out, { raw: { width: W, height: H, channels: 3 } })
  if (RAW) { fs.mkdirSync(RAW, { recursive: true }); await img.clone().png().toFile(`${RAW}/${s.id}.png`) }
  const [buf, q] = await under(img, 60 * 1024)
  fs.writeFileSync(`${OUT}/${s.id}.webp`, buf)
  // the round portrait: the head and shoulders from the same picture
  const hx = Math.round(r.head[0] * W), hy = Math.round(r.head[1] * H)
  const side = 230
  const left = Math.max(0, Math.min(W - side, hx - side / 2)), top = Math.max(0, Math.min(H - side, hy - Math.round(side * 0.5)))
  const [face] = await under(img.clone().extract({ left, top, width: side, height: side }).resize(128, 128), 6 * 1024)
  fs.writeFileSync(`${OUT}/${s.id}-face.webp`, face)
  console.log(s.id, `${(buf.length / 1024).toFixed(1)} kB q${q}`, `face ${(face.length / 1024).toFixed(1)} kB`, 'head', hx, hy)
}
await browser.close()

// The logo: the SL monogram (glossy purple and lilac, the gold ring and crown), from the owner's
// transparent file, trimmed and small enough to ship with the first paint.
if (!ONLY && fs.existsSync('logo-transparent.png')) {
  const logo = await sharp('logo-transparent.png').trim().resize({ height: 220 }).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toBuffer()
  fs.writeFileSync(`${OUT}/logo.webp`, logo)
  console.log('logo', `${(logo.length / 1024).toFixed(1)} kB`)
}
