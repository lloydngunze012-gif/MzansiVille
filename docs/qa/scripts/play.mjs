import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
const [,, W, H, PORT = '5199', TAG = '', RES = 'O Block', COURSE = 'Law', DAYS = '3'] = process.argv
const tag = `${W}${TAG}`; const dir = `shots/${tag}`; mkdirSync(dir, { recursive: true })
const b = await chromium.launch({ channel: 'msedge' })
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, hasTouch: true })
const net = []
if (TAG.includes('offhost')) await ctx.route(/supabase\.co/, r => { net.push('ABORT ' + r.request().url().slice(0, 90)); return r.abort('internetdisconnected') })
else if (TAG.includes('off')) await ctx.route(/supabase/, r => { net.push('ABORT ' + r.request().url().slice(0, 90)); return r.abort('internetdisconnected') })
const p = await ctx.newPage()
const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.type().toUpperCase() + ' ' + m.text().slice(0, 300)))
p.on('requestfailed', r => net.push('FAILED ' + r.url().slice(0, 90)))
const log = []; let n = 0
const info = () => p.evaluate((W) => {
  const scr = document.querySelector('[data-screen]')?.dataset.screen
  const btns = [...document.querySelectorAll('[data-act]')].filter(b => b.offsetParent || b.getClientRects().length).map(b => ({ act: b.dataset.act, go: b.dataset.go, id: b.dataset.id, cls: b.className, t: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 50), dis: b.disabled }))
  const over = []
  for (const el of document.querySelectorAll('main *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !el.getClientRects().length) continue
    const cs = getComputedStyle(el)
    if (r.right > W + 1 && cs.position !== 'fixed' && !el.closest('canvas')) over.push('OFFRIGHT ' + el.tagName + '.' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '" right=' + Math.round(r.right))
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflow + cs.overflowX) ) over.push('CLIPPED ' + el.tagName + '.' + el.className + ' "' + el.textContent.trim().slice(0, 40) + '"')
  }
  const blank = !document.querySelector('#app')?.innerText.trim()
  return { scr, btns, over: [...new Set(over)].slice(0, 15), text: (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 400), blank }
}, +W)
const snap = async (label) => { const i = await info(); n++; const f = `${dir}/${String(n).padStart(3, '0')}-${i.scr}-${label}.png`.replace(/[^\w\/.\-]/g, '_'); await p.screenshot({ path: f }); log.push({ n, label, f, ...i, errs: errs.length }); return i }
const click = async (sel) => { try { await p.locator(sel).first().click({ timeout: 4000 }) } catch (e) { log.push({ clickfail: sel, e: e.message.split('\n').slice(0,8).join(' | ').slice(0,400) }); await p.locator(sel).first().click({ force: true, timeout: 2000 }).catch(() => {}) } await p.waitForTimeout(500) }
await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForTimeout(1500)
await snap('cover')
await click('[data-act=start]'); await snap('rules')
await click('[data-act=agree]'); const r0 = await snap('agree-unchecked')
if (r0.scr === 'rules') { await p.check('#agree'); await click('[data-act=agree]') }
await snap('create')
await click('[data-act=begin]').catch(() => {}); await snap('begin-empty')
await p.fill('#name', 'Thandeka Mkhize-Ndlovu Long')
await p.selectOption('#residence', RES).catch(e => log.push({ err: 'res ' + e.message.slice(0, 100) }))
await p.selectOption('#course', COURSE).catch(e => log.push({ err: 'course ' + e.message.slice(0, 100) }))
const av = p.locator('[data-act=avatar]'); if (await av.count()) { await av.nth(1).click(); await p.waitForTimeout(300) }
await snap('create-filled')
await click('[data-act=begin]'); await p.waitForTimeout(2500); await snap('after-begin')
const tried = new Set(); let lastKey = ''; let days = 0; const NAVONLY = process.env.NAVONLY; let stuck = 0
for (let step = 0; step < (NAVONLY ? 0 : 260); step++) {
  const i = await info()
  const has = (a, f = () => true) => i.btns.find(b => b.act === a && !b.dis && f(b))
  let pick = null, label = ''
  const key = i.scr + i.text.slice(0, 120)
  if (key === lastKey) stuck++; else stuck = 0; lastKey = key
  if (stuck > 4) { log.push({ stuck: i }); await snap('STUCK'); break }
  if (['refill', 'gameover', 'graduated'].includes(i.scr)) { await snap('end'); break }
  if ((pick = has('choice'))) { label = 'choice' ; await p.locator('[data-act=choice]').nth(step % 2 ? 0 : 1).click().catch(() => p.locator('[data-act=choice]').first().click()) }
  else if ((pick = has('snooze'))) { label = 'snooze'; await snap('save-prompt'); await click('[data-act=snooze]') }
  else if ((pick = has('dismiss'))) { label = 'dismiss'; await snap('card'); await click('button[data-act=dismiss]') }
  else if ((pick = has('next'))) { label = 'next-day'; await snap('summary'); days++; if (days >= +DAYS) break; await click('[data-act=next]') }
  else if (i.scr === 'place' && (pick = has('do'))) { label = 'do-' + pick.id; await snap('sheet'); await p.locator(`[data-act=do][data-id="${pick.id}"]`).first().click(); await p.waitForTimeout(600) }
  else if (i.scr === 'place') { await snap('sheet-nothing'); await click('[data-act=close-sheet]'); label = 'close' }
  else {
    const phaseKey = i.text.slice(0, 60)
    const pins = i.btns.filter(b => b.act === 'place-open' && / open/.test(b.cls) && !tried.has(phaseKey + b.id))
    if (pins.length) { const pin = pins[0]; tried.add(phaseKey + pin.id); label = 'open-' + pin.id; await p.locator(`[data-act=place-open][data-id="${pin.id}"]`).first().click({ force: true }); await p.waitForTimeout(500) }
    else if ((pick = has('to-night'))) { label = 'to-night'; await click('[data-act=to-night]') }
    else if ((pick = has('phase'))) { label = 'phase'; await click('[data-act=phase]') }
    else { await snap('NO-ACTION'); log.push({ noaction: i }); break }
  }
  log.push({ step, label, scr: i.scr })
}
await snap('loop-end')
for (let k = 0; k < 3; k++) { if (await p.locator('button[data-act=close-sheet]').count()) await p.locator('button[data-act=close-sheet]').first().click({ force: true }).catch(() => {}); if (await p.locator('button[data-act=dismiss]').count()) await p.locator('button[data-act=dismiss]').first().click().catch(() => {}); await p.waitForTimeout(400) }
for (const go of ['milestones', 'profile', 'board', 'chat', 'share', 'save', 'privacy', 'world']) {
  try {
    if (!(await p.locator(`[data-act=nav][data-go=${go}]`).count())) { const g = p.locator('[data-act=gear]'); if (await g.count()) await g.first().click(); await p.waitForTimeout(400) }
    await p.locator(`[data-act=nav][data-go=${go}]`).first().click({ timeout: 3000 }); await p.waitForTimeout(go === 'world' ? 4000 : 1200)
    await snap('nav-' + go)
    if (go === 'chat') { const c = p.locator('#composer'); if (await c.isEnabled().catch(() => false)) { await c.fill('hello from QA'); await click('[data-act=send]'); await snap('chat-sent') } }
    if (go === 'share') { const s = p.locator('[data-act=share],[data-act=copy]'); if (await s.count()) { await s.first().click().catch(() => {}); await p.waitForTimeout(800); await snap('share-clicked') } }
    if (go === 'save') { const e = p.locator('#email'); if (await e.isEnabled().catch(() => false)) { await e.fill('qa@example.com'); await click('[data-act=magic]'); await snap('magic-sent') } }
    await p.goBack().catch(() => {}); await p.waitForTimeout(600)
  } catch (e) { log.push({ navfail: go, e: e.message.slice(0, 120) }) }
}
await snap('final')
writeFileSync(`${dir}/log.json`, JSON.stringify({ errs, net: [...new Set(net)], log }, null, 1))
console.log('ERRS', errs.length, '\n' + [...new Set(errs)].slice(0, 20).join('\n'))
console.log('NET', [...new Set(net)].slice(0, 10).join('\n'))
console.log(log.filter(l => l.label).map(l => l.label + '@' + (l.scr || '')).join(' > '))
console.log('OVER', [...new Set(log.flatMap(l => l.over || []))].slice(0, 25).join('\n'))
console.log(log.filter(l => l.clickfail || l.stuck || l.noaction || l.navfail || l.err || l.blank).map(l => JSON.stringify(l).slice(0, 600)).join('\n'))
await b.close()



