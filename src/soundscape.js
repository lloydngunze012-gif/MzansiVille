// The soundscape (Sound job, 11 Nov): campus and SunnyBay are never silent. Where you are picks a
// zone (data/campusville/sound.json): a mix of ambience layers and a music track by time of day.
// Crossing a border fades the old mix out and the new one in.
//
// The ambience is made live in Web Audio, so it costs no download: waves and gulls, street hum with
// the odd hooter and a passing engine, wind. The murmur inside places and the Caf's crowd are the
// existing crowd.ogg (filtered for the murmur), fetched the first time a zone needs it. Everything
// plays through audio.js's master, so the Sound switch and the screen-off pause cover it.
import SOUND from '../data/campusville/sound.json' with { type: 'json' }
import { ensure, graph, music, soundState, whenReady } from './audio.js'

const LAYERS = ['waves', 'street', 'wind', 'murmur', 'crowd']
const BASE = { waves: 0.5, street: 0.42, wind: 0.34, murmur: 0.2, crowd: 0.18 }
const GLIDE = 0.5 // s, the time constant of a fade: about 1.5 s to settle across a border

const where = { scene: null, part: null, inside: false, phase: null, busy: 1, place: null } // (place: job L, the SunnyBay place you are in) // (busy: job J, the Caf's chatter by how full it is)
let zone = null
const level = {} // wanted, 0..1.5 per layer
const live = {} // layer -> { out, stop(), timer }
let noise = null

function zoneOf() {
  if (!where.scene) return null
  if (where.scene === 'city') return `city.${where.part || 'campus'}`
  if (where.scene === 'campus' && where.inside) return 'home' // (job L: a house's common room is home)
  return where.scene
}
// (job L) home's music is the player's own choice: localStorage mzansiville.homeMusic (off or a track id)
export function homeMusic() {
  try { const v = localStorage.getItem('mzansiville.homeMusic'); return (SOUND.homeChoices || []).includes(v) ? v : 'music_campus' } catch { return 'music_campus' }
}
export function setHomeMusic(id) {
  try { localStorage.setItem('mzansiville.homeMusic', id) } catch { /* private window */ }
  sync()
}
export const homeMusicName = () => SOUND.homeNames?.[homeMusic()] || homeMusic()
export function nextHomeMusic() {
  const list = SOUND.homeChoices || []
  setHomeMusic(list[(list.indexOf(homeMusic()) + 1) % list.length])
  return homeMusicName()
}
const placeZone = () => (where.scene === 'city' && where.inside && where.place ? SOUND.places?.[where.place] : null)
function trackFor(id) {
  const z = placeZone() || SOUND.zones[id]
  if (!z?.music) return null
  const t = z.music[where.phase] || z.music.default || null
  if (t === 'choice') { const h = homeMusic(); return h === 'off' ? null : h }
  return t
}
const levelFor = (id) => Math.min(SOUND.caps?.music ?? 1, (placeZone() || SOUND.zones[id])?.musicLevel ?? 1)

// main.js says which scene is up and the time of day; the city says its district and whether you
// are inside a place. Safe to call every frame: nothing happens unless something changed.
export function setSound(patch) {
  let changed = false
  for (const k of Object.keys(patch)) if (where[k] !== patch[k]) { where[k] = patch[k]; changed = true }
  if (changed) sync()
}
function sync() {
  zone = zoneOf()
  const z = zone ? SOUND.zones[zone] : null
  // (inside a place: the room's murmur, and the district's music carries on)
  const pz = placeZone()
  const mix = pz ? pz.layers : z ? (where.inside && zone !== 'home' ? SOUND.zones.inside.layers : z.layers) : {}
  for (const name of LAYERS) level[name] = Math.min(Number(mix[name]) || 0, SOUND.caps?.[name] ?? 1.5)
  if (zone === 'caf') { level.crowd *= where.busy ?? 1; level.murmur *= where.busy ?? 1 }
  music(zone ? trackFor(zone) : null, zone ? levelFor(zone) : 1)
  document.body.dataset.zone = zone ? (where.inside ? 'inside' : zone) : ''
  apply()
}
function apply() {
  const g = graph()
  if (!g) return
  for (const name of LAYERS) {
    const want = level[name]
    let l = live[name]
    if (want > 0 && !l) l = live[name] = build(name, g)
    if (!l) continue
    clearTimeout(l.off)
    l.out.gain.setTargetAtTime(want * BASE[name], g.ctx.currentTime, GLIDE)
    // (a layer that has faded right out is taken down, so a phone is not mixing silence)
    if (want <= 0) l.off = setTimeout(() => { if (level[name] <= 0 && live[name] === l) { l.stop(); delete live[name] } }, 4000)
  }
}
whenReady(apply)

// ---------- the layers ----------
function noiseBuffer(ctx) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noise
}
function hiss(ctx, nodes) {
  const s = ctx.createBufferSource()
  s.buffer = noiseBuffer(ctx)
  s.loop = true
  s.start(0, Math.random() * 2)
  nodes.push(s)
  return s
}
function filter(ctx, type, f, q = 0.7) {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
function gainOf(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g }
function lfo(ctx, hz, depth, param, nodes) {
  const o = ctx.createOscillator()
  o.frequency.value = hz
  const g = gainOf(ctx, depth)
  o.connect(g).connect(param)
  o.start()
  nodes.push(o)
  return g
}
// Now and then, while the layer can be heard: fn() after a random wait between a and b seconds.
function every(l, name, a, b, fn) {
  const next = () => {
    l.timers.push(setTimeout(() => {
      if (live[name] !== l) return
      if (level[name] > 0 && document.visibilityState === 'visible' && graph()) { try { fn() } catch { /* never breaks the game */ } }
      next()
    }, (a + Math.random() * (b - a)) * 1000))
  }
  next()
}
function build(name, { ctx, master }) {
  const out = gainOf(ctx, 0)
  out.connect(master)
  const nodes = []
  const l = { out, timers: [], stop() { for (const t of this.timers) clearTimeout(t); for (const n of nodes) { try { n.stop() } catch { /* already stopped */ } } out.disconnect() } }
  if (name === 'waves') {
    // the swell: low noise that rises and falls every ten seconds; the wash: bright noise a moment behind it
    const swell = gainOf(ctx, 0.55)
    hiss(ctx, nodes).connect(filter(ctx, 'lowpass', 420)).connect(swell).connect(out)
    const tide = lfo(ctx, 0.1, 0.45, swell.gain, nodes)
    const wash = gainOf(ctx, 0.07)
    hiss(ctx, nodes).connect(filter(ctx, 'bandpass', 2600, 0.5)).connect(wash).connect(out)
    const late = ctx.createDelay(3)
    late.delayTime.value = 1.6
    const washDepth = gainOf(ctx, 0.14)
    tide.connect(late).connect(washDepth).connect(wash.gain)
    every(l, name, 7, 20, () => gulls(ctx, out))
  } else if (name === 'street') {
    const rumble = gainOf(ctx, 0.8)
    hiss(ctx, nodes).connect(filter(ctx, 'lowpass', 150)).connect(rumble).connect(out)
    lfo(ctx, 0.05, 0.2, rumble.gain, nodes)
    hiss(ctx, nodes).connect(filter(ctx, 'bandpass', 700, 0.4)).connect(gainOf(ctx, 0.05)).connect(out)
    every(l, name, 10, 26, () => hooter(ctx, out))
    every(l, name, 12, 28, () => passing(ctx, out))
  } else if (name === 'wind') {
    const band = filter(ctx, 'bandpass', 520, 1.1)
    const gust = gainOf(ctx, 0.5)
    hiss(ctx, nodes).connect(band).connect(gust).connect(out)
    lfo(ctx, 0.08, 260, band.frequency, nodes)
    lfo(ctx, 0.13, 0.28, gust.gain, nodes)
  } else {
    // murmur (voices through a wall: the crowd, low-passed) and crowd (the Caf, the campus)
    const dest = name === 'murmur' ? filter(ctx, 'lowpass', 620) : gainOf(ctx, 1)
    dest.connect(out)
    ensure('crowd').then((buffer) => {
      if (!buffer || live[name] !== l) return
      const s = ctx.createBufferSource()
      s.buffer = buffer
      s.loop = true
      s.connect(dest)
      s.start(0, name === 'murmur' ? 9 : 0)
      nodes.push(s)
    })
  }
  return l
}
function chirp(ctx, out, at, f, dur, vol) {
  const o = ctx.createOscillator()
  const g = gainOf(ctx, 0)
  o.type = 'triangle'
  o.frequency.setValueAtTime(f * 0.8, at)
  o.frequency.linearRampToValueAtTime(f * 1.12, at + dur * 0.35)
  o.frequency.linearRampToValueAtTime(f * 0.7, at + dur)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(out)
  o.start(at)
  o.stop(at + dur + 0.05)
}
function gulls(ctx, out) {
  const n = 2 + Math.floor(Math.random() * 3)
  const f = 1700 + Math.random() * 500
  const vol = 0.05 + Math.random() * 0.05
  for (let i = 0; i < n; i++) chirp(ctx, out, ctx.currentTime + i * 0.34, f * (1 - i * 0.03), 0.26, vol)
}
function hooter(ctx, out) {
  const twice = Math.random() < 0.4
  for (let i = 0; i < (twice ? 2 : 1); i++) {
    const at = ctx.currentTime + i * 0.3
    const g = gainOf(ctx, 0)
    const lp = filter(ctx, 'lowpass', 1700)
    for (const f of [392, 494]) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = f
      o.connect(lp)
      o.start(at)
      o.stop(at + 0.24)
    }
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.02)
    g.gain.setValueAtTime(0.05, at + 0.17)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.23)
    lp.connect(g).connect(out)
  }
}
// A car that stopped for you hoots (job I): the same two-tone hooter, a touch louder, once.
export function hootNow() {
  const g = graph()
  if (!g) return false
  const out = gainOf(g.ctx, 2.4)
  out.connect(g.master)
  hooter(g.ctx, out)
  setTimeout(() => out.disconnect(), 900)
  return true
}
// A vehicle going by: the engine loop, low, swelling in and away over four seconds.
function passing(ctx, out) {
  ensure('bus_engine').then((buffer) => {
    if (!buffer || !graph()) return
    const at = ctx.currentTime
    const s = ctx.createBufferSource()
    const g = gainOf(ctx, 0)
    s.buffer = buffer
    s.loop = true
    s.playbackRate.setValueAtTime(0.62, at)
    s.playbackRate.linearRampToValueAtTime(0.8, at + 2)
    s.playbackRate.linearRampToValueAtTime(0.55, at + 4)
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.3, at + 1.8)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 4)
    s.connect(filter(ctx, 'lowpass', 900)).connect(g).connect(out)
    s.start(at)
    s.stop(at + 4.1)
  })
}

// For tests: the zone, the mix wanted, which layers are built, and audio.js's own state.
export function soundscapeState() {
  return { zone: zone ? (where.inside ? 'inside' : zone) : null, where: { ...where }, level: { ...level }, layers: Object.keys(live), ...soundState() }
}
window.mzansiSound = { state: soundscapeState }
