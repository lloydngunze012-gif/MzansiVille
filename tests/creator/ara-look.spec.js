// Ara in the studio: serves the two exports from ~/Downloads (never copied into the repo) and
// takes the screenshots. ARA_DIR defaults to Downloads. Real GPU.
import { test } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

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

test('ara parts', async ({ page }) => {
  test.setTimeout(180000)
  fs.mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 380, height: 360 })
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.goto('/tests/creator/studio.html')
  await page.waitForFunction(() => window.studioReady)
  for (const [name, file] of [['woman', 'Athletic_woman.glb'], ['man', 'Athletic_man.glb']]) {
    const info = await page.evaluate(async ([url, printDepth]) => window.studioPage.show({ kind: 'ara', url, opts: { top: '#f0c400', print: true, printDepth } }), [`http://127.0.0.1:${port}/${file}`, file.includes('woman') ? 0.23 : 0.18])
    console.log(name, JSON.stringify(info))
    await page.evaluate(() => window.studioPage.setAngle(0))
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/ara-probe-${name}.png` })
  }
})
