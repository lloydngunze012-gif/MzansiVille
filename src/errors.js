// The error log: every error the game hits, with where it happened (screen, step),
// the device and the build, kept on this phone (the last 50, readable at #/errors)
// and, where Supabase is set up, sent to its client_errors table (supabase/schema.sql)
// for the owner to read. A report never breaks the game.
import { authEnabled, getClient } from './net.js'
import { myIdentity } from './presence.js'

const KEY = 'mzansiville.errors'
const MAX = 50
const sent = new Map() // message -> last sent (ms): the same error at most once a minute

function stepNow() {
  const world = document.getElementById('world')
  const lecture = document.getElementById('lecture3d')
  const morning = document.getElementById('morning3d')
  const home = document.getElementById('home3d')
  const parts = []
  if (world?.dataset.activity) parts.push(`activity:${world.dataset.activity}/${world.dataset.activityStep || ''}`)
  if (morning?.dataset.step) parts.push(`morning:${morning.dataset.step}`)
  if (home?.dataset.on === '1' && home.dataset.step) parts.push(`home:${home.dataset.step}`)
  if (lecture?.dataset.step) parts.push(`lecture:${lecture.dataset.step}`)
  if (world?.dataset.cam) parts.push(`cam:${world.dataset.cam}`)
  return parts.join(' ')
}
function device() {
  const n = navigator
  return `${n.userAgent} | ${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`
}

const HOUR = 3600 * 1000
const CAP = 20
const remoteOn = () => authEnabled && (!navigator.webdriver || new URLSearchParams(location.search).get('errlog') === '1')
// Has this phone sent fewer than 20 errors in the last hour? (and counts this one)
function underHourlyCap() {
  let times = []
  try { times = JSON.parse(localStorage.getItem('mzansiville.errsent') || '[]') } catch { times = [] }
  const now = Date.now()
  times = times.filter((t) => now - t < HOUR)
  if (times.length >= CAP) return false
  times.push(now)
  try { localStorage.setItem('mzansiville.errsent', JSON.stringify(times)) } catch { /* private mode */ }
  return true
}

// One row into client_errors (errors and funnel events). The player column comes with the Launch block in
// supabase/launch.sql; until that is run the row goes without it (the player id is also in detail).
let playerColumn = true
export async function logRow(row) {
  try {
    const client = await getClient()
    if (!client) return
    const id = myIdentity().id
    const detail = (() => { try { return { ...JSON.parse(row.detail || '{}'), player: id } } catch { return { player: id } } })()
    const full = { ...row, detail: JSON.stringify(detail).slice(0, 1000), player: id }
    if (playerColumn) {
      const { error } = await client.from('client_errors').insert(full)
      if (!error) return
      if (!/player/i.test(error.message || '')) return
      playerColumn = false
    }
    delete full.player
    await client.from('client_errors').insert(full)
  } catch { /* a report never breaks the game */ }
}

export function readErrors() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
export function clearErrors() {
  try { localStorage.removeItem(KEY) } catch { /* private mode */ }
}

// kind: where it came from ('error', 'promise', 'activity', 'watchdog', ...).
export function reportError(kind, error, extra = {}) {
  try {
    const message = String(error?.message || error || 'unknown').slice(0, 500)
    const entry = {
      at: new Date().toISOString(),
      kind,
      message,
      stack: String(error?.stack || '').split('\n').slice(0, 6).join('\n').slice(0, 1500),
      screen: location.hash || location.pathname,
      step: stepNow(),
      device: device(),
      // eslint-disable-next-line no-undef
      build: typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev',
      ...extra,
    }
    const list = readErrors()
    list.unshift(entry)
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch { /* full or private */ }
    const last = sent.get(message) || 0
    // Remote: the same error at most once a minute, and at most 20 an hour from this phone (the table
    // keeps the same limit per player). Automated tests send nothing unless ?errlog=1.
    if (remoteOn() && Date.now() - last > 60000 && underHourlyCap()) {
      sent.set(message, Date.now())
      logRow({
        kind: entry.kind, message: entry.message, stack: entry.stack, screen: entry.screen,
        step: entry.step, device: entry.device, build: entry.build, detail: JSON.stringify(extra).slice(0, 1000),
      })
    }
    return entry
  } catch {
    return null
  }
}

// Uncaught errors and rejected promises anywhere in the game.
export function installErrorReporting() {
  window.addEventListener('error', (event) => {
    // (a resource that failed to load: an image or a model)
    if (!event.error && event.target && event.target !== window) {
      reportError('load', `${event.target.tagName || 'resource'} failed: ${event.target.src || event.target.href || ''}`)
      return
    }
    reportError('error', event.error || event.message)
  }, true)
  window.addEventListener('unhandledrejection', (event) => reportError('promise', event.reason))
}
