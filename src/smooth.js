// Smoothness reports from real phones (owner, 7 Nov; docs/design/smoothness-reports.md).
// One shared collector. Each render loop calls smooth.frame(now, scene, place) once per frame
// (scene.js campus, home.js home, morning.js morning, lecture.js lecture); everything is kept
// per bucket (scene|place) in small typed arrays, and flushed to Supabase every 3 minutes
// while the page is visible and when it's hidden or closed. Nothing here ever throws into a
// render loop, and nothing is sent unless the table exists and the player hasn't switched it off.
//
// What is counted: frame times from the browser's frame clock (rAF timestamps), so a frame is
// the gap between two frames. Not counted: a gap over 1000 ms (tab hidden), and the first 3 s
// after a scene shows (a scene starting, or coming back from a gap): the loading hitch.
import { authEnabled, supabaseConfig } from './net.js'

const BINS = 100 // 2 ms bins to 200 ms, plus one overflow bin at [100]
const BIN_MS = 2
const WARM_S = 3 // not counted for this long after a scene shows
const GAP_MS = 1000 // a longer gap between frames isn't played time (tab hidden)
const LONG_MS = 50
const WINDOW_MS = 500 // fps is judged in half-second windows, as scene.js's own counter does
const PLACE_EVERY_MS = 500 // the place is worked out at most twice a second
const MIN_SECONDS = 10 // a bucket needs this much play before it's sent
const MIN_SECONDS_TEST = 2 // (?smooth=test; ?smoothmin=<seconds> sets it for ?smooth=test and ?smooth=live: QA)
const FLUSH_EVERY_MS = 3 * 60 * 1000
const MAX_ROWS_FLUSH = 6
const MAX_ROWS_SESSION = 40
const MAX_STALLS = 8 // per bucket per report
const MAX_TAPS = 60 // tap-to-move times kept per bucket per report (for the median)
const TAP_WAIT_MS = 3000 // a tap that never moves anyone isn't a tap-to-move
const SWITCH_KEY = 'mzansiville.smooth'

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined'
const params = hasWindow ? new URLSearchParams(location.search) : new URLSearchParams()
const TEST = params.get('smooth') === 'test'
// ?smooth=live: sends for real even on localhost or under automation (QA of the real send),
// with build 'qa-live' so those rows can be found and deleted.
const LIVE = params.get('smooth') === 'live'

const session = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10) // per page load, never the player id
const buckets = new Map()
let cur = null // the bucket frames are counted into now
let curKey = ''
let lastNow = 0
let lastScene = ''
let shownAt = 0 // when this scene last showed
let placeAt = -1e9
let placeName = ''
// Two clocks, both sent on the session's first row only:
//  boot_ms: timeOrigin -> the first screen the URL opens is shown and usable (the title, with its
//           cover image loaded; any other first screen after it has painted).
//  load_ms: the last tap on a button or link -> the first frame of the first 3D scene (Continue,
//           Enter campus, Start day...); a page that opens straight into a 3D scene has no tap, so
//           from timeOrigin.
let bootMs = null
let loadMs = null
let firstFrameAt = null
let lastClickAt = null
let loadSent = false
let pending = [] // rows a network failure or a 5xx kept for the next flush
let betterDevice = '' // from navigator.userAgentData, once it has answered
let tapAt = 0
let skipNextStall = false // an 'against' give-up is also a stalled walk: record it once
let active = null // is anything collected? (re-checked twice a second)
let sent = 0
let broken = false // the table said no (a 4xx): stop for this session, quietly
let warned = false
let flushTimer = 0
let gpuName = null
let winFrames = 0
let winMs = 0

function newBucket(scene, place) {
  return { scene, place, hist: new Uint32Array(BINS + 1), seconds: 0, w30: 0, w20: 0, long: 0, worst: 0, walks: 0, stalls: 0, stallAt: [], taps: 0, tapMs: [] }
}

function bucketFor(scene, place) {
  const key = `${scene}|${place}`
  if (key !== curKey) {
    cur = buckets.get(key)
    if (!cur) { cur = newBucket(scene, place); buckets.set(key, cur) }
    curKey = key
    winFrames = 0
    winMs = 0
  }
  return cur
}

// Is this page collecting? Only when it could send (or in ?smooth=test), and the switch is on.
export function switchOn() {
  try { return localStorage.getItem(SWITCH_KEY) !== 'off' } catch { return true }
}
export function setSwitch(on) {
  try { localStorage.setItem(SWITCH_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  active = null
  if (!on) { buckets.clear(); cur = null; curKey = '' }
}
function localhost() {
  return /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.hostname.endsWith('.localhost')
}
function isActive() {
  if (!hasWindow) return false
  if (!switchOn()) return false
  if (TEST) return true
  if (LIVE) return authEnabled && !broken
  if (!authEnabled || localhost() || params.get('fast') === '1' || navigator.webdriver || broken) return false
  return true
}

/** The first screen is up: called once after the first paint (main.js). The title counts as usable once its cover image has loaded. */
function boot() {
  if (!hasWindow || bootMs !== null) return
  let n = 0
  const check = () => {
    const img = document.querySelector('.tc-art img')
    if (n >= 2 && (!img || img.complete)) { bootMs = Math.round(performance.now()); return }
    if (++n < 1500) requestAnimationFrame(check) // (a cover that never loads: no boot time, nothing sent for it)
  }
  requestAnimationFrame(check)
}

/** Once per frame, after the frame is drawn. place: a string, or a function called at most twice a second. */
function frame(now, scene, place) {
  try {
    if (!hasWindow) return
    if (firstFrameAt === null) { // the first rendered frame of the first 3D scene
      firstFrameAt = performance.now()
      loadMs = Math.round(firstFrameAt - (lastClickAt ?? 0))
    }
    const gap = now - lastNow
    const fresh = scene !== lastScene || gap > GAP_MS || lastNow === 0
    lastNow = now
    if (fresh) { lastScene = scene; shownAt = now; winFrames = 0; winMs = 0; curKey = ''; return }
    if (now - placeAt >= PLACE_EVERY_MS) {
      placeAt = now
      active = isActive()
      placeName = typeof place === 'function' ? place() : place
    } else if (typeof place === 'string' && place !== placeName) placeName = place
    if (!active) return
    if (now - shownAt < WARM_S * 1000) return
    const b = bucketFor(scene, placeName || 'paths')
    b.hist[Math.min(BINS, (gap / BIN_MS) | 0)] += 1
    b.seconds += gap / 1000
    if (gap > LONG_MS) b.long += 1
    if (gap > b.worst) b.worst = gap
    winFrames += 1
    winMs += gap
    if (winMs >= WINDOW_MS) {
      const fps = (winFrames * 1000) / winMs
      if (fps < 30) b.w30 += winMs / 1000
      if (fps < 20) b.w20 += winMs / 1000
      winFrames = 0
      winMs = 0
    }
  } catch { /* never into a render loop */ }
}

// ---- events from the world ----------------------------------------------------------------
function current() {
  return cur && active ? cur : null
}
/** The player's finger went down on the ground: the clock for tap-to-move starts. */
function tap() {
  const b = current()
  if (b) { b.taps += 1; tapAt = performance.now() }
}
/** The player moved this frame: if a tap is waiting, that's its tap-to-move time. */
function moved() {
  if (!tapAt) return
  const ms = performance.now() - tapAt
  tapAt = 0
  const b = current()
  if (b && ms < TAP_WAIT_MS && b.tapMs.length < MAX_TAPS) b.tapMs.push(Math.round(ms))
}
function walkStart() {
  const b = current()
  if (b) b.walks += 1
}
function addStall(kind, how, x, z) {
  const b = current()
  if (!b) return
  b.stalls += 1
  if (b.stallAt.length < MAX_STALLS) b.stallAt.push({ k: kind, h: String(how).slice(0, 40), x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 })
}
/** The player's walk ended (player.js onWalk): a stalled walk more than 1.5 m short of its target is a stall. */
function walkEnd(how, left, x, z) {
  if (skipNextStall) { skipNextStall = false; return }
  if (how === 'stalled' && left > 1.5) addStall('player', `${left.toFixed(1)} m short`, x, z)
}
/** Pressed against something for good: scene.js gives the walk up (after 0.5 s or 6 frames). */
function against(seconds, frames, x, z) {
  addStall('against', `pressed ${seconds.toFixed(1)} s, ${frames} frames`, x, z)
  skipNextStall = true
}
/** Anyone else's walk held back for good (walks.js; queue holds are filtered there). */
function npcStall(how, x, z) {
  addStall('npc', how, x, z)
}
function npcWalk() {
  walkStart()
}

// ---- the report -----------------------------------------------------------------------------
function percentile(hist, total, p) {
  const want = Math.ceil(total * p)
  let n = 0
  for (let i = 0; i <= BINS; i++) {
    n += hist[i]
    if (n >= want) return i === BINS ? 250 : i * BIN_MS + BIN_MS / 2
  }
  return 250
}
const fpsOf = (ms) => Math.max(1, Math.min(240, Math.round(1000 / Math.max(ms, 1))))

function deviceName() {
  if (betterDevice) return betterDevice
  const ua = navigator.userAgent || ''
  let m
  if ((m = ua.match(/Android[ ]([\d.]+);\s*([^;)]+)/))) return `${m[2].trim()} Android ${m[1]}`.slice(0, 40)
  if ((m = ua.match(/\b(iPhone|iPad|iPod)\b.*?OS ([\d_]+)/))) return `${m[1]} iOS ${m[2].replace(/_/g, '.')}`.slice(0, 40)
  const browser = (ua.match(/(Edg|Chrome|Firefox|Safari)\/([\d]+)/) || [])
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'device'
  return `${os} ${browser[1] === 'Edg' ? 'Edge' : browser[1] || 'browser'} ${browser[2] || ''}`.trim().slice(0, 40)
}
// Chrome on Android keeps the model out of the user agent string now; userAgentData has it.
// Asked once, in the background: reports never wait on it (until it answers they use the user agent).
function refineDevice() {
  try {
    navigator.userAgentData?.getHighEntropyValues(['model', 'platformVersion']).then((v) => {
      const model = String(v.model || '').trim()
      if (!model) return
      const os = navigator.userAgentData.platform || 'Android'
      const version = String(v.platformVersion || '').split('.')[0]
      betterDevice = `${model} ${os}${version ? ` ${version}` : ''}`.slice(0, 40)
    }).catch(() => {})
  } catch { /* the user agent will do */ }
}

function gpu() {
  if (gpuName !== null) return gpuName
  gpuName = ''
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    if (info) gpuName = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '').slice(0, 80)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { /* no GPU name */ }
  return gpuName
}
function context() {
  const standalone = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone)
  return {
    build: LIVE ? 'qa-live' : typeof __BUILD__ !== 'undefined' ? String(__BUILD__).slice(0, 60) : 'dev',
    device: deviceName(),
    gpu: gpu() || null,
    mem: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
    cores: navigator.hardwareConcurrency || null,
    screen: `${window.innerWidth}x${window.innerHeight}@${Math.round((window.devicePixelRatio || 1) * 10) / 10}`,
    net: navigator.connection?.effectiveType || null,
    installed: standalone,
  }
}
function median(list) {
  if (!list.length) return null
  const s = [...list].sort((a, b) => a - b)
  return s[s.length >> 1]
}

function rowOf(b, ctx, withLoad) {
  const total = b.hist.reduce((a, c) => a + c, 0)
  return {
    session,
    ...ctx,
    scene: b.scene,
    place: b.place.slice(0, 60),
    seconds: Math.round(b.seconds * 10) / 10,
    fps_typical: fpsOf(percentile(b.hist, total, 0.5)),
    fps_low: fpsOf(percentile(b.hist, total, 0.9)),
    secs_below_30: Math.round(b.w30 * 10) / 10,
    secs_below_20: Math.round(b.w20 * 10) / 10,
    long_frames: b.long,
    worst_ms: Math.round(b.worst),
    taps: b.taps,
    tap_ms: median(b.tapMs),
    walks: b.walks,
    stalls: b.stalls,
    stall_at: b.stallAt,
    boot_ms: withLoad ? bootMs : null,
    load_ms: withLoad ? loadMs : null,
  }
}

/** Build this report's rows (at most 6, the busiest first) and clear what they covered. */
function takeRows() {
  const min = Number(params.get('smoothmin')) > 0 && (TEST || LIVE) ? Number(params.get('smoothmin')) : TEST ? MIN_SECONDS_TEST : MIN_SECONDS
  const left = MAX_ROWS_SESSION - sent
  if (left <= 0) return []
  const ready = [...buckets.values()].filter((b) => b.seconds >= min).sort((a, b) => b.seconds - a.seconds).slice(0, Math.min(MAX_ROWS_FLUSH, left))
  if (!ready.length) return []
  const ctx = context()
  // (the two clocks go on the session's first row, once both are known)
  const rows = ready.map((b, i) => rowOf(b, ctx, !loadSent && i === 0 && loadMs !== null && bootMs !== null))
  if (rows[0].load_ms !== null) loadSent = true
  for (const b of ready) buckets.set(`${b.scene}|${b.place}`, newBucket(b.scene, b.place))
  cur = null // (the bucket frames count into was replaced: the next frame picks it up again)
  curKey = ''
  sent += rows.length
  return rows
}

// One POST per flush. A 4xx (the table isn't there, or it refused the row) switches reports off for
// the session; a network failure or a 5xx keeps the rows for the next flush (the session cap of 40
// rows already counts them, so this can't grow, and there is no retry loop: one try per flush).
function post(rows) {
  const cfg = supabaseConfig
  if (!cfg.url || !cfg.key) return
  const keep = () => { pending = rows.concat(pending).slice(0, MAX_ROWS_SESSION) }
  const note = (status) => { if (LIVE) (window.__smoothPosts ||= []).push({ rows: rows.length, status, at: Date.now() }) }
  try {
    fetch(`${cfg.url}/rest/v1/smooth_reports`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    }).then((res) => {
      note(res.status)
      if (res.status >= 400 && res.status < 500) fail(`status ${res.status}`)
      else if (!res.ok) keep()
    }).catch(() => { note(0); keep() })
  } catch { note(0); keep() }
}
function fail(why) {
  broken = true // the game is unaffected
  pending = []
  if (!warned) { warned = true; console.warn(`smoothness reports are off for this session (${why})`) }
}

/** Send what's ready (every 3 minutes, and when the page is hidden or closing). */
function flush() {
  try {
    if (!hasWindow || !isActive()) return []
    const rows = takeRows()
    if (TEST) {
      if (rows.length) (window.__smoothReports ||= []).push(...rows)
      return rows
    }
    const batch = pending.concat(rows)
    pending = []
    if (batch.length) post(batch)
    return rows
  } catch { return [] }
}

function start() {
  if (!hasWindow || flushTimer) return
  flushTimer = setInterval(() => { if (document.visibilityState === 'visible') flush() }, FLUSH_EVERY_MS)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  window.addEventListener('pagehide', () => flush())
  // The last tap on a button or a link: the start of load_ms (the tap that opens a 3D scene).
  document.addEventListener('click', (e) => { if (e.target?.closest?.('button, a, [data-act]')) lastClickAt = performance.now() }, true)
  refineDevice()
  if (TEST || LIVE) {
    window.mzansiSmoothFlush = flush
    window.mzansiSmooth = smooth
  }
}

export const smooth = {
  frame, boot, tap, moved, walkStart, walkEnd, against, npcStall, npcWalk, flush, setSwitch, switchOn,
  // (tests) the buckets so far, and the settings that decide how they're sent
  get buckets() { return buckets },
  get session() { return session },
  get timing() { return { boot: bootMs, click: lastClickAt, firstFrame: firstFrameAt, load: loadMs } },
  get pending() { return pending },
  get device() { return deviceName() },
  limits: { MIN_SECONDS, MAX_ROWS_FLUSH, MAX_ROWS_SESSION, MAX_STALLS, WARM_S, GAP_MS },
}
start()
export default smooth
