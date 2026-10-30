// Game sounds from public/audio (CC0, see public/audio/CREDITS.md).
// Web Audio buffers keep loops gapless, and phones only allow sound after a tap,
// so nothing loads until unlock() runs from the first pointer event.
// Loops are "wanted" on or off; they start as soon as their file has loaded.

const NAMES = ['kettle', 'door', 'footsteps', 'bus_engine', 'crowd', 'music_campus']
const VOLUME = { kettle: 0.5, door: 0.7, footsteps: 0.55, bus_engine: 0.35, crowd: 0.18, music_campus: 0.22 }
const FADE = 0.25

let ctx = null
let master = null
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
    if (ctx.state === 'suspended') ctx.resume()
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

export function setMuted(muted) {
  if (!ctx) return
  master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05)
}
