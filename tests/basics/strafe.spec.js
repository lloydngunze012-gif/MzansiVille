// K11: the arrows (and K11b: WASD) move you the way they point, as seen from the
// camera. In the follow camera (Sims), walk right for 1.5 s: you go to the
// camera's right, not its left; then left, forward and back. The camera's right is
// worked out here from where it sits and looks (read only), never from moveRight.
// npx playwright test tests/basics/strafe.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, student, finger, arrows, read, saveVideo } from './touch.js'

test.use(PHONE)
test.describe.configure({ timeout: 300000 })

// The camera's forward and right on the ground (Y up, right-handed: right = (-f.z, f.x)).
async function cameraAxes(page) {
  const d = JSON.parse(await page.evaluate(() => window.mzansiDebug()))
  const fx = d.look[0] - d.cam[0]
  const fz = d.look[2] - d.cam[2]
  const n = Math.hypot(fx, fz)
  return { f: { x: fx / n, z: fz / n }, r: { x: -fz / n, z: fx / n } }
}

test('K11 the arrows move you right, left, forward and back as seen from the camera', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  expect(await page.evaluate(() => document.querySelector('#world').dataset.cam)).toBe('sims')
  const results = await moves(page, async (sx, sy) => {
    await arrows.walk(page, f, sx > 0 ? 'right' : sx < 0 ? 'left' : sy < 0 ? 'up' : 'down', 1500)
  })
  console.log('K11', JSON.stringify(results))
  check(results)
  await saveVideo(page, 'K11-strafe')
})

// The same with the keys (D, A, W, S): WASD and the arrows share one path.
test('K11b WASD moves you right, left, forward and back as seen from the camera', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const results = await moves(page, async (sx, sy) => {
    const key = sx > 0 ? 'd' : sx < 0 ? 'a' : sy < 0 ? 'w' : 's'
    await page.keyboard.down(key)
    await page.waitForTimeout(1500)
    await page.keyboard.up(key)
  })
  console.log('K11b', JSON.stringify(results))
  check(results)
})

function check(results) {
  for (const [name, r] of Object.entries(results)) {
    // (the old mirrored sign moved you about 2 m the wrong way: negative)
    expect(r.along, `${name}: moved the way it was pushed`).toBeGreaterThan(0.2)
    expect(r.across, `${name}: not off to the side`).toBeLessThan(r.along * 0.5)
  }
}

async function moves(page, hold) {
  const results = {}
  // [name, stick x, stick y (screen: down is +), the camera axis it should follow, sign]
  const pushes = [['right', 1, 0, 'r', 1], ['left', -1, 0, 'r', -1], ['forward', 0, -1, 'f', 1], ['back', 0, 1, 'f', -1]]
  for (const [name, sx, sy, axis, sign] of pushes) {
    const axes = await cameraAxes(page)
    const a = await read.pos(page)
    await hold(sx, sy)
    await page.waitForTimeout(400)
    const b = await read.pos(page)
    const dx = b.x - a.x
    const dz = b.z - a.z
    const along = (dx * axes[axis].x + dz * axes[axis].z) * sign
    const other = axis === 'r' ? axes.f : axes.r
    const across = Math.abs(dx * other.x + dz * other.z)
    results[name] = { along: +along.toFixed(2), across: +across.toFixed(2) }
  }
  return results
}
