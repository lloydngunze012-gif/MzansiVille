// Game sounds from public/audio (CC0, see public/audio/CREDITS.md).
// Web Audio buffers keep loops gapless, and phones only allow sound after a tap,
// so nothing loads until unlock() runs from the first pointer event.
// Loops are "wanted" on or off; they start as soon as their file has loaded.

// Small sounds load at the first tap; the crowd and the music tracks only when a zone asks for them
// (Sound job, 11 Nov), so a phone never downloads a track it does not play.
const EAGER = ['kettle', 'door', 'footsteps', 'bus_engine']
const MUSIC = ['music_campus', 'alt_slow_tar', 'alt_sunday_braai', 'alt_kasi_morning', 'alt_golden_hour']
const VOLUME = {
  kettle: 0.5, door: 0.7, footsteps: 0.55, bus_engine: 0.35, crowd: 0.18,
  // (music sits quietly under the ambience)
  music_campus: 0.16, alt_slow_tar: 0.13, alt_sunday_braai: 0.13, alt_kasi_morning: 0.13, alt_golden_hour: 0.13,
}
const FADE = 0.25
const MUSIC_FADE = 1.6

let ctx = null
let master = null
let musicBus = null
let grooveOut = null
const buffers = {}
const loading = {}
const wanted = {}
const playing = {}
const onReady = []
let track = null // the music wanted now
let trackLive = null // { name, source, gain }

function soundOn() {
  try { return localStorage.getItem('mzansiville.sound') !== 'off' } catch { return true }
}
export function musicOn() {
  try { return localStorage.getItem('mzansiville.music') !== 'off' } catch { return true }
}

let ext = null
function extension() {
  if (ext) return ext
  const probe = document.createElement('audio')
  // Safari on older iPhones cannot decode Ogg Vorbis (and none decode Ogg Opus, which the four alt
  // tracks are), so it gets the AAC copies.
  ext = probe.canPlayType('audio/ogg; codecs="vorbis"') && probe.canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a'
  return ext
}

// Fetch and decode one file, once. Resolves to the buffer, or null (a missing sound never breaks the game).
export function ensure(name) {
  if (!ctx) return Promise.resolve(null)
  if (buffers[name]) return Promise.resolve(buffers[name])
  loading[name] ||= (async () => {
    try {
      const response = await fetch(`/audio/${name}.${extension()}`)
      if (!response.ok) return null
      const data = await response.arrayBuffer()
      buffers[name] = await new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))
      loaded.push(name)
      if (wanted[name]) apply(name)
      if (track === name) applyMusic()
      return buffers[name]
    } catch { return null }
  })()
  return loading[name]
}
const loaded = []

// iPhone: sound is only allowed from inside a tap. The context is made and resumed there, a silent
// buffer is played (older iOS needs a sound started in the gesture itself), and the audio session is
// set to "playback" so the ringer switch on silent does not mute the game (Safari 16.4 and later).
export function unlock() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = soundOn() ? 1 : 0
      master.connect(ctx.destination)
      musicBus = ctx.createGain()
      musicBus.gain.value = musicOn() ? 1 : 0
      musicBus.connect(master)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch { /* not Safari */ }
      const blank = ctx.createBufferSource()
      blank.buffer = ctx.createBuffer(1, 1, 22050)
      blank.connect(ctx.destination)
      blank.start(0)
      for (const name of EAGER) ensure(name)
      for (const name of Object.keys(wanted)) if (wanted[name]) ensure(name)
      if (track) ensure(track)
    }
    if (ctx.state !== 'running') ctx.resume().then(ready).catch(() => {}) // iOS also says 'interrupted' after a lock
    else ready()
  } catch { /* no audio */ }
}
function ready() {
  for (const fn of onReady) { try { fn() } catch { /* a missing sound never breaks the game */ } }
}
// The ambience (src/ambience.js) builds its nodes once the context runs; fn is called on every unlock.
export function whenReady(fn) { onReady.push(fn); if (ctx && ctx.state === 'running') fn() }
export function graph() { return ctx && master && ctx.state === 'running' ? { ctx, master } : null }

function mark() {
  document.body.dataset.sounds = [...Object.keys(playing), ...(trackLive ? [trackLive.name] : [])].sort().join(' ')
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
  mark()
}

// Music: one track at a time through its own bus (the Music switch), crossfaded. A track that is
// still downloading starts when it lands; until then the old one plays on.
export function music(name) {
  if (name && !MUSIC.includes(name)) name = null
  if (track === name) return
  track = name || null
  if (track && ctx && !buffers[track]) ensure(track)
  applyMusic()
}
function applyMusic() {
  if (!ctx) return
  if (trackLive && trackLive.name === track) return
  if (track && !buffers[track]) return
  const now = ctx.currentTime
  if (trackLive) {
    const old = trackLive
    old.gain.gain.cancelScheduledValues(now)
    old.gain.gain.setValueAtTime(old.gain.gain.value, now)
    old.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE)
    old.source.stop(now + MUSIC_FADE + 0.05)
    trackLive = null
  }
  if (track) {
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffers[track]
    source.loop = true
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(VOLUME[track] ?? 0.13, now + MUSIC_FADE)
    source.connect(gain).connect(musicBus)
    source.start()
    trackLive = { name: track, source, gain }
  }
  mark()
}
export function setMusicOn(on) {
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.08)
}
// For tests and #/health: what is wanted, what is loaded, and whether anything can be heard.
export function soundState() {
  return {
    unlocked: Boolean(ctx), running: ctx?.state === 'running',
    master: master ? master.gain.value : 0, musicBus: musicBus ? musicBus.gain.value : 0,
    track, trackPlaying: trackLive?.name || null, loops: Object.keys(playing), loaded: [...loaded],
  }
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
  if (on && ctx && !buffers[name]) ensure(name)
  apply(name)
}

export function sfx(name, volume) {
  if (!ctx || !buffers[name]) return
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = buffers[name]
  gain.gain.value = volume ?? VOLUME[name] ?? 0.6
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
