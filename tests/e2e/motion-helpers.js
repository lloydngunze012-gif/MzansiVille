import { fpsGate } from '../fps.js'
// Shared by the motion tests (not a spec: importing a spec file runs all its tests).
import { expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const DEG = 180 / Math.PI

// A new student on campus at 13:00, after the morning and the lecture.
async function campus(page, spawn, extra = '', run = {}) {
  const seen = new Set()
  page.on('pageerror', (e) => { if (!seen.has(e.message)) { seen.add(e.message); console.log('PAGE ERROR', e.message, (e.stack || '').split(/\n/).slice(0, 3).join(' | ')) } })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate((r) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, r)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, run)
  await page.goto(`/?morning=0&spawn=${spawn}${extra}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  let n = -1
  await expect.poll(async () => { const m = await page.evaluate(() => window.mzansiBodies('campus').length); const done = m === n && m > 0; n = m; return done }, { timeout: 60000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1500)
  await fpsGate(page) // below 20 fps: INCONCLUSIVE (tests/fps.js)
}

// Sideways sliding from consecutive frames: the angle between each step and the way
// the body faces. Only real walking counts (faster than 0.3 m/s).
function crabs(frames, id) {
  const out = []
  const last = new Map()
  for (const f of frames) {
    for (const p of f.people) {
      if (id && p.id !== id) continue
      const key = p.id + (p.id === 'extra' ? `${Math.round(p.x)}` : '')
      const prev = last.get(p.id)
      last.set(p.id, { ...p, t: f.t })
      if (!prev || p.pose === 'sit' || p.pose === 'lie' || key === undefined) continue
      const dx = p.x - prev.x
      const dz = p.z - prev.z
      const dist = Math.hypot(dx, dz)
      const dt = (f.t - prev.t) / 1000
      if (dt <= 0 || dist > 1 || dist / dt < 0.3 || dist < 0.004) continue
      const step = Math.atan2(dx, dz)
      // The body as drawn at the end of the step (headless renders ~6 frames a second,
      // so each frame turns as much as ten phone frames; the step is judged on arrival).
      const facing = p.yaw
      out.push({ id: p.id, deg: Math.abs(wrap(step - facing)) * DEG, speed: dist / dt })
    }
  }
  return out
}

export { campus, crabs, wrap, DEG }
