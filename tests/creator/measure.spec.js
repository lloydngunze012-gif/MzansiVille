// Numbers for the creator comparison (ours vs Ara). Run on the real GPU with the frame cap off:
//   npx playwright test tests/creator/measure.spec.js --config playwright.spike.config.js --workers=1
// M1: the real creator, built (dist/, served with gzip like Vercel), Slow 4G, empty cache: bytes and
//     time until the first student is on the stage.
// M2: like for like: the student's own files only (our three .glb files, or Ara's one .glb), Slow 4G,
//     empty cache, from the call to the first drawn frame (the game's libraries and the clip library
//     are already in the page).
// M3: GPU texture memory, geometry and triangles of one student, and frame times (typical and worst
//     10%) while dancing and turning, on the studio's own stage.
// Slow 4G here = the Lighthouse preset: 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip.
import { test } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const OUT = 'docs/sprints/creator-studio'
const ARA_DIR = process.env.ARA_DIR || path.join(os.homedir(), 'Downloads')
const SLOW4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }
const results = {}
let araServer
let distServer
let araPort = 0
let distPort = 0
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' }
const TEXT = ['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.wasm']

test.beforeAll(async () => {
  araServer = http.createServer((req, res) => {
    const file = path.join(ARA_DIR, path.basename(new URL(req.url, 'http://x').pathname))
    const cors = { 'Access-Control-Allow-Origin': '*' }
    if (!/\.glb$/i.test(file) || !fs.existsSync(file)) { res.writeHead(404, cors); res.end(); return }
    res.writeHead(200, { ...cors, 'Content-Type': 'model/gltf-binary', 'Content-Length': fs.statSync(file).size })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => araServer.listen(0, '127.0.0.1', r))
  araPort = araServer.address().port
  // dist/ with gzip for text (as the host would), nothing for models and pictures
  distServer = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join('dist', p === '/' ? 'index.html' : p)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join('dist', 'index.html')
    const ext = path.extname(file)
    const body = fs.readFileSync(file)
    const text = TEXT.includes(ext)
    const out = text ? zlib.gzipSync(body) : body
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': out.length, ...(text ? { 'Content-Encoding': 'gzip' } : {}) })
    res.end(out)
  })
  await new Promise((r) => distServer.listen(0, '127.0.0.1', r))
  distPort = distServer.address().port
})
test.afterAll(async () => {
  await new Promise((r) => araServer.close(r))
  await new Promise((r) => distServer.close(r))
  fs.writeFileSync(`${OUT}/measure.json`, JSON.stringify(results, null, 1))
  console.log(JSON.stringify(results, null, 1))
})

test('M1: the real creator on Slow 4G, empty cache: bytes and time to the first student', async ({ browser }) => {
  test.setTimeout(300000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  const base = `http://127.0.0.1:${distPort}/`
  await page.goto(base)
  await page.evaluate(() => localStorage.clear())
  const urls = new Map()
  let total = 0
  let models = 0
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url))
  cdp.on('Network.loadingFinished', (e) => { const u = urls.get(e.requestId) || ''; total += e.encodedDataLength; if (/\/models\/people2\//.test(u)) models += e.encodedDataLength })
  await cdp.send('Network.emulateNetworkConditions', SLOW4G)
  // (a fresh load of the creator: new page, nothing kept)
  const t0 = Date.now()
  await page.goto(`${base}?morning=0#/new`, { waitUntil: 'commit' })
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 280000 })
  const ms = Date.now() - t0
  results.M1_ours_real_creator = { slow4g: true, secondsToFirstStudent: +(ms / 1000).toFixed(1), totalKB: Math.round(total / 1024), studentModelsKB: Math.round(models / 1024) }
  await ctx.close()
})

test('M2: the students own files on Slow 4G, empty cache: ours vs Ara', async ({ browser }) => {
  test.setTimeout(400000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await page.goto('/tests/creator/studio.html')
  await page.waitForFunction(() => window.studioReady)
  await page.evaluate(() => window.studioPage.prepare())
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', SLOW4G)
  const urls = new Map()
  let bytes = 0
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url))
  cdp.on('Network.loadingFinished', (e) => { if (/\.glb/.test(urls.get(e.requestId) || '')) bytes += e.encodedDataLength })
  const timed = async (spec) => {
    bytes = 0
    const t = await page.evaluate(async (s) => { const t0 = performance.now(); await window.studioPage.show(s); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0 }, spec)
    return { seconds: +(t / 1000).toFixed(1), modelKB: Math.round(bytes / 1024) }
  }
  results.M2_ours_woman = await timed({ kind: 'ours', look: { gender: 'female', skin: 'amber', hair: 'crop', outfit: 'organt' } })
  results.M2_ours_man = await timed({ kind: 'ours', look: { gender: 'male', skin: 'amber', hair: 'crop', outfit: 'organt' } })
  results.M2_ara_woman = await timed({ kind: 'ara', url: `http://127.0.0.1:${araPort}/Athletic_woman.glb`, opts: { top: '#f0c400', print: true } })
  results.M2_ara_man = await timed({ kind: 'ara', url: `http://127.0.0.1:${araPort}/Athletic_man.glb`, opts: { top: '#f0c400', print: true } })
  await ctx.close()
})

test('M3: GPU memory and frame times on the studio stage (real GPU, frame cap off)', async ({ browser }) => {
  test.setTimeout(400000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/tests/creator/studio.html')
  await page.waitForFunction(() => window.studioReady)
  await page.evaluate(() => window.studioPage.prepare())
  const run = async (name, spec) => {
    await page.evaluate((s) => window.studioPage.show(s), spec)
    await page.waitForTimeout(1500)
    const stats = await page.evaluate(() => window.studioPage.stats())
    const frames = []
    for (let i = 0; i < 3; i++) frames.push(await page.evaluate(() => window.studioPage.measure(6)))
    frames.sort((a, b) => a.medianMs - b.medianMs)
    const mid = frames[1]
    results[`M3_${name}`] = { ...stats, fpsTypical: mid.fpsTypical, fpsWorst10: mid.fpsWorst10, medianMs: mid.medianMs, p90Ms: mid.p90Ms }
  }
  await run('ours_woman', { kind: 'ours', look: { gender: 'female', skin: 'amber', hair: 'crop', outfit: 'organt' } })
  await run('ours_man', { kind: 'ours', look: { gender: 'male', skin: 'amber', hair: 'crop', outfit: 'organt' } })
  await run('ara_woman', { kind: 'ara', url: `http://127.0.0.1:${araPort}/Athletic_woman.glb`, opts: { top: '#f0c400', print: true } })
  await run('ara_man', { kind: 'ara', url: `http://127.0.0.1:${araPort}/Athletic_man.glb`, opts: { top: '#f0c400', print: true } })
  await ctx.close()
})
