// Curvy (owner, 7 Nov: "tapping Curvy does nothing"). C1: on every women's outfit the
// hips and thighs are measurably wider from the front and the behind deeper from the side
// (the old thigh/hip bone scaling gave about +12% at the hips and nothing on a dress).
// C2: the Body row can be reached and tapped above the Next bar at phone sizes (390x844,
// 360x740, and 390x664 with a browser toolbar showing), and the tap reaches the preview.
// C3: men don't get a Curvy button (it would show nothing).
import { test, expect } from '@playwright/test'

const WOMENS = ['hoodie', 'shirt', 'jacket', 'organt', 'dress', 'skirt', 'shweshwe']

test('C1: curvy is clearly visible on every women\'s outfit, front and side', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/?morning=0#/new')
  const out = await page.evaluate(async (outfits) => {
    const m = await import('/src/world/avatar3d.js')
    const measure = async (outfit, body) => {
      const av = m.createAvatar({ gender: 'female', skin: 'amber', hair: 'crop', outfit, body })
      await av.userData.ready
      av.updateMatrixWorld(true)
      const hips = av.getObjectByName('Hips')
      const vec = () => av.position.clone()
      const hipY = hips.getWorldPosition(vec()).y
      const v = vec()
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, hz = hips.getWorldPosition(vec()).z
      av.traverse((n) => {
        if (!n.isSkinnedMesh || !['body', 'legs'].includes(n.userData.part)) return
        const names = n.skeleton.bones.map((b) => b.name)
        const ids = n.geometry.attributes.skinIndex, wts = n.geometry.attributes.skinWeight
        for (let i = 0; i < n.geometry.attributes.position.count; i++) {
          // the trunk and legs only (not an arm that hangs beside the hips)
          let best = 0, bw = -1
          for (let k = 0; k < 4; k++) if (wts.getComponent(i, k) > bw) { bw = wts.getComponent(i, k); best = ids.getComponent(i, k) }
          if (!/^(Hips|Abdomen|UpperLeg|Torso)/.test(names[best])) continue
          n.getVertexPosition(i, v)
          n.localToWorld(v)
          if (Math.abs(v.y - (hipY - 0.1)) > 0.08) continue // the band from the hips to the upper thigh
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z)
        }
      })
      return { width: x1 - x0, behind: hz - z0, front: z1 - hz }
    }
    const res = {}
    for (const o of outfits) res[o] = { regular: await measure(o, 'regular'), curvy: await measure(o, 'curvy') }
    return res
  }, WOMENS)
  for (const o of WOMENS) {
    const { regular: r, curvy: c } = out[o]
    const width = c.width / r.width
    const behind = c.behind / r.behind
    console.log(`${o}: width x${width.toFixed(2)}, behind x${behind.toFixed(2)}`)
    expect(width, `${o} hips from the front`).toBeGreaterThan(1.15)
    expect(behind, `${o} behind from the side`).toBeGreaterThan(1.25)
    expect(width, `${o} not a caricature`).toBeLessThan(1.6)
  }
})

for (const [w, h] of [[390, 844], [360, 740], [390, 664]]) {
  test(`C2: the Body row is reachable above Next, and Curvy reaches the preview (${w}x${h})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto('/?morning=0#/new')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?morning=0#/new')
    await page.locator('.en[data-step="look"]').waitFor()
    const curvy = page.locator('[data-part="body"][data-id="curvy"]')
    // Reach it as a thumb would: scroll the page until it is above the Next bar.
    for (let i = 0; i < 40; i++) {
      const hit = await page.evaluate(() => {
        const b = document.querySelector('[data-part="body"][data-id="curvy"]').getBoundingClientRect()
        const foot = document.querySelector('.en-foot').getBoundingClientRect()
        const stage = document.querySelector('.en-stage').getBoundingClientRect()
        const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        return { ok: b.bottom <= foot.top && b.top >= stage.bottom && !!el?.closest('[data-part="body"][data-id="curvy"]') }
      })
      if (hit.ok) break
      // (small steps: a thumb's scroll; the cards are smaller now, and 240 px steps jumped right over the band)
      await page.evaluate(() => window.scrollBy(0, 40))
      await page.waitForTimeout(80)
    }
    const reach = await page.evaluate(() => {
      const b = document.querySelector('[data-part="body"][data-id="curvy"]').getBoundingClientRect()
      const foot = document.querySelector('.en-foot').getBoundingClientRect()
      const stage = document.querySelector('.en-stage').getBoundingClientRect()
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      return { bottom: b.bottom, footTop: foot.top, top: b.top, stageBottom: stage.bottom, hit: !!el?.closest('[data-part="body"][data-id="curvy"]') }
    })
    expect(reach.hit, 'the Curvy card is not covered by anything').toBe(true)
    expect(reach.bottom, 'above the Next bar').toBeLessThanOrEqual(reach.footTop)
    expect(reach.top, 'below the student').toBeGreaterThanOrEqual(reach.stageBottom)
    // Playwright's own tap runs the actionability checks (visible, stable, receives events).
    await page.locator('.cc-stage').waitFor()
    const before = JSON.parse(await page.locator('.cc-stage').getAttribute('data-look') || '{}')
    expect(before.curvy).toBeFalsy()
    await curvy.tap()
    await expect.poll(async () => JSON.parse(await page.locator('.cc-stage').getAttribute('data-look') || '{}').curvy, { timeout: 15000 }).toBe(true)
    await expect(curvy).toHaveAttribute('aria-pressed', 'true')
    await ctx.close()
  })
}

test('C3: the men\'s creator has no Curvy, and a man is never curvy', async ({ page }) => {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.en[data-step="look"]').waitFor()
  await page.locator('[data-part="body"][data-id="curvy"]').scrollIntoViewIfNeeded()
  await page.locator('[data-part="body"][data-id="curvy"]').tap()
  await page.locator('[data-gender="male"]').first().tap()
  await expect(page.locator('[data-part="body"]')).toHaveCount(0)
  const look = await page.evaluate(async () => { const m = await import('/src/world/avatar3d.js'); return m.lookOf({ gender: 'male', body: 'curvy' }).curvy })
  expect(look).toBe(false)
})
