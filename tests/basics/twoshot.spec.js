// T1 (Piece 3, part 1): the conversation camera with a person on campus, in Top, Sims
// and Eye. Tap someone on the Quad (a real touch); when the chat opens the camera eases
// into a two-shot in about 0.4 s: about 2.5 m back and 1.7 m up, both heads on screen
// (inside, under the HUD, nothing in front, never inside a body); goodbye eases it back
// to the view you had. Touch only; hooks only READ.
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, fingerWalk, saveVideo, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(600000)

// Every frame from now on (in the page): the camera and the shot it is in.
const record = (page) => page.evaluate(() => {
  window.__shot = []
  const tick = () => {
    if (!window.__shot) return
    window.__shot.push({ t: performance.now(), ...window.mzansiShot() })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const stopRecord = (page) => page.evaluate(() => { const r = window.__shot; window.__shot = null; return r })
// How long an ease took, in frames as drawn: from the frame before the change to the
// first frame seen settled; late: how many frames after the first frame 0.4 s on it
// settled (this recorder sees each frame's state one frame later, so 1 is on time; a
// long frame as a card first appears is waited out, never sped through).
function easeTime(frames, into) {
  const start = frames.findIndex((f) => (into ? f.close && f.eased : !f.close))
  if (start < 0) return null
  const end = frames.findIndex((f, i) => i > start && !f.easing)
  if (end < 0) return null
  const t0 = frames[Math.max(0, start - 1)].t
  const due = frames.findIndex((f) => f.t >= t0 + 400)
  return { ms: Math.round(frames[end].t - t0), late: end - due }
}

test('T1 conversation two-shot in Top, Sims and Eye: eases in, heads in frame, eases back', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const out = {}
  const done = []
  for (const mode of ['eye', 'sims', 'top']) {
    await tapOn(page, f, page.locator(`[data-act="view"][data-mode="${mode}"]`))
    await page.waitForTimeout(900)
    let result = null
    for (let round = 0; round < 12 && !result; round++) {
      // Someone near, on screen where a thumb can reach (not the vendors: they queue).
      const target = await page.evaluate((skip) => {
        const p = window.mzansiPlayerPos()
        const open = (s) => s.x > 30 && s.x < 382 && s.y > 170 && s.y < 760 && !(s.x > 290 && s.y < 260)
        return window.mzansiPeople()
          .filter((o) => !skip.includes(o.id) && !['mama_liz', 'mam_gugu'].includes(o.id))
          .map((o) => ({ ...o, s: window.mzansiPersonOnScreen(o.id), d: Math.hypot(o.x - p.x, o.z - p.z) }))
          .filter((o) => o.s && !o.s.behind && open(o.s) && o.d < 14)
          .sort((a, b) => a.d - b.d)[0] || null
      }, done)
      if (!target) { await fingerWalk(page, f, [140, -140, 0, 0][round % 4], [-160, -160, 160, -200][round % 4], 1600); continue }
      const before = await page.evaluate(() => window.mzansiShot())
      await record(page)
      await f.tap(target.s.x, target.s.y)
      const card = page.locator('.g-talk')
      try { await card.waitFor({ state: 'visible', timeout: 9000 }) } catch { await stopRecord(page); done.push(target.id); continue }
      const who = await card.getAttribute('data-talk')
      await page.waitForTimeout(1200)
      const into = await stopRecord(page)
      const shot = await page.evaluate(() => window.mzansiShot())
      // (in a crowd there can be no free spot for the pair: the camera then keeps a wider shot, the
      // game's fallback. This test is about the two-shot, so it talks to someone with room around them.)
      if (!shot.eased) {
        await tapOn(page, f, page.locator('.g-talk [data-act="talk-bye"]').first())
        await page.waitForTimeout(1500)
        done.push(who)
        continue
      }
      const heads = await page.evaluate((id) => window.mzansiHeads([id]), who)
      await page.screenshot({ path: `${OUT}/T1-${mode}.png` })
      // Goodbye: the camera eases back to the view you had.
      await record(page)
      await tapOn(page, f, page.locator('.g-talk [data-act="talk-bye"]').first())
      await page.waitForTimeout(1200)
      const back = await stopRecord(page)
      const after = await page.evaluate(() => window.mzansiShot())
      await page.screenshot({ path: `${OUT}/T1-${mode}-after.png` })
      done.push(who)
      { const i0 = into.findIndex((x) => x.close && x.eased); if (i0 >= 0) console.log(mode, 'in', JSON.stringify(into.slice(Math.max(0, i0 - 2), i0 + 12).map((x) => [Math.round(x.t - into[i0].t), x.easing ? 1 : 0, x.eases, x.easeT]))) }
      result = {
        who,
        apart: shot.apart,
        back: shot.back,
        height: shot.height,
        eased: shot.eased,
        inMs: easeTime(into, true),
        outMs: easeTime(back, false),
        fps: Math.round(into.length / ((into[into.length - 1].t - into[0].t) / 1000)),
        heads: heads.heads.map((h) => ({ id: h.id, inside: h.inside, underHud: h.underHud, hidden: h.hidden, shown: h.shown, dist: h.dist })),
        modeAfter: after.mode,
        closeAfter: after.close,
        viewBefore: before.mode,
      }
    }
    out[mode] = result
  }
  console.log('T1', JSON.stringify(out, null, 1))
  for (const mode of ['eye', 'sims', 'top']) {
    const r = out[mode]
    expect(r, `${mode}: a conversation happened`).toBeTruthy()
    expect(r.eased, `${mode}: the two-shot (not the old high shot)`).toBe(true)
    expect(r.back, `${mode}: about 2.5 m back`).toBeGreaterThan(1.8)
    expect(r.back, `${mode}: about 2.5 m back`).toBeLessThan(5.5)
    expect(Math.abs(r.height - 1.7), `${mode}: 1.7 m up`).toBeLessThan(0.2)
    expect(r.heads.length, `${mode}: both heads measured`).toBe(2)
    for (const h of r.heads) {
      expect(h.inside, `${mode}: ${h.id}'s head on screen`).toBe(true)
      expect(h.underHud, `${mode}: ${h.id}'s head not under the HUD`).toBe(false)
      expect(h.hidden, `${mode}: nothing in front of ${h.id}'s head`).toBe(null)
      expect(h.shown, `${mode}: ${h.id}'s head drawn`).toBe(true)
      expect(h.dist, `${mode}: the camera is not inside ${h.id}`).toBeGreaterThan(0.6)
    }
    // 0.4 s: not a cut (over 0.3 s), and settled on the first frame drawn after 0.4 s
    for (const [what, e] of [['in', r.inMs], ['back out', r.outMs]]) {
      expect(e.ms, `${mode}: eases ${what} over about 0.4 s, not a cut`).toBeGreaterThan(300)
      expect(e.late, `${mode}: eases ${what} in 0.4 s (settled on time)`).toBeLessThanOrEqual(1)
    }
    expect(r.modeAfter, `${mode}: back to the same view`).toBe(mode)
    expect(r.closeAfter, `${mode}: back to the follow view`).toBe(false)
  }
  await saveVideo(page, 'T1-twoshot')
})
