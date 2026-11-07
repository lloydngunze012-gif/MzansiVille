// Screenshots for Lloyd: Ara in the studio, ours and Ara side by side (one sheet), and the short
// videos of the turn and a drag (ours in the real creator, Ara in the same studio). Not committed.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { finger } from '../basics/touch.js'

const OUT = 'docs/sprints/creator-studio'
const ARA_DIR = process.env.ARA_DIR || path.join(os.homedir(), 'Downloads')
let server
let port = 0
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(ARA_DIR, path.basename(new URL(req.url, 'http://x').pathname))
    const cors = { 'Access-Control-Allow-Origin': '*' }
    if (!/\.glb$/i.test(file) || !fs.existsSync(file)) { res.writeHead(404, cors); res.end(); return }
    res.writeHead(200, { ...cors, 'Content-Type': 'model/gltf-binary', 'Content-Length': fs.statSync(file).size })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  port = server.address().port
})
test.afterAll(async () => { await new Promise((r) => server.close(r)) })
const ARA = { woman: 'Athletic_woman.glb', man: 'Athletic_man.glb' }
const url = (who) => `http://127.0.0.1:${port}/${ARA[who]}`
const OURS = { woman: { gender: 'female', skin: 'amber', hair: 'crop', outfit: 'organt' }, man: { gender: 'male', skin: 'amber', hair: 'crop', outfit: 'organt' } }
const araOpts = (who, extra = {}) => ({ top: '#f0c400', print: true, printDepth: who === 'woman' ? 0.23 : 0.18, ...extra })

async function harness(browser, video = false) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ...(video ? { recordVideo: { dir: `${OUT}/vid`, size: { width: 390, height: 844 } } } : {}) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.goto('/tests/creator/studio.html')
  await page.waitForFunction(() => window.studioReady)
  await page.evaluate(() => window.studioPage.prepare())
  return { ctx, page }
}
const stageShot = async (page, name) => { await page.waitForTimeout(600); await page.locator('#stage').screenshot({ path: `${OUT}/${name}.png` }) }

test('ara in the studio: woman and man, front and three-quarter', async ({ browser }) => {
  test.setTimeout(240000)
  fs.mkdirSync(OUT, { recursive: true })
  const { ctx, page } = await harness(browser)
  for (const who of ['woman', 'man']) {
    await page.evaluate(async ([u, o]) => window.studioPage.show({ kind: 'ara', url: u, opts: o }), [url(who), araOpts(who)])
    for (const [view, a] of [['front', 0], ['threequarter', 0.42]]) {
      await page.evaluate((a) => window.studioPage.setAngle(a), a)
      await stageShot(page, `ara-studio-${who}-${view}`)
    }
  }
  await ctx.close()
})

test('the sheet: ours and Ara side by side, same pose', async ({ browser }) => {
  test.setTimeout(240000)
  const { ctx, page } = await harness(browser)
  const cells = []
  for (const who of ['woman', 'man']) {
    await page.evaluate(async (look) => window.studioPage.show({ kind: 'ours', look, pose: 'stand' }), OURS[who])
    await page.evaluate(() => window.studioPage.setAngle(0))
    await page.waitForTimeout(700)
    cells.push((await page.locator('#stage').screenshot()).toString('base64'))
    await page.evaluate(async ([u, o]) => window.studioPage.show({ kind: 'ara', url: u, opts: o }), [url(who), araOpts(who, { clip: 'Idle_Loop' })])
    await page.evaluate(() => window.studioPage.setAngle(0))
    await page.waitForTimeout(700)
    cells.push((await page.locator('#stage').screenshot()).toString('base64'))
  }
  const sheet = await ctx.newPage()
  await sheet.setViewportSize({ width: 1500, height: 780 })
  await sheet.setContent(`<body style="margin:0;background:#f4ecdc;font:700 22px system-ui"><div style="display:grid;grid-template-columns:repeat(4,362px);gap:16px;padding:16px;justify-content:center">${['Ours: woman', 'Ara: woman', 'Ours: man', 'Ara: man'].map((t, i) => `<figure style="margin:0"><img style="width:362px;display:block;border-radius:22px" src="data:image/png;base64,${cells[i]}"><figcaption style="padding:8px 4px">${t}</figcaption></figure>`).join('')}</div></body>`)
  await sheet.screenshot({ path: `${OUT}/sheet-ours-vs-ara.png`, clip: { x: 0, y: 0, width: 1500, height: 450 } })
  await ctx.close()
})

test('videos: the turn and a drag, ours (the real creator) and Ara (the same studio)', async ({ browser }) => {
  test.setTimeout(240000)
  fs.mkdirSync(`${OUT}/vid`, { recursive: true })
  // ours, in the creator
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, recordVideo: { dir: `${OUT}/vid`, size: { width: 390, height: 844 } } })
  let page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  let f = await finger(page)
  await page.waitForTimeout(6000)
  await f.drag([[110, 260], [300, 260]], 600)
  await page.waitForTimeout(5000)
  const o = page.locator('[data-part="outfit"][data-id="organt"]')
  await o.scrollIntoViewIfNeeded(); await o.tap()
  await page.waitForTimeout(4500)
  let v = page.video()
  await ctx.close()
  await v.saveAs(`${OUT}/video-ours-turn-and-drag.webm`)
  // Ara, in the same studio
  const h = await harness(browser, true)
  await h.page.evaluate(async ([u, o]) => window.studioPage.show({ kind: 'ara', url: u, opts: o }), [url('woman'), araOpts('woman')])
  f = await finger(h.page)
  await h.page.waitForTimeout(6000)
  await f.drag([[110, 160], [300, 160]], 600)
  await h.page.waitForTimeout(6000)
  v = h.page.video()
  await h.ctx.close()
  await v.saveAs(`${OUT}/video-ara-turn-and-drag.webm`)
  fs.rmSync(`${OUT}/vid`, { recursive: true, force: true })
})
