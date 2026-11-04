import { test } from '@playwright/test'

// Movement tests need a real frame rate (owner, 4 Nov). Below 20 fps the game runs in
// slow motion and a whole gesture fits inside one frame, so a movement test there
// proves nothing either way: it's skipped as INCONCLUSIVE. The measured rate is printed
// first, at the top of the test's output, and kept as an annotation in the report.
export const MIN_FPS = 20

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The rate the game draws at (#world data-fps, the scene's own count): the median of
// five readings over 2.5 s. target: a page or a frame.
export async function measureFps(target) {
  const readings = []
  for (let i = 0; i < 5; i++) {
    await pause(500)
    readings.push(Number(await target.locator('#world').getAttribute('data-fps')) || 0)
  }
  readings.sort((a, b) => a - b)
  return readings[2]
}

// Measure every phone in the test; skip the test as INCONCLUSIVE if any is below 20.
export async function fpsGate(...targets) {
  const fps = []
  for (const target of targets) fps.push(await measureFps(target))
  const low = Math.min(...fps)
  console.log(`FPS ${fps.join(', ')}${low < MIN_FPS ? ` (below ${MIN_FPS}: INCONCLUSIVE)` : ''}`)
  test.info().annotations.push({ type: 'fps', description: fps.join(', ') })
  test.skip(low < MIN_FPS, `INCONCLUSIVE: ${low} fps, below ${MIN_FPS}`)
  return low
}
