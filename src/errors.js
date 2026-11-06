// The error log: every error the game hits, with where it happened (screen, step),
// the device and the build, kept on this phone (the last 50, readable at #/errors)
// and, where Supabase is set up, sent to its client_errors table (supabase/schema.sql)
// for the owner to read. A report never breaks the game.
import { authEnabled, getClient } from './net.js'

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
    if (authEnabled && Date.now() - last > 60000 && !/navigator\.webdriver/.test(message)) {
      sent.set(message, Date.now())
      getClient().then((client) => client?.from('client_errors').insert({
        kind: entry.kind, message: entry.message, stack: entry.stack, screen: entry.screen,
        step: entry.step, device: entry.device, build: entry.build, detail: JSON.stringify(extra).slice(0, 1000),
      })).catch(() => {})
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
