// Installing Soft Life on a phone (owner, 7 Nov). The menu's "Install Soft Life" and the
// #/install screen (also #install) read installMode():
//   'prompt'  Android Chrome has offered to install: our button opens its install prompt
//   'ios'     iPhone/iPad: the three Share > Add to Home Screen steps
//   'manual'  any other browser, or Chrome before it has offered: the browser-menu steps
//   'done'    opened from the home screen, or installed from here: the option hides
// The service worker (public/sw.js) is registered in the built game only, so dev and the
// tests that run on the dev server are unchanged.

let deferred = null
const listeners = new Set()
const changed = () => { for (const fn of listeners) { try { fn() } catch { /* a listener's problem */ } } }

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault() // keep Chrome's own mini-bar away; our Install button opens it instead
  deferred = event
  changed()
})
window.addEventListener('appinstalled', () => { deferred = null; changed() })

export function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone)
}

// The title's installed-app look (styles.css, "Title on phones") reads <html data-display>:
// 'standalone' when opened from the home screen (Android and iPhone), else 'browser'.
// Set here, before the first screen is drawn, and kept in step with the display mode.
function markDisplay() { document.documentElement.dataset.display = isStandalone() ? 'standalone' : 'browser' }
markDisplay()
try { window.matchMedia('(display-mode: standalone)').addEventListener('change', markDisplay) } catch { /* old browsers */ }

// The phone's status and navigation bars (<meta name="theme-color">) follow the screen: night
// plum on the title (the manifest's colour, so the splash and the first screen match) and on
// enrolment, the dark Settings plum there, cream everywhere else in the game.
// (quick: the opening page, light since V2.1; main.js passes it instead of 'create')
const BARS = { boot: '#1a0d33', title: '#1a0d33', quick: '#f4efe4', create: '#140a24', settings: '#1c0e34', errors: '#1c0e34' }
export function barColour(screen) {
  const colour = BARS[screen] || '#f4efe4'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && meta.content !== colour) meta.content = colour
  return colour
}

export function isIos() {
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Facebook, Instagram, TikTok, Snapchat and Line open links in their own window, which can't install.
export function isInApp() { return /Instagram|FBAN|FBAV|TikTok|musical_ly|Snapchat|Line\//i.test(navigator.userAgent || '') }
export const isAndroid = () => /Android/i.test(navigator.userAgent || '')

/** Chrome on Android: this page, opened in Chrome itself (the in-app browser's way out). */
export function chromeIntent() {
  const { host, pathname, search } = location
  const q = search.replace(/([?&])install=1&?/, '$1').replace(/[?&]$/, '')
  return `intent://${host}${pathname}${q}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(location.href)};end`
}

// Hidden only when opened from the home screen. Installed but in the browser still shows Install.
export function installMode() {
  if (isStandalone()) return 'done'
  if (isInApp()) return isIos() ? 'inapp-ios' : 'inapp'
  if (isIos()) return 'ios'
  return deferred ? 'prompt' : 'manual'
}

/** Opens the browser's install prompt (Android Chrome). Resolves 'accepted', 'dismissed' or 'none'. */
export async function promptInstall() {
  const event = deferred
  if (!event) return 'none'
  deferred = null
  event.prompt()
  const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' }))
  changed()
  return outcome
}

export function onInstallChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Registers public/sw.js in the built game (or with ?sw=1 on the dev server). */
export function registerWorker() {
  const wanted = import.meta.env?.PROD || new URLSearchParams(location.search).has('sw')
  if (!wanted || !('serviceWorker' in navigator)) return
  const go = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* no worker: the game still plays */ })
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}

// Tests (read only): the mode the menu shows.
window.mzansiInstallMode = installMode
