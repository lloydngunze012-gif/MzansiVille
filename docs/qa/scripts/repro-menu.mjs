import { chromium } from '@playwright/test'
const b = await chromium.launch({ channel: 'msedge' })
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await p.goto('http://127.0.0.1:5199/'); await p.waitForTimeout(1200)
await p.click('[data-act=start]'); await p.check('#agree'); await p.click('[data-act=agree]')
await p.fill('#name', 'Rep'); await p.selectOption('#residence', { index: 1 }); await p.selectOption('#course', { index: 1 })
await p.click('[data-act=begin]'); await p.waitForTimeout(2500)
for (let k = 0; k < 6 && await p.locator('button[data-act=dismiss]').count(); k++) { await p.locator('button[data-act=dismiss]').first().click({ force: true }); await p.waitForTimeout(400) }
const st = () => p.evaluate(() => ({ scr: [...document.querySelectorAll('[data-screen]')].map(e => e.dataset.screen), menus: [...document.querySelectorAll('.g-menu')].map(m => { const r = m.getBoundingClientRect(); return getComputedStyle(m).opacity + '@' + Math.round(r.width) }), top: document.elementFromPoint(160, 200)?.closest('[data-act],[data-screen]')?.outerHTML.slice(0, 90) }))
await p.click('[data-act=gear]'); await p.waitForTimeout(500); console.log('menu open', JSON.stringify(await st()))
await p.locator('.g-menu [data-act=nav]').first().click(); 
for (const t of [300, 1500, 4000]) { await p.waitForTimeout(t); console.log('after nav +' + t, JSON.stringify(await st())) }
await p.screenshot({ path: 'shots/repro-menu-after-nav.png' })
await b.close()
