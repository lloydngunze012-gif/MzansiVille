// #/sounds: a private listening page so Lloyd can pick the campus music (not linked from the game).
// It covers the game while the address is #/sounds. Tracks play through their own Web Audio context
// (gapless loops); the three grooves are the live synth in src/groove.js. One plays at a time.
import { startGroove, stopGroove } from './groove.js'
import { unlock } from './audio.js'

const TRACKS = [
  { id: 'music_campus', name: 'Sherwood (current campus track)', note: 'Chill loop, about 35 s. In the game today.', vorbis: true },
  { id: 'alt_slow_tar', name: 'Slow Tar', note: 'Slow amapiano, 108 BPM, log drum and soft Rhodes. 44 s.' },
  { id: 'alt_sunday_braai', name: 'Sunday Braai', note: 'Warm afro-house, 120 BPM, congas and a plucked arpeggio. 48 s.' },
  { id: 'alt_kasi_morning', name: 'Kasi Morning', note: 'Gentle and slow, 98 BPM, keys and a marimba tune. 39 s.' },
  { id: 'alt_golden_hour', name: 'Golden Hour', note: 'Deep house meets amapiano, 112 BPM, pads and a bell lead. 43 s.' },
]
const GROOVES = [
  { id: 'classic', name: 'Creator groove (current)', note: 'Amapiano, 112 BPM, Am7 Fmaj7 Dm7 Em7. What the creator plays today.' },
  { id: 'mellow', name: 'Creator groove: mellow', note: '104 BPM, Cmaj7 Am7 Fmaj7 G7, a lazier log drum.' },
  { id: 'bright', name: 'Creator groove: bright', note: '120 BPM, Dm7 Bbmaj7 Gm7 A7, a busier bass.' },
]

let root = null
let ctx = null
let wired = false
let current = null // { kind, id, key, source, gain }
const buffers = {}

const css = `
#sounds-page{position:fixed;inset:0;z-index:100000;overflow:auto;background:#f4efe4;color:#1c1915;font-family:Figtree,system-ui,sans-serif;-webkit-overflow-scrolling:touch}
#sounds-page .sp-in{max-width:560px;margin:0 auto;padding:20px 16px 48px}
#sounds-page h1{font-family:Graduate,Figtree,serif;font-size:24px;margin:0 0 4px}
#sounds-page h2{font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin:26px 0 8px;color:#5b5348}
#sounds-page p.sp-lede{margin:0 0 8px;color:#5b5348;font-size:15px;line-height:1.4}
#sounds-page .sp-warn{background:#fff3c4;border-radius:10px;padding:10px 12px;font-size:14px;margin:10px 0}
#sounds-page .sp-row{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #ded6c4;border-radius:14px;padding:12px;margin:8px 0}
#sounds-page .sp-row[data-on="true"]{border-color:#f0c400;box-shadow:0 0 0 2px #f0c40088}
#sounds-page .sp-txt{flex:1;min-width:0}
#sounds-page .sp-txt b{display:block;font-size:16px}
#sounds-page .sp-txt span{display:block;font-size:13px;color:#5b5348;margin-top:2px}
#sounds-page button.sp-btn{flex:none;min-width:84px;min-height:48px;border:0;border-radius:12px;background:#1c1915;color:#f4efe4;font:600 15px Figtree,system-ui,sans-serif;cursor:pointer}
#sounds-page .sp-row[data-on="true"] button.sp-btn{background:#f0c400;color:#1c1915}
#sounds-page button.sp-btn:focus-visible{outline:3px solid #7a4cc8;outline-offset:2px}
`

function soundOff() {
  try { return localStorage.getItem('mzansiville.sound') === 'off' } catch { return false }
}

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function extFor(track) {
  const probe = document.createElement('audio')
  const codec = track.vorbis ? 'vorbis' : 'opus'
  return probe.canPlayType(`audio/ogg; codecs="${codec}"`) ? 'ogg' : 'm4a'
}

function mark() {
  if (!root) return
  for (const row of root.querySelectorAll('.sp-row')) {
    const on = !!current && row.dataset.kind === current.kind && row.dataset.id === current.id
    row.dataset.on = String(on)
    const b = row.querySelector('button')
    b.textContent = on ? 'Stop' : 'Play'
    b.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${row.dataset.name}`)
  }
}

function stopAll() {
  if (current) {
    if (current.kind === 'groove') stopGroove('sounds')
    else if (current.source) {
      try {
        const now = ctx.currentTime
        current.gain.gain.setValueAtTime(current.gain.gain.value, now)
        current.gain.gain.linearRampToValueAtTime(0, now + 0.15)
        current.source.stop(now + 0.2)
      } catch { /* already stopped */ }
    }
  }
  current = null
  document.body.dataset.soundsPlaying = ''
  mark()
}

async function play(kind, id) {
  stopAll()
  const key = `${kind}:${id}`
  current = { kind, id, key }
  document.body.dataset.soundsPlaying = key
  mark()
  if (kind === 'groove') {
    unlock() // the game's audio context; the groove plays through its bus
    startGroove('sounds', id)
    return
  }
  const c = ensureCtx()
  const track = TRACKS.find((t) => t.id === id)
  try {
    if (!buffers[id]) {
      const res = await fetch(`/audio/${id}.${extFor(track)}`)
      buffers[id] = await c.decodeAudioData(await res.arrayBuffer())
    }
    if (!current || current.key !== key) return // changed our mind while it loaded
    const source = c.createBufferSource()
    const gain = c.createGain()
    source.buffer = buffers[id]
    source.loop = true
    gain.gain.setValueAtTime(0, c.currentTime)
    gain.gain.linearRampToValueAtTime(id === 'music_campus' ? 0.6 : 0.85, c.currentTime + 0.2)
    source.connect(gain).connect(c.destination)
    source.start()
    current.source = source
    current.gain = gain
  } catch {
    current = null
    document.body.dataset.soundsPlaying = ''
    mark()
  }
}

function rowHtml(kind, item) {
  return `<div class="sp-row" data-kind="${kind}" data-id="${item.id}" data-name="${item.name}" data-on="false">
    <div class="sp-txt"><b>${item.name}</b><span>${item.note}</span></div>
    <button class="sp-btn" type="button" aria-label="Play ${item.name}">Play</button>
  </div>`
}

function close() {
  stopAll()
  if (root) root.remove()
  root = null
}

function open() {
  if (root) return
  const style = document.createElement('style')
  style.textContent = css
  root = document.createElement('div')
  root.id = 'sounds-page'
  root.appendChild(style)
  const body = document.createElement('div')
  body.className = 'sp-in'
  body.innerHTML = `<h1>Sounds</h1>
    <p class="sp-lede">Tap Play on each one, then tell Lloyd which you like. One plays at a time and loops until you tap Stop.</p>
    ${soundOff() ? '<p class="sp-warn">Sound is switched off in Settings, which silences the three creator grooves. Switch it on there to hear them. The tracks play anyway.</p>' : ''}
    <h2>Campus music</h2>${TRACKS.map((t) => rowHtml('track', t)).join('')}
    <h2>Creator groove</h2>${GROOVES.map((g) => rowHtml('groove', g)).join('')}`
  root.appendChild(body)
  document.body.appendChild(root)
  root.addEventListener('click', (e) => {
    const r = e.target.closest('.sp-row')
    if (!r || !e.target.closest('button')) return
    if (current && current.kind === r.dataset.kind && current.id === r.dataset.id) stopAll()
    else play(r.dataset.kind, r.dataset.id)
  })
}

// Idempotent: main.js calls it whenever the address becomes #/sounds.
export function mountSounds() {
  if (!wired) {
    wired = true
    window.addEventListener('hashchange', () => {
      if (location.hash.startsWith('#/sounds')) open()
      else close()
    })
  }
  if (location.hash.startsWith('#/sounds')) open()
}

// The listening page also goes quiet when the screen is off or the tab is hidden.
document.addEventListener("visibilitychange", () => {
  if (!ctx) return
  if (document.visibilityState === "hidden") ctx.suspend().catch(() => {})
  else if (current) ctx.resume().catch(() => {})
})
