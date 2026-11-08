// Game sounds from public/audio (CC0, see public/audio/CREDITS.md).
// Web Audio buffers keep loops gapless, and phones only allow sound after a tap,
// so nothing loads until unlock() runs from the first pointer event.
// Loops are "wanted" on or off; they start as soon as their file has loaded.

const NAMES = ['kettle', 'door', 'footsteps', 'bus_engine', 'crowd', 'music_campus']
const VOLUME = { kettle: 0.5, door: 0.7, footsteps: 0.55, bus_engine: 0.35, crowd: 0.18, music_campus: 0.22 }
const FADE = 0.25

let ctx = null
let master = null
let grooveOut = null
const buffers = {}
const wanted = {}
const playing = {}

function soundOn() {
  try { return localStorage.getItem('mzansiville.sound') !== 'off' } catch { return true }
}

function extension() {
  const probe = document.createElement('audio')
  // Safari on older iPhones cannot decode Ogg Vorbis, so it gets the AAC copies.
  return probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'
}

async function load(name, ext) {
  try {
    const response = await fetch(`/audio/${name}.${ext}`)
    const data = await response.arrayBuffer()
    buffers[name] = await new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))
    if (wanted[name]) apply(name)
  } catch { /* a missing sound never breaks the game */ }
}

export function unlock() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = soundOn() ? 1 : 0
      master.connect(ctx.destination)
      const ext = extension()
      for (const name of NAMES) load(name, ext)
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {}) // iOS also says 'interrupted' after a lock
  } catch { /* no audio */ }
}

function apply(name) {
  if (!ctx || !buffers[name]) return
  const now = ctx.currentTime
  const live = playing[name]
  if (wanted[name] && !live) {
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffers[name]
    source.loop = true
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(VOLUME[name], now + FADE)
    source.connect(gain).connect(master)
    source.start()
    playing[name] = { source, gain }
  } else if (!wanted[name] && live) {
    live.gain.gain.cancelScheduledValues(now)
    live.gain.gain.setValueAtTime(live.gain.gain.value, now)
    live.gain.gain.linearRampToValueAtTime(0, now + FADE)
    live.source.stop(now + FADE + 0.05)
    delete playing[name]
  }
  document.body.dataset.sounds = Object.keys(playing).sort().join(' ')
}

// The live groove (src/groove.js) plays through the same master, so mute covers it.
export function bus() {
  if (!ctx || ctx.state !== 'running') return null
  if (!grooveOut) {
    grooveOut = ctx.createGain()
    grooveOut.gain.value = 0.55 * grooveLevel
    grooveOut.connect(master)
  }
  return { ctx, out: grooveOut }
}

// 0..1, how loud the groove is (the Quad fades it with distance from the stage).
let grooveLevel = 1
export function setGrooveLevel(level) {
  grooveLevel = Math.max(0, Math.min(1, level))
  if (grooveOut && ctx) grooveOut.gain.setTargetAtTime(0.55 * grooveLevel, ctx.currentTime, 0.2)
}

// Safe to call every frame: it only acts when the wanted state changes.
export function loop(name, on) {
  on = Boolean(on)
  if (Boolean(wanted[name]) === on) return
  wanted[name] = on
  apply(name)
}

export function sfx(name) {
  if (!ctx || !buffers[name]) return
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffers[name]
  gain.gain.value = VOLUME[name] ?? 0.6
  source.connect(gain).connect(master)
  source.start()
}

// Running water (the shower): filtered noise, swelling in and out over `seconds`.
export function water(seconds = 2) {
  if (!ctx || !master || !soundOn()) return
  try {
    const length = Math.ceil(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1800
    band.Q.value = 0.6
    const gain = ctx.createGain()
    const t = ctx.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.28, t + 0.3)
    gain.gain.setValueAtTime(0.28, t + seconds - 0.4)
    gain.gain.linearRampToValueAtTime(0, t + seconds)
    source.connect(band).connect(gain).connect(master)
    source.start()
  } catch { /* a missing sound never breaks the game */ }
}

export function setMuted(muted) {
  if (!ctx) return
  master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05)
}

// Screen off, tab switched or app in the background: silence (owner, 8 Nov: "why am I hearing the
// game sound when I've switched the screen off"). The audio clock is suspended while the page is
// hidden, so loops and the groove stop and pick up again on return; only what we paused is resumed.
let pausedByHide = false
function sleepWhenHidden() {
  if (!ctx) return
  if (document.visibilityState === 'hidden') {
    // silent at once (gain 0), then the clock stops; both undone on return
    master.gain.cancelScheduledValues(0); master.gain.value = 0
    if (ctx.state === 'running') { pausedByHide = true; ctx.suspend().catch(() => {}) }
  } else {
    master.gain.value = soundOn() ? 1 : 0 // a muted player stays muted on return
    if (!pausedByHide) return
    pausedByHide = false
    ctx.resume().catch(() => {}) // if iOS refuses, the next tap (unlock) does it
  }
}
document.addEventListener('visibilitychange', sleepWhenHidden)
addEventListener('pagehide', () => { if (ctx && ctx.state === 'running') { pausedByHide = true; ctx.suspend().catch(() => {}) } })
addEventListener('pageshow', sleepWhenHidden)
// (the browser freezing a background page, e.g. Chrome on Android, also silences it)
document.addEventListener('freeze', () => { if (ctx && master) { master.gain.value = 0; if (ctx.state === 'running') { pausedByHide = true; ctx.suspend().catch(() => {}) } } })

// Synthesised effects (src/sfx.js): run fn(ctx, out) on the shared master, so mute and the
// screen-off pause cover them. Nothing plays before the first tap or while muted.
export function synth(fn) {
  if (!ctx || !master || ctx.state !== 'running' || !soundOn()) return
  try { fn(ctx, master) } catch { /* a missing sound never breaks the game */ }
}
