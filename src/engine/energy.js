// Meeting people (owner, 10 Nov), item 5: walking costs energy. Rates live in data, not
// hard-coded (meta.json "energy"). Taxi and driving are charged once, from city.js's
// onPay; walking is drained a little each frame you're actually moving, converted from
// real seconds to game minutes by the same kind of ratio the morning scene already uses
// for dawdling (src/world/morning.js).
import META from '../../data/campusville/meta.json' with { type: 'json' }

const RATES = META.energy || {}
export const WALK_PER_MINUTE = RATES.walkPerMinute ?? 2
export const TAXI_COST = RATES.taxiCost ?? 3
export const DRIVE_COST = RATES.driveCost ?? 0
export const LOW_THRESHOLD = RATES.lowThreshold ?? 10
export const LOW_SPEED_FACTOR = RATES.lowSpeedFactor ?? 0.65
export const REAL_SECONDS_PER_GAME_MINUTE = RATES.realSecondsPerGameMinute ?? 1.5
export const RACE_DRAIN_FACTOR = RATES.raceDrainFactor ?? 0.5
export const LOW_HINT = RATES.lowHint || 'Getting tired. Eat something soon.'

// Halved while a race is on (item 6: "fun, not a chore").
let racing = false
export function setRacing(on) { racing = Boolean(on) }

function cap(run) { return run?.energyCap || 100 }

// Called every frame the player is actually walking (not standing). dt: real seconds
// this frame (already scaled by ?fast=1, same as every other timer in the 3D scenes).
export function drainWalking(run, dt) {
  if (!run?.stats || !(dt > 0)) return
  const factor = racing ? RACE_DRAIN_FACTOR : 1
  const gameMinutes = (dt * factor) / REAL_SECONDS_PER_GAME_MINUTE
  const next = (run.stats.energy ?? cap(run)) - gameMinutes * WALK_PER_MINUTE
  run.stats.energy = Math.max(0, Math.min(cap(run), next))
}
export function drainTaxi(run) {
  if (!run?.stats) return
  run.stats.energy = Math.max(0, Math.min(cap(run), (run.stats.energy ?? cap(run)) - TAXI_COST))
}
export function drainDrive(run) {
  if (!run?.stats || !DRIVE_COST) return
  run.stats.energy = Math.max(0, Math.min(cap(run), (run.stats.energy ?? cap(run)) - DRIVE_COST))
}
export function isLow(run) { return (run?.stats?.energy ?? cap(run)) < LOW_THRESHOLD }
// How much of full walking speed is left: 1 normally, slower under the threshold. The
// player can always still reach a door, just not at a brisk pace.
export function speedFactor(run) { return isLow(run) ? LOW_SPEED_FACTOR : 1 }

// A one-shot hint the first time energy drops under the threshold, not every frame
// (hysteresis: it can fire again once energy has recovered a little above it).
let hinted = false
export function checkLowHint(run) {
  const low = isLow(run)
  if (low && !hinted) { hinted = true; window.dispatchEvent(new CustomEvent('mzansi-energy-low', { detail: { text: LOW_HINT } })) }
  else if (!low && (run?.stats?.energy ?? 0) > LOW_THRESHOLD + 5) hinted = false
}
