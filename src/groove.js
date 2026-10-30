// A short amapiano-style groove for the character creator, made live in Web Audio
// (no recording, so nothing to license): four-on-the-floor kick, the log-drum bass,
// off-beat shaker, rim on 2 and 4, and soft minor-seventh chord stabs. 112 BPM.

import { bus } from './audio.js'

export const BPM = 112
const STEP = 60 / BPM / 4 // one 16th note
const LOOKAHEAD = 0.12

// A minor: Am7, Fmaj7, Dm7, Em7, one bar each (as frequencies).
const CHORDS = [
  [220, 261.6, 329.6, 392],
  [174.6, 220, 261.6, 329.6],
  [146.8, 174.6, 220, 261.6],
  [164.8, 196, 246.9, 293.7],
]
// Log drum: 16th-step -> bass note (Hz). The syncopation is the amapiano bounce.
const LOG = { 0: 55, 3: 55, 6: 65.4, 10: 82.4, 11: 73.4, 14: 98 }

let timer = 0
let step = 0
let nextTime = 0
let noise = null

function noiseBuffer(ctx) {
  if (noise) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

function envGain(ctx, out, at, peak, decay) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay)
  g.connect(out)
  return g
}

function kick(ctx, out, at) {
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(120, at)
  o.frequency.exponentialRampToValueAtTime(42, at + 0.12)
  o.connect(envGain(ctx, out, at, 0.9, 0.32))
  o.start(at)
  o.stop(at + 0.35)
}

function logDrum(ctx, out, at, freq) {
  // Pitched, woody, with a little downward glide.
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(freq * 1.5, at)
  o.frequency.exponentialRampToValueAtTime(freq, at + 0.04)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 900
  f.Q.value = 6
  o.connect(f).connect(envGain(ctx, out, at, 0.55, 0.28))
  o.start(at)
  o.stop(at + 0.3)
}

function hiss(ctx, out, at, { freq, q, peak, decay, type = 'highpass' }) {
  const s = ctx.createBufferSource()
  s.buffer = noiseBuffer(ctx)
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  s.connect(f).connect(envGain(ctx, out, at, peak, decay))
  s.start(at)
  s.stop(at + decay + 0.02)
}

function stab(ctx, out, at, notes) {
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 1400
  const g = envGain(ctx, out, at, 0.07, 0.42)
  f.connect(g)
  for (const freq of notes) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    o.detune.value = (Math.random() - 0.5) * 12
    o.connect(f)
    o.start(at)
    o.stop(at + 0.45)
  }
}

function schedule() {
  const sound = bus()
  if (!sound) return
  const { ctx, out } = sound
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const s = step % 16
    const bar = Math.floor(step / 16) % CHORDS.length
    if (s % 4 === 0) kick(ctx, out, nextTime)
    if (LOG[s]) logDrum(ctx, out, nextTime, LOG[s])
    if (s % 2 === 1) hiss(ctx, out, nextTime, { freq: 7000, q: 0.7, peak: s % 4 === 3 ? 0.09 : 0.05, decay: 0.05 })
    if (s === 4 || s === 12) hiss(ctx, out, nextTime, { freq: 1800, q: 4, peak: 0.25, decay: 0.09, type: 'bandpass' })
    if (s === 2 || s === 7 || s === 10) stab(ctx, out, nextTime, CHORDS[bar])
    nextTime += STEP
    step += 1
    if (s === 0) document.body.dataset.grooveBars = String(Math.floor(step / 16))
  }
}

// Several places can want the groove (the creator, the Quad stage); it plays while any does.
const owners = new Set()

export function startGroove(owner = 'creator') {
  owners.add(owner)
  if (timer) return
  step = 0
  nextTime = 0
  timer = setInterval(schedule, 25)
  schedule()
  document.body.dataset.groove = '1'
}

export function stopGroove(owner = 'creator') {
  owners.delete(owner)
  if (owners.size) return
  clearInterval(timer)
  timer = 0
  delete document.body.dataset.groove
}
