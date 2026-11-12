// Activity sounds (owner, 12 Nov, job K: "each has its own fitting sound; no generic beeps"). All made live in Web
// Audio through audio.js's master, so the Sound switch and the screen-off pause cover them, and nothing is downloaded.
// One-shots: crunch (eating), sip, page, pencil, rustle (a bag, clothes), clank (weights), breath, thud (a kick),
// splash, whoosh, pins (bowling), cheer, tok (a woodblock beat), miss, skid, cash, keys (typing), clap, hum.
// Loops (return { set(x), stop() }): roll (a bowling ball), engine (the racing cabinet), swim (strokes).
import { graph } from './audio.js'

let noise = null
function noiseBuf(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noise
}
// A burst of filtered noise: t0 (s from now), dur, filter type/frequency/Q, peak gain, attack.
function burst(g, { t0 = 0, dur = 0.12, type = 'bandpass', f = 2000, f1 = null, q = 1, vol = 0.2, attack = 0.005 }) {
  const { ctx, out } = g
  const at = ctx.currentTime + t0
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf(ctx)
  const fl = ctx.createBiquadFilter()
  fl.type = type
  fl.frequency.setValueAtTime(f, at)
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, at + dur)
  fl.Q.value = q
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(vol, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(fl).connect(gain).connect(out)
  src.start(at, Math.random() * 1.5)
  src.stop(at + dur + 0.05)
}
// A pitched blip with a fall (wood, metal, a thump): never used on its own as a beep.
function tone(g, { t0 = 0, f = 440, f1 = null, dur = 0.15, type = 'sine', vol = 0.15 }) {
  const { ctx, out } = g
  const at = ctx.currentTime + t0
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, at)
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + dur)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(gain).connect(out)
  o.start(at)
  o.stop(at + dur + 0.05)
}
function open(level = 1) {
  const g = graph()
  if (!g) return null
  const out = g.ctx.createGain()
  out.gain.value = level
  out.connect(g.master)
  setTimeout(() => out.disconnect(), 4000)
  return { ctx: g.ctx, out }
}

const R = (a, b) => a + Math.random() * (b - a)
const ONE = {
  crunch: (g) => { for (let i = 0; i < 3; i++) burst(g, { t0: i * 0.09 + R(0, 0.02), dur: 0.06, f: R(2200, 3600), q: 1.4, vol: 0.18 }) },
  sip: (g) => { burst(g, { dur: 0.35, f: 600, f1: 1800, q: 6, vol: 0.12, attack: 0.05 }) },
  page: (g) => { burst(g, { dur: 0.22, type: 'highpass', f: 2500, vol: 0.12, attack: 0.04 }); burst(g, { t0: 0.12, dur: 0.12, type: 'highpass', f: 4000, vol: 0.06 }) },
  pencil: (g) => { for (let i = 0; i < 5; i++) burst(g, { t0: i * 0.06, dur: 0.04, f: R(5000, 7000), q: 3, vol: 0.05 }) },
  rustle: (g) => { for (let i = 0; i < 4; i++) burst(g, { t0: i * 0.08, dur: 0.12, type: 'highpass', f: R(1800, 3000), vol: 0.07 }) },
  clank: (g) => { for (const [f, v] of [[523, 0.14], [1347, 0.08], [2210, 0.05]]) tone(g, { f, dur: 0.5, type: 'triangle', vol: v }); burst(g, { dur: 0.03, f: 4000, vol: 0.12 }) },
  breath: (g) => { burst(g, { dur: 0.5, type: 'lowpass', f: 900, vol: 0.07, attack: 0.18 }) },
  thud: (g) => { tone(g, { f: 110, f1: 45, dur: 0.18, vol: 0.4 }); burst(g, { dur: 0.04, type: 'lowpass', f: 1400, vol: 0.2 }) },
  splash: (g) => { burst(g, { dur: 0.6, type: 'lowpass', f: 2400, f1: 500, vol: 0.25, attack: 0.01 }); for (let i = 0; i < 4; i++) tone(g, { t0: R(0.1, 0.5), f: R(500, 900), f1: R(1200, 1800), dur: 0.06, vol: 0.04 }) },
  whoosh: (g) => { burst(g, { dur: 0.35, f: 400, f1: 2400, q: 0.8, vol: 0.12, attack: 0.1 }) },
  pins: (g, n = 8) => {
    for (let i = 0; i < Math.max(2, n); i++) {
      const t0 = R(0, 0.32)
      tone(g, { t0, f: R(700, 1200), f1: R(400, 600), dur: R(0.08, 0.16), type: 'triangle', vol: 0.16 })
      burst(g, { t0, dur: 0.05, f: R(2500, 4200), q: 2, vol: 0.14 })
    }
    burst(g, { t0: 0.05, dur: 0.5, type: 'lowpass', f: 700, vol: 0.12, attack: 0.02 })
  },
  cheer: (g) => { for (let i = 0; i < 3; i++) burst(g, { t0: i * 0.15, dur: 0.9, f: R(800, 1400), q: 0.7, vol: 0.12, attack: 0.15 }) },
  tok: (g) => { tone(g, { f: 1250, f1: 900, dur: 0.07, type: 'triangle', vol: 0.14 }); burst(g, { dur: 0.03, f: 2600, q: 4, vol: 0.08 }) },
  miss: (g) => { tone(g, { f: 160, f1: 110, dur: 0.16, vol: 0.12 }) },
  skid: (g) => { burst(g, { dur: 0.4, f: 2600, f1: 1400, q: 5, vol: 0.12, attack: 0.02 }) },
  cash: (g) => { tone(g, { f: 1900, dur: 0.18, type: 'triangle', vol: 0.06 }); tone(g, { t0: 0.07, f: 2500, dur: 0.25, type: 'triangle', vol: 0.05 }) },
  keys: (g) => { for (let i = 0; i < 6; i++) burst(g, { t0: i * 0.07 + R(0, 0.03), dur: 0.03, f: R(3000, 5000), q: 2, vol: 0.07 }) },
  clap: (g) => { for (let i = 0; i < 6; i++) burst(g, { t0: i * 0.11 + R(0, 0.03), dur: 0.05, f: R(1200, 2200), q: 1.2, vol: 0.12 }) },
  chatter: (g) => { for (let i = 0; i < 5; i++) burst(g, { t0: i * 0.13 + R(0, 0.05), dur: 0.16, f: R(400, 900), q: 3, vol: 0.06, attack: 0.03 }) },
  snip: (g) => { for (let i = 0; i < 2; i++) { burst(g, { t0: i * 0.14, dur: 0.03, f: 6000, q: 6, vol: 0.12 }); tone(g, { t0: i * 0.14, f: 3200, dur: 0.04, type: 'triangle', vol: 0.05 }) } },
  hum: (g) => { for (const [f, d] of [[262, 0], [330, 0.25], [392, 0.5]]) tone(g, { t0: d, f, dur: 0.45, type: 'sine', vol: 0.05 }) },
}
// play('crunch'), play('pins', 9): a one-shot. Returns true when it sounded (Sound on, audio unlocked).
export function play(name, arg, vol = 1) {
  const fn = ONE[name]
  const g = fn && open(vol)
  if (!g) return false
  fn(g, arg)
  return true
}
export const SOUND_NAMES = Object.keys(ONE)

// ---------- loops ----------
function stopper(nodes, gain, ctx) {
  return () => {
    try { gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08) } catch { /* gone */ }
    setTimeout(() => { for (const n of nodes) { try { n.stop() } catch { /* stopped */ } } gain.disconnect() }, 400)
  }
}
// The bowling ball rolling down the lane: a low rumble; set(speed 0..1).
export function roll() {
  const g = graph()
  if (!g) return { set() {}, stop() {} }
  const { ctx } = g
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf(ctx)
  src.loop = true
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 180
  const gain = ctx.createGain()
  gain.gain.value = 0.0001
  src.connect(lp).connect(gain).connect(g.master)
  src.start()
  return { set(v) { gain.gain.setTargetAtTime(0.05 + 0.35 * v, ctx.currentTime, 0.05); lp.frequency.setTargetAtTime(140 + 160 * v, ctx.currentTime, 0.05) }, stop: stopper([src], gain, ctx) }
}
// The racing cabinet's engine: set(speed 0..1) raises the note.
export function engine() {
  const g = graph()
  if (!g) return { set() {}, stop() {} }
  const { ctx } = g
  const a = ctx.createOscillator()
  const b = ctx.createOscillator()
  a.type = 'sawtooth'
  b.type = 'square'
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  const gain = ctx.createGain()
  gain.gain.value = 0.05
  a.connect(lp)
  b.connect(lp)
  lp.connect(gain).connect(g.master)
  a.start()
  b.start()
  const set = (v) => { a.frequency.setTargetAtTime(60 + 120 * v, ctx.currentTime, 0.06); b.frequency.setTargetAtTime(30 + 60 * v, ctx.currentTime, 0.06) }
  set(0)
  return { set, stop: stopper([a, b], gain, ctx) }
}
